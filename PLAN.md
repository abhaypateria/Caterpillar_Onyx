# Onyx — Build Plan

This plan merges the two READMEs (`README.md`, which is heavy on algorithms, and `README_ONYX.md`, which is product-focused) into one buildable scope. It includes only the **PRD outcomes and practical features**. Gamified leaderboards, streaks and badges, phone-as-sensor, remote mentor, crew optimiser and similar ideas are parked (see §7).

---

## 1. What research changed

| Finding | Impact on plan |
|---|---|
| Cat already ships a **Seat Belt Reminder** (alarm when the parking brake is released unbuckled; the event is logged in VisionLink) and **VisionLink Operator Coaching** (onboard tips) | A plain seatbelt alarm or tip engine is **not novel**. Our differentiation is **prediction before the violation, cause of the idling, voice in local languages, and working without internet**. We integrate with the OEM interlock and never replace it. |
| Construction equipment idles **~38–40% of engine hours**; good fleets reach **20–25%**; an excavator burns **~3–5 L/h** at idle | Use these as benchmarks and for ₹/fuel-waste figures. The old prototype's 1.5 L/h was too low. |
| **Chrome Web Speech API** sends audio to Google's servers (no offline use); Tamil and Kannada support is unconfirmed; mixed Hindi-English is weak | Test on day 1. Use **Sarvam AI** for speech recognition (handles mixed Hindi-English and Tamil-English, ₹1,000 free credits) and fall back to Web Speech. Offline mode uses fixed keyword commands only. |
| **Bhashini** has free speech recognition, speech output and translation for 22 Indian languages (non-commercial use) | Mention it on the production-roadmap slide; optional backup provider. |
| **WhatsApp Cloud API**: the test number is free; production utility messages cost ~₹0.115 each | The owner summary is viable. Say "under ₹4 per owner per month" on the pitch. |
| **Open-Meteo**: free, no key, 10k calls/day, includes temperature, humidity, apparent temperature and precipitation | Use it for live conditions and the heat index. |
| Heat safety is defined by **WBGT** work/rest tables (NDMA heat guidance references WBGT) | Estimate WBGT from temperature and humidity, then drive break reminders from a work/rest table, not a fixed timer. |
| **TF.js COCO-SSD** detects people in the browser at usable frame rates on a laptop | Proximity demo via webcam is feasible; run it on a laptop, not a low-end phone. |

## 2. Issues in the current READMEs

