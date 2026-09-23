# Caterpillar Onyx — Smart Operator Assistant

A voice-first copilot for CAT machine operators in India that keeps them safe, trains them on the job in their own language, and shows owners what their machines are doing.

> *India needs lakhs of new operators, most of whom don't read English. Onyx speaks their language.*

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

## Phase 1 — Core features (problem statement)

- **Daily Task Dashboard** — Shows the operator's scheduled tasks for the day with live status and predicted finish times.
- **Seatbelt Compliance** — Detects an unfastened seatbelt while the engine runs, alerts the operator, locks hydraulics and logs the event.
- **Proximity Hazard Alerts** — Warns of people or objects in blind spots and the swing radius, with safety distances that widen in rain, fog or darkness.
- **Incident Logging** — Records near misses and incidents in seconds, automatically adding time, machine and telemetry context.
- **Working Conditions Awareness** — Adjusts safety advice and task estimates for heat, monsoon rain, dust, ground and light conditions.
- **Heat Stress Protection** — Break and hydration reminders based on the heat index and continuous operating time.
- **Operator Training Hub** — Short interactive lessons, quizzes, simulations and instructor booking, recommended from each operator's own behaviour.
- **Unusual Behaviour Detection** — Flags excessive idling, low productivity (high fuel per load cycle), seatbelt violations and statistical outliers in telemetry.
- **Task Time Estimation** — Predicts how long a task will actually take from the planner's estimate, task type, weather, operator skill and machine age, and explains the difference.

## Voice accessibility (hands-free operation)

- **Wake Word + Push-to-Talk** — "Hey CAT" or a joystick button starts a voice command without taking hands off the controls.
- **Voice Commands** — Ask for the next task, mark tasks done, get time estimates or start a lesson by speaking in any supported language.
- **Voice Incident Reporting** — Describe an incident aloud and the assistant turns it into a structured, timestamped report.
- **Priority-Based Spoken Alerts** — Critical alerts interrupt immediately, warnings wait for a pause and tips wait until the machine is idle.
- **Confirmation for Data Changes** — Every command that changes data is read back and requires "confirm" or "cancel".
- **Voice Pre-Start Checklist** — The assistant reads each inspection item aloud, and the machine is marked ready only after telemetry confirms the seatbelt is fastened.
- **Context-Aware Coaching** — Proactive spoken nudges from live telemetry, e.g. "You've idled 12 minutes — shut down until the truck arrives?"
- **Emergency Phrase** — Saying "Mayday" alerts the supervisor with location and the last 60 seconds of machine data.
- **Alertness Check-ins** — Periodic spoken check-ins; slow or missing replies late in a shift suggest a break.
- **Audio Micro-Lessons** — Two-minute spoken lessons during idle time turn waiting into training.
- **Shift Handover Voice Notes** — Spoken notes like "left track is noisy" are read out to the next operator at login.
- **Voice Is Never Motion Control** — By design, voice only reads, logs and alerts; it never moves the machine.

## Phase 2 — India differentiators

- **Diesel Theft Detection** — Flags readings where fuel consumed doesn't match engine hours and load cycles.
- **WhatsApp Daily Owner Summary** — Sends the owner hours worked, idle time, fuel, alerts and task progress on WhatsApp every evening.
- **Operator Identity & Scorecard** — Voice or QR login ties telemetry to the person in the seat for personal coaching.
- **Regional-Language Skill Badges** — Lessons and quizzes in the operator's language earn a digital skill badge they can show employers.
- **Explained Estimates** — Every time prediction says why, e.g. "+40% because beginner operator in rain".

## Phase 3 — Bold ideas

- **Phone as Sensor** — The operator's Android phone detects engine-on, idle and dig cycles from vibration, giving any old or non-Cat machine basic telematics for free.
- **Ustad Knowledge Capture** — Records how expert operators work and coaches beginners against their benchmarks.
- **Remote Mentor Mode** — An expert watches live data and coaches a beginner through the headset.

## Roadmap

- **Safety Compliance Reports** — One-tap incident and safety records a contractor can show clients or inspectors.
- **Mechanic / Dealer Booking** — Local-language button to call a mechanic or book dealer service, cutting downtime in tier-2/3 towns.
- **Predictive Maintenance Hints** — Warns about drifting fuel-per-cycle or engine-hour trends before a breakdown.
- **Photo Inspections** — Walk-around checks with photo evidence and AI detection of obvious issues like leaks or worn teeth.
- **Utility No-Go Zones** — Mark buried gas and fibre lines on a site map and warn before the bucket gets close.
- **Theft & Misuse Alerts** — Alerts when a machine runs after hours or leaves the site boundary.
- **Weather-Aware Scheduling** — Monsoon and heat forecasts reorder the day's tasks automatically.
- **Fuel & CO₂ Reports** — Idle fuel and emissions per project for client and regulatory reporting.
- **Gamified Safety** — Crew leaderboards and badges such as "30 days without a seatbelt alert".
- **Spoken Shift Summary** — At logoff, a short spoken recap of what went well and one thing to improve.

## Design

- **Landing Page** — Bold, editorial style inspired by landonorris.com: black background, oversized type, CAT yellow accent, one hero animation.
- **Cab Mode (Operator App)** — Same identity but restrained: no scrolling for alerts, large tap targets for gloved hands, high contrast for sunlight.
- **Colour Discipline** — CAT yellow for brand only; green, amber and red are reserved for real safety states.

## Tech notes

- **Offline First** — Everything works without internet and syncs when connectivity returns.
- **Speech** — Browser Web Speech API for the demo; Bhashini or AI4Bharat models for offline, higher-quality Indian-language speech.
- **WhatsApp** — Meta WhatsApp Cloud API test number for the demo, with a click-to-chat link as a no-setup fallback.
- **Fonts** — Noto Sans (Latin, Devanagari, Tamil, Kannada) for consistent rendering across all four languages.

## Datasets

- **Machine Telemetry** — Timestamp, machine ID, operator ID, engine hours, fuel used, load cycles, idling time, seatbelt status and safety alert.
- **Task History** — Task ID, task type, weather, operator skill, machine age, estimated time and actual time.
