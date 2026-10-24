# Architecture Violations & Defects (Audit)

> **Audited commit:** `dd5e785770456964a28862aec7e25f4dc4adc447` · **Branch:** `migration/runtime-parity` · **Tree:** clean at audit start.
> **Method:** static call-path tracing; no application code, tests, config or generated files were modified. No new tests were written (audit constraint). Findings are therefore rated on the strength of code evidence, and every "confirmed" item names the exact interleaving or call path that produces it.
> **Severity:** Critical / High / Medium / Low. Nothing here is rated Critical: no path was found that destroys unrelated data or corrupts a whole dataset under normal use.

Statuses used: **Confirmed violation** (an architectural invariant is broken), **Confirmed functional defect** (product behavior is wrong even though the architecture is followed), **Potential risk** (plausible failure mode, not demonstrated by an existing test), **Intentional exception**.

---

## A. Confirmed violations

### V1 — Load-time reminder re-arm writes a whole Task record outside the command path
- **Severity:** Medium · **Domain:** Task / Reminders / UI state
- **Files:** `features/tasks/hooks/useTasksState.ts:448-470`; `repositories/TaskRepository.ts:202-232` (`saveTask`); canonical targeted API at `TaskRepository.ts:364-423` (`updateNotificationIds`)
- **Call path:** `loadState()` → `rearmWebReminders(allTodos)` (`services/scheduling/reminders.service.ts:1438`) → for every re-armed task `void TaskRepository.saveTask(updatedTask)` (web only).
- **Expected invariant:** UI/hook layers must not mutate domain entities directly; notification ids must be written through the command/reconciler path with an expected-state check.
- **Evidence:** `saveTask` is a full-record overwrite under the partition lock: it re-reads the partition, replaces `records[task.id]` with the caller's potentially stale snapshot, and forces `revision + 1` / `updatedAt = now`. The snapshot was captured before `rearmWebReminders` ran and the write is fire-and-forget (`void … .catch`), so a concurrent `completeTask`, rename or move committed in that window is reverted (status, title, schedule, revision) and the reverted task is presented as a fresh user edit. The canonical CAS primitive `updateNotificationIds` is already used by every command and by `NotificationReconcilerService`, so this path is the only one bypassing it.
- **Reproduction (deterministic):** on web, with a task whose reminder is in the future, trigger `loadState` and, before the re-arm save settles, `EntityCommandService.completeTask(taskId, ws)`. The saved record is the pre-completion snapshot → the task reappears as `todo` while `pebble_log` still holds its reward.
- **Existing tests:** none cover the web re-arm write; `SingleAuthoritativeReminderMutationPath.test.ts` asserts scheduling identity, not this persistence path.
- **Minimal correction:** persist via `TaskRepository.updateNotificationIds(task.id, task.workspaceId, ids, { reminder, status, archivedAt, updatedAt, revision })` and drop the returned-entity local state rewrite (or route the whole re-arm through `NotificationReconcilerService`).
- **Regression risk:** low; the CAS API already has the same signature used by the reconciler.

### V2 — Workspace archive/unarchive bypass the locking, strict-write and verification discipline
- **Severity:** High · **Domain:** Workspace
- **Files:** `services/command/handlers/WorkspaceCommandHandler.ts:265-313` (`restoreWorkspaceArchive`, `archiveWorkspace`); `repositories/WorkspaceRepository.ts:53-70` (`saveWorkspace` tolerant by default)
- **Call path:** `app/(tabs)/tasks.tsx:1157` → `EntityCommandService.archiveWorkspace` → read `WorkspaceRepository.getWorkspaces()` **outside any lock** → `saveWorkspace({ ...staleWorkspace, archivedAt })` → `emitStateChange("workspace_changed")`.
- **Expected invariants:** lifecycle mutations take `ws_lifecycle_<id>`, use fresh state, use `{throwOnError:true}` or read-back verification (as `restoreWorkspace` does), and emit success only after a durable write.
- **Evidence:**
  1. No lock is taken, and `saveWorkspace` reads the collection inside its own lock only to replace the record wholesale — a concurrent `updateWorkspace` (which *is* locked and bumps `revision`) between the hook's read and the save is overwritten by the stale record: the rename is lost.
  2. `saveWorkspace` is called without `throwOnError`, so a failed `setItem` is swallowed (`WorkspaceRepository.ts:68-69`), yet `emitStateChange` still fires and the screen has already updated `state.workspaces`/`state.activeWorkspaceId` (`tasks.tsx:1157-1172`). The UI claims an archive that did not persist.
  3. `revision`/`updatedAt` are not advanced by the handler, so the record does not signal a new edit to `MoveReconcilerService` or open screens.
