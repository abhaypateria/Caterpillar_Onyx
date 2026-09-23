"""API tests. Run:  cd api && .venv\\Scripts\\python -m pytest -v

Groups:
- offline:  keys blanked, checks the template/keyword fallbacks the demo relies on.
- chain:    Groq model order + fall-through, with the HTTP call mocked (no network, no quota).
- live:     real calls using api/.env; skipped when a key is missing. LLM quality tests run
            once per model in GROQ_MODELS, so the backup model is proven too.
"""
import asyncio
import base64
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
    assert client.get("/health").json() == {"ok": True, "groq": False, "llm_models": [], "sarvam": False}


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


# ============================================================ chain (mocked HTTP)
PRIMARY, BACKUP = "model-a", "model-b"


@pytest.fixture
def mocked_chain(monkeypatch):
    """Key 'set', two models, the Groq call replaced by a fake that records which model it hit."""
    monkeypatch.setattr(main, "GROQ_KEY", "fake")
    monkeypatch.setattr(main, "GROQ_MODELS", [PRIMARY, BACKUP])
    calls: list[str] = []
    behaviour: dict[str, object] = {}  # model → exception to raise, or dict to return

    async def fake_groq(model, prompt):
        calls.append(model)
        b = behaviour.get(model, {"from": model})
        if isinstance(b, Exception):
            raise b
        return b

    monkeypatch.setattr(main, "_groq", fake_groq)
    return calls, behaviour


def test_chain_uses_primary_model_when_healthy(mocked_chain):
    calls, _ = mocked_chain
    assert asyncio.run(main.llm_json("p")) == {"from": PRIMARY}
    assert calls == [PRIMARY]


def test_chain_moves_to_backup_on_rate_limit(mocked_chain):
    calls, behaviour = mocked_chain
    behaviour[PRIMARY] = main.ProviderBusy(60, "429")
    assert asyncio.run(main.llm_json("p")) == {"from": BACKUP}
    assert calls == [PRIMARY, BACKUP]


def test_chain_skips_rate_limited_model_on_next_call(mocked_chain):
    calls, behaviour = mocked_chain
    behaviour[PRIMARY] = main.ProviderBusy(60, "429")
    asyncio.run(main.llm_json("p"))
    calls.clear()
    asyncio.run(main.llm_json("p"))
    assert calls == [BACKUP], "rate-limited model should be on cooldown"


def test_chain_retries_model_after_cooldown(mocked_chain):
    calls, behaviour = mocked_chain
    behaviour[PRIMARY] = main.ProviderBusy(0, "429")  # zero cooldown → eligible again immediately
    asyncio.run(main.llm_json("p"))
    del behaviour[PRIMARY]
    calls.clear()
    assert asyncio.run(main.llm_json("p")) == {"from": PRIMARY}


def test_chain_survives_bad_json_and_errors(mocked_chain):
    _, behaviour = mocked_chain
    behaviour[PRIMARY] = ValueError("not json")
    assert asyncio.run(main.llm_json("p")) == {"from": BACKUP}


def test_chain_returns_none_when_everything_fails(mocked_chain):
    _, behaviour = mocked_chain
    behaviour[PRIMARY] = behaviour[BACKUP] = main.ProviderBusy(60, "429")
    assert asyncio.run(main.llm_json("p")) is None


def test_endpoint_uses_template_when_chain_fails(mocked_chain):
    _, behaviour = mocked_chain
    behaviour[PRIMARY] = behaviour[BACKUP] = main.ProviderBusy(60, "503")
    les = client.post("/llm/lesson", json={"incident": {"type": "seatbelt"}, "lang": "hi"}).json()
    assert les == main.LESSON_TEMPLATES["seatbelt"]


def test_no_key_means_no_llm_calls(mocked_chain, monkeypatch):
    calls, _ = mocked_chain
    monkeypatch.setattr(main, "GROQ_KEY", "")
    assert asyncio.run(main.llm_json("p")) is None
    assert calls == []


class FakeResponse:
    def __init__(self, status, text="", headers=None, payload=None):
        self.status_code, self.text, self.headers, self._payload = status, text, headers or {}, payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise main.httpx.HTTPStatusError("err", request=None, response=None)


