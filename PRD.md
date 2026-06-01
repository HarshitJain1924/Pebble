# Product Requirements Document (PRD) — Pebble Productivity App

## 1. Overview
**Product Name:** Pebble  
**Platform:** React Native (Expo SDK 54) - iOS, Android, Web  
**Core Value Proposition:** A local-first, premium productivity suite combining daily task planning, habit tracking, focus timers (Pomodoro), localized alarms, and a fully offline-compatible **Pebble Capture Engine** without requiring a backend database or cloud AI APIs.

---

## 2. Target Audience & Design Vision
- **Target Audience:** Professionals, students, and power users who seek an integrated productivity suite.
- **Privacy Focus:** Users who value absolute privacy and offline capability (local-first state via AsyncStorage).
- **Design Philosophy:** Inspired by the classic crow-and-pebbles story (raising the water level one pebble at a time). One task, one habit, one focus session, one reminder. Small actions create big progress.
- **Visual Identity:** Friendly, calm, premium, modern, trustworthy, and personal. Minimal crow holding a purple pebble.
- **Design Language:** Focuses on fluid gesture motion, premium glassmorphism overlays (via expo-blur), soft dynamic shadows, high-fidelity micro-interactions (expo-haptics), and a clean, borderless aesthetic leveraging modern fonts (@expo-google-fonts/outfit).

---

## 3. Product Architecture & User Flow

### 3.1 Global Natural Language Capture Flow
The central interaction loop for creating structured tasks, reminders, and habits using plain text:

```mermaid
graph TD
    A[Tap FAB or Header Capture Pill] --> B[Open Premium Glassmorphic Pebble Capture Modal (Bottom Sheet)]
    B --> C[Fading Rotating Placeholders Teach Users NLP Syntax]
    C --> D[User Types: 'Study React tomorrow at 8pm and remind me 30 mins before']
    D --> E[100% Offline Parser Chrono + Compromise Runs in <12ms]
    E --> F[Display Interactive Real-Time Preview Card]
    F --> G{Smart Detection Badge: '✨ Smartly detected' or '📝 Draft'}
    G --> H[Interactive Cycle-on-Tap Badges for Rapid Fine-tuning]
    H --> I[Tap Badge: Category, Priority, Date, or Time cycles instantly with Haptics]
    I --> J[Confirm & Save to Workspace (AsyncStorage)]
    J --> K[Alarm scheduled via expo-notifications]
```

---

## 4. Feature Specifications

### 4.1 Pebble Capture Engine
- **Heuristic Parsing:** Centralized parsing handling using `chrono-node` and `compromise`.
- **Habit/Recurrence Detection:** Matches recurring keywords (`daily`, `every day`, `every morning`, `weekdays`, `weekends`) and automatically classifies the item as a `"habit"`.
- **Smart Date & Time Extraction:** Extracts date/time phrases, combines them into actionable timestamps, and strips them from the task title.
- **Smart Lead Reminders Offset:** Detects phrases like *"remind me 30 minutes before"* to compute offset and set accurate local notifications using `expo-notifications`.
- **Cycle-on-Tap Customizations:**
  - **Category:** Work ➔ Personal ➔ Health ➔ Learning ➔ Creative ➔ Focus
  - **Priority:** High ➔ Medium ➔ Low
  - **Date:** Today ➔ Tomorrow ➔ Next Week ➔ Inbox
  - **Time:** None ➔ 08:00 ➔ 12:00 ➔ 15:00 ➔ 18:00 ➔ 20:00 ➔ 22:00

### 4.2 Behavior Suggestion Engine
- **Local Analytics:** Frequency tracking based on task creations.
- **Auto-Suggestions:** If a task is created multiple times, prompts to convert to a recurring habit.
- **Action Loops:** Accept (automatically creates habit, schedules it, and awards XP) or Dismiss.

### 4.3 Today Dashboard & Workspaces
- **Universal Metrics:** Progress meters for active tasks and completed habits.
- **Workspaces:** Segmented folder grids with due-today task indicators.
- **Focus Timer:** Immersive Pomodoro timer with `react-native-reanimated` breathing rings, gamification (+10 XP task, +15 XP habit).
- **Calendar Integration:** Leverages `react-native-calendars` for rich streak and schedule viewing.

---

## 5. Technical Stack & Non-Functional Requirements
- **Framework:** Expo SDK 54, React Native 0.81 (New Architecture & React Compiler enabled), Expo Router with Typed Routes.
- **Core Libraries:** `chrono-node` (date/time parser), `compromise` (offline NLP).
- **Storage:** `@react-native-async-storage/async-storage` (100% offline local-first state).
- **UI & Transitions:** `react-native-reanimated` (animations), `react-native-gesture-handler` (interactions), `expo-blur` (glassmorphism), `@gorhom/bottom-sheet` (bottom sheet modals).
- **Performance Thresholds:**
  - Parsing execution time: **<15ms** (runs on main or background thread efficiently).
  - UI frame rate: **60fps** continuous UI render for gestures and modal sheets.
  - Light-mode shadows: Dynamically softened to soft light levels (`opacity: 0.03 - 0.05`).
