# Caterpillar Onyx — Smart Operator Assistant

> **An intelligent, multilingual copilot for CAT machine operators — making every shift safer, more productive, and easier to learn from.**

Onyx is a voice-first operator assistant designed for CAT machinery. It combines **machine telemetry, operator behaviour, task information, and environmental conditions** to provide real-time safety assistance, explainable task predictions, personalized training, and useful shift insights.

Built with the realities of Indian construction and infrastructure sites in mind, Onyx is designed for **low-literacy environments, regional languages, harsh working conditions, and unreliable connectivity**.

---

# 1. The Problem

Heavy machinery operators make hundreds of small decisions during a shift:

- When is it safe to continue operating?
- Why is today's task taking longer than expected?
- Is excessive idling affecting productivity?
- Is the operator working safely?
- What should a less-experienced operator improve?
- What happened during a safety incident?
- How can supervisors understand what is happening across their machines?

Existing machine data can answer **what happened**, but it often doesn't turn that data into **actionable assistance for the operator**.

### Onyx bridges that gap.

```text
Machine Telemetry
       +
Operator Behaviour
       +
Task Information
       +
Weather & Conditions
       ↓
      ONYX
       ↓
Safety | Productivity | Training | Insights
```

---

# 2. Why India

India's infrastructure and construction activity creates a particularly strong use case for an operator assistant.

- **Operator skill gap** — Many operators learn primarily through hands-on experience and informal mentorship.
- **Regional languages** — English-first interfaces can create unnecessary barriers.
- **Low-literacy environments** — Critical information should not depend entirely on reading.
- **Small and mixed-age fleets** — Not every machine has the same level of connected technology.
- **Harsh conditions** — Heat, dust, rain, poor visibility, and difficult terrain affect both safety and productivity.
- **Unreliable connectivity** — Construction and mining sites may have intermittent network access.
- **WhatsApp-based workflows** — Supervisors and small fleet owners already rely heavily on mobile communication.

Onyx therefore follows an **India-first, voice-first and offline-first** approach.

---

# 3. Core Product

Onyx has four connected intelligence layers:

### 🛡️ Safety Intelligence
Understand safety conditions and intervene when necessary.

### 📈 Productivity Intelligence
Understand task progress, idle time, fuel usage and completion times.

### 🎓 Operator Intelligence
Identify individual improvement areas and deliver targeted micro-learning.

### 🎙️ Voice Assistant
Allow operators and supervisors to interact naturally without relying on text-heavy interfaces.

These aren't separate features — they use the same operational context.

---

# 4. Phase 1 — Core Features

## 4.1 Daily Task Dashboard

At the beginning of a shift, Onyx presents the operator's scheduled tasks.

```text
TODAY'S TASKS

01  Excavation        60 min
02  Material Loading  45 min
03  Grading            35 min
```

The dashboard provides:

- Current task
- Upcoming tasks
- Estimated completion time
- Actual progress
- Task status
- Delays or deviations

Operators can access this information through both the screen and voice.

---

## 4.2 Explainable Task Time Estimation

The problem statement provides both **estimated and actual task times**.

Onyx turns this into an adaptive prediction system.

Instead of simply displaying:

> Estimated: 60 min

Onyx predicts:

> **Expected completion: 52 min**

and explains why.

```text
TASK: EXCAVATION

Planner estimate       60 min
Onyx prediction        52 min

WHY?

✓ Experienced operator
✓ Good weather conditions
✓ Historical performance
△ Machine age

Confidence             82%
Expected range         49–57 min
```

The prediction can use:

- Task type
- Operator skill
- Machine age
- Historical task performance
- Weather
- Current productivity
- Idle time

This makes the prediction **explainable rather than a black box**.

---

# 5. Safety Intelligence

## 5.1 Seatbelt Compliance

Onyx monitors seatbelt status while the machine is operating.

If an unsafe condition is detected:

1. The operator receives an immediate alert.
2. The event is logged.
3. The safety dashboard is updated.
4. The event becomes part of the operator's safety history.

Example:

> ⚠️ **Seatbelt unfastened**  
> Please fasten your seatbelt before continuing.

