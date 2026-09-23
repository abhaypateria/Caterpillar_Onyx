"""Onyx API. Owner: Person B.

Run:  cd api && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
The web app proxies /api/* to this server (see web/vite.config.ts).
Every endpoint must work without API keys (template fallback) so the demo never breaks.
"""
import json
import os
import sqlite3
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
SARVAM_KEY = os.getenv("SARVAM_API_KEY", "")
DB = Path(__file__).parent / "onyx.db"

app = FastAPI(title="Onyx API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

LANG_NAME = {"en": "English", "hi": "Hindi", "ta": "Tamil", "kn": "Kannada"}

# Keyword rules for the offline incident classifier (order = priority; first hit wins).
INCIDENT_RULES: list[tuple[str, str, list[str]]] = [
    # (type, severity, keywords across en / hi-latin / common code-mix)
    ("injury", "high", ["injur", "hurt", "bleed", "chot", "ghayal", "khoon"]),
    ("proximity", "high", ["person", "people", "worker", "aadmi", "aadami", "insaan", "peeche", "behind", "near", "paas", "reversing", "blind"]),
    ("seatbelt", "medium", ["seatbelt", "belt", "seat belt", "belt nahi", "belt khul"]),
    ("damage", "medium", ["damage", "hit", "broke", "broken", "tuut", "toot", "takra", "dent", "bucket"]),
    ("near_miss", "medium", ["near miss", "near-miss", "almost", "bach gaya", "baal baal", "close call"]),
]


def classify_incident(text: str) -> dict:
    """Deterministic fallback when Gemini is unavailable. Never raises."""
    t = text.lower()
    for kind, severity, keys in INCIDENT_RULES:
        if any(k in t for k in keys):
            return {"type": kind, "severity": severity, "description": text.strip() or kind}
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
    """Readable spoken summary from shift facts when Gemini is unavailable."""
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
    return {"ok": True, "gemini": bool(GEMINI_KEY), "sarvam": bool(SARVAM_KEY)}


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


# ---------------------------------------------------------------- LLM (Gemini)
async def gemini_json(prompt: str) -> dict | None:
    """Call Gemini and parse a JSON reply. Returns None on any failure so callers can fall back."""
    if not GEMINI_KEY:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(url, headers={"x-goog-api-key": GEMINI_KEY}, json=body)
            r.raise_for_status()
            return json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
    except Exception as e:  # noqa: BLE001 — demo must never crash
        print("gemini error:", e)
        return None


class TextIn(BaseModel):
    text: str
    lang: str = "en"


@app.post("/llm/incident")
async def structure_incident(body: TextIn):
    out = await gemini_json(
        "An excavator operator reported a site incident by voice (may be code-mixed Hindi/Tamil/Kannada/English).\n"
        f'Transcript: "{body.text}"\n'
        'Return JSON {"type": one of near_miss|seatbelt|proximity|damage|injury|other, '
        '"severity": low|medium|high, "description": one clear English sentence}.'
    )
    if out and out.get("type"):
        return out
    return classify_incident(body.text)


@app.post("/llm/intent")
async def intent(body: TextIn):
    out = await gemini_json(
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
    out = await gemini_json(
        f"Write a short spoken shift summary for the {body.audience} in {LANG_NAME.get(body.lang, 'English')}. "
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
    out = await gemini_json(
        f"Turn this real site incident into a 2-minute safety micro-lesson for an excavator operator in "
        f"{LANG_NAME.get(body.lang, 'English')}. Incident: {json.dumps(body.incident)}. "
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
                data={"language_code": lang, "model": "saarika:v2"},
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
                json={"inputs": [body.text[:500]], "target_language_code": lang, "speaker": "meera"},
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
