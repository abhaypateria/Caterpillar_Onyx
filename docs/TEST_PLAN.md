# Onyx — Test Plan

Every flow in the app, with who tests it and the latest result.

- **Auto** = run by `e2e/run.mjs` (headless Chrome, simulated microphone using real Sarvam speech).
- **Manual** = needs real hardware (mic, camera, phone, speakers) or a person.

**Last full run: 24 Sep 2026, ~02:30.** Results: **54/54 automated end-to-end tests pass**, **56/56 web unit tests**, **101/101 API tests** (live Groq and Sarvam keys).

## How to run

```bash
# 1. Web on :5173 and API on :8000 (see TEAM_PLAN.md §1), keys in api/.env
cd web && npm test                     # engine, voice and i18n unit tests
cd api && python -m pytest -q          # API tests (live LLM and speech when keys are set)
cd e2e && npm install && python make_audio.py
node run.mjs                           # all groups (~8 min)
node run.mjs core                      # one group: core, i18n, mobile, offline, voice
IDS=SAF-06,VOI-01 node run.mjs core,voice   # specific cases
```

---

## 1. Login and navigation

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| LOG-01 | Open login screen | 4 languages and 3 operators shown | Auto | ✅ |
| LOG-02 | Open `/#/replay` while logged out | Redirected to login | Auto | ✅ |
| LOG-03 | Pick हिन्दी, then Ravi | Today opens with Hindi labels | Auto | ✅ |
| LOG-04 | Change language in header to English | Whole UI switches language | Auto | ✅ |
| LOG-05 | Pick machine LDR001, then log in | Loader plan (Material Loading, Grading) | Auto | ✅ |
| LOG-06 | Tap ⏻ | Back to login | Auto | ✅ |

## 2. Today (task dashboard and ETA)

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| TOD-01 | Log in as Ravi on EXC001 | 4 tasks; current task has ETA, range and "Beginner operator +21 min" | Auto | ✅ ETA 1h 19m |
| TOD-02 | Start, then +1 cycle ×10 | "In progress"; 10/30 cycles; "Live pace so far" line appears | Auto | ✅ |
| TOD-03 | Done | Next task (Trenching) becomes current | Auto | ✅ |
| TOD-04 | Reload the page | Progress kept (offline persistence) | Auto | ✅ |
| TOD-05 | Planner vs Onyx table | Onyx 42 vs actual 42 on T003 | Auto | ✅ |

## 3. Safety

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| SAF-01 | Engine On, then Seatbelt Unfastened | Red "Fasten your seatbelt" banner within 2 s and spoken | Auto | ✅ |
| SAF-02 | Keep unbelted for 60 s | "Supervisor notified" banner and auto incident in log | Auto | ✅ |
| SAF-03 | Fasten seatbelt | Banner clears | Auto | ✅ |
| SAF-04 | Fill incident form, then Log | Incident appears in log | Auto | ✅ |
| SAF-05 | Set Rainy, Night and Dust | Proximity distances widen | Auto | ✅ 5 m → 10 m |
| SAF-06 | Engine on, then Simulate worker approaching | "STOP" banner, spoken, auto proximity incident | Auto | ✅ |
| SAF-07 | +30 min in extreme heat, then Took a break | "Take a break now", then resets | Auto | ✅ |
| SAF-08 | Live weather | Conditions filled from Open-Meteo | Auto | ✅ |
| SAF-09 | Engine off | Proximity and seatbelt alerts clear | Auto | ✅ |
| SAF-M1 | Camera detection with a real webcam; walk towards it | Box and distance on person; STOP when close | **Manual** | ☐ |

## 4. Replay (state engine)

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| REP-01 | ⏭ 08:50 at 8× | Warning 09:10, belt off 09:30, "20 MINUTES EARLY" reveal | Auto | ✅ |
| REP-02 | Backtest table | 79% · 18 min · 0.13 · control 5% | Auto | ✅ |
| REP-03 | Switch to control day | No reveal | Auto | ✅ |
| REP-04 | Click on the chart | Clock jumps to that time | Auto | ✅ |
| REP-M1 | Play at 4× with speakers on | Truck-delay nudge **spoken** at 09:10 | **Manual** | ☐ |

## 5. Insights

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| INS-01 | Open Insights | ₹840 idle cost; seatbelt findings on both alert rows; fuel mismatch on example row | Auto | ✅ |

## 6. Training, Shift summary, Supervisor

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| TRN-01 | Start recommended lesson, answer quiz | Steps, quiz, "Correct!/Not quite" | Auto | ✅ |
| TRN-02 | Turn latest incident into a lesson | Lesson built by LLM (e.g. "Maintain Safe Proximity: 4-meter Rule") | Auto | ✅ |
| TRN-03 | Book an instructor | "Instructor requested" | Auto | ✅ |
| SUM-01 | Open Shift | Tasks, idle, cost, alerts shown | Auto | ✅ |
| SUM-02 | Read it out | LLM summary uses the real facts ("…cut down the 160 minutes idle…") | Auto | ✅ |
| SUM-03 | WhatsApp link | `wa.me` URL containing the summary | Auto | ✅ |
| SUM-M1 | Enter a real phone number, tap WhatsApp | WhatsApp opens with the text; message arrives | **Manual** | ☐ |
| SUP-01 | Open Supervisor | Incidents listed, auto-logged tagged | Auto | ✅ |
| SUP-02 | Sync incidents | "Synced N"; incidents stored on API | Auto | ✅ |