Safety-critical behaviour is handled through deterministic rules rather than relying on an LLM.

---

## 5.2 Proximity & Hazard Awareness

Onyx can monitor hazards around the machine, including:

- People in operating zones
- Objects in blind spots
- Swing-radius hazards
- Restricted areas
- Unsafe proximity

The alert priority changes depending on severity.

```text
CRITICAL
Immediate spoken alert

WARNING
Alert when appropriate

INFORMATION
Shown when operator attention is available
```

---

## 5.3 Working Conditions Awareness

Operating conditions affect both safety and productivity.

Onyx incorporates:

- Temperature
- Heat index
- Rain
- Visibility
- Ground conditions
- Time of day

The system can adapt:

- Safety warnings
- Break reminders
- Task estimates
- Operator guidance

---

## 5.4 Heat & Fatigue Awareness

Onyx tracks continuous operating time together with environmental conditions.

For example:

```text
Temperature       41°C
Continuous work   3h 12m
Last break        1h 48m ago

⚠ Break recommended
```

The system provides **non-diagnostic safety reminders**, rather than attempting to medically assess the operator.

---

# 6. Incident Logging & Replay

Reporting an incident should not require filling out a long form.

The operator can simply say:

> "There was a person close to the machine while I was reversing."

Onyx converts the voice input into a structured incident report:

```text
INCIDENT #042

Time:
10:37 AM

Machine:
EXC001

Operator:
OP1001

Type:
Proximity hazard

Description:
Person entered operating area while
machine was reversing.

Telemetry:
Seatbelt — Fastened
Machine — Operating
Weather — Sunny
```

### Incident Replay

For supervisors, the event can be viewed as a timeline:

```text
10:37:14   Normal operation
10:37:19   Person detected
10:37:21   Proximity threshold crossed
10:37:23   Safety alert triggered
10:37:25   Operator responded
```

This turns raw telemetry into an understandable safety event.

---

# 7. Operator Intelligence

## 7.1 Operator Skill Profile

Instead of treating every operator identically, Onyx builds a lightweight performance profile.

```text
OP1001

Safety
█████████░  91%

Productivity
███████░░░  73%

Fuel Efficiency
████████░░  81%

Machine Care
██████░░░░  64%
```

The profile is based on measurable behaviour such as:

- Task completion time
- Idle time
- Fuel efficiency
- Safety events
- Training completion
- Historical performance

The goal is **coaching, not punishment**.

---

## 7.2 Personalized Training

Training recommendations are generated from the operator's actual behaviour.

For example:

> **Recommended lesson: Reducing unnecessary idle time**

> Your recent idle time is higher than your historical average for similar tasks.

Lessons are short and practical:

- 1–3 minute audio lessons
- Visual demonstrations
- Interactive questions
- Simulations
- Safety refreshers

The operator can start a lesson using voice.

> **"Start my recommended lesson."**

---

# 8. Ustad Benchmarking

Many operators learn from experienced operators — the **"ustad"** model.

Onyx can use experienced operators as a benchmark rather than relying only on generic training.

For example:

```text
EXCAVATION PERFORMANCE

Experienced benchmark
48 sec / cycle

Current operator
61 sec / cycle

Difference
+27%
```

Onyx can then identify the relevant improvement area and recommend a short lesson.

This creates a continuous loop:

```text
Observe
   ↓
Identify improvement area
   ↓
Recommend lesson
   ↓
Operator applies it
   ↓
Measure performance
   ↓
Update skill profile
```

---

# 9. Unusual Behaviour Detection

Onyx identifies operational patterns that deviate from normal behaviour.

Examples:

### Excessive idling

```text
Average idle time     18 min
Current idle time     41 min

⚠ Unusual idle behaviour
```

### Fuel efficiency anomaly

```text
Normal fuel / cycle    0.21 L
Current fuel / cycle   0.27 L

⚠ 29% above baseline
```

### Safety anomaly

Repeated safety alerts can trigger additional training recommendations.

These are presented as **anomalies or observations**, not as automatic accusations or conclusions.

---

# 10. Shift Intelligence

At the end of every shift, Onyx generates a concise summary for both the operator and supervisor.

