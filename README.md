# Caterpillar Onyx — Smart Operator Assistant
 
A voice-first copilot for CAT machine operators in India that **predicts the unsafe moment before it happens**, speaks to the operator in their own language, trains them on the job and shows owners what their machines are doing.
 
> *Seatbelt beeps react. Onyx predicts.*
>
> *India needs lakhs of new operators, most of whom don't read English. Onyx speaks their language.*
 
## The problem in one paragraph
 
Excavators and loaders are becoming digital, but operators still work with paper schedules, a beeping alarm and on-the-job training. The challenge is to build one intelligent companion that supports the operator through the whole workday: daily tasks, real-time safety (seatbelt, proximity, incidents, working conditions), training, detection of unusual machine usage and prediction of how long a task will really take.
 
## The insight: what the organisers' data already tells us
 
### Unsafe moments follow waiting, not working
 
| Time | Load cycles | Fuel per cycle | Idle | Seatbelt | Alert |
|---|---|---|---|---|---|
| 05-01 08:00 | 12 | 0.43 L | 30 min | Fastened | No |
| 05-01 10:00 | **2** | **1.90 L** | **55 min** | **Unfastened** | **Yes** |
| 05-01 14:00 | 10 | 0.61 L | 15 min | Fastened | No |
| 05-02 09:00 | **1** | **2.00 L** | **60 min** | **Unfastened** | **Yes** |
 
Both safety alerts happened in windows of long idling and almost no work, with about 4× worse fuel per load cycle. Neither happened in the productive windows. It is only four rows, so we treat it as a hypothesis, but it suggests a chain:
 
```
Truck late → excavator waits → operator gets bored → unbuckles / steps out
→ work resumes suddenly → operator unbelted and distracted → danger
```
 
**Idling is a symptom of a site coordination problem, and it comes before unsafe behaviour.** Other teams will alert the operator after the seatbelt comes off. Onyx predicts the moment 15 minutes earlier and fixes the cause.
 
### Planner estimates ignore the operator and the weather
 
| Task | Weather | Skill | Machine age | Estimated | Actual | Difference |
|---|---|---|---|---|---|---|
| T001 Earth Excavation | Sunny | Expert | 2 | 60 | 58 | −3% |
| T002 Trenching | Rainy | Intermediate | 4 | 45 | 52 | +16% |
| T003 Material Loading | Cloudy | Beginner | 3 | 30 | 42 | **+40%** |
| T004 Grading | Sunny | Expert | 5 | 35 | 33 | −6% |
| T005 Demolition | Windy | Intermediate | 6 | 90 | 105 | +17% |
 
Experts beat the estimate, while a beginner took 40% longer and bad weather added about 16%. **Caveat:** in this data weather is confounded with skill (only experts had sunny days), so the two effects can't be separated yet. Our Bayesian estimator is built for exactly this: it starts from sensible priors and becomes more precise as more tasks are completed.
 
## Why India
 
- **Operator shortage** — Infrastructure growth (highways, metro, mining) is outpacing the supply of skilled operators.
- **Limited English and reading skills** — Many operators are first-generation or migrant workers, so text-heavy English software excludes them.
- **Informal training** — Most operators learn by watching a senior ("ustad"), with no structured path to certification.
- **Small owners and rental fleets** — Owner-operators with 1–5 machines, often older models without telematics.
- **Harsh conditions** — 45°C+ heat, dust, monsoon mud and patchy 4G on remote sites.
- **WhatsApp everywhere** — Owners and supervisors already run their business on WhatsApp and low-cost Android phones.
## Languages
 
- **English, Hindi, Tamil, Kannada** — Voice and on-screen text in all four, covering North and South India and three different scripts.
- **Code-mixed commands** — Everyday mixes like "machine start karo" work; technical words stay in English in every language.
- **Low-literacy design** — Icons, colours and voice carry the meaning, so the app is usable without reading.
## How Onyx works: brain, voice and screens
 
