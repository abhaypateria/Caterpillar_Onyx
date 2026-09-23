"""API tests. Run:  cd api && .venv\\Scripts\\python -m pytest -v

Groups:
- offline:  keys blanked, checks the template/keyword fallbacks the demo relies on.
- chain:    provider order + fall-through, with providers mocked (no network, no quota).
- live:     real calls using api/.env; skipped when a key is missing.
            LLM quality tests run on Groq by default. Set TEST_GEMINI=1 to also run them
            on Gemini (free tier = 20 requests/day per model, so this is opt-in).
"""
import asyncio
import base64
import os
import re

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

DEVANAGARI, TAMIL, KANNADA = re.compile(r"[ऀ-ॿ]"), re.compile(r"[஀-௿]"), re.compile(r"[ಀ-೿]")
SCRIPT = {"hi": DEVANAGARI, "ta": TAMIL, "kn": KANNADA}
SEVERITIES = {"low", "medium", "high"}


@pytest.fixture
def offline(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "GEMINI_KEY", "")
    monkeypatch.setattr(main, "GROQ_KEY", "")
    monkeypatch.setattr(main, "SARVAM_KEY", "")
    monkeypatch.setattr(main, "DB", tmp_path / "test.db")


@pytest.fixture(autouse=True)
def fresh_cooldowns():
    main._cooldown_until.clear()
    yield
    main._cooldown_until.clear()


# ============================================================ offline (fallbacks)
def test_health_offline(offline):
    assert client.get("/health").json() == {"ok": True, "gemini": False, "groq": False, "sarvam": False}


@pytest.mark.parametrize("text,expected", [
    ("ek aadmi machine ke peeche aa gaya", "proximity"),
    ("worker was standing behind the machine while reversing", "proximity"),
    ("There was a person near the machine", "proximity"),
    ("seatbelt khul gaya tha", "seatbelt"),
    ("bucket ne wall ko takra diya", "damage"),
    ("worker ko chot lag gayi", "injury"),
    ("operator was not belted and got hurt", "injury"),
    ("baal baal bach gaya", "near_miss"),
    ("something strange happened", "other"),
    ("near miss with a truck, no one was hurt", "near_miss"),
    ("near miss: bucket almost hit the wall", "near_miss"),
    ("truck almost hit us, kisi ko chot nahi lagi", "near_miss"),
])
def test_incident_keyword_fallback(offline, text, expected):
    out = client.post("/llm/incident", json={"text": text, "lang": "hi"}).json()
    assert out["type"] == expected
    assert out["severity"] in SEVERITIES


@pytest.mark.parametrize("kind", ["proximity", "seatbelt", "damage", "injury", "near_miss", "other", "unknown_type"])
def test_lesson_template_schema(offline, kind):
    out = client.post("/llm/lesson", json={"incident": {"type": kind}, "lang": "en"})
    assert out.status_code == 200
    les = out.json()
    assert les["title"] and 3 <= len(les["steps"]) <= 4
    for q in les["quiz"]:
        assert len(q["options"]) == 3 and 0 <= q["answer"] < 3


def test_summary_template(offline):
    facts = {"tasksDone": 3, "tasksTotal": 3, "idleMin": 42, "safetyAlerts": 1, "lessons": 1}
    text = client.post("/llm/summary", json={"facts": facts, "lang": "hi", "audience": "operator"}).json()["text"]
    assert "3 of 3 tasks" in text and "42 minutes idle" in text and "1 safety alert" in text


def test_summary_template_empty_facts(offline):
    assert client.post("/llm/summary", json={"facts": {}, "lang": "en"}).json()["text"]


def test_intent_offline_returns_unknown(offline):
    assert client.post("/llm/intent", json={"text": "agla kaam kya hai", "lang": "hi"}).json()["name"] == "unknown"


def test_speech_offline_returns_503(offline):
    assert client.post("/speech/stt", json={"audio": "AAAA", "lang": "hi"}).status_code == 503
    assert client.post("/speech/tts", json={"text": "hello", "lang": "hi"}).status_code == 503


def test_incidents_roundtrip(offline):
    batch = [{"id": "a1", "at": "2025-05-01T10:37:00", "type": "proximity", "description": "x"},
             {"id": "a2", "at": "2025-05-01T11:00:00", "type": "seatbelt", "description": "y"}]
    assert client.post("/incidents", json={"incidents": batch}).json() == {"saved": ["a1", "a2"]}
    assert [i["id"] for i in client.get("/incidents").json()] == ["a2", "a1"]  # newest first


def test_incidents_resync_is_idempotent(offline):
    inc = {"id": "dup", "at": "2025-05-01T10:00:00", "type": "other", "description": "z"}
    client.post("/incidents", json={"incidents": [inc]})
    client.post("/incidents", json={"incidents": [inc]})
    assert len(client.get("/incidents").json()) == 1