```text
SHIFT SUMMARY

Operator       OP1001
Machine        EXC001
Duration       6h 42m

TASKS
3 / 3 completed

PRODUCTIVITY
8% above personal average

IDLE TIME
42 min

SAFETY
1 seatbelt alert

TRAINING
1 lesson completed

MACHINE
No critical anomalies
```

The operator can simply ask:

> **"How was my shift today?"**

Onyx can answer in the operator's selected language.

---

# 11. Multilingual Voice Interface

Voice is a core part of Onyx, not an additional feature.

### Supported languages

- English
- Hindi
- Tamil
- Kannada

### Code-mixed speech

Onyx is designed to understand natural operator speech such as:

> "Next task kya hai?"

> "Machine ko kitna time lagega?"

> "Idling bahut zyada ho raha hai."

Technical machine terminology can remain in English where that is more natural for operators.

---

## Voice Capabilities

### Ask

> "What is my next task?"

### Update

> "Mark excavation complete."

### Explain

> "Why is this task taking longer?"

### Report

> "There was a person near the machine."

### Learn

> "Start my recommended lesson."

### Summarize

> "How was my shift?"

---

# 12. Voice Safety Design

Voice interactions are deliberately constrained.

### Critical alerts

Interrupt immediately.

### Warnings

Wait for an appropriate moment where possible.

### Information

Presented when operator attention is available.

### Data-changing actions

Require confirmation.

```text
Onyx:
"Mark excavation as complete?"

Operator:
"Confirm."

Onyx:
"Excavation marked complete."
```

### Machine control

> **Voice never controls machine movement.**

Onyx can read, explain, log and assist — it does not issue movement commands.

---

# 13. Supervisor Copilot

Supervisors can interact with operational data using natural language instead of navigating multiple dashboards.

Examples:

> **"Which machines had safety alerts today?"**

> **"Why was T002 delayed?"**

> **"Show me OP1001's performance this week."**

> **"What caused the difference between estimated and actual time?"**

Onyx translates these questions into structured data queries and presents the result in plain language.

This gives the supervisor a single interface over:

- Machines
- Operators
- Tasks
- Safety events
- Productivity
- Training

---

# 14. Context-Aware Recommendations

Onyx combines multiple signals before making a recommendation.

```text
Operator
   +
Machine
   +
Task
   +
Weather
   +
Historical behaviour
   +
Current telemetry
          ↓
       ONYX
          ↓
Context-aware recommendation
```

Instead of treating every event independently, Onyx can explain the relevant context.

Example:

> ⚠️ **Break recommended**

> Temperature: 41°C  
> Continuous operating time: 3h 12m  
> Last break: 1h 48m ago

This makes alerts more useful and reduces unnecessary notification noise.

---

# 15. India-First Design

## Low-Literacy Interface

Information is communicated through:

- Icons
- Voice
- Large controls
- High contrast
- Minimal text
- Colour-coded states

## Glove-Friendly Controls

The operator interface uses:

- Large touch targets
- Minimal navigation
- No unnecessary scrolling
- Simple visual hierarchy

## Harsh Environment

Designed for:

- Bright sunlight
- Dust
- Heat
- Rain
- Long shifts

---

# 16. Offline-First Architecture

Construction sites cannot always depend on a stable internet connection.

Critical functionality therefore remains available locally.

```text
              CLOUD
                │
          Sync when online
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
   Analytics          Fleet Data
        │
        └───────┬────────┘
                │
        ────────┼────────
                │
             DEVICE
                │
       ┌────────┴────────┐
       │                 │
 Local Safety       Local Storage
 Engine             & Telemetry
       │                 │
       └────────┬────────┘
                │
          Operator App
```

Offline capabilities include:

- Safety rules
- Task information
- Incident logging
- Voice commands
- Training content
- Recent machine data
- Telemetry buffering

Data synchronizes automatically when connectivity returns.

---

# 17. AI Architecture & Safety Boundary

Onyx separates **AI assistance** from **safety-critical logic**.

