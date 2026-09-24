"""Onyx API. Owner: Person B.

Run:  cd api && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
The web app proxies /api/* to this server (see web/vite.config.ts).
Every endpoint must work without API keys (template fallback) so the demo never breaks.
"""
import json
import os
import re
import sqlite3
import time
from pathlib import Path

import httpx

# Use the OS certificate store so HTTPS works behind antivirus / corporate TLS inspection
# (e.g. Kaspersky re-signs api.groq.com with its own root, which Python's bundle rejects).
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:  # optional: falls back to Python's default certificates
    pass
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")
GROQ_KEY = os.getenv("GROQ_API_KEY", "")
# Tried in order. Rate limits are per model (free tier: 1000 req/day, 8000 tokens/min each),
# so later models cover earlier ones being rate-limited or retired. qwen is last: it also has a
# 1000 output-tokens/min cap (~3 lessons/min), but it's a different model family.
GROQ_MODELS = [m.strip() for m in os.getenv(
    "GROQ_MODELS", "openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b").split(",") if m.strip()]
SARVAM_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_STT_MODEL = "saarika:v2.5"
SARVAM_SPEAKER = "priya"
DB = Path(__file__).parent / "onyx.db"

app = FastAPI(title="Onyx API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

LANG_NAME = {"en": "English", "hi": "Hindi", "ta": "Tamil", "kn": "Kannada"}
# Name the script explicitly: models otherwise drift into romanised Hindi, which TTS voices read badly.
LANG_SCRIPT = {"en": "English", "hi": "Hindi written in Devanagari script", "ta": "Tamil written in Tamil script",
               "kn": "Kannada written in Kannada script"}

# Keyword rules for the offline incident classifier (order = priority; first hit wins).
INCIDENT_RULES: list[tuple[str, str, list[str]]] = [
    # (type, severity, keywords across en / hi-latin / common code-mix)
    ("injury", "high", ["injur", "hurt", "bleed", "chot", "ghayal", "khoon",
                        "चोट", "घायल", "खून", "காயம்", "ரத்தம்", "ಗಾಯ", "ರಕ್ತ"]),
    # No bare "near" here: it would swallow "near miss".
    ("proximity", "high", ["person", "people", "worker", "someone", "helper", "aadmi", "aadami", "insaan", "peeche",
                           "behind", "paas", "reversing", "blind", "near the machine", "near me",
                           # Native script, as returned by Sarvam speech-to-text
                           "आदमी", "व्यक्ति", "मज़दूर", "मजदूर", "पीछे", "ஆள்", "தொழிலாளி", "பின்னால்", "ವ್ಯಕ್ತಿ", "ಕಾರ್ಮಿಕ", "ಹಿಂದೆ"]),
    ("seatbelt", "medium", ["seatbelt", "belt", "seat belt", "belt nahi", "belt khul", "बेल्ट", "பெல்ட்", "ಬೆಲ್ಟ್"]),
    ("damage", "medium", ["damage", "hit", "broke", "broken", "tuut", "toot", "takra", "dent", "bucket", "टूट", "टकरा", "नुकसान", "சேதம்", "ಹಾನಿ"]),
]
NEAR_MISS_WORDS = ["near miss", "near-miss", "almost", "nearly", "bach gaya", "baal baal", "close call", "बाल-बाल", "बाल बाल", "बच गया"]
# "No one was hurt" / "chot nahi lagi" must not count as an injury.
NO_HARM = re.compile(
    r"\b(no ?one|nobody|none of us)\s+(was\s+|got\s+|is\s+)?(hurt|injured)"
    r"|\b(was\s*n[o']?t|not)\s+(hurt|injured)"
    r"|\b(kisi ko |koi )?chot nahi( lagi| aayi)?"
    r"|(किसी को |कोई )?चोट नहीं( लगी| आई)?"
)


def classify_incident(text: str) -> dict:
    """Deterministic fallback when no LLM is available. Never raises."""
    t = NO_HARM.sub(" ", text.lower())
    near_miss = any(k in t for k in NEAR_MISS_WORDS)
    for kind, severity, keys in INCIDENT_RULES:
        if near_miss and kind == "damage":
            continue  # "almost hit the wall" — nothing was actually damaged
        if any(k in t for k in keys):
            return {"type": kind, "severity": severity, "description": text.strip() or kind}
    if near_miss:
        return {"type": "near_miss", "severity": "medium", "description": text.strip()}
    return {"type": "other", "severity": "low", "description": text.strip() or "Unspecified incident"}


# Template micro-lessons per incident type — the near-miss → lesson loop still works offline.
LESSON_TEMPLATES: dict[str, dict] = {
    "proximity": {
        "title": "Keeping people out of the swing radius",
        "steps": [
            "Before you swing or reverse, look and sound the horn twice.",
            "Never move while a person is inside the machine's swing radius.",
            "Use a spotter for blind-side moves and keep eye contact.",
            "If anyone enters the zone, stop the machine until they are clear.",
        ],
        "quiz": [{
            "q": "A worker walks behind the machine while you reverse. What do you do first?",
            "options": ["Reverse faster to finish", "Stop immediately and wait until they are clear", "Sound the horn and keep moving"],
            "answer": 1,
        }],
    },
    "seatbelt": {
        "title": "Seatbelt every time the engine runs",
        "steps": [
            "Fasten the seatbelt before you start the engine.",
            "The belt keeps you inside the cab if the machine tips or jolts.",
            "Keep it fastened even for short moves across the site.",
            "If the belt is worn or frayed, report it and do not operate.",
        ],
        "quiz": [{
            "q": "When must the seatbelt be fastened?",
            "options": ["Only on slopes", "Whenever the engine is running", "Only on public roads"],
            "answer": 1,
        }],
    },
    "damage": {
        "title": "Avoiding machine and property damage",
        "steps": [
            "Walk the area and note obstacles before you begin.",
            "Keep the bucket low and controlled near walls and structures.",
            "Match your speed to visibility and ground conditions.",
            "Report any contact or damage straight away so it can be checked.",
        ],
        "quiz": [{
            "q": "How should you carry the bucket near a structure?",
            "options": ["High and fast", "Low and controlled", "It does not matter"],
            "answer": 1,
        }],
    },
    "injury": {
        "title": "Responding to an on-site injury",
        "steps": [
            "Stop the machine and secure it before doing anything else.",
            "Do not move a badly hurt person unless there is further danger.",
            "Call for the site first-aider and your supervisor immediately.",
            "Record what happened while it is fresh so it can be prevented next time.",
        ],
        "quiz": [{
            "q": "What is your first action after an injury near the machine?",
            "options": ["Finish the task", "Stop and secure the machine, then get help", "Restart the engine"],
            "answer": 1,
        }],
    },
    "near_miss": {
        "title": "Learning from a near miss",
        "steps": [
            "A near miss is a warning — treat it like a real incident.",
            "Think about what changed just before it happened.",
            "Slow down and add one extra check where the risk appeared.",
            "Tell your supervisor so the same situation can be fixed for everyone.",
        ],
        "quiz": [{
            "q": "Why report a near miss when no one was hurt?",
            "options": ["It is not needed", "To fix the risk before it causes real harm", "Only to blame someone"],
            "answer": 1,
        }],
    },
}
DEFAULT_LESSON = {
    "title": "Working safely on site",
    "steps": [
        "Check the area and your machine before you start.",
        "Stay aware of people and hazards around you.",
        "Slow down when visibility or ground conditions are poor.",
        "Report anything unusual to your supervisor.",
    ],
    "quiz": [{
        "q": "When should you report an unsafe situation?",
        "options": ["Never", "As soon as you notice it", "Only at the end of the shift"],
        "answer": 1,
    }],
}


def template_lesson(incident: dict) -> dict:
    return LESSON_TEMPLATES.get(str(incident.get("type", "")), DEFAULT_LESSON)


def template_summary(facts: dict, audience: str) -> str:
    """Readable spoken summary from shift facts when no LLM is available."""
    tasks = facts.get("tasksDone")
    total = facts.get("tasksTotal")
    idle = facts.get("idleMin")
    alerts = facts.get("safetyAlerts", facts.get("alerts"))
    lessons = facts.get("lessons")
    parts: list[str] = []
    if tasks is not None and total is not None:
        parts.append(f"{tasks} of {total} tasks completed")
    if idle is not None:
        parts.append(f"{idle} minutes idle")
    if alerts is not None:
        parts.append(f"{alerts} safety alert" + ("s" if alerts != 1 else ""))
    if lessons:
        parts.append(f"{lessons} lesson" + ("s" if lessons != 1 else "") + " done")
    body = ", ".join(parts) if parts else "shift completed"
    who = "Operator" if audience == "operator" else "Fleet"
    good = "Good work keeping the machine productive." if not alerts else "Please review today's safety alerts."
    return f"{who} shift summary: {body}. {good}"


# ---------------------------------------------------------------- storage
def db():
    con = sqlite3.connect(DB)
    con.execute("create table if not exists incidents (id text primary key, at text, data text)")
    return con


@app.get("/health")
def health():
    return {"ok": True, "groq": bool(GROQ_KEY), "llm_models": GROQ_MODELS if GROQ_KEY else [], "sarvam": bool(SARVAM_KEY)}


class IncidentBatch(BaseModel):
    incidents: list[dict]


@app.post("/incidents")
def save_incidents(body: IncidentBatch):
    with db() as con:
        for i in body.incidents:
            con.execute("insert or replace into incidents values (?,?,?)", (i["id"], i["at"], json.dumps(i)))
    return {"saved": [i["id"] for i in body.incidents]}


@app.get("/incidents")
def list_incidents():
    with db() as con:
        return [json.loads(r[0]) for r in con.execute("select data from incidents order by at desc")]


# ---------------------------------------------------------------- LLM (Groq models in order)
class ProviderBusy(Exception):
    """Rate-limited, overloaded, retired or slow: skip this model for `cooldown` seconds."""

    def __init__(self, cooldown: float, why: str):
        super().__init__(why)
        self.cooldown = cooldown


_cooldown_until: dict[str, float] = {}


async def _groq(model: str, prompt: str) -> dict:
    # JSON mode: Groq returns 400 json_validate_failed when the model emits invalid JSON
    # (~1 in 12 Kannada summaries on gpt-oss-20b). Output is sampled, so one retry usually works.
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_KEY}"},
                    json={"model": model, "temperature": 0.2, "response_format": {"type": "json_object"},
                          "messages": [{"role": "user", "content": prompt}]},
                )
        except httpx.TimeoutException:  # a slow model must not stall every voice command
            raise ProviderBusy(30, f"timeout {model}")
        if not (r.status_code == 400 and "json_validate_failed" in r.text and attempt == 0):
            break
    if r.status_code == 429:  # Groq says how long to wait
        try:
            wait = float(r.headers.get("retry-after", 60))
        except ValueError:
            wait = 60
        raise ProviderBusy(wait, f"429 {model}")
    if r.status_code in (500, 502, 503):
        raise ProviderBusy(30, f"{r.status_code} {model}")
    if r.status_code == 404 or "decommissioned" in r.text:
        raise ProviderBusy(3600, f"retired {model}")
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def llm_providers() -> list[tuple[str, object]]:
    """Ordered chain of Groq models; each has its own rate limits."""
    if not GROQ_KEY:
        return []
    return [(m, lambda p, m=m: _groq(m, p)) for m in dict.fromkeys(GROQ_MODELS)]