```
         ┌──────────────────────────────────────────────────────────┐
 BRAIN   │ Operator state engine (HMM) · Idle root cause ·          │
         │ Bayesian live ETA · Nudge learner · Crew optimiser ·     │
         │ Near-miss → lesson loop                                  │
         ├──────────────────────────────────────────────────────────┤
 VOICE   │ Wake word · Priority spoken alerts · Voice incidents ·   │
         │ Mayday · 4 languages · Offline · Never motion control    │
         ├──────────────────────────────────────────────────────────┤
 SCREENS │ Task dashboard · Training hub · Supervisor view ·        │
         │ WhatsApp owner summary · Fuel/CO₂ · Shift replay         │
         └──────────────────────────────────────────────────────────┘
```
 
Every alert, nudge, fatigue signal and lesson recommendation comes from **one brain**, not a pile of separate threshold rules.
 
## The brain: algorithms
 
### 1. Operator State Engine — predicts the unsafe moment
 
A **Hidden Markov Model** tracks the operator's hidden state from telemetry every 5 minutes.
 
| State | What it looks like |
|---|---|
| Productive | High cycle rate, low idle, seatbelt on |
| Waiting | Few cycles, idle rising, seatbelt still on — **the pre-danger state** |
| Disengaged | Long idle, seatbelt off, fuel wasted |
| Fatigued | Late in the shift, cycles slowing, irregular rhythm, heat |
 
**Observations:** cycle rate, idle fraction, fuel per cycle, seatbelt, hours into shift and heat index (discretised into low / medium / high).
 
**Live filtering (forward algorithm):**
 
```
α_t(j) = [ Σ_i α_{t-1}(i) · A[i][j] ] · B[j](o_t)      then normalise
```
 
**Forecasting 15 minutes ahead (3 steps):**
 
```
P(state at t+3) = α_t · A³
Risk = P(Disengaged) + P(Fatigued)
Risk > 0.6  →  intervene now, while the operator is still belted
```
 
**Starting transition matrix** (from domain knowledge, then learned with Baum–Welch on synthetic data):
 
```
             Prod   Wait   Diseng  Fatig
Productive [ 0.85   0.12   0.02    0.01 ]
Waiting    [ 0.30   0.55   0.14    0.01 ]
Disengaged [ 0.20   0.10   0.68    0.02 ]
Fatigued   [ 0.05   0.05   0.10    0.80 ]
```
 
**Context-driven upgrade:** the transition matrix depends on context (truck ETA, hours into shift, heat), so a truck known to be 20 minutes late raises the Waiting → Disengaged probability *before* any idling shows up.
 
**Why an HMM and not deep learning:** it works with small data, the matrices are explainable to judges and operators, it outputs probabilities and forecasts, and the forward filter is about 20 lines that run offline on a cheap Android phone.
 
### 2. Idle Root Cause — fix the site, not just the operator
 
When risk rises, Onyx scores the likely cause and sends the fix to the right person.
 
| Cause | Evidence | Who gets the fix |
|---|---|---|
| Truck / material delay | Haul-truck ETA > 10 min, task needs a truck | **Dispatcher:** re-sequence trucks. **Operator:** "Engine off, stay belted" |
| Fatigue / heat | > 5 h into shift, cycle times rising, heat index high | **Operator:** break and water now |
| Weather | Rain or wind, and the next task is a slope or demolition | **Supervisor:** swap task order |
| Unexplained | None of the above | Logged as an **anomaly**; micro-lesson assigned |
 
Explained idling (waiting for a truck) is normal. **Only unexplained idling counts as an anomaly**, which removes most false alarms.
 
> Voice example (Hindi): *"Truck 18 minute late hai — engine band karo, belt lagaye rakho."*
 
### 3. Bayesian Live ETA — "Google Maps ETA for a dig job"
 
**Before the task:**
 
```
log(actual / planned) = β_skill + β_weather + β_age · (age − 3) + noise
```
 
This is fitted with Bayesian linear regression (Normal priors). From the task history: Expert ≈ ×0.95, Intermediate ≈ ×1.16, Beginner ≈ ×1.40.
 
**During the task:** each completed load cycle updates the per-cycle time (Normal–Normal conjugate update).
 
```
μ_post = (μ₀/σ₀² + n·x̄/σ²) / (1/σ₀² + n/σ²)
ETA    = elapsed + (N − n) · μ_post  (+ expected waiting from the state engine)
```
 
