# AI Context: Pebble Productivity App

> **Truth as of 2026-10-02.** Verified against the active codebase on this date. If the code has changed since, the code wins — update this document instead of trusting the date.

This file is a compressed memory layer optimized for future AI sessions. It serves as a navigation map and architectural primer.

> **Source of truth**: Active code and tests outrank every document, including this one.
> Evidence order: (1) code + tests, (2) tokens/components, (3) `docs/architecture/*`,
> (4) `docs/current_state.md` / `docs/integrity_status.md` / this file, (5) `AGENTS.md`
> & `.agents/skills/*`, (6) README/PRD, (7) `docs/archive/**` (historical only).
> If documentation conflicts with code, inspect the code and update the document — do
> not invent a third interpretation. Verify claims against `app/`, `features/`,
> `services/`, `repositories/`, and `shared/constants/` before trusting prose anywhere.

---

## 1. Project Summary
Pebble is a premium, local-first productivity app built on **Expo SDK 57 / React Native 0.86 / React 19.2** (New Architecture + React Compiler). It integrates daily task planning, habit consistency tracking, Pomodoro and stopwatch focus timers, localized reminders, a calendar/schedule planner, and a completely offline natural language capture engine. The visual experience is gamified through earning Pebbles and Gems, guided by a calm crow companion named **Cairn** (`docs/cairn_voice_guide.md`).

---

## 2. Current Terminology & Domain Model
The current canonical terminology established by the codebase:
- **Workspace**: The top-level organizational folder.
- **Task**: A one-off actionable item (status: `todo` or `completed`).
- **Habit**: A recurring item tracked via a `completionHistory` array and streaks.
- **Checklist**: A list of sub-items.
- **Resource**: Passive reference items (links, notes, images) saved inside a workspace.
- **Recycle Bin**: A soft-delete safety net for entities and workspaces.
- **Gamification**: Users earn **Pebbles** on eligible completion of a Task, Habit, Focus session, or Checklist (1 Pebble per event, capped at **15/day globally**). Lifetime Pebbles derive **Gems** at **45:1**; Gems are the only spendable currency (bonus Gems are also awarded for a first daily Pebble and are spendable on streak recovery). Source: `features/profile/services/pebble.service.ts`.
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
- **Owned-Key Registry**: `services/storage/storage-keys.ts` (`isPebbleOwnedKey`) is the single definition of the Pebble storage surface used by backup/restore/clear-all.
- **Startup Recovery**: `services/startup/startup-recovery.ts` (`runStartupRecovery`) is the single startup sequence: interrupted-restore recovery → MoveReconciler → ConversionReconciler → ghost pruning → recycle-bin cleanup → **GraphReconciler** → NotificationReconciler.
- **Notification Permission**: OS permission is requested only after explicit user intent (Alert Center "Enable Alerts") via `services/notifications/notification-permission.ts`; permanent denials route to system Settings.

### 3.2 Command Handler Architecture
- **Command Handlers**: All complex mutations, side-effects, and cross-partition logic are centralized in Command Handlers (`TaskCommandHandler`, `HabitCommandHandler`, `WorkspaceCommandHandler`, etc.).
- **Events**: Handlers emit events via a lightweight state emitter (`state-events.ts`) which triggers UI re-renders.

### 3.3 Concurrency & Data Integrity Model
- Operations performing Read-Modify-Write (RMW) cycles across partitions use a deterministic mutex locking system (`withLock`).
- **Known Data-Integrity Work Completed**:
  - The `Task` mutation surface (update, complete, uncomplete, move, recycle, restore, bulk operations) has received substantial lock-boundary hardening.
  - `Workspace` lifecycle (delete/restore) is hardened with a strict 5-lock acquisition sequence (`tasks`, `habits`, `checklists`, `resources`, `ws_lifecycle`).
  - `HabitCommandHandler.updateHabit` and `completeHabits` are hardened with `withLock` and failure isolation.
  - `ChecklistCommandHandler` item-level dual-state mutations (`toggleChecklistItem`, `deleteChecklistItem`, `addChecklistItem`) and lifecycle boundaries are verified under workspace partition locks with zero lost updates.
  - `ResourceCommandHandler` permanent deletion (`permanentlyDeleteResource`) and multi-repository boundaries (Active, RecycleBin, Tombstone, Graph relationships, and `resourceIds` reconciliation) are verified under hostile concurrency.
  - `GraphReconcilerService` secondary resource reference (`resourceIds`) mutation paths across Task, Habit, and Checklist are hardened against stale prunes and concurrent user linking.
  - `MoveJournalRepository` and `MoveReconcilerService` removal durability and idempotent crash recovery across multi-partition workspace boundaries are verified safe under hostile crash/restart conditions.
- **Known Remaining Areas Requiring Audit/Hardening**:
  - Conversion journal-removal atomicity and remaining secondary task/habit operations (see `docs/integrity_status.md` OPEN items).

---

## 3.4 Current Navigation (verify in `app/(tabs)/_layout.tsx` + `shared/components/navigation/PebbleRadialTabBar.tsx`)
Pebble does **not** use a conventional tab bar. The bottom dock is a **radial "Pebble dial"** (`PebbleRadialTabBar`) with five sectors, opened by tap (sticky) or hold-drag (release-to-launch):

1. **Today** (`app/(tabs)/index.tsx`) — workspace-grouped execution stream.
2. **Workspaces** (`app/(tabs)/tasks.tsx`) — workspace grid + per-workspace Tasks/Habits/Checklists/Resources domain tabs.
3. **Quick Capture** (center hero sector) — opens the `UnifiedCapture` bottom sheet (there is no FAB and no separate capture pill).
4. **Schedule** (`app/(tabs)/calendar.tsx`) — day/week/month planner with drag-drop scheduling.
5. **Focus** (`app/(tabs)/focus.tsx`) — Pomodoro/stopwatch cockpit with linked task/habit and ambient sound.

