# Caterpillar Onyx — Smart Operator Assistant

An intelligent, hands-free companion for CAT machine operators that improves safety, efficiency and training throughout the workday.

## Core features (from the problem statement)

- **Daily Task Dashboard** — Shows the operator's scheduled tasks for the day with live status and predicted finish times.
- **Seatbelt Compliance** — Detects an unfastened seatbelt while the engine runs, alerts the operator, locks hydraulics and logs the event.
- **Proximity Hazard Alerts** — Warns of people or objects in blind spots and the swing radius, with safety distances that widen in rain, fog or darkness.
- **Incident Logging** — Records near misses and incidents in seconds, automatically adding time, machine and telemetry context.
- **Working Conditions Awareness** — Adjusts safety advice and task estimates to weather, temperature, ground and light conditions.
- **Operator Training Hub** — Short interactive lessons, quizzes, simulations and instructor booking, recommended from each operator's own behaviour.
- **Unusual Behaviour Detection** — Flags excessive idling, low productivity (high fuel per load cycle), seatbelt violations and statistical outliers in telemetry.
- **Task Time Estimation** — Predicts how long a task will actually take from the planner's estimate, task type, weather, operator skill and machine age.

## Voice accessibility (hands-free operation)

- **Wake Word + Push-to-Talk** — "Hey CAT" or a joystick button starts a voice command without taking hands off the controls.
- **Voice Commands** — Ask for the next task, mark tasks done, get time estimates or start a lesson by speaking.
- **Voice Incident Reporting** — Describe an incident aloud and the assistant turns it into a structured, timestamped report.
- **Priority-Based Spoken Alerts** — Critical alerts interrupt immediately, warnings wait for a pause and tips wait until the machine is idle.
- **Confirmation for Data Changes** — Every command that changes data is read back and requires "confirm" or "cancel".
- **Voice Pre-Start Checklist** — The assistant reads each inspection item aloud, and the machine is marked ready only after telemetry confirms the seatbelt is fastened.
- **Context-Aware Coaching** — Proactive spoken nudges from live telemetry, e.g. "You've idled 12 minutes — shut down until the truck arrives?"
- **Emergency Phrase** — Saying "Mayday" alerts the supervisor with location and the last 60 seconds of machine data.
- **Alertness Check-ins** — Periodic spoken check-ins; slow or missing replies late in a shift suggest a break.
- **Multilingual Support** — Commands and alerts in the operator's preferred language for mixed-language crews.
- **Audio Micro-Lessons** — Two-minute spoken lessons during idle time turn waiting into training.
- **Shift Handover Voice Notes** — Spoken notes like "left track is noisy" are read out to the next operator at login.
- **Offline Speech Recognition** — Recognition runs on the device so voice works on sites with no connectivity.
- **Voice Is Never Motion Control** — By design, voice only reads, logs and alerts; it never moves the machine.

## Additional ideas

- **Geofenced Exclusion Zones** — Operators draw no-go areas (e.g. buried utilities) and get warned before the boom enters them.
- **Ground Crew Tracking** — Workers' phones or tags show their live position around the machine.
- **Weather-Aware Scheduling** — Forecasts automatically reorder the day's tasks, e.g. grading moves before rain arrives.
- **Shift Replay & Scoring** — Operators review their own telemetry against expert benchmarks, e.g. trenching cycle times.
- **Gamified Safety** — Crew leaderboards and badges such as "30 days without a seatbelt alert".
- **Remote Mentor Mode** — An expert watches live data and coaches a beginner through the headset.
- **Self-Improving Estimates** — Every completed task retrains the estimator so predictions improve for each site.
- **Predictive Maintenance Hints** — Warns about drifting fuel-per-cycle or engine-hour trends before a breakdown.
- **Fuel & CO₂ Tracker** — Shows the cost and emissions of today's idling.
- **Fatigue Score** — Combines shift length, heat, reaction times and idle patterns into an alertness indicator.
- **Spoken Shift Summary** — At logoff, a short spoken recap of what went well and one thing to improve.

## Datasets

- **Machine Telemetry** — Timestamp, machine ID, operator ID, engine hours, fuel used, load cycles, idling time, seatbelt status and safety alert.
- **Task History** — Task ID, task type, weather, operator skill, machine age, estimated time and actual time.