**Worked example (T002, trenching in rain, planned 45 min):**
- The prior gives 52 min for 30 cycles (μ₀ = 1.73 min/cycle).
- After 10 cycles in 20 min (x̄ = 2.0), μ_post ≈ 1.94.
- The ETA shown is **59 ± 4 min**, and it narrows live as work continues.
Every estimate explains itself, e.g. *"+7 min: rain · +3 min: machine age 6 years."*
 
### 4. Nudge Learner — coaching that learns what works for each operator
 
This is a **contextual bandit with Thompson sampling**. For each situation, Onyx can nudge in different styles:
 
- **fuel cost:** "₹180 wasted"
- **safety:** "stay belted"
- **streak:** "keep your 5-day streak"
- **audio lesson:** a 2-minute micro-lesson
Onyx records whether the operator *acted* (engine off within 2 minutes, seatbelt stayed on) and updates a Beta(success + 1, fail + 1) per style. Each operator gradually gets the nudge that works for them, and alert fatigue drops.
 
### 5. Crew Optimiser — the right operator on the right task
 
The ETA model runs for every operator × task pair using tomorrow's weather forecast. The **Hungarian algorithm** (`scipy.optimize.linear_sum_assignment`) then finds the assignment with the least total time and risk.
 
> *"Put the expert on demolition tomorrow (windy): saves ~15 min and lowers risk."*
 
### 6. Near-Miss → Lesson Loop
 
Every incident and every predicted Disengaged moment becomes a **training scenario** built from its real context (rain, late truck, 10:00, seatbelt off) in the operator's language. The training hub grows from real site events, the way aviation turns near-misses into lessons.
 
### 7. Counterfactual Shift Replay
 
Shift replay shows what happened, and also what *would* have happened:
 
> *"If you had switched off during those three waits: 4.1 L saved and no seatbelt alert."*
 
## Phase 1 — Core features (problem statement)
 
- **Daily Task Dashboard** — Today's tasks with live status and Bayesian ETAs that narrow as work progresses.
- **Seatbelt Compliance** — Detects an unfastened seatbelt while the engine runs, predicts unbuckling risk before it happens, escalates voice → supervisor, logs the event and integrates with the machine's existing OEM interlock (Onyx never controls hydraulics itself).
- **Proximity Hazard Alerts** — Warns of people or objects in blind spots and the swing radius, with safety distances that widen in rain, fog or darkness. The demo uses camera-based person detection.
- **Incident Logging** — Records near misses and incidents in seconds, automatically attaching time, machine, operator state and telemetry context.
- **Working Conditions Awareness** — Adjusts safety advice, risk thresholds and task estimates for heat, monsoon rain, dust, ground and light conditions.
- **Heat Stress Protection** — Break and hydration reminders based on the heat index and continuous operating time; heat also feeds the Fatigued state.
- **Operator Training Hub** — Short interactive lessons, quizzes, simulations and instructor booking, recommended by the state engine and generated from real near misses.
- **Unusual Behaviour Detection** — Flags *unexplained* idling, low productivity (high fuel per load cycle), seatbelt violations and statistical outliers, using root-cause labels to avoid false alarms.
- **Task Time Estimation** — Predicts how long a task will actually take from the planner's estimate, task type, weather, operator skill and machine age, with a confidence range and an explanation.
## Voice accessibility (hands-free operation)
 
- **Wake Word + Push-to-Talk** — "Hey CAT" or a joystick button starts a voice command without taking hands off the controls.
- **Voice Commands** — Ask for the next task, mark tasks done, get time estimates or start a lesson by speaking in any supported language.
- **Voice Incident Reporting** — Describe an incident aloud and the assistant turns it into a structured, timestamped report.
- **Priority-Based Spoken Alerts** — Critical alerts interrupt immediately, warnings wait for a pause and tips wait until the machine is idle.
- **Confirmation for Data Changes** — Every command that changes data is read back and requires "confirm" or "cancel".
- **Voice Pre-Start Checklist** — The assistant reads each inspection item aloud, and the machine is marked ready only after telemetry confirms the seatbelt is fastened.
- **Predictive Coaching** — Spoken nudges driven by the state engine and nudge learner, e.g. "Truck 18 minutes late — engine off, stay belted."
- **Emergency Phrase** — Saying "Mayday" alerts the supervisor with location and the last 60 seconds of machine data.
- **Smart Alertness Check-ins** — Spoken check-ins only when the state engine is unsure whether the operator is alert; slow or missing replies raise the Fatigued probability.
- **Audio Micro-Lessons** — Two-minute spoken lessons during idle time turn waiting into training.
- **Shift Handover Voice Notes** — Spoken notes like "left track is noisy" are read out to the next operator at login.
- **Voice Is Never Motion Control** — By design, voice only reads, logs and alerts; it never moves the machine.
## Phase 2 — India differentiators
 
