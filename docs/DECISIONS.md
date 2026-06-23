# Architectural Decisions: Pebble Productivity App

This document logs the critical design decisions, visual guidelines, and technical trade-offs adopted in Pebble.

---

## 1. 100% Offline Local-First Heuristic Parsing
* **Decision**: Implement plain-text parsing entirely on the client-side using `chrono-node` and `compromise`, bypassing external LLM APIs (e.g. OpenAI, Gemini) and backend database servers.
* **Rationale**:
  * **Privacy**: Pebble is a personal productivity suite; task contents must never leave the user's device.
  * **Latency**: Client-side heuristic parsing executes in `<12ms`, providing immediate UI previews as the user types. Cloud APIs introduce network latency of 500ms to 2s.
  * **Cost & Reliability**: Ensures the app works perfectly in tunnels, flights, or off-grid areas with zero subscription API costs.
* **Trade-off**: Highly complex linguistic nuances might be missed compared to generative LLMs, but this is mitigated by providing interactive cycle-on-tap pills for manual fine-tuning.

---

## 2. Settings Companion Toggle vs Gesture Dismissal
* **Decision**: Separate the permanent Settings companion toggle (`showMascot`) from the temporary swipe-to-dismiss state stored under `"todoapp:mascot:dismissed"`.
* **Rationale**:
  * Shaking the device should only toggle the mascot's presence if it is permanently enabled in Settings.
  * If the mascot is swiped off-screen, it is temporarily dismissed. Shaking the device will summon it back.
  * If the mascot is disabled in Settings, accelerometer listeners are ignored, preventing accidental shake activations in pocket.
  * Toggling the mascot back on in Settings immediately resets the temporary dismissal, bringing the companion back.

---

## 3. Worklet UI Thread Separation
* **Decision**: Delegate all React state mutations and Ref writes (`isDismissingRef.current = false`) from Reanimated timing callbacks to the JS thread using `runOnJS()`.
* **Rationale**:
  * Reanimated's animation loops and timing functions run on a separate native UI thread for smooth 60fps performance.
  * Modifying JS variables (React state, React refs) directly from the UI thread causes memory segmentation faults, silent crashes, or state mismatches.
  * Explicitly wrapping React mutations in JS helper functions executed via `runOnJS` guarantees thread safety and stability.

---

## 4. Hanging Twine SVG Math Compensation
* **Decision**: Replace static vertical twine Views with a diagonal SVG Line that calculates the post-rotation coordinate of the card hole.
* **Rationale**:
  * The suggestion card is rotated by `-4deg` around its center point to look organic.
  * Trigonometric rotation shifts the top-right card hole to the left by `10px` and upwards by `4px`.
  * A static vertical line does not follow this shift, making the string appear detached from the hole.
  * By calculating the rotated hole center `(166, 108)` and connecting it diagonally to the beak coordinate `(181, 68)` via SVG, the thread stays perfectly attached.

---

## 5. Shadow Opacity and Borderless Esthetics
* **Decision**: Scale down shadow opacity to `0.03 - 0.05` in light mode, replacing thick card dividers with hairline borders (`StyleSheet.hairlineWidth`).
* **Rationale**:
  * Standard React Native shadows can look muddy or harsh in light mode.
  * Reducing shadow opacity and using borderless structures preserves a premium, clean glassmorphic aesthetic.

---

## 6. Pebble Knowledge Collections V1 Design Architecture
* **Status**: Implemented (V1)
* **Decision**: Group saved reference items inside a single storage key `todoapp:collections:v1` as a Record grouped by workspace list/folder ID, with optional assignment fallback to `"unassigned"`. Prioritize pull-based UX resurfacing over push notifications, and allow one-click task projection awarding +10 XP without deleting the reference item.
* **Rationale**:
  * **Unified Storage & Isolation**: Storing items grouped by `folderId` prevents polluting the main tasks payload while keeping query complexity low. Using `"unassigned"` avoids forcing folder creation on the user.
  * **Notification Well-being**: Avoids notification fatigue by keeping Collections out of OS push notifications. Instead, items are contextually integrated into existing screen reads (Today view, mascot cards, Pomodoro breaks).
  * **Frictionless Actionability**: Allowing users to project references into tasks closes the loop between storage and action, rewarding them with XP (+10 XP) to incentivize behavior.