async def llm_json(prompt: str) -> dict | None:
    """First provider that returns valid JSON wins. None → caller uses its template fallback."""
    for name, call in llm_providers():
        if _cooldown_until.get(name, 0) > time.monotonic():
            continue
        try:
            out = await call(prompt)
            if isinstance(out, dict):
                return out
        except ProviderBusy as e:
            _cooldown_until[name] = time.monotonic() + e.cooldown
            print(f"llm {name} busy ({e}), skipping for {e.cooldown:.0f}s")
        except Exception as e:  # noqa: BLE001 — demo must never crash
            print(f"llm {name} error:", e)
    return None


class TextIn(BaseModel):
    text: str
    lang: str = "en"


@app.post("/llm/incident")
async def structure_incident(body: TextIn):
    out = await llm_json(
        "An excavator operator reported a site incident by voice (may be code-mixed Hindi/Tamil/Kannada/English).\n"
        f'Transcript: "{body.text}"\n'
        "Types (pick the most specific):\n"
        "- injury: someone was actually hurt.\n"
        "- proximity: a person or vehicle got inside the machine's working/swing zone or behind it, "
        "even if the operator calls it a near miss.\n"
        "- seatbelt: operating without the seatbelt fastened.\n"
        "- damage: the machine actually hit and damaged something.\n"
        "- near_miss: a close call with no person in the zone and nothing damaged.\n"
        "- other: anything else.\n"
        "Severity: high = a person was in danger or hurt; medium = equipment/property at risk; low = minor.\n"
        'Return JSON {"type": ..., "severity": ..., "description": one clear English sentence}.'
    )
    if out and out.get("type"):
        return out
    return classify_incident(body.text)