- **Diesel Theft Detection** — Flags readings where fuel consumed doesn't match engine hours and load cycles.
- **WhatsApp Daily Owner Summary** — Sends the owner hours worked, idle time and its cost, fuel, alerts, predicted-vs-actual task times and the day's top risk every evening.
- **Operator Identity & Scorecard** — Voice or QR login ties telemetry to the person in the seat for personal coaching and nudge learning.
- **Regional-Language Skill Badges** — Lessons and quizzes in the operator's language earn a digital skill badge they can show employers.
- **Explained Estimates** — Every time prediction says why, e.g. "+40% because beginner operator in rain".
- **Dispatcher Sync** — Idle root cause tells the site dispatcher which machine is waiting on trucks, so the site is fixed, not just the operator.
## Phase 3 — Bold ideas
 
- **Phone as Sensor** — The operator's Android phone detects engine-on, idle and dig cycles from vibration, giving any old or non-Cat machine basic telematics for free.
- **Ustad Knowledge Capture** — Records how expert operators work and coaches beginners against their benchmarks ("ghost expert" comparison of cycle times).
- **Remote Mentor Mode** — An expert watches live data and coaches a beginner through the headset.
- **Crew Optimiser** — Assigns operators to tomorrow's tasks by predicted time, skill and weather risk.
## Roadmap
 
- **Safety Compliance Reports** — One-tap incident and safety records a contractor can show clients or inspectors.
- **Mechanic / Dealer Booking** — Local-language button to call a mechanic or book dealer service, cutting downtime in tier-2/3 towns.
- **Predictive Maintenance Hints** — Warns about drifting fuel-per-cycle or engine-hour trends before a breakdown.
- **Photo Inspections** — Walk-around checks with photo evidence and AI detection of obvious issues like leaks or worn teeth.
- **Utility No-Go Zones** — Mark buried gas and fibre lines on a site map and warn before the bucket gets close.
- **Ground Crew Tags** — Low-cost BLE tags on workers for live positions around the machine.
- **Theft & Misuse Alerts** — Alerts when a machine runs after hours or leaves the site boundary.
- **Weather-Aware Scheduling** — Monsoon and heat forecasts reorder the day's tasks automatically.
- **Fuel & CO₂ Reports** — Idle fuel and emissions per project (≈ 2.68 kg CO₂ per litre of diesel) for client and regulatory reporting.
- **Crew Safety Goals** — Team-level streaks and badges such as "30 days without a seatbelt alert", with no public ranking of individuals.
- **Spoken Shift Summary** — At logoff, a short spoken recap of what went well and one thing to improve.
## Demo: a day with Ravi (OP1001, EXC001)
 
1. **Pre-start** — Voice checklist in Hindi; the machine is ready only once the seatbelt is confirmed.
2. **Morning briefing** — Three tasks with Bayesian ETAs, the weather, and the crew optimiser's suggestion.
3. **09:45** — The organisers' telemetry is replayed. State probabilities move live, risk crosses 0.6, the root cause is a late truck, the voice nudge plays and the dispatcher is alerted.
4. **The reveal** — "In your data, the seatbelt came off at 10:00. Onyx warned at 09:45." The same happens for the next-day row.
5. **Proximity** — A teammate walks into the webcam's view (the swing radius). An alert fires and an incident is logged automatically with context.
6. **Voice incident** — "Near miss log karo…" becomes a structured report, which becomes a training scenario.
7. **Idle time** — A 2-minute audio micro-lesson plays in the style the nudge learner picked for Ravi.
8. **Evening** — A WhatsApp owner summary with idle cost, fuel, alerts and ETAs vs actuals.
9. **Backtest slide** — Catch rate, lead time and false alarms from the synthetic backtest.
## Hackathon scope
 