- **Reproduction (deterministic):** call `updateWorkspace({id, name:"New"})` concurrently with `archiveWorkspace(id)` using a paused `setItem`; the persisted record keeps `name:"Old"` and `archivedAt` set. Alternatively inject a `setItem` rejection: the promise resolves and `workspace_changed` is emitted with nothing persisted.
- **Existing tests:** none cover archive/unarchive concurrency or write failure (`workspaceArchive.test.ts` covers archiving children/events; `workspaceHostileVerification.test.ts` covers delete/restore).
- **Minimal correction:** wrap both handlers in `withLock("ws_lifecycle_<id>")`, re-read inside the lock, preserve `revision` semantics (`revision + 1`), persist with `{throwOnError:true}`, verify by read-back, and emit only after the write succeeds. Cancel the archived children's reminders explicitly (today they are only cleared later by `NotificationReconcilerService`, which excludes archived workspaces from its active set).
- **Regression risk:** low; it matches `updateWorkspace` (already locked) and `deleteWorkspace`.

### V3 — `reorderWorkspaces` reports success when its write fails
- **Severity:** Low · **Domain:** Workspace / ordering
- **Files:** `services/command/handlers/WorkspaceCommandHandler.ts:58-67`; `repositories/WorkspaceRepository.ts:92-128` (`applyWorkspaceOrder` tolerates by default); contrast `services/command/handlers/TaskCommandHandler.ts:62-71` → `TaskRepository.applyTaskOrder` (no try/catch)
- **Call path:** drag reorder → `reorderWorkspaces(ordered)` → `applyWorkspaceOrder(ordered)` (no `throwOnError`) → `emitStateChange("workspace_changed")` + analytics.
- **Expected invariant:** a failed write must not be reported as a successful mutation.
- **Evidence:** `applyWorkspaceOrder` catches `setItem` failures and only warns unless `options.throwOnError`; the handler omits the option and proceeds to emit. The task equivalent throws, so the two reorder commands behave differently on storage failure.
- **Reproduction:** make `AsyncStorage.setItem` reject for `pebble:v1:workspaces`; `reorderWorkspaces` resolves, the event fires, the UI keeps the new order until the next load reads the old one.
- **Existing tests:** `bulkSnapshotOrdering.test.ts` asserts merge semantics; no failure-injection test.
- **Minimal correction:** pass `{ throwOnError: true }` and emit only after success (task parity).

### V4 — Command/service layer imports a React hook module
- **Severity:** Low · **Domain:** Cross-cutting dependency direction
- **Files:** `services/command/shared/schedule-reminder-normalizer.ts:2`; `services/command/handlers/ChecklistCommandHandler.ts:36` (and dynamic import at `:1009`); imported symbol at `features/details/task/hooks/useTaskDetailForm.ts:55-70`
- **Call path:** `normalizeScheduleReminder` / checklist reminder computation → `computeTriggerEpoch` from a module whose first line is `import { useCallback, useState } from "react"`.
- **Expected invariant:** the command/service layer must not depend on UI hooks (dependency direction is UI → services → repositories; the reverse pulls React into the command layer and invites cycles).
- **Evidence:** `computeTriggerEpoch` is a pure date-function with no hook dependency, but it lives in a hook module that imports React and task-detail types. `services/*` also imports `features/capture`, `features/profile` and `features/settings` services (see "Intentional exceptions" for why that is tolerated), but this is the only import of a `hooks/` module.
- **Minimal correction:** move `computeTriggerEpoch` (and any sibling pure helpers) to `shared/utils/schedule-time.ts` and re-export from the hook module if screens need it.
- **Regression risk:** mechanical; no behavior change.

### V5 — A second, divergent storage-ownership predicate
- **Severity:** Low · **Domain:** Storage / backup / clear
- **Files:** `services/storage/storage-utils.ts:9-20` (`clearRepositoryStorage`), re-exported by `repositories/index.ts:22`
- **Expected invariant:** `services/storage/storage-keys.ts` (`isPebbleOwnedKey`) is the single definition of Pebble's storage surface (documented in `AI_CONTEXT.md` §3.1).
- **Evidence:** `clearRepositoryStorage` filters `key.startsWith("pebble:")`, which misses every owned `todoapp:*` key and `@pebble_widget_payload` (focus stats, economy ledgers, dashboard prefs, onboarding mirror, calendar selection, mascot state), and would delete any non-registry key sharing the prefix. Its callers are tests only (grep: `services/storage/__tests__/*`), so today it is dead production code exposed as public API.
- **Minimal correction:** delete it, or implement it in terms of `isPebbleOwnedKey` and state its ownership contract.
- **Regression risk:** none in production; tests reference it.

