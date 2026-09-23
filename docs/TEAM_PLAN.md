# Team Plan — tonight → 8:00 AM presentation

Two people, one repo, no merge fights. The work is split **by folder**, so each person owns different files.

- **Person A (Sadhya)**: the engine and operator screens: Today, Safety, Replay, Insights.
- **Person B (teammate)**: voice, backend and "people" screens: Training, Shift summary, Supervisor, plus the API and translations.

The shared foundation is already built and tested: types, datasets, ETA model, state engine (HMM), heat/WBGT, anomaly rules, seatbelt escalation, store, i18n, voice interface, API skeleton. **Build on it; don't rewrite it.**

---

## 1. Setup (10 min, both)

```bash
git clone https://github.com/abhaypateria/Caterpillar_Onyx.git
cd Caterpillar_Onyx/web && npm install && npm run dev        # http://localhost:5173
# second terminal
cd Caterpillar_Onyx/api && pip install -r requirements.txt
cp .env.example .env                                         # add keys (Person B)
uvicorn main:app --reload --port 8000
```

- `npm test` runs the engine tests (must stay green).
- `npm run build` must pass before every push.
- Open the app on a phone or tablet on the same Wi-Fi at `http://<laptop-ip>:5173`.

## 2. Git rules

1. **Work on your own branch**: `a/<feature>` or `b/<feature>`.
2. **Commit small, push often.** Merge into `main` at every checkpoint (§5), via PR or `git merge`.
3. **Before merging:** `git pull --rebase origin main`, then `npm run build`, then `npm test`.
4. **Only edit files you own** (§3). For a shared file, message the other person first and keep the change **append-only**.
5. **Never commit `.env` or API keys.**

## 3. File ownership

| Path | Owner | Notes |
|---|---|---|
| `web/src/engine/**` | A | Pure logic plus tests. B only imports from `engine/index.ts`. |
| `web/src/pages/Dashboard.tsx`, `Safety.tsx`, `Replay.tsx`, `Insights.tsx` | A | Plus any `web/src/components/a/**` |
| `web/src/pages/Training.tsx`, `Summary.tsx`, `Supervisor.tsx` | B | Plus any `web/src/components/b/**` |
| `web/src/voice/**`, `web/src/components/VoiceButton.tsx` | B | |
| `web/src/api/client.ts`, `api/**` | B | |
| `web/src/i18n/locales/hi.json`, `ta.json`, `kn.json` | B | Translations |
| `web/src/i18n/locales/en.json` | Shared | **Append-only**: A adds keys under `dashboard/safety/replay/insights`; B under `training/summary/supervisor/voice` |
| `web/src/types.ts`, `web/src/store/index.ts` | Shared | **Append-only**; tell the other person |
| `web/src/components/Layout.tsx`, `AlertBanner.tsx`, `index.css`, `App.tsx` | A | Ask A for changes |

## 4. What's already built (use it)

| Import from `../engine` | What it does |
|---|---|
| `PROVIDED_TELEMETRY`, `PROVIDED_TASKS`, `OPERATORS`, `MACHINES`, `BENCH` | Organisers' data (exact) and benchmarks |
| `fitEta(rows)`, `predictEta(model, input)` | Bayesian ETA → `{minutes, low, high, contributions[], confidence}` |
| `liveEta(pred, totalCycles, doneCycles, elapsedMin)` | ETA that narrows as cycles complete |
| `shiftWindows(DEMO_DAY)`, `step()`, `run()` | 5-min simulated shift and HMM filter → `{belief, risk, state, alarm}` per window |
| `backtest(windows)` | Catch rate, lead time, false alarms |
| `idleRootCause(window, ctx)`, `CAUSE_ACTIONS` | Truck delay / heat / weather / unexplained, and who to tell (i18n keys) |
| `analyse(rows)`, `idleCost(min)` | Telemetry findings (idle, productivity, seatbelt, fuel mismatch, outlier); ₹ / L / CO₂ |
| `seatbeltStage(engineOn, belted, sec)` | ok → voice → repeat → supervisor |
| `wbgt()`, `breakDue()`, `proximityThresholds()`, `weatherFromCode()` | Conditions and heat |

| Other modules | |
|---|---|
| `useStore()` (`store/index.ts`) | Operator, language, tasks, incidents (`addIncident`), conditions, machine state, alerts (`pushAlert`), risk |
| `speak(text, lang, priority)`, `listen(lang)`, `parseIntent(text)` (`voice/`) | Voice contract |
| `api.*` (`api/client.ts`) | Backend calls; each returns `null` on failure, so **always have a fallback** |
| `fetchWeather()`, `whatsappLink()` | Open-Meteo and the WhatsApp link |

