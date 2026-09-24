# How Onyx Works

What each feature actually computes, with the real formulas, constants and worked numbers from the code. Use it to prepare for the demo and for judges' "how does it work?" questions.

Code locations are given as `file` so you can show the implementation if asked.

---

## 1. Task time estimate (Today screen)

`web/src/engine/eta.ts`

### 1a. Before the task starts: Bayesian regression on the planner's error

The model does not predict minutes directly. It predicts **how wrong the planner's estimate will be**, as a ratio:

```
log(actual / planned) = w · x + noise
x = [1, Beginner, Intermediate, Cloudy, Windy, Rainy, machineAge − 3]
```

Each feature is 0/1 (skill, weather) or years (machine age). Expert and Sunny are the baseline (all zeros).

**Why a ratio?** A beginner is slow *by a percentage*: 40% slower on a 30-minute task and on a 90-minute task alike. Modelling the log of the ratio makes each factor multiply the plan.

**Why Bayesian?** We have only 5 real tasks. So each weight starts from an expert **prior**, then the 5 real tasks update it:

| Feature | Prior mean (≈ effect) | Prior uncertainty |
|---|---|---|
| Beginner | +0.25 (≈ +28%) | ±0.15 |
| Intermediate | +0.08 (≈ +8%) | ±0.10 |
| Cloudy / Windy / Rainy | +0.04 / +0.07 / +0.12 | ±0.08 / ±0.08 / ±0.10 |
| Machine age | +0.01 per year over 3 | ±0.01 |
| Noise | σ = 0.07 | |

Fitting is standard conjugate Bayesian linear regression (closed form, no training loop):

```
posterior precision  A = XᵀX / σ² + Λ₀          (Λ₀ = 1 / prior variance)
posterior mean       w = A⁻¹ (Xᵀy / σ² + Λ₀ μ₀)
posterior covariance Σ = A⁻¹
```

**Prediction for one task**

```
minutes     = planned × exp(w · x)
sd (log)    = √(xᵀ Σ x + σ²)
90% range   = minutes × exp(±1.645 × sd)
confidence  = 1 − 2 × sd          (shown as a %)
```

**The "Why?" panel:** each factor's minutes = `planned × (exp(wᵢ · xᵢ) − 1)`.

**Worked example (the demo):** Ravi (Beginner), Earth Excavation, planned 60 min, Sunny, EXC001 (3 years old):
- Only the Beginner feature is on. After learning from T003 (a beginner took 42 min against a 30-minute plan), its weight is ≈ 0.27.
- 60 × e^0.27 ≈ **79 min**. The panel shows **"Beginner operator +21 min"**.
- sd ≈ 0.112, so the range is 60 × … ≈ **66–95 min** and the confidence is **78%**.
- Change the weather to **Rain** on the Safety screen and every estimate on Today rises, because Rainy switches on.

**Validation**
- **In-sample** (the 5 tasks it learned from): Onyx 0.7 min average error against 7.6 for the planner. It knows these tasks, so it's not a fair test.
- **Held-out:** a model fitted only on the 5 real tasks, tested on 60 unseen synthetic tasks: **3.9 min** against **13.5 min** for the planner.

### 1b. While the task runs: live update per load cycle

Once the task starts, each **+1 cycle** is evidence about this operator's real pace today. The model treats *minutes per cycle* as unknown and updates it (a Normal–Normal conjugate update):

```
prior per-cycle time   μ₀ = predicted minutes / total cycles      (79 / 30 = 2.63 min)
prior uncertainty      σ₀ = μ₀ × sd(log)                          (≈ 0.29 min)
per-cycle variability  σ  = 0.3 × μ₀                              (cycles naturally vary)
after n cycles taking x̄ minutes on average:
  μ_post = (μ₀/σ₀² + n·x̄/σ²) / (1/σ₀² + n/σ²)
  total  = elapsed + (cycles left) × μ_post
  time left = total − elapsed
  range  = total ± 1.645 × √(left² · var_post + left · σ²)
```