### V6 — A second Recycle-Bin restore orchestrator lives in the storage service
- **Severity:** Medium · **Domain:** Recycle Bin / cross-domain restore
- **Files:** `services/storage/storage.service.ts:284-340` (`restoreRecycleBinItems`); caller `app/recycle-bin.tsx:169,250`
- **Expected invariants:** domain restore policy is owned by the command handlers; batch operations isolate per-item failures (`RecycleBinCommandHandler.permanentlyDeleteItems` is the model); every restored domain emits its own change event.
- **Evidence:**
  1. The function is a second restore coordinator (task → `restoreTasks`; everything else → individual `restore*` handlers) with its own event policy, duplicating knowledge that belongs to the command layer.
  2. The loop has no `try/catch`: one failing habit/workspace/resource aborts every remaining item in a "Restore All" batch (`app/recycle-bin.tsx:250`). `successfulRestoreIds` is populated but never used.
  3. A restored workspace emits only `workspace_mode_changed`; tasks/habits/checklists/resources screens subscribe to their own events (`useTasksState`, `useChecklistState`, `useResourceState`) and therefore do not reload the restored children.
  4. A restored task's `restoreTasks` failure is reported only by throwing; the UI catch reloads the bin, so no false success — but partial commits are not surfaced per item.
- **Minimal correction:** move this orchestration to a `RecycleBinCommandHandler.restoreItems` that calls the domain `restore*` handlers per item with the same failure-isolation/reporting shape as `permanentlyDeleteItems`, and emit one event per domain that actually changed.
- **Regression risk:** medium (touch the bin screen and restore paths); behavior is covered by `recycleRestoreTransactionRecovery.test.ts` and `recycleDeleteRestoreReferentialIntegrity.test.ts`.

### V7 — Profile screens read raw storage keys instead of repositories/services
- **Severity:** Low · **Domain:** Profile / statistics
- **Files:** `app/profile/stats.tsx:179` (`AsyncStorage.getItem("pebble:history")`), `:228` (`getItem("todoapp:focus:stats")`); `features/profile/services/achievement-stats.service.ts:74,96` (same keys)
- **Expected invariant:** persistence keys are owned by repositories (`Pebble_EXACT_OWNED_KEYS` registry) and consumers go through the repository/service that normalizes them.
- **Evidence:** `getAllHistory()` (`services/analytics/productivity-history.service.ts:64`) and `FocusStatsRepository.getFocusStats()` already exist and normalize malformed data; the screens duplicate parsing and defaulting, so a future key/shape change has four independent readers.
- **Minimal correction:** use the existing accessors; no behavior change expected.

### V8 — Permanent workspace deletion decides from pre-lock state
- **Severity:** Medium · **Domain:** Workspace / permanent delete
- **Files:** `services/command/handlers/WorkspaceCommandHandler.ts:586-736` (`permanentlyDeleteWorkspace`)
- **Expected invariant:** a destructive lifecycle operation reads the entity it is about to destroy **inside** the lifecycle lock (as `permanentlyDeleteTask` does at `TaskCommandHandler.ts:527-530`).
- **Evidence:** `binItems`, `parsed`, `activeWorkspaces` and `activeWorkspace` are read before `withLocks([...partitions, ws_lifecycle])`. Inside the lock, the code acts on that snapshot: `if (activeWorkspace) deleteWorkspace(...)`, `multiRemove(partitionKeys)` unconditionally, and removal of `binItem?.id ?? workspaceId`. If a concurrent `restoreWorkspace` (or a create with the same id) commits between the read and lock acquisition, the workspace can be active at commit time while `activeWorkspace` is undefined → metadata survives, partitions are purged, tombstones are written for the restored generation, and the restore's bin entry is not the one removed.
- **Reproduction:** pause the handler after the pre-lock reads, run `restoreWorkspace(<same id>)` to completion, resume: the restored workspace is left with empty partitions and a tombstone barrier.
- **Existing tests:** `workspaceDeletionHostileVerification.test.ts`, `permanentDeleteCrashBoundary.test.ts` cover interleavings but not a restore landing inside this specific window.
- **Minimal correction:** re-read the bin item, workspace metadata and partitions inside the lock (or re-validate `activeWorkspace` existence after acquiring it) and derive the tombstone generation and bin item id from the locked values.

---

## B. Confirmed functional defects

### F1 — Stopwatch reset can permanently lose the session
- **Severity:** Medium · **Domain:** Focus
- **Files:** `features/focus/hooks/useFocusState.ts:825-851` (`swReset`)
- **Call path:** Reset → `clearStopwatchState()` (**awaited first**) → `recordFocusSession(sessionId: focus_sw_<start>)` inside `try` → failure only `console.warn`.
- **Expected behavior/contract:** a completed focus session is durable; the timer path explicitly keeps `todoapp:focus:current_session` until the command resolves (`useFocusState.ts:600-640`, `useFocusSessionDurability.test.tsx`). The stopwatch path has no equivalent recovery record.
- **Evidence:** once `todoapp:focus:current_stopwatch` is removed, the elapsed interval and start time exist only in React state; the reset handler already cleared the UI (`setSwRunning(false)`, `setSwTime(0)`, `setSwLaps([])`). A rejected `recordFocusSession` (e.g. `RewardIntentPersistenceError` when the intent ledger is unwritable) leaves nothing to retry — no session row, no stats credit, no reward.
- **Reproduction:** make `RewardIntentRepository.addIntent` reject, run a stopwatch for >10s, press reset: state clears, nothing is recorded, no recovery marker remains.
- **Existing tests:** `useFocusSessionDurability.test.tsx` covers only timer expiry/recovery.
- **Minimal correction:** persist a stopwatch completion marker (start time/elapsed, stable session id) before clearing the stopwatch state, and clear it only after `recordFocusSession` resolves; or refuse to clear state and surface the failure. Keep the same stable `focus_sw_<start>` id.