```text
              OPERATOR
                  │
                  ▼
        ┌──────────────────┐
        │ Voice / UI Layer │
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ Intent / AI Layer│
        │                  │
        │ Understand       │
        │ Summarize        │
        │ Explain          │
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ Validation Layer │
        └────────┬─────────┘
                 │
        ┌────────┴─────────┐
        ▼                  ▼
 Deterministic        ML Models
 Safety Rules         Predictions
        │                  │
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │ Onyx Response    │
        └──────────────────┘
```

### The LLM is not the safety system.

LLMs are used for:

- Natural-language understanding
- Voice interaction
- Summarization
- Explanation
- Training assistance

Safety-critical rules remain deterministic and validated.

> **AI assists the operator. It never controls the machine.**

---

# 18. Data & Intelligence

The hackathon dataset provides two core sources of information.

### Machine Telemetry

```text
Timestamp
Machine ID
Operator ID
Engine Hours
Fuel Used
Load Cycles
Idle Time
Seatbelt Status
Safety Alert
```

### Task History

```text
Task ID
Task Type
Weather
Operator Skill
Machine Age
Estimated Time
Actual Time
```

For demonstration and model development, additional historical/synthetic records can be generated while preserving the relationships represented by the provided dataset.

### Models / Analytics

Onyx can use these signals for:

- Task time prediction
- Anomaly detection
- Operator performance analysis
- Fuel efficiency analysis
- Safety pattern detection

The system combines ML outputs with deterministic safety rules and contextual information.

---

# 19. Phase 2 — Fleet & India Features

Once the core operator experience is established, Onyx can extend to fleet owners and supervisors.

### WhatsApp Daily Summary

Send:

- Operating hours
- Idle time
- Fuel usage
- Safety alerts
- Task completion
- Important anomalies

directly to the owner's WhatsApp.

---

### Diesel/Fuel Anomaly Detection

Identify cases where:

```text
Fuel consumption
       ≠
Expected usage based on
engine hours + load cycles
```

and flag them for review.

---

### Regional Skill Badges

Operators can earn digital badges for completed training and demonstrated skills.

Examples:

- Excavation Safety
- Efficient Operation
- Seatbelt Compliance
- Machine Care

---

### Maintenance Insights

Monitor changes in operating patterns such as:

- Fuel per cycle
- Idle behaviour
- Engine hours
- Productivity

and surface potential maintenance signals before they become major issues.

> These are **maintenance hints**, not claims of guaranteed failure prediction.

---

# 20. Future Extensions

The platform can eventually support:

- Photo-based pre-start inspections
- Geofenced machine usage
- Utility/no-go zones
- Remote mentor mode
- Mechanic/dealer booking
- Theft and misuse alerts
- Weather-aware task scheduling
- Fuel and emissions reporting
- Advanced machine-health analytics
- Phone-based fallback sensing for older machines

These features build on the same underlying machine, operator and task intelligence layer.

---

# 21. What Makes Onyx Different

Most systems answer one of these questions:

> **What is the machine doing?**

or

> **What should the operator do?**

Onyx connects the two.

### Onyx understands:

**Who** is operating  
**What** machine they are using  
**What** task they are performing  
**How** they are performing  
**Where** they are operating  
**What** the environment is like

and uses that context to provide:

```text
                 ONYX

          ┌────────────────┐
          │    SAFETY      │
          └────────────────┘
                  │
          ┌────────────────┐
          │ PRODUCTIVITY   │
          └────────────────┘
                  │
          ┌────────────────┐
          │   TRAINING     │
          └────────────────┘
                  │
          ┌────────────────┐
          │   INSIGHTS     │
          └────────────────┘
```

The goal is not simply to collect more machine data.

> **The goal is to turn machine data into better decisions at the point of operation.**

---

# 22. Product Experience

## Operator App

**Simple. Visual. Voice-first.**

```text
┌──────────────────────────┐
│ GOOD MORNING, OP1001     │
│                          │
│ CURRENT TASK             │
│ Excavation               │
│                          │
│ ETA                      │
│ 52 min                   │
│                          │
│ ███████████░░ 72%        │
│                          │
│ ⚠ 1 Safety Alert         │
│                          │
│ 🎙 "Hey CAT..."          │
└──────────────────────────┘
```

## Supervisor Dashboard

Focused on:

