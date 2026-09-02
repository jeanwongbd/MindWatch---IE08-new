# UI Wireframes — Stress & Body Load App

Interactive wireframes live in the Figma Make preview. Use the bottom nav or the screen selector pills to move between screens.

---

## User Journey

```
Open app
  ↓
[1] Today          — dual-dimension overview + mismatch banner
  ↓
[2] Check-in       — stress slider + optional context tags
  ↓
[3] Why?           — biometric factor breakdown explaining the mismatch
  ↓
[4] Trends         — 7-day body load + perceived stress chart
```

---

## Screen Inventory

### 1. Today
**Purpose:** Morning snapshot. Two distinct dimensions side-by-side.

| Zone | Content |
|---|---|
| Header | Date + greeting |
| Mismatch banner | Appears when `body load − perceived stress > 2`. Amber. Tap → Why? |
| HOW I FEEL card | Slider result as large numeral (Fraunces). Green for low. |
| MY BODY card | Computed body load score. Amber/red for elevated. |
| Biometric rows | HR · HRV · Sleep · Respiratory with delta vs baseline |
| CTA | "Log today's stress" → Check-in |

**Design decisions:**
- Two-card split keeps dimensions visually equal; user can see mismatch at a glance without reading.
- Mismatch banner uses amber (not red) to avoid alarm — it prompts curiosity, not anxiety.

---

### 2. Check-in
**Purpose:** Lightweight daily self-report. < 10 seconds to complete.

| Zone | Content |
|---|---|
| Big numeral | Real-time stress rating (0–10), color-coded teal → amber → red |
| Slider | 0–10 range, thumb tracks colour |
| Context chips | Exam · Deadline · Presentation · Group work · Exercise · Caffeine · Illness · Other |
| Body status reminder | Ambient amber strip showing today's body load |
| CTA | "Save check-in" |

**Design decisions:**
- Slider-first (not scale tap) for nuance; literature shows finer resolution on continuous sliders.
- Context chips are optional — never required. Reduces friction for quick days.
- Pre-populated body status keeps both dimensions in view during reporting.

---

### 3. Why?
**Purpose:** Contextual interpretation of mismatch. Closes the "why is my body doing that?" loop.

| Zone | Content |
|---|---|
| Headline | "Why your body may be showing higher load" |
| Signal count chip | Number of contributing factors |
| Factor cards | Icon · label · deviation bar · plain-language explanation |
| Footer note | Methodology transparency |

**Factor cards include:**
- Sleep (hours vs. usual)
- HRV (% deviation)
- Resting HR (bpm delta)

**Design decisions:**
- Plain-language explanations beneath each factor reduce health literacy barrier.
- Deviation bars (with usual-level marker) give relative context without raw numbers dominating.
- Screen is read-only — no inputs. The interpretation is informational, not actionable.

---

### 4. Trends
**Purpose:** Weekly pattern recognition. Helps users connect behaviour to outcomes.

| Zone | Content |
|---|---|
| Line chart | Body load (solid amber) + perceived stress (dashed teal) over 7 days |
| Mismatch zones | Translucent red columns behind days where load − stress > 2 |
| Hover tooltip | Day-level S/L values on pointer over |
| Insight cards | 3 auto-generated observations (mismatch count, HRV trend, recovery day) |

**Design decisions:**
- Dashed line for stress, solid for body load — stress is self-reported (less certain), load is sensor-derived.
- Mismatch zones are subtle (6% opacity) — background context, not foreground alarm.
- Insight cards are specific, not generic ("Sat recovery day worked" not "rest is good").

---

## Aesthetic Stance

- **Ground:** Near-black (#0d0d0d) — Oura-dark, clinical, premium.
- **Display type:** Fraunces (optical size variable) — organic warmth on clinical data.
- **Body type:** DM Sans — clean, approachable.
- **Data labels:** DM Mono — structural, tabular.
- **Accent palette:**
  - Teal `#4fb89a` — calm / low stress / baseline
  - Amber `#e8a23a` — elevated / watch
  - Red `#e85d3a` — mismatch / high stress
  - Purple `#a78bfa` — reserved for HRV pulse animation (future)

---

## V2 Considerations

- Notification: "Your body load is rising — check in early today"
- Onboarding baseline calibration (7-day baseline before mismatch detection activates)
- Journal entry: free-text note attached to check-in
- Weekly report summary card
- Export / share data (coach / clinician view)