### F2 — Habit completion from a non-today calendar date mutates today
- **Severity:** High · **Domain:** Habit / Schedule
- **Files:** `app/(tabs)/calendar.tsx:201-257`; `services/command/handlers/HabitCommandHandler.ts:481-543, 548-643`
- **Call path:** Calendar `handleToggleCompleteHabit` computes `isCompleted = isHabitCompletedToday(habit, selectedDate)` (read = **selected** date) and then calls `completeHabit`/`uncompleteHabit`, which resolve `const today = getTodayDateKey()` and mutate **that** entry only.
- **Expected behavior:** the action the user sees (toggle this occurrence) must apply to the occurrence they are looking at; supporting only today must be reflected in the UI.
- **Evidence:** on a past date with a completed habit, the tap calls `uncompleteHabit`; today's entry is absent → `skipped: true`, nothing changes. On a past/future date with an incomplete habit, the tap writes today's completion and raises a Pebble for today, while the visible day stays incomplete.
- **Reproduction (deterministic UI):** open Calendar on yesterday for a habit with no completion yesterday and no completion today, tap it; today becomes completed and yesterday still shows incomplete. Then navigate to today: the habit is now "done".
- **Existing tests:** calendar hook tests cover navigation and dispatch; none cover habit completion date semantics.
- **Minimal correction:** either disable completion affordances outside today for habits, or extend the habit commands with an explicit `dateKey` (with recurrence validation, streak recomputation for that date, and the reward id scoped to it). The former is the smaller, behavior-preserving change.

### F3 — Habit reschedule writes Reminder while the calendar reads Schedule
- **Severity:** Medium · **Domain:** Habit / Scheduling
- **Files:** `features/calendar/hooks/useCalendarState.ts:1096-1107` (daily planner), `:1555-1567` (week drag), `:1653-1665` (month drag); read path `services/scheduling/scheduling.service.ts:58-100` (`getStructuredSchedule`) used by `useCalendarState.ts:596,626,661`, `WeekHorizonView`, `MonthOverviewView`
- **Expected invariant (AGENTS.md):** Schedule is calendar placement; Reminder is notification delivery only.
- **Evidence:** habit drag/plan updates only `reminder.triggerAt`. Placement for all domains derives exclusively from `schedule.startTime/date`, so the habit keeps its old slot ("Anytime" if it has no schedule) after the drop; the only observable effect is the notification time. Task and checklist paths use `calculateRescheduledTask(...)`, which writes `schedule`.
- **Reproduction:** drag a habit from "Anytime" to 14:00 in the week view; after `loadDataFromStorage()` it returns to "Anytime", and its reminder now fires at 14:00.
- **Existing tests:** `calendarHabitScheduling.test.ts` asserts habit reminder scheduling, not placement.
- **Minimal correction:** for habits, write `schedule: calculateRescheduledTask(habit, drop).schedule` (plus an explicit reminder only if product wants the notification to follow), and let `normalizeScheduleReminder` derive the default reminder as it does for tasks.

### F4 — Task bulk complete/archive are not failure-isolated (and their hooks can reject unhandled)
- **Severity:** Medium · **Domain:** Task / bulk operations
- **Files:** `services/command/handlers/TaskCommandHandler.ts:958-985` (`archiveTasks`), `:987-1014` (`completeTasks`); hook `features/tasks/hooks/useTasksState.ts:906-1037`
- **Expected invariant:** bulk operations are per-item failure-isolated, with committed items reflected and failures surfaced (the Habit path already does this: `HabitCommandHandler.ts:673-710`).
- **Evidence:** both task loops `await` each item with no `try/catch`; a lifecycle-guard rejection, `RewardIntentPersistenceError`, or a missing task (`updateTask` throws "not found") aborts the batch. Earlier items are already committed, but the hook's `updatedById` projection never runs (it is after the `await`), so the UI shows the pre-BCL state until an event-driven reload — and nothing emits because the throw skips the single `emitStateChange`. `handleBulkComplete`/`handleBulkArchive` have no `try/catch`, so the rejection escapes the press handler.
- **Reproduction:** select two tasks; delete one from another screen (or make its intent ledger write fail); bulk-complete the selection. The first commits, the command rejects, no `tasks_changed` fires from the batch, and the caller throws.
- **Existing tests:** `bulkLifecycleParity.test.ts` covers happy-path parity and already-completed skips; no failure-injection test for tasks (habit isolation has `completeHabitsConcurrency.test.ts`).
- **Minimal correction:** adopt the habit pattern — per-item `try/catch`, emit for the committed subset, return the committed list — and add `try/catch` in the hook.

