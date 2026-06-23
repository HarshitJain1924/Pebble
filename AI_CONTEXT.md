# AI Context: Pebble Productivity App

This file is a compressed memory layer optimized for future AI sessions. It serves as a navigation map and design primer.

---

## 1. Project Summary
Pebble is a premium, local-first productivity app inspired by Aesop's crow-and-pebbles fable. It integrates daily task planning, habit consistency tracking, Pomodoro focus timers, localized reminders, and a completely offline natural language capture engine. The visual experience is gamified through XP achievements and an interactive Pebble Jar, guided by a responsive Crow mascot companion.

---

## 2. Tech Stack
* **Framework**: React Native 0.81 & Expo SDK 54 (Expo Router, expo-notifications, expo-blur, expo-haptics, expo-sensors)
* **Language**: TypeScript (Type-safe Expo Router)
* **State & Persistence**: local-first client database via `@react-native-async-storage/async-storage` (keys: `todoapp:v1`, `todoapp:daily:v1`, `todoapp:history:v1`, `todoapp:profile:v1`, `todoapp:settings:v1`, `todoapp:recycle_bin:v1`, `todoapp:collections:v1`)
* **Natural Language Parsing**: Client-side parsing using `chrono-node` and `compromise` (<12ms)
* **Animation & Gestures**: `react-native-reanimated`, `react-native-gesture-handler`

---

## 3. Current Architecture Snapshot
* **Local Observer Pattern**: A lightweight state emitter in [stateEvents.ts](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/services/stateEvents.ts) alerts active views to load fresh AsyncStorage state whenever items are mutated.
* **Worklet Thread Boundary**: UI animations run on the native UI thread. React state updates or Ref mutations within worklets are routed to the JS thread via Reanimated's `runOnJS()` to prevent crashes.

---

## 4. Folder Structure Overview
* `/app/` — Expo Router tab layout and subscreen routing.
* `/components/` — UI widgets divided by feature area (dashboard, focus, profile, ui primitives).
* `/constants/` — Palette colors, dark/light theme configs, and fonts.
* `/hooks/` — Custom hooks (voice capture, color schemes).
* `/modules/` — Feature UI sections (tasks, habits, workspaces, stats).
* `/services/` — Underlying logic services (NLP, storage, alarms, mascot recommendations).
* `/docs/` — Full-length documentation references.

---

## 5. Core Features
1. **Pebble Capture**: Client-side natural language text extraction with live cycle-on-tap pills.
2. **Focus timer**: Pomodoro timer with animated breathing rings, ambient audio, and XP rewards.
3. **Mascot Companion**: Responsive crow mascot that summons/dismisses via device shakes, falls asleep during quiet hours, and holds dangling parchment recommendation cards.
4. **Alarms & Reminders**: Local reminders with double-escalation warnings (+120m and +240m).
5. **Recycle Bin**: Soft-delete safety net with 30-day auto-purge on mount.
6. **Pebble Knowledge Collections**: Save passive reference items (links, notes, images) nested inside workspace collections, triage unassigned items in the Inbox, and copy items to tasks (+10 XP).

---

## 6. Planned Systems
* **Pebble Knowledge Collections Extensions**
  * **Status**: Planned (Future Phase)
  * **Description**: Pull-style resurfacing integrations (Today screen widgets, mascot suggestion cards, and focus break recommendation panels).

---

## 7. Active Systems
* **Settings vs Gesture Separation**: Companion settings toggle is distinct from temporary swipe-dismissals. Shaking the device summons the mascot back if swiped, but does nothing if disabled in Settings.
* **Hanging Twine SVG Alignment**: Suggestion cards hang from the beak by an SVG diagonal line that compensates for the card's `-4deg` rotation to align exactly with the card's punch hole center `(166, 108)` and beak Y-level `(181, 68)`.

---

## 8. Current Priorities/TODOs
* [ ] Maintain documentation synchronization across `/docs` and `AI_CONTEXT.md` when code is edited.
* [ ] Optimize AsyncStorage writes to prevent storage lag.
* [x] Implement Pebble Knowledge Collections (create collections, nested links/notes/images, default Quick Captures, Inbox triage, non-destructive task copy).

---

## 9. Known Constraints
* **AsyncStorage**: Local-only; no cloud syncing. Max size limits apply (5-10MB standard).
* **Exact Alarms**: Android 12+ requires explicit user permission which must be launched via Intent.
* **Web Fallbacks**: Reminders on Web fall back to `setTimeout`/`setInterval` logs.

---

## 10. Important Rules AI Should Follow
1. **Source Code is Truth**: If existing documentation conflicts with active code, trust the code.
2. **Thread Safety**: Never mutate JS state or React Refs directly inside Reanimated timing worklets; always wrap them in `runOnJS()`.
3. **Beak Offsets**: Mascot beak coordinates must remain centered at `bubbleOffsetRightShared.value - translateX.value - 8` relative to the screen. Adjust container shifts accordingly.
4. **Keep it Concise**: Maintain `AI_CONTEXT.md` under 300 lines; do not duplicate full documentation files.
