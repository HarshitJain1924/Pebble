# Pebble Productivity App (Expo SDK 54)

A local-first, premium productivity suite built with Expo Router. It seamlessly combines day-focused task planning, daily habit tracking, streak consistency analytics, customizable time alarms, deep-focus Pomodoro timers, and an advanced **Local Heuristic Pebble Capture Engine**—requiring no backend databases or paid cloud APIs.

Pebble is inspired by the classic crow-and-pebbles story: a crow raises the water level one pebble at a time until it reaches its goal.
Our philosophy is simple:
* One task
* One habit
* One focus session
* One reminder
* Small actions create big progress.

> 📖 **Project PRD:** View the full [Product Requirements Document (PRD.md)](./PRD.md) for detailed feature flowcharts, specs, and technical requirements.

---

## ⚡ Key Highlights

Pebble integrates a completely offline-ready, lightning-fast natural language engine alongside modern UX principles:

1. **Pebble Capture:** Type naturally (e.g. *"Gym every morning at 7am"* or *"Study React tomorrow at 8pm high priority"*). Pebble uses `chrono-node` and `compromise` client-side to extract dates, times, categories, and priorities in **<12ms**.
2. **Rotating Placeholders:** Fades between plain text examples to naturally guide users on input possibilities.
3. **✨ Detection Badges:** Displays glowing `Smartly detected` or `Draft schedule` badges based on extraction confidence.
4. **🔄 Cycle-on-Tap Editing:** Tapping the parsed badges in the preview card lets you cycle categories, priorities, dates, and times on-the-go with **haptic feedback** before saving.
5. **🔔 Local Notifications:** Parses phrases like *"and remind me 15 minutes before"*, automatically scheduling exact alarms via `expo-notifications`.
6. **🧠 Local Behavior Suggestions:** Tracks creation frequencies and prompts suggestion banners to *"Convert Gym into a recurring habit?"* after repeated manual entries.

---

## 📱 Core Screens & Navigation

Built on **Expo Router** with seamless transitions:

### 1. Today Dashboard (`app/(tabs)/index.tsx`)
The entry point of the app, providing an authoritative, borderless summary of your day:
- **Universal Metrics**: Real-time progress meters tracking completed tasks and active habits.
- **Category Shortlinks**: High-fidelity graphical shortcuts to filter and create tasks in various contexts.
- **Alarms Preview**: Spotlights the next upcoming exact alarm notification so you stay ahead.

### 2. Tasks & Habits Planner (`app/(tabs)/tasks.tsx`)
Features a unified segmented switcher to toggle between **Tasks** and **Habits**:
- **Calendar Strip**: Scrollable weekday strip using `react-native-calendars` to filter active tasks.
- **Suggestions Banner**: Displays active local suggestions to convert repetitive tasks into habits.
- **Streak Statistics**: Track habit consistency with density bars and weekly progress grids.

### 3. Focus Console (`app/(tabs)/focus.tsx`)
An immersive deep-work console designed to optimize cognitive flow:
- **Preset Focus Sessions**: Presets for 15, 25, 45, or 60-minute Pomodoros.
- **Liquid Timers**: Features visual gradient rings that breathe and animate using `react-native-reanimated`.
- **Gamification**: Awards +10 XP (represented as pebbles added to your progress) for task completion and +15 XP for habit runs.

### 4. Pebble Capture Modal
- **Access:** Tap the `⚡ Pebble Capture` pill or FAB to trigger a Bottom Sheet (`@gorhom/bottom-sheet`).
- **Glassmorphism Overlay:** Implements beautiful blurred glass backdrops using `expo-blur`.
- **Interactive Review:** Tweak parsed items instantly by tapping pills.

---

## 🎨 Hardware Gestures & Fluid Motion

The Pebble system incorporates smooth transitions powered by **React Native Gesture Handler** and **React Native Reanimated**:
1. **Interactive Tab Swiping**: Swipe left or right anywhere to slide between tab views (Today ⇄ Planner ⇄ Analytics ⇄ Focus).
2. **Directional Card Swipes**: Swipe items horizontally in lists:
   - **Swipe Right**: Checks off and completes the item (Success Haptic + Emerald Green splash overlay).
   - **Swipe Left**: Deletes the item (Medium Haptic + Crimson Red delete overlay).
3. **Dynamic Premium Shadows**: Softens shadows dynamically based on theme (opacity `0.03`-`0.05` in light mode).

---

## 🛠️ Technical Stack
- **React Native 0.81** (New Architecture & React Compiler enabled)
- **Expo SDK 54** (Expo Router, expo-notifications, expo-blur, expo-haptics)
- **State Management**: `@react-native-async-storage/async-storage`
- **UI Components**: `@gorhom/bottom-sheet`, `react-native-calendars`

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