- The prior counts about as much as **7 cycles** of evidence ((0.3/0.112)² ≈ 7). After roughly 7 cycles the operator's real pace dominates.
- The range narrows as the task progresses and reaches zero at the last cycle.
- **Screen:** before Start the headline is the predicted **ETA**. After Start it shows **Time left** (counting down), with **Elapsed**, **Total** and **Finishes ≈ hh:mm**.
- **Demo clock:** there's no real machine, so each **+1 cycle** adds one cycle of simulated work at the predicted pace ±8%.

---

## 2. Operator state engine: predicting the unsafe moment (Replay)

`web/src/engine/hmm.ts`, `synthetic.ts`, `backtest.ts`, `insights.ts`

### The idea

In the organisers' data, **both seatbelt alerts happened in windows of long idling and very few load cycles**. The hypothesis: late truck → operator waits → gets bored → unbuckles → work restarts suddenly while unbelted. So **idling comes before unsafe behaviour**, and can be detected before the seatbelt comes off.

### Hidden Markov Model

The operator's mental state can't be observed directly. We infer it every 5 minutes from what the machine reports.

**Hidden states:** Productive, Waiting, Disengaged (unsafe), Fatigued.

**Observations** (each bucketed into levels):

| Signal | Levels |
|---|---|
| Load cycles in 5 min | 0 · 1–3 · ≥4 |
| Idle minutes in 5 min | 0–1 · 2–3 · ≥4 |
| Seatbelt | off · on |
| Hours since last break | < 2.5 · 2.5–5 · ≥ 5 |
| Heat index | < 32 °C · 32–40 · ≥ 40 |

Each state has a table of how likely each level is (e.g. Disengaged → belt off 70% of the time; Productive → belt off 2%). The chance of a window's observations given a state is the product of the five (`emission()`).

**Transitions** (probability of moving from one state to the next in 5 minutes):

```
             Prod   Wait   Diseng  Fatig
Productive [ 0.85   0.12   0.02    0.01 ]
Waiting    [ 0.30   0.55   0.14    0.01 ]
Disengaged [ 0.20   0.10   0.68    0.02 ]
Fatigued   [ 0.05   0.05   0.10    0.80 ]
```

**Context-aware transitions:** known facts shift these probabilities **before** idling even shows:
- **Truck more than 10 min late:** Productive→Waiting +0.15, Waiting→Disengaged +0.12.
- **5+ hours since the last break:** more drift to Fatigued.
- **Heat index 40 °C or more:** more drift to Fatigued.

**Filtering** (the forward algorithm, every 5 minutes):

```
belief_t = normalise( (belief_{t−1} × A) ⊙ emission(observations_t) )
```

**Forecasting 15 minutes (3 steps) ahead.** Disengaged and Fatigued are made "absorbing" (once entered, you stay), so the forecast gives the probability of **reaching** them within 15 minutes:
- **Unbuckle risk (gauge)** = P(reach Disengaged within 15 min).
- **Fatigue** = P(reach Fatigued within 15 min). It's shown separately and drives break advice, not the seatbelt alarm. Mixing the two made hot, busy mid-mornings look like imminent unbuckling.
- **Alarm** = risk > **50%**, while the operator is not yet Disengaged (the point is to warn *before* it happens).
- **Engine off** (break or lunch) means no operating risk, and the belief resets.

### Likely cause, and who gets told

Checked in order, for windows with at least 3 idle minutes:
1. A truck is late → **"Truck N minutes late. Switch the engine off and stay belted."** The supervisor gets "re-sequence haul trucks".
2. 5+ hours since the last break, or heat index 40 °C or more → **"Take a water break now."**
3. Rain or wind and the next task is demolition or grading → caution, and the supervisor gets "swap task order".
4. Otherwise → **unexplained idling**. Only this counts as an anomaly, so explained waiting is never blamed on the operator.