### F5 — Reward reversal runs outside the partition lock, so uncomplete can delete a reward for a re-completed entity
- **Severity:** High · **Domain:** Task, Habit / Rewards
- **Files:** `services/command/handlers/TaskCommandHandler.ts:1292-1332`; `services/command/handlers/HabitCommandHandler.ts:489-530`; `features/profile/services/pebble.service.ts:737-750` (`reversePebbleReward` swallows failures)
- **Expected invariant:** completion and its reward are serialized per entity (`completeTask`/`completeHabit` award inside the partition lock precisely so an uncomplete cannot interleave). Reversal is the inverse operation and must obey the same serialization.
- **Evidence / interleaving:**
  1. `uncompleteTask` holds `tasks:<ws>`, writes `status:"todo"`, returns (lock released at :1324).
  2. Concurrent `completeTask` acquires the lock, writes `completed`, records the intent, calls `awardOwedRewardUnlocked` → `already_earned` (the ledger still holds `task:<id>`), removes the intent, returns.
  3. The first call now runs `reversePebbleReward("task:<id>")` (:1332) and deletes the Pebble.
  Final state: task completed, no Pebble, no intent to repair it; a later completion replay short-circuits on "already completed" and never re-awards. Habit has the identical shape at `HabitCommandHandler.ts:520-530`.
- **Reproduction (deterministic):** pause between the storage write and the reversal (storage-failure injection or a deferred `setItem`), run `completeTask` to completion, resume. The ledger ends with zero entries while the task is completed.
- **Existing tests:** `rewardDurability.test.ts` covers "uncomplete before recovery" (intent discarded) but no complete/uncomplete interleaving around reversal; `completeHabitsConcurrency.test.ts` covers completion only.
- **Minimal correction:** perform the reversal inside the same partition lock, immediately after the uncomplete write (and only if the write committed), and discard/repair the intent there too. `reversePebbleReward` must report write failure instead of swallowing it, so the caller can keep the state recoverable. Do not move `earnPebble` around: the intent ordering is already correct.

### F6 — Failed UI mutations are silent
- **Severity:** Low · **Domain:** UI state / Tasks, Habits
- **Files:** `features/habits/hooks/useHabitCrud.ts:151-190` (no `try/catch` around `completeHabit`/`uncompleteHabit`); `features/tasks/hooks/useTaskCrud.ts:347-355` (catch → rollback → return); `features/tasks/hooks/useTasksState.ts:906,973`
- **Expected behavior:** a failed mutation is surfaced; the UI must not silently revert.
- **Evidence:** `toggleHabit` awaits the command without a handler, so a rejection becomes an unhandled promise rejection; `toggleTodo` catches, logs, rolls back the optimistic state and returns — the checkbox flickers back with no message. Bulk handlers reject unhandled (F4).
- **Minimal correction:** wrap the awaited commands and call `showToast`/`Alert` on failure (the hooks already receive `showToast`). No integrity change.

### F7 — Habit toggle uses `selectedWorkspaceId`, not the habit's workspace
- **Severity:** Low · **Domain:** Habit
- **Files:** `features/habits/hooks/useHabitCrud.ts:151-172`; caller composition `features/tasks/hooks/useTasksState.ts:318-323`
- **Evidence:** `completeHabit(id, selectedWorkspaceId || INBOX)` returns `null` when the habit lives in another partition (the screen filters habits by `activeWorkspaceId` at `app/(tabs)/tasks.tsx:313`, and `selectedWorkspaceId` can diverge from it — e.g. a workspace param change updates both, but modal-driven flows write `activeWorkspaceId` separately). A no-op is indistinguishable from success because `toggleHabit` returns silently on `null`.
- **Status:** Potential risk is the divergence; the silent no-op is confirmed by the `null` handling. Treat as a small correctness hardening, not data loss.
- **Minimal correction:** resolve the workspace from the habit record (`habit.workspaceId ?? INBOX`) like `useTodayActions` does.

### F8 — Undo of a workspace delete hardcodes the bin item id
- **Severity:** Low · **Domain:** Workspace / Recycle Bin
- **Files:** `features/workspaces/components/WorkspaceModal.tsx:310` (`restoreWorkspace(\`rb-${editingWorkspaceId}\`)`)
- **Evidence:** `RecycleBinRepository` builds ids as `rb-<entityId>` **or** `rb-<entityId>-g<generation>` (`RecycleBinRepository.ts:36-37`). `restoreWorkspace` tolerates several forms (`WorkspaceCommandHandler.ts:99-105`) including `rb-<id>-g*`, so the hardcoded id happens to work today because workspace packages always carry generation 1. It breaks as soon as workspace generation allocation changes, and it duplicates id-shape knowledge in a component.
- **Minimal correction:** resolve the bin item by `entityId`/`entityType` (as `useHabitCrud` does) and pass its real `id`.