## 7. Voice (push-to-talk, Sarvam speech)

| ID | Say | Expected reply | Type | Result |
|---|---|---|---|---|
| VOI-01 | "अगला काम क्या है?" | "अगला काम: Earth Excavation, 60 मिनट।" | Auto | ✅ |
| VOI-02 | "यह काम कितना समय लेगा?" | "…लगभग 79 मिनट में पूरा होगा।" | Auto | ✅ |
| VOI-03 | "देर क्यों हो रही है?" | "+21 मिनट: नया ऑपरेटर" | Auto | ✅ |
| VOI-04 | "एक आदमी मशीन के पीछे आ गया" | Logged as proximity incident | Auto | ✅ |
| VOI-05 | "काम हो गया" | Asks "confirm or cancel" | Auto | ✅ |
| VOI-06 | "बचाओ बचाओ" | Emergency banner, supervisor alerted | Auto | ✅ |
| VOI-07 | Tamil "அடுத்த வேலை என்ன?" | "அடுத்த பணி: Earth Excavation, 60 நிமிடம்." | Auto | ✅ |
| VOI-08 | Kannada "ಮುಂದಿನ ಕೆಲಸ ಏನು?" | "ಮುಂದಿನ ಕೆಲಸ: Earth Excavation, 60 ನಿಮಿಷ." | Auto | ✅ |
| VOI-09 | "How long will this task take?" | "…about 79 minutes." | Auto | ✅ |
| VOI-10 | "Start my training lesson" | Opens Training | Auto | ✅ |
| VOI-M1 | "काम हो गया", then "हाँ" | Task marked done (two-step confirm) | **Manual** | ☐ |
| VOI-M2 | Real mic in a noisy room | Recording stops ~1 s after you stop talking; correct reply | **Manual** | ☐ |
| VOI-M3 | Mixed Hindi-English, e.g. "next task kya hai" | Correct reply | **Manual** | ☐ |
| VOI-M4 | Critical alert while Onyx is speaking | Critical alert interrupts immediately | **Manual** | ☐ |
| VOI-M5 | Tamil/Kannada reply on the demo laptop | Audible (device voice or Sarvam audio) | **Manual** | ☐ |

## 8. Languages, phone layout, offline

| ID | Test | Expected | Type | Result |
|---|---|---|---|---|
| I18N-en/hi/ta/kn | All 7 screens in each language | No raw keys, no `{{placeholders}}` | Auto | ✅ ×4 |
| I18N-M1 | Native speaker reads Tamil and Kannada safety alerts | Correct and natural | **Manual** | ☐ |
| MOB-01 | All screens at 390 px | No sideways scrolling | Auto | ✅ |
| MOB-02 | Primary buttons on phone | ≥ 44 px tall | Auto | ✅ |
| MOB-M1 | Phone/tablet over Wi-Fi (`http://<laptop-ip>:5173`, Chrome flag for mic) | Works; mic and camera allowed | **Manual** | ☐ |
| MOB-M2 | Outdoors in sunlight, with gloves | Readable; buttons hittable | **Manual** | ☐ |
| OFF-01 | API unreachable | Today, Safety, Replay still work | Auto | ✅ |
| OFF-02 | API unreachable, Read it out | Template summary on device | Auto | ✅ |
| OFF-03 | API unreachable, log incident, then sync | Kept on device; "will sync when online" | Auto | ✅ |
| OFF-04 | API unreachable, incident → lesson | Built-in lesson used | Auto | ✅ |
| OFF-M1 | Turn Wi-Fi off mid-demo, then back on | App keeps working; sync succeeds after | **Manual** | ☐ |

## 9. Demo-day checks (manual, on the presentation laptop)

| ID | Check | Result |
|---|---|---|
| DEMO-01 | `http://localhost:8000/health` shows `groq: true, sarvam: true` on venue Wi-Fi | ☐ |
| DEMO-02 | Antivirus (Kaspersky) not blocking API calls: Read it out returns an AI summary | ☐ |
| DEMO-03 | Full 3-minute demo script (TEAM_PLAN §6) runs without touching code, timed twice | ☐ |
| DEMO-04 | Backup screen recording of the full demo saved locally | ☐ |
| DEMO-05 | Fresh start: log out, clear site data (F12 → Application → Local Storage → `onyx`) | ☐ |
| DEMO-06 | Volume up; laptop not on silent; mic permission granted in Chrome | ☐ |

## Known limitations (not bugs)

- Shift summary idle time comes from the organisers' telemetry for the selected machine, not from the live shift.
- The voice ETA and the screen ETA can differ by a minute due to rounding.
- The replay nudge is spoken only while playing, not when scrubbing the chart.
- Automated voice tests use Sarvam-generated speech, not a human voice, so VOI-M2/M3 still matter.