@pytest.mark.parametrize("response,cooldown", [
    (FakeResponse(429, headers={"retry-after": "7"}), 7),        # Groq's own wait time is honoured
    (FakeResponse(429), 60),                                     # no header → a minute
    (FakeResponse(503), 30),                                     # overloaded
    (FakeResponse(404), 3600),                                   # model retired
    (FakeResponse(400, text='{"error":{"code":"model_decommissioned"}}'), 3600),
])
def test_groq_errors_map_to_cooldowns(monkeypatch, response, cooldown):
    async def post(*_a, **_k):
        return response
    monkeypatch.setattr(main.httpx.AsyncClient, "post", post)
    with pytest.raises(main.ProviderBusy) as e:
        asyncio.run(main._groq("m", "p"))
    assert e.value.cooldown == cooldown


def test_timeout_counts_as_busy(monkeypatch):
    """A hung model must be put on cooldown, not retried on every voice command."""
    async def hang(*_a, **_k):
        raise main.httpx.ReadTimeout("slow")
    monkeypatch.setattr(main.httpx.AsyncClient, "post", hang)
    with pytest.raises(main.ProviderBusy):
        asyncio.run(main._groq("m", "p"))


INVALID_JSON = FakeResponse(400, text='{"error":{"code":"json_validate_failed"}}')
VALID = FakeResponse(200, payload={"choices": [{"message": {"content": '{"ok": true}'}}]})


def test_invalid_json_is_retried_once(monkeypatch):
    responses = [INVALID_JSON, VALID]
    async def post(*_a, **_k):
        return responses.pop(0)
    monkeypatch.setattr(main.httpx.AsyncClient, "post", post)
    assert asyncio.run(main._groq("m", "p")) == {"ok": True}
    assert responses == []


def test_invalid_json_twice_moves_to_next_model(mocked_chain, monkeypatch):
    """Two bad generations → give up on this model for this request (no cooldown) and try the next."""
    calls, behaviour = mocked_chain
    behaviour[PRIMARY] = main.httpx.HTTPStatusError("400 json_validate_failed", request=None, response=None)
    assert asyncio.run(main.llm_json("p")) == {"from": BACKUP}
    assert PRIMARY not in main._cooldown_until, "a bad generation is not a reason to bench the model"


def test_invalid_json_retry_stops_after_two_attempts(monkeypatch):
    sent = []
    async def post(*_a, **_k):
        sent.append(1)
        return INVALID_JSON
    monkeypatch.setattr(main.httpx.AsyncClient, "post", post)
    with pytest.raises(main.httpx.HTTPStatusError):
        asyncio.run(main._groq("m", "p"))
    assert len(sent) == 2


def test_groq_parses_json_content(monkeypatch):
    async def post(*_a, **_k):
        return FakeResponse(200, payload={"choices": [{"message": {"content": '{"name": "eta"}'}}]})
    monkeypatch.setattr(main.httpx.AsyncClient, "post", post)
    assert asyncio.run(main._groq("m", "p")) == {"name": "eta"}


# ============================================================ live: key + every model answers
needs_groq = pytest.mark.skipif(not main.GROQ_KEY, reason="GROQ_API_KEY not set")


@needs_groq
@pytest.mark.parametrize("model", main.GROQ_MODELS)
def test_groq_model_works(model):
    try:
        out = asyncio.run(main._groq(model, 'Reply with JSON {"ok": true}'))
    except main.ProviderBusy as e:
        pytest.skip(f"{model} rate-limited by Groq ({e})")
    assert out == {"ok": True}


# ============================================================ live: LLM quality (per model)
@pytest.fixture(params=main.GROQ_MODELS if main.GROQ_KEY else [pytest.param(None, marks=pytest.mark.skip(reason="GROQ_API_KEY not set"))])
def llm(request, monkeypatch, tmp_path):
    """Pin the chain to one model and record whether the answer really came from the LLM."""
    monkeypatch.setattr(main, "GROQ_MODELS", [request.param])
    monkeypatch.setattr(main, "DB", tmp_path / "test.db")
    answers = Answers()
    answers.model = request.param
    real = main.llm_json

    async def recording(prompt):
        out = await real(prompt)
        answers.append(out)
        return out

    monkeypatch.setattr(main, "llm_json", recording)
    return answers


class Answers(list):
    model = ""


def from_llm(answers):
    """The endpoint's answer must come from the LLM, not the offline template.
    A model on cooldown was rate-limited by Groq: that's quota, not quality, so skip rather than fail.
    Bad JSON or other errors don't set a cooldown, so they still fail."""
    if answers and answers[-1] is None and answers.model in main._cooldown_until:
        pytest.skip(f"{answers.model} rate-limited by Groq")
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