---

## C. Potential risks

### P1 — Startup recovery is not step-isolated, and a throw also skips onboarding routing
- **Severity:** Medium · **Files:** `services/startup/startup-recovery.ts:39-56`; `app/_layout.tsx:74-87`
- **Evidence:** only the reward-intent and notification steps are wrapped; `recoverInterruptedRestore`, both move/conversion steps, recycle-bin cleanup and graph reconciliation propagate. The layout `try` then jumps to `catch`, so `OnboardingService.isOnboardingCompleted()` and the `router.replace` calls never execute — a corrupted or transiently unreadable store leaves the user on the tabs (or onboarding) with unreconciled journals and stale notifications until the next launch. `startupRecovery.test.ts` asserts only the notification-failure tolerance.
- **Minimal correction:** run each step through a `settle()` helper that logs and continues (ordering preserved), and keep routing independent of recovery success. Report partial recovery to the UI if desired.

### P2 — Incremental focus minutes are neither awaited nor session-keyed
- **Severity:** Medium · **Files:** `features/focus/hooks/useFocusState.ts:754-766` (`creditFocusTime`), `:800-810` (`logPartialMinutes`), `:1127-1136` (pause/background), `repositories/FocusStatsRepository.ts:113-141` (`addFocusMinutes`)
- **Evidence:** `logPartialMinutes` calls `creditFocusTime(...)` without `await`/`void` handling and immediately advances `loggedMinutesInCurrentSessionRef`; `saveActiveSession` (which persists that ref) is separately fire-and-forget. If the stats write fails (caught inside `creditFocusTime`), the minutes are lost and the completion will subtract `loggedMinutes`, so they are never re-credited. If the marker save fails after a successful credit, a relaunch reads stale `loggedMinutes` and the completion credits the same stretch again. Neither write carries the session id, so no reconciliation detects either case.
- **Minimal correction:** await/sequence the credit and marker writes, or (better) keep incremental minutes out of the durable counter and derive totals from the session ledger/idempotency table at completion. The displayed numbers are already derived from sessions (`refreshFocusStats`), so the persisted counter can be treated as a cache.

### P3 — `GraphRepository` in-memory cache is authoritative after first load
- **Severity:** Low · **Files:** `repositories/GraphRepository.ts:28-60, 96-140`
- **Evidence:** `loaded` short-circuits `ensureLoadedUnlocked`, and `saveRelationshipUnlocked` writes the whole cached map. Any write that bypasses this class (a second runtime, manual AsyncStorage tooling, a restore not followed by `resetCache`) is invisible and will be reverted on the next edge write. Backup restore and `clearAllData` do call `resetCache`, so the current single-runtime paths are covered; the risk is architectural (documented lock/process limits).
- **Minimal correction:** none required for a single-runtime app; if a second writer is ever introduced, drop the cache or add a version/read-verify.

### P4 — Reminder cancellation in `updateTask` is fire-and-forget
- **Severity:** Low · **Files:** `services/command/handlers/TaskCommandHandler.ts:1199-1205`
- **Evidence:** `cancelReminderIds(existing.reminder.notificationIds, …).catch(...)` is not awaited when a reminder-relevant field changes, so the command can resolve while the old OS notification is still scheduled. `NotificationReconcilerService` cancels stale notifications on its next pass (startup/settings change), but between those the old reminder may fire for an archived/completed/rescheduled task. `completeTask` deliberately awaits (documented at :1456-1464), so behavior is inconsistent.
- **Minimal correction:** await the cancellation (as `completeTask` does) before emitting success.

### P5 — `saveWorkspace`/`saveWorkspaces` are tolerant by default
- **Severity:** Medium · **Files:** `repositories/WorkspaceRepository.ts:53-91`
- **Evidence:** both swallow `setItem` failures unless `throwOnError` is passed. Callers that do pass it: `updateWorkspace`, `createWorkspace`, `deleteWorkspace` (in the handler), `permanentlyDeleteWorkspace`, onboarding, `restoreWorkspace` (plus read-back). Callers that do not: `archiveWorkspace`/`restoreWorkspaceArchive` (V2) and `applyWorkspaceOrder` via `reorderWorkspaces` (V3). The default is a trap for the next caller.
- **Minimal correction:** make the strict behavior the default (or require an explicit `tolerateFailure: true`) and fix the two callers.