@app.post("/llm/intent")
async def intent(body: TextIn):
    out = await llm_json(
        f'Operator said: "{body.text}". Map to one intent: next_task, task_done, eta, why_late, '
        'report_incident, start_lesson, shift_summary, mayday, confirm, cancel, unknown. Return JSON {"name": ...}.'
    )
    return out or {"name": "unknown", "text": body.text}


class SummaryIn(BaseModel):
    facts: dict
    lang: str = "en"
    audience: str = "operator"


@app.post("/llm/summary")
async def summary(body: SummaryIn):
    out = await llm_json(
        f"Write a short spoken shift summary for the {body.audience} in {LANG_SCRIPT.get(body.lang, 'English')}. "
        "Max 3 sentences, plain words, keep technical terms in English. One thing that went well, one to improve. "
        f'Facts: {json.dumps(body.facts)}. Return JSON {{"text": ...}}.'
    )
    if out and out.get("text"):
        return out
    return {"text": template_summary(body.facts, body.audience)}


class LessonIn(BaseModel):
    incident: dict
    lang: str = "en"


@app.post("/llm/lesson")
async def lesson(body: LessonIn):
    out = await llm_json(
        f"Turn this real site incident into a 2-minute safety micro-lesson for an excavator operator in "
        f"{LANG_SCRIPT.get(body.lang, 'English')}. Incident: {json.dumps(body.incident)}. "
        'Return JSON {"title": str, "steps": [3-4 short sentences], "quiz": [{"q": str, "options": [3 str], "answer": index}]}.'
    )
    if out and out.get("steps"):
        return out
    return template_lesson(body.incident)