### The demo day (simulated, labelled on screen)

The real telemetry is 2-hourly, so we simulate 5-minute windows that match it (`shiftWindows(DEMO_DAY)`):
- The shift runs 07:00–15:00, with lunch 12:00–12:45 (engine off, which resets fatigue).
- **The truck is late from 09:05 for 60 minutes.** While waiting there are 0–1 cycles and 4–5 idle minutes per window.
- **After 25 minutes or more of idling**, the operator unbuckles with 50% probability per window. They re-buckle when real work resumes.
- Temperature is 33 °C plus up to 6 °C in the afternoon, at 60% humidity.
- **Result:** risk crosses 50% at **09:10**, and the seatbelt comes off at **09:30**, which is **20 minutes of warning**.

### Backtest (the numbers on the Replay screen)

Each scenario runs 40 simulated shifts, with a late truck starting at a random time between 08:00 and 13:00 and lasting 35–75 minutes.
- **Event:** the seatbelt comes off while the engine runs.
- **Caught:** an alarm started within the 30 minutes before the event. **Lead time** is the gap.
- **False alarm:** an alarm with no event in the next 30 minutes.

| | Idle → unbuckle days | Control days | Beep only |
|---|---|---|---|
| Warned ahead | **79%** | 5% | 0% |
| Average lead time | **18 min** | — | 0 |
| False alarms per shift | **0.13** | 1.02 | — |

**Control days** make the seatbelt come off at random (4% per window), unrelated to idling. Catching only 5% there shows the model isn't just echoing the simulator: it only predicts unbuckling when there's a real idle-driven lead-up.

---

## 3. Seatbelt escalation (always running)

`web/src/engine/insights.ts → seatbeltStage`, `components/a/SafetyMonitor.tsx`

Checked every second, while the engine is on and the belt is off:

| Time unbelted | Action |
|---|---|
| 0 s | Red banner and spoken "Fasten your seatbelt" |
| 20 s | Spoken again |
| 60 s | "Supervisor notified" banner, spoken, **automatic incident** (seatbelt, medium) with a snapshot of the machine state |

Fastening the belt or stopping the engine clears it. These are fixed rules, never AI, and Onyx never controls the machine.

---

## 4. Heat stress and breaks (Safety)

`web/src/engine/conditions.ts`

**WBGT (wet-bulb globe temperature)** is the standard heat-stress index. Without a globe thermometer we use the Australian Bureau of Meteorology shade approximation:

```
vapour pressure  e = RH/100 × 6.105 × exp(17.27·T / (237.7 + T))      (hPa)
WBGT            ≈ 0.567·T + 0.393·e + 3.94
```

| WBGT | Level | Work / rest per hour | Break due after continuous engine time |
|---|---|---|---|
| < 28 °C | normal | 60 / 0 | 120 min |
| 28–30 | caution | 45 / 15 | 45 min |
| 30–32 | high heat | 30 / 30 | 30 min |
| ≥ 32 | extreme heat | 15 / 45 | 15 min |

**Worked example:** 34 °C, 55% humidity → e ≈ 29.1 → **WBGT ≈ 34.7 → extreme heat → break every 15 min**. It's a non-diagnostic reminder, not a medical assessment. "Feels like" is `T + 0.33·e − 4`, which is also the heat input to the state engine.

---

## 5. Proximity hazards (Safety)

`web/src/engine/conditions.ts`, `components/a/Proximity.tsx`, `components/a/distance.ts`

**Safety distances:** warn at 5 m, stop at 2 m, multiplied by a factor:

```
factor = 1 + 0.25 (rain) + 0.25 (dust) + 0.2 (dusk) or 0.5 (night) + 0.15 (muddy or slope)
```

Rain + night + dust = 2.0, so the distances become **warn 10 m, stop 4 m**.