### P6 — Workspace restore does not emit child-domain events
- **Severity:** Low · **Files:** `services/command/handlers/WorkspaceCommandHandler.ts:240-249` (only `workspace_mode_changed`); `services/storage/storage.service.ts:335-339` (same for the bin path)
- **Evidence:** tasks/habits/checklists/resources screens subscribe to their own events (`useTasksState.ts:740-775`, `useChecklistState`, `useResourceState`), so an open list does not refresh the children of a restored workspace until the next unrelated event or refocus. The WorkspaceModal undo compensates by emitting `tasks_changed`/`habits_changed` (`WorkspaceModal.tsx:315-317`), which makes the behavior inconsistent across entry points.
- **Minimal correction:** emit each restored domain's event after the commit (as the modal does).

### P7 — `FocusStatsRepository.completedToday` never resets
- **Severity:** Low · **Files:** `repositories/FocusStatsRepository.ts:7,78`; no reader in production (`FocusStatsCard.tsx` is unreferenced; profile stats use `totalFocusTime`)
- **Evidence:** the field is incremented on every completion and never rolled over; the docstring calls it a persisted counter read by stats screens, which is only true for `totalFocusTime`. Any future use as "today" would show the lifetime count.
- **Minimal correction:** either reset/slice by date key when loading/crediting, or rename/document it as a lifetime counter and remove it from the profile summary.

### P8 — Daily history snapshot is an unlocked read-modify-write
- **Severity:** Low · **Files:** `services/analytics/productivity-history.service.ts:79-128`
- **Evidence:** `recordDailyHistorySnapshot` is invoked fire-and-forget by nearly every command; concurrent invocations read the same history array and write `[todaySnapshot, ...]` without a lock. Because only today's entry is replaced, cross-day entries survive; the loss window is limited to same-day snapshot content (last writer wins) and the write itself. It is a derived cache used by profile stats, not domain truth.
- **Minimal correction:** accept and document, or serialize under a `pebble:history` lock key.

---

## D. Intentional exceptions (documented deviations)

1. **UI-state persistence from hooks/components** — `UiStateRepository.saveUiState` in `useTaskCrud`, `useWorkspaceState`, `WorkspaceModal`, `useTasksState`; direct `todoapp:*` preference writes in the focus hook, calendar hook, mascot overlay and capture drafts. These are presentation/draft state, not domain entities, and are covered by the backup restore policy (`PEBBLE_RESTORE_PRESERVED_KEYS` / `EPHEMERAL_KEYS`).
2. **Bootstrap onboarding** — `services/onboarding/onboarding.service.ts:70-150` seeds profile/workspaces/settings/ui_state under `ONBOARDING_LIFECYCLE_LOCK` and writes the completion flag last. It bypasses commands deliberately (no events before the dataset exists). It relies on `saveWorkspace({throwOnError:true})`.
3. **Settings/profile service writes** — `features/settings/services/settings.service.ts` is the owning service for `Settings`/`UserProfile` (no command domain). The follow-up `themeCache` write in `ui_state` is a second key (P5-adjacent) and is best-effort by design.
4. **Incremental focus minutes** — `FocusStatsRepository.addFocusMinutes` is documented as intentionally non-idempotent; completion is the exactly-once boundary (see P2 for the residual window).
5. **Command layer importing feature services** — `services/command/**` imports `features/capture` (parsing/factories), `features/profile` (economy/reward intents), `features/settings` (notification policy) and `features/details/task/hooks` (V4). The first three are stable domain services with no UI dependency and are used consistently; the hook import is the one exception that breaks layering.
6. **Dead/orphaned systems** — `shared/components/navigation/motion-tabs/**` (imported but never rendered; contains a second focus-start implementation at `popup-body.tsx:279-303`), `services/events/domain-events.ts`, `useTasksState.handleSaveParsedItem`, `EntityCommandService.createRelationship`, `FocusStatsCard`, `clearRepositoryStorage`. They are not live bypasses; `docs/current_state.md` §22.1 already records them. Do not "fix" them in place — confirm intent before removal.
7. **Relationship graph is focus-provenance only** — user-facing links use `resourceIds`; `GraphCommandHandler` relationship mutations have no production callers. `GraphReconcilerService` owns dangling-edge cleanup.
8. **Per-process mutex** — `shared/utils/mutex.ts` serializes only within one JS runtime; the documented recovery model (journals/intents/idempotent replay) is the cross-process story.

---

## E. Cross-cutting observations (no finding)

- The lock hierarchy is consistently implemented: partition keys first, then `move_journal`, then `recycle_bin`; conversion takes `conversion_journal` first then partitions; backup restore uses explicit numeric priorities (`backup.service.ts:208-230`). No ABBA cycle was found in the traced paths, and every unlocked primitive (`*Unlocked`) is paired with a held lock.
- Events are emitted after durable writes in all traced command handlers (exceptions: F4's partial batch and V2/V3's false success).
- Reward-intent validators are domain-specific and tombstone-aware; the ledger cannot pay a deleted/recycled/uncompleted entity, and the daily cap is terminal (no backlog), as documented.