1. **"Onyx warned at 09:45" is not in the data.** The provided telemetry is 2-hourly, so the 15-minute forecast can only be shown on **simulated 5-minute data**. Say that explicitly on screen ("simulated replay based on real rows").
2. **Circular backtest risk.** If the synthetic data is generated with "idle → unbuckle" built in, the model finding it proves nothing. Keep the generator's assumptions visible, and show one result on data *without* that link to show the model doesn't invent it.
3. **The idle ↔ unbuckle link rests on 2 of 4 rows.** Keep calling it a hypothesis, as `README.md` already does.
4. **`README_ONYX.md` example numbers don't match the data.** It shows 0.21 L/cycle "normal", while the provided data is 0.43–2.0 L/cycle. Use real figures.
5. **The two READMEs overlap and conflict** (stack, MVP list, where ustad benchmarking sits). The **MVP list in `README_ONYX.md` §25 has 14 items**, which is too many. This plan is the single source of truth for scope.
6. **The nudge learner (Thompson sampling) can't visibly learn in a 5-minute demo**, and its "streak" style is gamification. Parked.
7. **The seatbelt must never "lock hydraulics" from our app**; that's the OEM interlock's job (both READMEs agree; the old prototype text didn't).

## 3. Features to start with

### P0 — Must ship (PRD)

| # | Feature | PRD outcome | Notes |
|---|---|---|---|
| 1 | **Daily task dashboard** | Task dashboard | Current task card, today's list, status, predicted finish time, available by voice |
| 2 | **Explainable task-time estimate** | Task time estimation | Bayesian log-ratio model on skill, weather and machine age; range plus reasons ("+7 min rain") |
| 3 | **Live ETA update during a task** | Task time estimation | Each finished load cycle updates the per-cycle time estimate, so the ETA range narrows as work progresses |
| 4 | **Seatbelt compliance** | Safety | Detect → spoken alert → escalate to supervisor if not fixed in N seconds → auto-log |
| 5 | **Operator state engine (predicted risk)** | Safety + unusual behaviour | HMM forward filter on 5-min windows; 15-min risk gauge; replay of real and simulated data |
| 6 | **Idle root cause** | Unusual behaviour | Truck delay / heat / weather / unexplained; **only unexplained idle is flagged** |
| 7 | **Unusual behaviour detection** | Unusual behaviour | Unexplained idle, fuel per cycle vs. baseline, seatbelt, statistical outliers; worded as "observations" |
| 8 | **Proximity hazard** | Safety | Webcam person detection (COCO-SSD) and simulated radar; safety distance widens in rain, dust, dark |
| 9 | **Incident logging (voice + form)** | Safety | Speech → structured report with telemetry snapshot; auto-logs from #4 and #8 |
| 10 | **Working conditions + heat** | Safety (conditions) | Open-Meteo, estimated WBGT, work/rest table, break reminders |
| 11 | **Training hub** | Training | 1–3 min lessons (audio + visual), quiz, instructor booking, recommended from #5–#7 |
| 12 | **Near-miss → lesson** | Training | An incident becomes a short scenario lesson in the operator's language |

### P1 — Practical, build right after P0

| # | Feature | Why |
|---|---|---|
| 13 | **Voice layer, 4 languages** | Push-to-talk, ~15 intents, priority-based speech, confirmation before data changes, "Mayday"; interface in EN/HI/TA/KN |
| 14 | **Operator login (profile or QR code)** | Ties data to the person in the seat; needed by #2, #5 and #11 |
| 15 | **Voice pre-start checklist** | Practical safety habit; checks the seatbelt against telemetry |
| 16 | **Shift summary** | "How was my shift?", shown on screen and spoken |
| 17 | **Supervisor view + incident replay** | Fleet status, incident timeline, per-operator profile |
| 18 | **WhatsApp owner summary** | Cloud API test number, with a `wa.me` link as fallback |
| 19 | **Diesel/fuel mismatch flag** | Fuel vs. engine hours × cycles; "for review" wording |
| 20 | **Offline mode** | PWA cache, IndexedDB queue, rules and filters run on the device |

### P2 — Only if P0 and P1 are done

- **Supervisor copilot (LLM Q&A over data)**, e.g. "Why was T002 delayed?"
- **Ustad benchmark**: cycle time vs. expert (needs cycle-level data, synthetic only)
- **Idle fuel/CO₂ counter** (2.68 kg CO₂ per litre)
- **Landing page** in the landonorris-inspired style
- **Shift handover voice notes**

## 4. Architecture

```
 Android tablet / laptop (PWA, React + TS)             FastAPI (Python)
 ┌───────────────────────────────────────┐            ┌──────────────────────────┐
 │ UI: cab mode · supervisor · training  │  sync      │ /data  telemetry, tasks  │
 │ Voice: STT/TTS adapter + intents      │◄──────────►│ /incidents /lessons      │
 │ On-device engine (TS):                │  when      │ /llm   structure, summary│
 │   safety rules · HMM filter · ETA     │  online    │ /whatsapp  send summary  │
 │   root cause · heat/WBGT              │            │ /weather  Open-Meteo     │
 │ IndexedDB: events, queue, content     │            │ SQLite                   │
 │ TF.js COCO-SSD (proximity demo)       │            │ models/: fit HMM + ETA → │
 └───────────────────────────────────────┘            │   JSON params for device │
                                                      └──────────────────────────┘
```

- **Safety rules are deterministic and run on the device.** An LLM is never in the safety path.
- **Models are fitted in Python** (`numpy`, `hmmlearn`, `scipy`) and exported as JSON, then run in TypeScript, so they work offline.
- **Speech goes through one adapter interface** (`transcribe`, `speak`): Sarvam → Web Speech → offline keywords.
- **The LLM** (Claude via API) handles intent parsing for free-form speech, incident structuring, summaries and lesson text. Every path has a template fallback.

## 5. Milestones

| Milestone | Deliverable | Done when |
|---|---|---|
| **M0 Setup** | Repo layout (`web/`, `api/`, `models/`, `data/`); CI lint; datasets as CSV; design tokens; i18n scaffold with 4 languages | App shell runs; language switch works |
| **M0.5 Day-1 spikes** | Test Hindi, Tamil and Kannada speech recognition and speech output on the demo device (Sarvam + Web Speech); WhatsApp test send; COCO-SSD on a webcam | Go/no-go per risk, noted in this file |
| **M1 Data + models** | Synthetic generator (5-min windows, truck ETA, heat); fitted HMM; Bayesian ETA; root-cause rules; anomaly rules; unit tests | Backtest table in README filled with real numbers |
| **M2 PRD screens** | P0 #1–#12 in cab mode and supervisor view | End-to-end demo runs with voice off |
| **M3 Voice** | P1 #13–#15 | Full demo path is hands-free in Hindi + English; Tamil and Kannada for core intents |
| **M4 Owner + offline** | P1 #16–#20 | Airplane-mode test passes; WhatsApp arrives on a phone |
| **M5 Demo** | Script, native-speaker review of TA/KN, sunlight and glove test, backup recording | Two clean rehearsals |

## 6. Suggested split (4 people)

- **Models & data**: generator, HMM, ETA, root cause, anomalies, backtest.
- **Operator app**: cab-mode screens, on-device engine port, offline/PWA.
- **Voice & language**: STT/TTS adapter, intents, i18n, translations, lesson audio.
- **Backend & integrations**: FastAPI, incidents, LLM calls, WhatsApp, weather, supervisor view, proximity demo.

## 7. Parked (not now)

Leaderboards, streaks, badges, crew safety goals · nudge learner (bandit) · crew optimiser · counterfactual shift replay · phone as sensor · remote mentor · photo inspections · utility no-go zones and geofencing · theft alerts · dealer booking · predictive maintenance · weather-aware scheduling.

## 8. Decisions needed

1. **Deadline and team size**, to set milestone dates.
2. **Speech provider for the demo**: Sarvam (best mixed-language support, uses credits) vs. Web Speech only (free, weaker). Recommended: Sarvam with Web Speech fallback.
3. **LLM provider and key** for the language layer.
4. **Demo hardware**: Android tablet for cab mode and a laptop for webcam proximity + supervisor view.

## Sources

- Cat Seat Belt Reminder — https://www.cat.com/en_GB/by-industry/construction-industry-resources/technology/detect/safety-technology/seat-belt-reminder.html
- VisionLink Operator Coaching — https://www.cat.com/en_IN/news/machine-press-releases/caterpillar-launches-three-new-features-for-visionlink-productivity.html
- WhatsApp Business Platform pricing — https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Bhashini — https://en.wikipedia.org/wiki/Bhashini · https://bhashini.gitbook.io/bhashini-apis
- Sarvam speech-to-text — https://www.sarvam.ai/apis/speech-to-text · https://www.sarvam.ai/api-pricing
- Web Speech API — https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition · https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md
- Open-Meteo — https://open-meteo.com/en/docs
- Idle benchmarks — https://www.constructionequipment.com/sustainability/article/10757122/how-to-manage-engine-idling-for-efficiency · https://www.finning.com/en_CA/company/blog/reducing-fuel-burn-and-idle-time-in-excavators.html
- Heat stress / WBGT — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4730480/ · https://www.osha.gov/heat-exposure/water-rest-shade
- COCO-SSD — https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/README.md
- India operator skill gap (IESC) — https://equipmenttimes.in/empowering-operators-the-mission-achievements-of-iesc