Stack routes (modals/screens, `app/_layout.tsx`): `onboarding`, `profile`, `profile/stats`, `profile/achievements`, `sanctuary`, `notifications`, `task-details` (modal), `checklist-details` (modal), `resource-details` (modal), `archive`, `recycle-bin`. `settings` exists as a route but is hidden (`href: null`) from the dial.

---

## 4. Folder Structure Overview
* `/app/` — Expo Router routes (tab group + modal/subscreens).
* `/features/` — Encapsulated vertical feature slices (e.g., `capture`, `today`, `details`, `profile`).
* `/services/command/` — Centralized Command Handlers for all data mutations.
* `/repositories/` — Raw AsyncStorage data access objects.
* `/shared/` — Common types, utilities, and generic UI components.
* `/docs/` — Full-length documentation references.

---

## 5. Active Product Features
1. **Unified Capture**: Client-side natural language text extraction (`chrono-node` + regex/pattern heuristics) with a live parse preview. Includes a **workspace-routing suggestion** (suggests an existing workspace for the item, accept/dismiss) — see note below.
2. **Focus Timer**: Pomodoro timer with animated breathing rings and gamification rewards.
3. **Mascot Companion (Cairn)**: A calm crow companion docked beside the navigation dial that reacts at edges of activity (completion, milestones, empty states) without judging or pressuring the user. Authoritative spec: `docs/cairn_voice_guide.md`.
4. **Alarms & Reminders**: Local reminders using `expo-notifications`.
5. **Resources**: Save passive reference items (links, notes, images) nested inside workspaces.
6. **Manual Data Export**: User-facing export flow in Settings that generates a full local backup JSON via authoritative `BackupService` and presents the platform-native share/save sheet (`expo-sharing`).
7. **Contextual Empty-State System**: Reusable, accessible `EmptyState` component with Pebble mascot integration (`idle`, `sleeping`, `focus`, `peek`), concise explanatory messaging, and immediate action triggers (`open_quick_add`, `setIsAddingResource`) across Checklists, Resources, Calendar, Focus target picking, and Archive.
8. **Accessibility Hardening**: Standardized semantic roles, state exposure (`checked`, `selected`, `expanded`, `busy`, `disabled`), contextual accessible labels on icon-only controls, expanded baseline hit areas on core interactive components (`PressableScale`, `AnimatedCheckbox`, `SegmentedSwitcher`, `AppCard`), and explicit touch-target hardening across high-risk controls.

### 5.1 Known inactive / orphaned systems (as of 2026-10-02)

These are documented features or code paths that are **not currently operational**. Do not present them as working, and do not assume their data exists.

- **Behavior Suggestion Banner (`features/capture/components/SuggestionBanner.tsx`) — NOT WIRED.** The banner is mounted on the Workspaces landing screen (`app/(tabs)/tasks.tsx`) but is effectively unreachable. It renders `null` unless `getActiveSuggestions()` returns items from `PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS`, and the only writer of that key — `logTaskCreation()` — is called solely by `useTasksState.handleSaveParsedItem()`, which has **no callers**. The live capture path, `CaptureService.saveParsedItem()`, never logs suggestions. Unless the key is seeded by other means, the banner never appears.
- **`useTasksState.handleSaveParsedItem()` — ORPHANED.** This is a second, legacy entity-creation path (bypassing `CaptureService`) that is exported from the hook but never invoked. The Smart Capture ADR (`docs/architecture/smart_capture_adr.md`) already flags it as a bypass to be deprecated; it is currently dead code.
- **Suggestion "create this workspace" in Quick Capture — NOT IMPLEMENTED.** Quick Capture can suggest *routing into an existing workspace* (`workspace-suggestions.service.ts`, surfaced in `UnifiedCapture`), but there is no behavior that proposes *creating a new workspace* from a capture.
- **Dead files / modules (no production importers).** `shared/components/navigation/motion-tabs/**` (entire tree; imported once as `AnimatedTabBar` but never rendered — the live bar is `PebbleRadialTabBar`), `services/events/domain-events.ts`, and several orphaned components: `CalendarNavigationCard`, `FocusStatsCard`, `FocusRhythmPeaks`, `ContinueWorkspaceCard`, plus test-only `TemporalHorizonStrip`, `PebbleJarProgressCard`, `StreakBanner`, `SegmentedSwitcher`. Full list + the "do NOT delete" exceptions (`useColorScheme.web.ts`, routes, scripts) in `docs/current_state.md` §22.1.

---

## 6. Important Architectural Constraints
1. **Source Code is Truth**: If existing documentation conflicts with active code, trust the code.
2. **Lock Order**: When acquiring multiple locks (e.g., cross-workspace moves), lock keys must generally be sorted alphabetically via `withLocks`. However, specific hierarchical paths (e.g. Partition -> MoveJournal -> Recycle Bin) must explicitly bypass alphabetical sorting to prevent global hierarchy deadlocks.
3. **Unlocked Primitives**: Command handlers using `withLock` must call `*Unlocked` repository methods (e.g., `saveTasksUnlocked`) to prevent re-entrant deadlocks, since the mutex is non-reentrant.
4. **Worklet Thread Boundary**: UI animations run on the native UI thread. React state updates or Ref mutations within worklets must be routed to the JS thread via Reanimated's `runOnJS()`.