---

## F. Repair status

> **Repair pass:** commit `650d5ae` · `migration/runtime-parity`. No application code was changed by this table; it records the verified outcome of the repairs against the findings above. Guarantees and per-finding evidence live in `docs/integrity_status.md` (CLOSED #25–#33).

| Finding | Status | Where the fix is / why not |
|---|---|---|
| **V1** load-time reminder re-arm | **Fixed** | `useTasksState` persists ids through `TaskRepository.updateNotificationIds` (expected-state CAS) and cancels ids it scheduled when the CAS loses. No dedicated hook-level failure test — see CLOSED #32 gap. |
| **V2** workspace archive/unarchive | **Fixed** | Both handlers run under `ws_lifecycle_<id>` with a fresh read, lifecycle guard, `revision + 1` and strict persistence; child reminders cancelled after commit. CLOSED #25. |
| **V3** `reorderWorkspaces` false success | **Fixed** | `applyWorkspaceOrder(..., { throwOnError: true })`; `saveWorkspace(s)`/`applyWorkspaceOrder` are strict by default. CLOSED #25. |
| **V4** command layer imports a hook module | **Fixed** | `computeTriggerEpoch` moved to `shared/utils/schedule-time.ts`; the hook re-exports it. CLOSED #32. |
| **V5** divergent ownership predicate | **Fixed** | `clearRepositoryStorage` uses `isPebbleOwnedKey`; device-local prefs and onboarding survive a content reset. CLOSED #32. |
| **V6** duplicate Recycle-Bin orchestrator | **Fixed** | Removed from `storage.service`; `RecycleBinCommandHandler.restoreItems` is the single orchestrator with per-item isolation and per-domain events. CLOSED #30. |
| **V7** raw storage-key reads in profile | **Fixed** | Profile screens and `achievement-stats.service` use `getAllHistory()` / `FocusStatsRepository.getFocusStats()`. CLOSED #32. |
| **V8** permanent delete decides pre-lock | **Fixed** | Bin item, package, metadata and partitions are read inside the locks. CLOSED #25. |
| **F1** stopwatch reset can lose the session | **Fixed** | Durable `pending_stopwatch_session` record written before the UI/live state is cleared, cleared only after the command commits, retried idempotently. CLOSED #27. |
| **F2** habit completion from another date mutates today | **Fixed** | Off-today affordance hidden and every caller guarded (the audit's smaller, behavior-preserving option). CLOSED #28. |
| **F3** habit reschedule writes only Reminder | **Fixed** | Habits write `schedule` via `calculateRescheduledTask` in planner and week/month drags. CLOSED #28. |
| **F4** task bulk operations not failure-isolated | **Fixed** | Per-item isolation + committed-subset return/emit + hook `try/catch` with a truthful toast. CLOSED #29. |
| **F5** reward reversal outside the partition lock | **Fixed** | Reversal runs inside the partition lock immediately after the committed uncomplete/recycle write. CLOSED #26. |
| **F6** silent failed UI mutations | **Fixed** | Task toggle, habit toggle and bulk handlers surface a toast instead of reverting/unhandling silently. CLOSED #28/#29. |
| **F7** habit toggle uses `selectedWorkspaceId` | **Fixed** | Partition resolved from `habit.workspaceId`; `null` result no longer silently swallowed. CLOSED #28. |
| **F8** workspace undo hardcodes `rb-<id>` | **Fixed** | The modal passes the entity id and the command resolves the live bin entry. CLOSED #30. |
| **P1** startup recovery not step-isolated | **Fixed** | Every step settled independently (ordering preserved) and routing decoupled from recovery success. CLOSED #31. |
| **P2** incremental focus minutes unawaited | **Fixed** | Credit awaited and serialized; checkpoint advances only after commit; marker written after the credit settles. CLOSED #27. |
| **P3** GraphRepository cache | **Deferred by design** | Single-runtime paths all `resetCache`; the risk requires a second writer. Documented in OPEN #3. |
| **P4** fire-and-forget reminder cancel in `updateTask` | **Fixed** | Cancellation is awaited with contained failure, matching `completeTask`. |
| **P5** tolerant `saveWorkspace(s)` default | **Fixed** | Strict by default with an explicit `tolerateFailure: true` opt-out. CLOSED #25. |
| **P6** workspace restore emits no child events | **Fixed** | Restore emits one event per domain that actually changed. CLOSED #30. |
| **P7** `completedToday` never resets | **Fixed** | Daily counter carries `completedTodayDate`; a stale day reports 0 and is reset on the next credit. CLOSED #33. |
| **P8** unlocked daily-history RMW | **Fixed** | Read and write run under the `pebble:v1:history` lock. CLOSED #33. |
