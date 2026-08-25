# AI Context: Pebble Productivity App

This file is a compressed memory layer optimized for future AI sessions. It serves as a navigation map and architectural primer.

---

## 1. Project Summary
Pebble is a premium, local-first productivity app. It integrates daily task planning, habit consistency tracking, Pomodoro focus timers, localized reminders, and a completely offline natural language capture engine. The visual experience is gamified through earning Pebbles and Gems, guided by a responsive Crow mascot companion.

---

## 2. Current Terminology & Domain Model
The current canonical terminology established by the codebase:
- **Workspace**: The top-level organizational folder.
- **Task**: A one-off actionable item (status: `todo` or `completed`).
- **Habit**: A recurring item tracked via a `completionHistory` array and streaks.
- **Checklist**: A list of sub-items.
- **Resource**: Passive reference items (links, notes, images) saved inside a workspace.
- **Recycle Bin**: A soft-delete safety net for entities and workspaces.
- **Gamification**: Users earn **Pebbles** (Task = 1, Habit = 1, Focus = 1) which convert to **Gems** (45 Pebbles = 1 Gem).
- **Move Journal**: Logs pending cross-workspace moves to recover from crashes.
- **Conversion Journal**: Logs pending task<->habit conversions to recover from crashes.
- **Unified Capture**: The natural language capture engine.

*(Note: Legacy terminology such as XP, Vault, Collections, Todo, TodoList, and TaskList are obsolete and must not be used).*

---

## 3. Current Architecture Snapshot

> **IMPORTANT**: The architecture described here is a summary. For the definitive, authoritative state of the data integrity, locking, and persistence model, ALWAYS read:
> 1. `docs/current_state.md`
> 2. `docs/integrity_status.md`

### 3.1 Repository & Storage Model
- **Storage**: 100% local-first client database via `@react-native-async-storage/async-storage`.
- **Partitioning**: Data is strictly partitioned by entity type and workspace ID (e.g., `pebble:v1:tasks:${workspaceId}`).
- **Repositories**: Pure data-access objects (e.g., `TaskRepository`, `HabitRepository`) that enforce exact storage keys and structural normalizations.

### 3.2 Command Handler Architecture
- **Command Handlers**: All complex mutations, side-effects, and cross-partition logic are centralized in Command Handlers (`TaskCommandHandler`, `HabitCommandHandler`, `WorkspaceCommandHandler`, etc.).
- **Events**: Handlers emit events via a lightweight state emitter (`state-events.ts`) which triggers UI re-renders.

### 3.3 Concurrency & Data Integrity Model
- Operations performing Read-Modify-Write (RMW) cycles across partitions use a deterministic mutex locking system (`withLock`).
- **Known Data-Integrity Work Completed**:
  - The `Task` mutation surface (update, complete, uncomplete, move, recycle, restore, bulk operations) has received substantial lock-boundary hardening.
  - `Workspace` lifecycle (delete/restore) is hardened with a strict 5-lock acquisition sequence (`tasks`, `habits`, `checklists`, `resources`, `ws_lifecycle`).
  - `HabitCommandHandler.updateHabit` is hardened with `withLock` and `saveHabitUnlocked`.
- **Known Remaining Areas Requiring Audit/Hardening**:
  - Remaining `Habit` operations (e.g., `completeHabit`, `moveHabit`).
  - `Checklist` and `Resource` operations.
  - `TaskCommandHandler.clearCompletedTasks`.

---

## 4. Folder Structure Overview
* `/app/` — Expo Router tab layout and subscreen routing.
* `/features/` — Encapsulated vertical feature slices (e.g., `capture`, `today`, `details`, `profile`).
* `/services/command/` — Centralized Command Handlers for all data mutations.
* `/repositories/` — Raw AsyncStorage data access objects.
* `/shared/` — Common types, utilities, and generic UI components.
* `/docs/` — Full-length documentation references.

---

## 5. Active Product Features
1. **Unified Capture**: Client-side natural language text extraction (`chrono-node`, `compromise`) with live cycle-on-tap pills.
2. **Focus Timer**: Pomodoro timer with animated breathing rings and gamification rewards.
3. **Mascot Companion**: Responsive crow mascot that recommends actions and provides visual feedback.
4. **Alarms & Reminders**: Local reminders using `expo-notifications`.
5. **Resources**: Save passive reference items (links, notes, images) nested inside workspaces.

---

## 6. Important Architectural Constraints
1. **Source Code is Truth**: If existing documentation conflicts with active code, trust the code.
2. **Lock Order**: When acquiring multiple locks (e.g., cross-workspace moves), lock keys must generally be sorted alphabetically via `withLocks`. However, specific hierarchical paths (e.g. Partition -> MoveJournal -> Recycle Bin) must explicitly bypass alphabetical sorting to prevent global hierarchy deadlocks.
3. **Unlocked Primitives**: Command handlers using `withLock` must call `*Unlocked` repository methods (e.g., `saveTasksUnlocked`) to prevent re-entrant deadlocks, since the mutex is non-reentrant.
4. **Worklet Thread Boundary**: UI animations run on the native UI thread. React state updates or Ref mutations within worklets must be routed to the JS thread via Reanimated's `runOnJS()`.
