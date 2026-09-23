"""Generate the spoken test clips via the running API (Sarvam TTS). Run: python make_audio.py"""
import base64
from pathlib import Path

import httpx

CLIPS = {
    "hi_next": ("hi", "अगला काम क्या है?"),
    "hi_eta": ("hi", "यह काम कितना समय लेगा?"),
    "hi_why": ("hi", "देर क्यों हो रही है?"),
    "hi_incident": ("hi", "एक आदमी मशीन के पीछे आ गया"),
    "hi_done": ("hi", "काम हो गया"),
    "hi_yes": ("hi", "हाँ"),
    "hi_mayday": ("hi", "बचाओ बचाओ"),
    "ta_next": ("ta", "அடுத்த வேலை என்ன?"),
    "kn_next": ("kn", "ಮುಂದಿನ ಕೆಲಸ ಏನು?"),
    "en_eta": ("en", "How long will this task take?"),
    "en_lesson": ("en", "Start my training lesson"),
}
out = Path(__file__).parent / "audio"
out.mkdir(exist_ok=True)
for name, (lang, text) in CLIPS.items():
    r = httpx.post("http://localhost:8000/speech/tts", json={"text": text, "lang": lang}, timeout=40)
    r.raise_for_status()
    (out / f"{name}.wav").write_bytes(base64.b64decode(r.json()["audio"]))
    print("ok", name)
