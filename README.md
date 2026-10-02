# Pebble Productivity App (Expo SDK 57)

> **Truth as of 2026-10-02.** Verified against the active codebase on this date. If the code has changed since, the code wins — see `AGENTS.md` for the source-of-truth order.

A local-first, premium productivity suite built with Expo Router. It seamlessly combines day-focused task planning, daily habit tracking, streak consistency analytics, customizable time alarms, deep-focus Pomodoro timers, and an advanced **Local Heuristic Pebble Capture Engine**—requiring no backend databases or paid cloud APIs.

Pebble is inspired by the classic crow-and-pebbles story: a crow raises the water level one pebble at a time until it reaches its goal.
Our philosophy is simple:
* One task
* One habit
* One focus session
* One reminder
* Small actions create big progress.

**Design direction:** a calm, modern 2026 mobile aesthetic — strong hierarchy, purposeful whitespace, content-first surfaces, restrained motion, and subtle depth. Blur/translucency is used only where it improves hierarchy, not as a style mandate. See `.agents/skills/pebble-design` §10.5.

> 📖 **Project PRD:** View the full [Product Requirements Document (PRD.md)](./PRD.md) for detailed feature flowcharts, specs, and technical requirements.

---

## ⚡ Key Highlights

Pebble integrates a completely offline-ready, lightning-fast natural language engine alongside modern UX principles:

1. **Pebble Capture:** Type naturally (e.g. *"Gym every morning at 7am"* or *"Study React tomorrow at 8pm high priority"*). Pebble uses `chrono-node` plus client-side regex/pattern heuristics to extract dates, times, categories, and priorities **fully offline**.
2. **Rotating Placeholders:** Fades between plain text examples to naturally guide users on input possibilities.
3. **✨ Detection Badges:** Displays glowing `Smartly detected` or `Draft schedule` badges based on extraction confidence.
4. **🔄 Tap-to-Adjust Editing:** The live parse preview exposes detected type, date/time, priority, category, recurrence, and reminder as tappable chips, so you can correct the parser before saving.
5. **🔔 Local Notifications:** Parses phrases like *"and remind me 15 minutes before"*, automatically scheduling exact alarms via `expo-notifications`.
6. **🧠 Local Behavior Suggestions:** Tracks creation frequencies and prompts suggestion banners to *"Convert Gym into a recurring habit?"* after repeated manual entries.

---

## 📱 Core Screens & Navigation

Built on **Expo Router** with typed routes. Navigation is **not** a conventional tab bar:
the bottom dock is a radial **Pebble dial** (`shared/components/navigation/PebbleRadialTabBar.tsx`)
with five sectors, opened by tap (sticky) or hold-drag (release-to-launch). Cairn,
the mascot, sits docked beside it.

### 1. Today (`app/(tabs)/index.tsx`)
The execution surface. Renders a **workspace-grouped stream** (one drawer per workspace)
with an aggregate "All" context tab, a circadian scenic header, a Now Focus card, and
filter/search controls. Each workspace previews at most 5 items before a "+N more" gateway.

### 2. Workspaces (`app/(tabs)/tasks.tsx`)
The organization surface. A workspace grid plus, once a workspace is open, peer domain
tabs for **Tasks / Habits / Checklists / Resources**, with a swipeable date header and
per-domain search. Habit streaks are tracked across these surfaces.

### 3. Schedule (`app/(tabs)/calendar.tsx`)
A day / week / month planner with drag-to-reschedule and drop-to-plan, all-day sections,
a current-time indicator, planning sheets, and free-time gaps.

### 4. Focus (`app/(tabs)/focus.tsx`)
A Pomodoro/stopwatch cockpit with a linked task or habit, ambient sound, a music player,
and an optional atmospheric glow. Completions award Pebbles.

### 5. Quick Capture (center dial sector)
Tapping the centre **Quick Capture** sector opens the `UnifiedCapture` bottom sheet
(`@gorhom/bottom-sheet`) — the single natural-language entry point. There is no FAB and
no standalone capture pill.

---

## 🎨 Hardware Gestures & Fluid Motion

The Pebble system incorporates smooth transitions powered by **React Native Gesture Handler** and **React Native Reanimated**:
1. **Radial navigation**: Tap the dock Pebble to open the dial in sticky mode, or hold and drag to a sector and release to launch.
2. **Directional Card Swipes**: Swipe items horizontally in lists to reveal secondary actions.
3. **Targeted translucency**: `expo-blur` is used sparingly for hierarchy/depth (the dock shield, zen/review overlays, mascot surfaces). Glassmorphism is deliberately *not* a design rule — see `docs/architecture/decision_log.md`.

---

## Architecture Documentation

For the authoritative source of truth on Pebble's crash recovery, persistence, and integrity mechanisms, refer to:
- [Current State Architecture](docs/current_state.md)
- [Integrity Status](docs/integrity_status.md)

---

## 🛠️ Technical Stack
- **React Native 0.86** on **React 19.2** (New Architecture & React Compiler enabled)
- **Expo SDK 57** (Expo Router, expo-notifications, expo-blur, expo-haptics)
- **Storage**: `@react-native-async-storage/async-storage` (local-first, no backend)
- **UI Components**: `@gorhom/bottom-sheet`, `react-native-calendars` (date pickers/detail calendars), `react-native-reanimated`, `react-native-gesture-handler`

---

## 🚀 Run Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start Development Server**:
   ```bash
   npx expo start
   ```
3. **Start Web Server**:
   ```bash
   npx expo start --web
   ```