**Demo facts** (from `npm test` and the engine):
- On `DEMO_DAY`, the truck is late from **09:05**. The risk alarm fires at **09:10**, while the operator is still belted. The seatbelt comes off at **09:30**, which is **20 min of warning**.
- Onyx's ETA beats the planner on the 5 provided tasks.

---

## 5. Timeline

| Time | Checkpoint | Person A | Person B |
|---|---|---|---|
| **22:30–01:00** | **CP1 merge 01:00** | **Today** screen: current task card, ETA + range + "why", Start / +1 cycle / Done with live ETA, today's list. **Safety**: engine/belt toggles → escalation, auto-incident, alert banner, spoken alerts | **API**: add keys, check Groq works, write template fallbacks. **Voice**: route every intent in `VoiceButton` (next task, done + confirm, ETA, why, incident, mayday). Test hi/ta/kn recognition on the demo phone and note the results |
| **01:00–03:30** | **CP2 merge 03:30** | **Replay**: play DEMO_DAY, risk gauge, state bars, root cause, spoken nudge, the 09:10 → 09:30 reveal, backtest table. **Safety**: webcam person detection (COCO-SSD) + radar + widened distances, conditions from Open-Meteo, heat/break timer | **Voice incident**: speech → `api.structureIncident` → `addIncident` → sync. **Training**: lesson list, player (`speak`), quiz, recommendations, near-miss → lesson. **Translations**: fill `ta.json` and `kn.json` (have a native speaker check the safety lines) |
| **03:30–05:00** | **CP3 feature freeze 05:00** | **Insights**: findings table, idle vs 25% target, idle ₹/L/CO₂, fuel-mismatch "for review", operator profile | **Shift summary**: facts → `api.summary`, spoken, plus a WhatsApp `wa.me` link. **Supervisor**: fleet status, incident list + timeline, dispatcher nudges. Sarvam STT if time allows |
| **05:00–06:30** | Polish | Bug fixes, phone/tablet layout, sunlight contrast | Bug fixes, full voice run-through in Hindi |
| **06:30–07:30** | Rehearse | Run the demo script twice, then record a **backup video** of the full demo | Same |

**If behind, cut in this order:** Sarvam STT → Supervisor timeline → webcam proximity (keep the simulated radar) → Tamil/Kannada voice (keep the screen translations) → Insights profile.
**Never cut:** Today + ETA, seatbelt, Replay reveal, voice incident in Hindi.

## 6. Demo script (3 min, one operator's day)

1. **Login** as Ravi (OP1001, Hindi) on EXC001.
2. **Today** — "Agla kaam kya hai?" → the task card and the ETA with its reason ("+12 min: beginner").
3. **Safety** — engine on, belt off → spoken Hindi alert → escalates → incident logged automatically.
4. **Replay** — the late truck at 09:05 → risk climbs → **warning at 09:10**, "Truck late, engine band karo, belt lagaye rakho" → the seatbelt came off at 09:30. *"Beeps react; Onyx predicts."* Then the backtest numbers.
5. **Voice incident** — "Near miss log karo, ek aadmi machine ke peeche aa gaya" → structured report → becomes a lesson.
6. **Insights** — idle cost in ₹ and the fuel-mismatch flag.
7. **Shift summary** — spoken in Hindi → WhatsApp message to the owner.

## 7. API contract (Person B implements; Person A calls via `api.*`)

| Endpoint | In | Out | Fallback |
|---|---|---|---|
| `GET /health` | — | `{ok, groq, llm_models, sarvam}` | — |
| `POST /llm/incident` | `{text, lang}` | `{type, severity, description}` | keyword rules |
| `POST /llm/intent` | `{text, lang}` | `{name}` | `unknown` |
| `POST /llm/summary` | `{facts, lang, audience}` | `{text}` | template |
| `POST /llm/lesson` | `{incident, lang}` | `{title, steps[], quiz[]}` | template per type (TODO) |
| `POST /speech/stt` | `{audio(base64), lang}` | `{text}` | browser recognition |
| `POST /speech/tts` | `{text, lang}` | `{audio(base64)}` | browser speechSynthesis |
| `POST /incidents` · `GET /incidents` | `{incidents[]}` | `{saved[]}` · list | local store |

**Keys** (in `api/.env`, see `api/.env.example`): `GROQ_API_KEY` from console.groq.com; `SARVAM_API_KEY` from the Sarvam dashboard. The LLM is Groq only (Gemini was dropped: free tier is 20 requests/day and was often overloaded).