# ============================================================ chain (mocked providers)
@pytest.fixture
def mocked_chain(monkeypatch):
    """Both keys 'set', providers replaced by fakes that record calls."""
    monkeypatch.setattr(main, "GEMINI_KEY", "fake")
    monkeypatch.setattr(main, "GROQ_KEY", "fake")
    calls: list[str] = []
    behaviour: dict[str, object] = {}  # model → exception to raise, or dict to return

    async def fake_gemini(model, prompt):
        calls.append(f"gemini:{model}")
        b = behaviour.get(model, main.ProviderBusy(3600, "429"))
        if isinstance(b, Exception):
            raise b
        return b

    async def fake_groq(prompt):
        calls.append("groq")
        b = behaviour.get("groq", {"from": "groq"})
        if isinstance(b, Exception):
            raise b
        return b

    monkeypatch.setattr(main, "_gemini", fake_gemini)
    monkeypatch.setattr(main, "_groq", fake_groq)
    return calls, behaviour


def gemini_chain():
    return list(dict.fromkeys([main.GEMINI_MODEL, *main.GEMINI_FALLBACK_MODELS]))


def test_chain_uses_first_gemini_model_when_healthy(mocked_chain):
    calls, behaviour = mocked_chain
    behaviour[main.GEMINI_MODEL] = {"from": "primary"}
    assert asyncio.run(main.llm_json("p")) == {"from": "primary"}
    assert calls == [f"gemini:{main.GEMINI_MODEL}"]


def test_chain_moves_to_next_gemini_model_on_quota(mocked_chain):
    calls, behaviour = mocked_chain
    second = gemini_chain()[1]
    behaviour[second] = {"from": "second"}
    assert asyncio.run(main.llm_json("p")) == {"from": "second"}
    assert calls == [f"gemini:{main.GEMINI_MODEL}", f"gemini:{second}"]


def test_chain_falls_through_to_groq_when_all_gemini_busy(mocked_chain):
    calls, _ = mocked_chain
    assert asyncio.run(main.llm_json("p")) == {"from": "groq"}
    assert calls == [f"gemini:{m}" for m in gemini_chain()] + ["groq"]


def test_chain_skips_rate_limited_models_on_next_call(mocked_chain):
    calls, _ = mocked_chain
    asyncio.run(main.llm_json("p"))
    calls.clear()
    asyncio.run(main.llm_json("p"))
    assert calls == ["groq"], "exhausted Gemini models should be on cooldown"


def test_chain_survives_bad_json_and_errors(mocked_chain):
    calls, behaviour = mocked_chain
    behaviour[main.GEMINI_MODEL] = ValueError("not json")
    behaviour[gemini_chain()[1]] = {"from": "second"}
    assert asyncio.run(main.llm_json("p")) == {"from": "second"}


def test_chain_returns_none_when_everything_fails(mocked_chain):
    _, behaviour = mocked_chain
    behaviour["groq"] = main.ProviderBusy(60, "429")
    assert asyncio.run(main.llm_json("p")) is None


def test_endpoint_uses_template_when_chain_fails(mocked_chain):
    _, behaviour = mocked_chain
    behaviour["groq"] = main.ProviderBusy(60, "429")
    les = client.post("/llm/lesson", json={"incident": {"type": "seatbelt"}, "lang": "hi"}).json()
    assert les == main.LESSON_TEMPLATES["seatbelt"]


@pytest.mark.parametrize("call", [lambda: main._gemini("any-model", "p"), lambda: main._groq("p")])
def test_timeout_counts_as_busy(monkeypatch, call):
    """A hung provider must be put on cooldown, not retried on every voice command."""
    async def hang(*_a, **_k):
        raise main.httpx.ReadTimeout("slow")
    monkeypatch.setattr(main.httpx.AsyncClient, "post", hang)
    with pytest.raises(main.ProviderBusy):
        asyncio.run(call())


def test_groq_only_when_no_gemini_key(mocked_chain, monkeypatch):
    calls, _ = mocked_chain
    monkeypatch.setattr(main, "GEMINI_KEY", "")
    assert asyncio.run(main.llm_json("p")) == {"from": "groq"}
    assert calls == ["groq"]


# ============================================================ live: keys
@pytest.mark.skipif(not main.GEMINI_KEY, reason="GEMINI_API_KEY not set")
def test_gemini_key_works():
    """At least one Gemini model in the chain answers (1 request)."""
    reasons = []
    for m in gemini_chain():
        try:
            assert asyncio.run(main._gemini(m, 'Reply with JSON {"ok": true}')) == {"ok": True}
            return
        except main.ProviderBusy as e:
            reasons.append(str(e))
    pytest.fail(f"every Gemini model busy/over quota: {reasons}")


@pytest.mark.skipif(not main.GROQ_KEY, reason="GROQ_API_KEY not set")
def test_groq_key_works():
    assert asyncio.run(main._groq('Reply with JSON {"ok": true}')) == {"ok": True}


