# Project Context: Pebble Productivity App

Pebble is a local-first, premium productivity suite designed for individuals who value speed, privacy, and delightful micro-interactions.

---

## 1. Vision & Philosophy
Inspired by the classic Aesop fable where a thirsty crow raises the water level in a pitcher by dropping one pebble at a time, Pebble's core philosophy is built around three pillars:
* **Tasks** = Things to do (active, short-term)
* **Habits** = Things to repeat (active, long-term)
* **Vault** = Things to remember (passive, static; Status: Implemented (V1))

Small daily actions accumulate to build long-term progress. Visually, progress is gamified through **Pebble Points (XP)** and an interactive **Pebble Jar** that fills up as tasks, habits, and focus sessions are completed, and (once implemented) vault conversions will drop pebbles.

---

## 2. Design Vision & Premium Aesthetics
Pebble is built to feel premium, calm, and interactive:
* **Glassmorphism**: Leverages [expo-blur](https://docs.expo.dev/versions/v54.0.0/sdk/blur/) for card wrappers and modal backdrops, providing a frosted-glass aesthetic.
* **Fluid Gestures**: Horizontal swipe-to-complete (right) and swipe-to-delete (left) gestures for fast workflow management.
* **Micro-interactions**: Uses [expo-haptics](https://docs.expo.dev/versions/v54.0.0/sdk/haptics/) for physical feedback on ticks, taps, and shakes.
* **Mascot Companion**: A responsive Crow companion that sits on the bottom right, peeks out, sleeps during quiet hours, wakes up when tasks are completed, and holds dangling parchment cards containing context-aware suggestions.

---

## 3. Core User Flows & Mental Model
1. **The Pebble Capture Loop**: Tapping the Quick Add FAB opens a glassmorphic bottom sheet. As the user types naturally, a client-side NLP parser (running `<12ms`) extracts attributes (dates, times, recurrence, workspaces) and displays live cycle-on-tap pills. Saving creates the item and schedules local notifications.
2. **Sanctuary Dashboard**: Displays a high-level summary of the day, including active task progress, alarm previews, and a pebble jar representing earned XP.
3. **Immersive Focus Cockpit**: A Pomodoro timer showing animated breathing rings. Completing work sessions awards XP (+10 XP for tasks, +15 XP for habits) and drops physical pebbles into the interactive jar.
4. **Pebble Vault (Memory Loop - Status: Implemented (V1))**: Allows users to browse a unified list of saved links, notes, and ideas inside Workspaces, optionally assigned to folders or kept in the "Inbox" (unassigned). Vault items can be converted directly to active tasks (+10 XP), soft-deleted to the Recycle Bin, or archived. Future extensions plan pull-resurfacing in Today widgets, mascot suggestion cards, and focus break recommendation panels.

---

## 4. Repository Inventory & Folder Groupings (Phase 1)
Below is the inventory of folders and important files in Pebble:

### Core Directories
* `/app/` — Screen-level navigation layouts and specific routes (Expo Router).
* `/components/` — UI components, widgets, and layout primitives.
  * `/components/dashboard/` — Widgets for the home dashboard.
  * `/components/focus/` — Pomodoro timer controls, modals, and local state management.
  * `/components/profile/` — Jar visualization, rhythm charts, and tiers.
  * `/components/ui/` — Platform generic components (buttons, text, undo provider).
* `/constants/` — Design tokens, themes, and global colors.
* `/hooks/` — Custom React hooks (voice, color schemes).
* `/modules/` — Feature UI containers and primary business hooks.
* `/services/` — Underlying core business logic, NLP parser, database (AsyncStorage), and notification engines.

---

## 5. Logical Modules & File Map
To manage the codebase incrementally, we group the files into the following **9 logical modules**:

| Module | Purpose | Main Files |
| :--- | :--- | :--- |
| **1. Routing & Shell** | Main navigation shell, layouts, onboarding | [Root Layout](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/app/_layout.tsx), [Tabs Layout](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/app/(tabs)/_layout.tsx), [Onboarding](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/app/onboarding.tsx) |
| **2. Planner (Tasks & Habits)** | Unified workspace and list managers | [Planner Screen](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/app/(tabs)/tasks.tsx), [Habits Section](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/modules/habits/HabitSection.tsx), [useTasksState](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/modules/tasks/useTasksState.ts) |
| **3. Pebble Capture & NLP** | Client-side natural language parser | [nlpParser](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/services/nlpParser.ts), [CaptureInputBox](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/ui/CaptureInputBox.tsx), [NLPCapture](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/NLPCapture.tsx) |
| **4. Mascot Companion** | Crow mascot interactive assistant | [MascotOverlay](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/MascotOverlay.tsx), [quickSuggestions](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/services/quickSuggestions.ts) |
| **5. Focus Console** | Pomodoro timer, music player, and XP gamification | [Timer Cockpit](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/focus/TimerCockpit.tsx), [useFocusState](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/focus/useFocusState.ts), [PebbleJar](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/profile/PebbleJar.tsx) |
| **6. Reminders & Alerts** | Alarms and local notifications scheduling | [Reminders Service](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/services/reminders.ts), [AlarmModal](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/modules/reminders/AlarmModal.tsx) |
| **7. Storage & Sync** | Local-first persistence and state event sync | [Storage Service](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/services/storage.ts), [stateEvents](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/services/stateEvents.ts), [UndoContext](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/ui/UndoContext.tsx) |
| **8. Dashboard & Metrics** | Sanctuary widgets, calendar strip, analytics charts | [Dashboard Screen](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/app/(tabs)/index.tsx), [PebbleInsightCard](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/components/dashboard/PebbleInsightCard.tsx) |
| **9. Pebble Vault** | Reference repository for links, notes, and ideas (Status: Implemented (V1)) | [PEBBLE_VAULT.md](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/docs/PEBBLE_VAULT.md), [VaultSection](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/modules/vault/VaultSection.tsx) |