- Fleet status
- Task progress
- Safety events
- Operator performance
- Machine anomalies
- ETA deviations
- Training recommendations

---

# 23. Design Language

The visual identity takes inspiration from CAT's industrial character while keeping the interface modern and focused.

### Visual principles

- Dark industrial background
- CAT yellow as the primary brand accent
- High contrast
- Large typography
- Strong visual hierarchy
- Minimal clutter

### Safety colours

Colour has semantic meaning:

```text
GREEN   Normal
AMBER   Warning
RED     Critical
YELLOW  CAT / Brand
```

CAT yellow is therefore **not used as a generic warning colour**.

---

# 24. Proposed Hackathon Demo

The complete demo follows one operator through a realistic shift.

### 01 — Start Shift

Onyx greets the operator and presents the day's tasks.

### 02 — Begin Excavation

The system predicts completion time using task and operator history.

### 03 — Safety Event

An unsafe seatbelt state triggers an immediate intervention and event log.

### 04 — Changing Conditions

Heat and operating duration trigger an appropriate break reminder.

### 05 — Task Completion

Actual performance is compared with the estimate and the prediction is explained.

### 06 — Personalized Coaching

Onyx identifies an improvement area and recommends a short lesson.

### 07 — Incident Replay

The supervisor can inspect a safety event as a timeline.

### 08 — Shift Summary

Onyx generates a concise operator and supervisor report.

### 09 — Voice Query

The supervisor asks:

> **"Why was today's excavation different from the estimate?"**

Onyx explains the relevant task, operator, machine and environmental factors.

---

# 25. Roadmap

### MVP — Hackathon

- Daily Task Dashboard
- Task Time Prediction
- Explainable ETA
- Seatbelt Compliance
- Safety Alerts
- Incident Logging
- Working Conditions
- Heat/Break Awareness
- Operator Skill Profile
- Personalized Micro-Learning
- Multilingual Voice Assistant
- Shift Summary
- Supervisor Copilot
- Offline-ready architecture

### Phase 2

- Ustad Benchmarking
- WhatsApp Owner Summary
- Fuel Anomaly Detection
- Maintenance Insights
- Photo Inspections
- Regional Skill Badges

### Phase 3

- Advanced Machine Health
- Remote Mentor Mode
- Utility No-Go Zones
- Geofencing
- Phone-based sensing
- Fleet-wide predictive analytics

---

# 26. Tech Stack

### Frontend

- React
- Responsive operator/supervisor interfaces
- Voice interaction
- PWA / offline capabilities

### Backend

- Python
- FastAPI
- REST APIs
- WebSocket / real-time telemetry where applicable

### AI / ML

- Task-time prediction
- Anomaly detection
- Operator performance analytics
- LLM for natural-language interaction
- Indian-language speech technologies

### Data

- Machine telemetry
- Task history
- Operator profiles
- Safety events
- Training records

### Voice

Demo:

- Browser Web Speech APIs

Production direction:

- Bhashini
- AI4Bharat
- Appropriate Indian-language speech models

### Connectivity

- Offline-first local storage
- Background synchronization
- Cloud analytics when connected

---

# 27. Core Product Philosophy

Onyx is built around five principles:

### 1. Safety first
Critical safety decisions should be reliable, explainable and deterministic.

### 2. Voice over typing
The operator should not need to stop working to interact with the system.

### 3. Assist, don't control
Onyx supports the operator; it never directly controls machine movement.

### 4. Explain the intelligence
Predictions and recommendations should have understandable reasons.

### 5. Designed for the real site
Heat, dust, poor connectivity, regional languages and low-literacy environments are product requirements — not edge cases.

---

# ONYX

### **See the machine. Understand the operator. Assist the shift.**

```text
MACHINE
   │
   ├─────────────┐
   │             │
OPERATOR       TASK
   │             │
   └──────┬──────┘
          │
     ENVIRONMENT
          │
          ▼
       ┌───────┐
       │ ONYX  │
       └───┬───┘
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
 SAFETY  PRODUCTIVITY  TRAINING
    │      │      │
    └──────┼──────┘
           ▼
        BETTER
        SHIFTS
```

**Onyx turns machine data into actionable intelligence — directly where the work happens.**