# ============================================================ live: LLM quality
LIVE = (["groq"] if main.GROQ_KEY else []) + (["gemini"] if main.GEMINI_KEY and os.getenv("TEST_GEMINI") else [])


@pytest.fixture(params=LIVE or [pytest.param(None, marks=pytest.mark.skip(reason="no LLM key (or TEST_GEMINI unset)"))])
def llm(request, monkeypatch, tmp_path):
    """Force one provider and record whether the answer really came from the LLM."""
    if request.param == "groq":
        monkeypatch.setattr(main, "GEMINI_KEY", "")
    else:
        monkeypatch.setattr(main, "GROQ_KEY", "")
    monkeypatch.setattr(main, "DB", tmp_path / "test.db")
    answers: list = []
    real = main.llm_json

    async def recording(prompt):
        out = await real(prompt)
        answers.append(out)
        return out

    monkeypatch.setattr(main, "llm_json", recording)
    return answers


def from_llm(answers):
    assert answers and answers[-1] is not None, "LLM gave no answer — endpoint used the offline fallback"


@pytest.mark.parametrize("text,expected", [
    ("Near miss log karo, ek aadmi machine ke peeche aa gaya", "proximity"),
    ("near miss with a truck, no one was hurt", "near_miss"),
    ("operator ne seatbelt nahi lagayi thi", "seatbelt"),
    ("bucket hit the site office wall and broke the window", "damage"),
    ("helper ka haath kat gaya, khoon beh raha hai", "injury"),
])
def test_llm_incident(llm, text, expected):
    out = client.post("/llm/incident", json={"text": text, "lang": "hi"}).json()
    from_llm(llm)
    assert out["type"] == expected, out
    assert out["severity"] in SEVERITIES and out["description"]


@pytest.mark.parametrize("text,expected", [
    ("There was a person near the machine", "report_incident"),
    ("Machine ko kitna time lagega?", "eta"),
    ("Is kaam mein itni der kyun ho rahi hai?", "why_late"),
    ("Aaj ki shift kaisi rahi?", "shift_summary"),
    ("அடுத்த வேலை என்ன?", "next_task"),
    ("ಮುಂದಿನ ಕೆಲಸ ಏನು?", "next_task"),
    ("Mark excavation complete", "task_done"),
])
def test_llm_intent(llm, text, expected):
    name = client.post("/llm/intent", json={"text": text, "lang": "hi"}).json()["name"]
    from_llm(llm)
    assert name == expected


@pytest.mark.parametrize("lang", ["hi", "ta", "kn"])
def test_llm_summary_language(llm, lang):
    facts = {"tasksDone": 2, "tasksTotal": 3, "idleMin": 55, "safetyAlerts": 1}
    text = client.post("/llm/summary", json={"facts": facts, "lang": lang, "audience": "operator"}).json()["text"]
    from_llm(llm)
    assert SCRIPT[lang].search(text), f"summary not in {lang} script: {text[:120]}"


def test_llm_lesson_from_incident_hindi(llm):
    inc = {"type": "proximity", "severity": "high", "description": "Person walked behind the excavator while it reversed."}
    les = client.post("/llm/lesson", json={"incident": inc, "lang": "hi"}).json()
    from_llm(llm)
    assert DEVANAGARI.search(les["title"] + " ".join(les["steps"]))
    assert 3 <= len(les["steps"]) <= 4
    for q in les["quiz"]:
        assert len(q["options"]) == 3 and 0 <= int(q["answer"]) < 3


# ============================================================ live: Sarvam
SAMPLES = {
    "hi": "एक आदमी मशीन के पीछे आ गया",
    "ta": "இயந்திரத்தின் பின்னால் ஒருவர் வந்தார்",
    "kn": "ಯಂತ್ರದ ಹಿಂದೆ ಒಬ್ಬರು ಬಂದರು",
}
needs_sarvam = pytest.mark.skipif(not main.SARVAM_KEY, reason="SARVAM_API_KEY not set")


@needs_sarvam
@pytest.mark.parametrize("lang", ["hi", "ta", "kn"])
def test_sarvam_tts(lang):
    r = client.post("/speech/tts", json={"text": SAMPLES[lang], "lang": lang})
    assert r.status_code == 200, r.text
    assert len(base64.b64decode(r.json()["audio"])) > 1000


@needs_sarvam
@pytest.mark.parametrize("lang", ["hi", "ta", "kn"])
def test_sarvam_stt_roundtrip(lang):
    """Synthesize speech, then transcribe it back: proves STT works for each language."""
    audio = client.post("/speech/tts", json={"text": SAMPLES[lang], "lang": lang}).json()["audio"]
    r = client.post("/speech/stt", json={"audio": audio, "lang": lang})
    assert r.status_code == 200, r.text
    assert SCRIPT[lang].search(r.json()["text"]), f"transcript not in {lang} script: {r.json()['text']!r}"