**Built and demoed live:**
- Task dashboard with live Bayesian ETA
- Operator state engine with telemetry replay and 15-minute forecast
- Idle root cause and dispatcher nudge
- Voice commands, spoken alerts and voice incident logging (Hindi + English)
- Camera-based proximity detection
- Near-miss → lesson generator
- Fuel / CO₂ idle counter and WhatsApp owner summary
- Backtest on the provided data and on synthetic data
**Shown as roadmap:** everything else above.
 
## Validation
 
- **Synthetic data generator** — Expands the 4 telemetry rows and 5 task rows into thousands of records that follow the observed patterns (idle ↔ unbuckling, skill and weather ↔ overrun). Clearly labelled as synthetic.
- **State engine backtest** — Percentage of seatbelt / safety events predicted ahead of time, average lead time in minutes, and false alarms per shift.
- **ETA accuracy** — Mean absolute error of the Onyx ETA vs the planner's estimate, before and during the task.
| Metric | Planner / baseline | Onyx |
|---|---|---|
| Safety events predicted ahead | 0% (reactive) | _TBD_ |
| Average warning lead time | 0 min | _TBD_ |
| False alarms per shift | — | _TBD_ |
| Task time MAE | _TBD_ | _TBD_ |
 
## Judge Q&A
 
- **"Only four rows of data?"** — That's why we use an HMM and Bayesian methods, which are built for small data; the synthetic data is labelled as such and follows the observed patterns.
- **"Why not deep learning?"** — Too little data, not explainable, and it can't run offline on a cheap phone in a cab.
- **"Is this data really available?"** — Engine hours, fuel, cycles, idle and seatbelt are standard telematics fields (they're in the provided sheet). For older machines, Phone as Sensor fills the gap.
- **"Does the app control the machine?"** — No. Voice and app only read, log and alert; interlocks stay with the OEM system.
- **"What's new here?"** — Everyone else alerts after a violation. Onyx predicts it from the operator's work rhythm, finds the upstream cause and fixes it.
## Design
 
- **Landing Page** — Bold, editorial style inspired by landonorris.com: black background, oversized type, CAT yellow accent, one hero animation.
- **Cab Mode (Operator App)** — Same identity but restrained: no scrolling for alerts, large tap targets for gloved hands, high contrast for sunlight.
- **Risk Gauge** — One large, glanceable gauge showing the next-15-minute risk from the state engine.
- **Colour Discipline** — CAT yellow for brand only; green, amber and red are reserved for real safety states.
## Tech notes
 
- **Offline First** — Everything works without internet and syncs when connectivity returns; the HMM forward filter and ETA update run on the device.
- **Models** — Python (`numpy`, `hmmlearn`, `scipy`) for fitting and backtests; learned matrices exported as JSON and run in JavaScript on the device.
- **Proximity Demo** — In-browser person detection (TensorFlow.js COCO-SSD) on a webcam feed.
- **Speech** — Browser Web Speech API for the demo; Bhashini or AI4Bharat models for offline, higher-quality Indian-language speech.
- **Language Layer** — An LLM turns root-cause output into short spoken nudges, structures voice incident reports and writes near-miss lessons.
- **Weather** — Open-Meteo API (free, no key) for current conditions and forecasts.
- **WhatsApp** — Meta WhatsApp Cloud API test number for the demo, with a click-to-chat link as a no-setup fallback.
- **Fonts** — Noto Sans (Latin, Devanagari, Tamil, Kannada) for consistent rendering across all four languages.
## Datasets
 
- **Machine Telemetry** — Timestamp, machine ID, operator ID, engine hours, fuel used, load cycles, idling time, seatbelt status and safety alert.
- **Task History** — Task ID, task type, weather, operator skill, machine age, estimated time and actual time.
- **Synthetic Extensions** — Generated 5-minute telemetry windows, haul-truck ETAs, heat index and task outcomes for training and backtesting.
 