**Simulated sensors:** four zones (front, rear, left, right) drift randomly between 6 and 20 m. "Simulate worker approaching" moves one zone in from 9 m by 0.5 m every half-second.

**Camera detection** (runs entirely in the browser, offline):
1. **COCO-SSD** (SSD-Lite MobileNet v2, bundled in `public/models`) detects objects in each frame, about 8 times a second. We keep **person** detections with confidence above 50%.
2. **Distance from a single camera** (no depth sensor), using a pinhole model of a typical ~70° webcam, where the frame is about 1.40·d wide and 0.79·d tall at distance d:
   ```
   by height = 1.7 m (person height) / (box height fraction × 0.79)
   by width  = 0.5 m (shoulder width) / (box width fraction × 1.40)
   distance  = by width, if the box touches the top/bottom edge (person cut off, i.e. close)
             = the nearer of the two, otherwise (safety-conservative)
   ```
   Using height alone made a close, cut-off person look far away (3.4 m instead of about 0.5 m).
3. **Direction:** the left or right third of the frame means left or right; the middle means behind (the camera is treated as the rear camera).

**Alerts** (only while the engine runs), for the nearest of the sensors and the camera:
- Inside the warn distance: an amber banner and a spoken warning.
- Inside the stop distance: a red **STOP** banner, spoken, plus an automatic **high-severity proximity incident** (at most one every 30 s).

**Live weather:** Open-Meteo (free, no key) at the site's coordinates gives temperature, humidity, weather code and day/night. The weather code maps to Sunny, Cloudy, Windy (wind 30 km/h or more) or Rainy.

---

## 6. Unusual behaviour (Insights)

`web/src/engine/insights.ts → analyse`

