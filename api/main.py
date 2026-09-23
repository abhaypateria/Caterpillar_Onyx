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
    if out:
        return out
    t = body.text.lower()  # TODO(B): improve keyword fallback
    kind = "proximity" if any(k in t for k in ["person", "aadmi", "worker", "near"]) else "near_miss"
    return {"type": kind, "severity": "medium", "description": body.text}


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
    return out or {"text": f"Shift summary: {json.dumps(body.facts)}"}  # TODO(B): nicer template


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
    if out:
        return out
    raise HTTPException(503, "LLM unavailable")  # TODO(B): template lesson per incident type


# ---------------------------------------------------------------- speech (Sarvam)
class AudioIn(BaseModel):
    audio: str  # base64
    lang: str = "en"


@app.post("/speech/stt")
async def stt(body: AudioIn):
    # TODO(B): call Sarvam speech-to-text (check current endpoint + model name in Sarvam docs),
    # header "api-subscription-key", language code e.g. hi-IN. Return {"text": ...}.
    raise HTTPException(503, "Sarvam not configured")


@app.post("/speech/tts")
async def tts(body: TextIn):
    # TODO(B): call Sarvam text-to-speech; return {"audio": base64}. Browser speechSynthesis is the fallback.
    raise HTTPException(503, "Sarvam not configured")
