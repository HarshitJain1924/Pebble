# Features Specification: Pebble Productivity App

Pebble integrates offline-ready task capturing, gamified analytics, immersive focus consoles, and a reactive companion assistant.

---

## 1. Local Heuristic Pebble Capture Engine

The capture engine is a client-side NLP parser that runs client-side in `<12ms`. It extracts data using regexes and rule-based heuristic layers.

### 1.1 NLP Parser Syntax
* **Recurrence Keywords**:
  * `"gym every day"`, `"run daily"` ➔ Type: `habit`, Recurrence: `daily`
  * `"meeting every weekday"` ➔ Type: `habit`, Recurrence: `weekdays` (Mon-Fri)
  * `"pay bills every month on the 1st"` ➔ Type: `task`, Recurrence: `monthly`, Day: `1`
  * `"drink water every 2 hours"` ➔ Type: `habit`, Recurrence: `interval` (2 hours)
* **Lead Alarms**:
  * Detecting `"remind me 30 mins before"` or `"alert me 1 hour prior"` calculates `reminderOffsetMinutes` to schedule a notification before the event.
* **Categories mapping**:
  * Scans keywords (e.g. `study` ➔ `learning`, `gym` ➔ `health`, `meeting` ➔ `work`, `clean` ➔ `personal`, `meditate` ➔ `focus`, `design` ➔ `creative`).

### 1.2 Cycle-on-Tap Controls
Tapping parsed badges inside the capture review card rotates parameters:
* **Category**: `Work` ➔ `Personal` ➔ `Health` ➔ `Learning` ➔ `Creative` ➔ `Focus`.
* **Priority**: `Medium` ➔ `High` ➔ `Low`.
* **Scheduled Date**: `Today` ➔ `Tomorrow` ➔ `Next Week` ➔ `Inbox` (Unscheduled).
* **Suggested Time**: `None` ➔ `08:00` ➔ `12:00` ➔ `15:00` ➔ `18:00` ➔ `20:00` ➔ `22:00`.

---

## 2. Mascot Companion Assistant (Crow)

The Crow mascot overlay serves as a gamified guide and smart suggestor.

### 2.1 Mascot Poses and Offsets

| Mascot Pose | Trigger | Offset Translation | Breathing Animation |
| :--- | :--- | :--- | :--- |
| **`idle`** | Default passive state | `translateX: 30`, `translateY: 0` | `-3px` amplitude, `2400ms` duration |
| **`peek`** | Occasional peeks | `translateX: 24`, `translateY: -5` | `-4px` amplitude, `2000ms` duration |
| **`chatting`**| Tapping the mascot | `translateX: 24`, `translateY: -2` (tilt `-10deg`) | `-5px` amplitude, `1800ms` duration |
| **`focus`** | Pomodoro work block running | `translateX: 26`, `translateY: 0` (tilt `-5deg`) | `-2px` amplitude, `3000ms` duration |
| **`sleeping`**| Quiet Hours (User inactive) | `translateX: 28`, `translateY: 4` | `-1.2px` amplitude, `4500ms` duration |
| **`worried`** | Evening, streak at risk, 0 pebbles | `translateX: 0`, `translateY: -8` (tilt `12deg`) | `-6px` amplitude, `1200ms` duration |

### 2.2 Twine Suggestion Card
When a task/habit is checked off, the mascot displays a suggestion card dangling from its beak:
* **Twine Rope**: An SVG-drawn diagonal line from beak `(181, 68)` to rotated card hole `(166, 108)`.
* **Parchment Styling**: Warm color tones (`rgba(253, 251, 242, 0.96)` for light mode, `rgba(30, 29, 27, 0.96)` for dark mode).
* **Interactive Actions**: Tapping the button executes custom actions:
  * Start 5m Zen Break.
  * Start 25m Focus Session.
  * Add suggested task/habit parsed from workspace topics.

---

## 3. Focus Console (Pomodoro)

The focus console is an immersive tool built to block distractions.

* **Duration Presets**: Quick select buttons for 15, 25, 45, or 60 minutes.
* **Liquid Rings**: Double concentric circles that scale and breathe using `react-native-reanimated` timing loops.
* **XP Gamification**:
  * Completing a task in focus mode awards **+10 XP** (drops a task pebble in the jar).
  * Completing a habit awards **+15 XP** (drops a habit pebble).
* **Ambient Music**: Built-in player modal with presets (Lo-Fi Beats, Forest Rain, Cozy Cafe, Waves).

---

## 4. Alarms & Notification Escalations

* **Snooze/Dismiss Banners**: Incoming alarms trigger a top-down slider banner allowing the user to Snooze (+15 mins) or Dismiss directly without leaving their current screen.
* **Quiet Hours**: Users can set quiet hours (e.g. 10 PM - 7 AM). All notification triggers scheduled during quiet hours are automatically blocked to respect user downtime.
* **Escalation Warnings**: Reminders scheduled for critical items trigger backup notifications at `+120 mins` and `+240 mins` if the item is not ticked off, preventing critical tasks from being forgotten.

---

## 5. Recycle Bin & Undo Lifecycle

* **Soft Delete**: Deleting lists, tasks, or habits places them in the Recycle Bin with metadata tracking their original folder.
* **Undo Snackbar**: Displays a slide-in bar allowing the user to reverse the delete action instantly.
* **Auto-Purge**: Root launcher runs a cleanup check on mount. Items with deletion timestamps older than 30 days are permanently purged from disk, and their scheduled reminders are deleted.

---

## 6. Pebble Knowledge Collections V1

* **Status**: Implemented (V1)
* **Description**: Pebble Knowledge Collections (formerly Pebble Vault) is a digital reference repository inside the Workspace area.

### 6.1 Unified List & Quick Add Selector
* **Segmented Switcher**: The Workspace segmented control partitions folders into three segments: `[Tasks | Habits | Collections]`.
* **Optional Folder Assignment**: Collections can optionally be associated with a workspace folder; if not assigned, they reside in the general "Inbox" (unassigned).
* **Save Type Heuristics**: The Quick Add bottom sheet supports saving to Collections, offering content types like links, notes, images, and files.

### 6.2 Task Conversion, Recycle Bin, & Restoration
* **Make Actionable**: Collection items can be converted into active tasks. Doing so copies the title and notes, places the task in the selected folder, awards **+10 XP** (drops a task pebble in the jar), and keeps the source reference item intact.
* **Archiving & Deleting**: Supports toggling archived status and soft-deleting collections or items to the Recycle Bin (allowing recovery).
* **Restoration**: Restoring collections or items from the Recycle Bin returns them to their original workspace folders and emits `vault_changed` events.

### 6.3 Pull-Based Resurfacing (Planned Future Scope)
* **Today Dashboard ("Pebble from the Vault")**: Will display one random item daily in a morning widget card.
* **Mascot Suggestions**: Tapping the mascot companion will periodically display a saved idea in the beak parchment suggestion card.
* **Focus Rest Recommendations**: Pomodoro break screens will recommend reviewing a saved link or note to relax.