For each telemetry reading (the organisers' 2-hourly rows):

```
running minutes = (engine hours − previous reading's engine hours) × 60     (if between 0 and 8 h)
idle share      = idle minutes / running minutes
fuel per cycle  = fuel used / load cycles
expected fuel   = idle min/60 × 3.5 L/h  +  cycles × 0.45 L  +  working min/60 × 0.5 L/h
```

| Flag | Rule |
|---|---|
| ⛔ Long idle | idle > 40 min in the reading |
| ⚠ Idle share | idle > 50% of running time |
| ⚠ High fuel per cycle | > 1.0 L per cycle |
| ⛔ Seatbelt off | reading shows unfastened |
| ⚠ Fuel above expected | fuel > 1.35 × expected, i.e. **possible theft or a leak, for review** |
| ⚠ Statistical outlier | idle or fuel/cycle more than 2 standard deviations above the fleet |

**Idle cost:** idle minutes/60 × 3.5 L/h, × ₹90/L, and × 2.68 kg CO₂/L. The real rows (160 min) give **9.3 L, ₹840, 25 kg CO₂**. The benchmarks are the industry average of ~39% idle and a good-fleet target of 25%.

**Operator profile** (coaching, not punishment):
- **Safety:** % of readings with the belt fastened.
- **Idle discipline:** 100 − 2 × (idle share − 25%).
- **Productivity:** cycles per hour ÷ 10.
- **Fuel efficiency:** 0.6 L ÷ average fuel per cycle.

---

## 7. Voice assistant

`web/src/voice/index.ts`, `voice/sarvam.ts`, `components/VoiceButton.tsx`, `api/main.py`

**Press 🎙 → speak → press ⏹:**
1. **Record:** the mic opens (the bubble shows "Listening…" only once audio is captured) and records until the second press, with a 30 s safety limit. The mic is then fully released.
2. **Convert:** the browser recording is decoded, resampled to **16 kHz mono**, and encoded as WAV.
3. **Transcribe:** the audio goes to our API, then **Sarvam speech-to-text** (`saarika:v2.5`) in the operator's language. It understands Hindi, Tamil, Kannada, English and mixed speech. Chrome's recognition is the fallback.
4. **Understand:**
   - **Offline keyword rules** first, covering Latin-script Hindi ("agla kaam"), Devanagari ("अगला काम"), Tamil and Kannada.
   - If nothing matches and we're online, **Groq** classifies the intent.
5. **Act:** next task, ETA (the same model as the screen), why late (the biggest ETA factor), task done (with a spoken confirm/cancel step), incident, mayday, open lesson, open summary.
6. **Reply:** text in the selected language, spoken by the **device voice** if the device has one for that language, otherwise **Sarvam text-to-speech** (cached).

**Speech queue:**
- **Priorities:** critical interrupts everything, warnings wait for the current sentence, info waits.
- **No duplicates:** the same message is never queued twice.
- **Controls:** Pause/Resume continue mid-sentence; Stop clears everything.
- **Watchdog:** a timeout clears a stuck sentence.
- **Chrome fix:** Onyx resumes the speech engine before cancelling, because Chrome otherwise stays paused and silences every later reply.

**Voice incident report:** Groq returns `{type, severity, description}` as JSON. Without Groq, keyword rules apply, in order: injury (high) → proximity (high) → seatbelt → damage → near miss → other. "No one was hurt" / "किसी को चोट नहीं लगी" is removed first, so it isn't classified as an injury.

---

## 8. AI layer (Groq) and fallbacks

`api/main.py`

- **Models tried in order:** `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen`. On a rate limit or error, the next model is tried. Responses are JSON-only, and invalid JSON is retried.
- **Used for:** understanding free-form speech, structuring incidents, shift summaries (2–3 sentences in the operator's language, one good point and one to improve) and lessons generated from incidents.
- **Every AI feature has a no-AI fallback:** keyword rules, template summaries, built-in lessons. **Safety never depends on AI.**
- **HTTPS behind antivirus:** the API trusts the Windows certificate store (`truststore`), so Kaspersky's HTTPS inspection doesn't break it. Networks with their own firewall certificate (e.g. Fortinet) still block it; use another network.

---

## 9. Training, Shift, Supervisor

- **Recommended lesson:** chosen from the latest incident type (proximity or near miss → swing-radius lesson, seatbelt → seatbelt lesson), otherwise the idle lesson.
- **Lesson from incident:** Groq writes title, steps and quiz from the real incident, in the operator's language; offline, the matching built-in lesson is used.
- **Lesson audio:** Play reads the title and steps sentence by sentence, always restarting from the beginning. Pause, Resume and Stop are available.
- **Shift summary facts:**
  - tasks done out of the total;
  - idle minutes from this machine's telemetry, with the cost;
  - safety alerts (seatbelt, proximity and high-severity incidents);
  - lessons completed;
  - hours since login.

  Groq turns these into speech for the operator or the owner. **WhatsApp** opens `wa.me/<number>?text=<summary>`; a free Cloud API integration is on the roadmap.
- **Supervisor fleet status:** a machine with a seatbelt finding shows **Unfastened**, one with other serious findings shows **Warn**, otherwise **Clear**. Dispatcher actions come from the Replay's likely cause and the idle findings.
- **Sync:** incidents are stored on the device first (so they work offline) and sent to the API's SQLite database on **Sync**.

---

## 10. Language, offline and data

- **Language:** all UI text comes from `en/hi/ta/kn.json`, and a test guarantees the four files have identical keys. **Data values** (task names, sites, skill, weather) stay in English internally and are translated only when displayed, so the models and voice logic are unaffected.
- **Offline:** the app state is saved in the browser (localStorage). The models, safety rules, camera detection and lessons all run on the device. Only speech (Sarvam), AI text (Groq), live weather and sync need internet, and each has a fallback.
- **Data:** the organisers' 4 telemetry rows and 5 task rows are used exactly as given. Everything else (the 5-minute replay, backtest shifts, held-out tasks, one fuel-mismatch example row) is **synthetic and labelled as such** in the app.