# ---------------------------------------------------------------- speech (Sarvam)
class AudioIn(BaseModel):
    audio: str  # base64
    lang: str = "en"


SARVAM_LOCALE = {"en": "en-IN", "hi": "hi-IN", "ta": "ta-IN", "kn": "kn-IN"}


@app.post("/speech/stt")
async def stt(body: AudioIn):
    """Sarvam speech-to-text. Falls back to 503 so the browser's recognition is used instead."""
    if not SARVAM_KEY:
        raise HTTPException(503, "Sarvam not configured")
    lang = SARVAM_LOCALE.get(body.lang, "en-IN")
    try:
        import base64
        audio = base64.b64decode(body.audio)
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                "https://api.sarvam.ai/speech-to-text",
                headers={"api-subscription-key": SARVAM_KEY},
                data={"language_code": lang, "model": SARVAM_STT_MODEL},
                files={"file": ("audio.wav", audio, "audio/wav")},
            )
            r.raise_for_status()
            return {"text": r.json().get("transcript", "")}
    except Exception as e:  # noqa: BLE001 — demo must never crash; browser STT takes over
        print("sarvam stt error:", e)
        raise HTTPException(503, "Sarvam STT failed")


@app.post("/speech/tts")
async def tts(body: TextIn):
    """Sarvam text-to-speech → base64 audio. Falls back to 503 so browser speechSynthesis is used."""
    if not SARVAM_KEY:
        raise HTTPException(503, "Sarvam not configured")
    lang = SARVAM_LOCALE.get(body.lang, "en-IN")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                "https://api.sarvam.ai/text-to-speech",
                headers={"api-subscription-key": SARVAM_KEY},
                json={"inputs": [body.text[:500]], "target_language_code": lang, "speaker": SARVAM_SPEAKER},
            )
            r.raise_for_status()
            audios = r.json().get("audios", [])
            if not audios:
                raise HTTPException(503, "Sarvam returned no audio")
            return {"audio": audios[0]}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        print("sarvam tts error:", e)
        raise HTTPException(503, "Sarvam TTS failed")
