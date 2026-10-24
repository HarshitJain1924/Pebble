# Pebble Runtime Flow Map (Audit)

> **Audited commit:** `dd5e785770456964a28862aec7e25f4dc4adc447`
> **Branch:** `migration/runtime-parity` (clean working tree, in sync with `origin`)
> **Audit date:** 2026-10-24
> **Method:** static call-path tracing of the checked-out code, plus execution of `npx tsc --noEmit` and the full Jest suite (see `verification-coverage.md`).
> **Legend:** ✅ verified path (code traced end-to-end; tests exist where noted) · ⚠️ verified path with a defect/risk (see `architecture-violations.md`) · 🟡 inferred/incomplete (call path stops or depends on runtime behavior not exercised here).

This map is descriptive: it records what the code actually does today, not what the docs say it should do. Where the two differ, the differences are called out.

---

## 0. Layer inventory

| Layer | Location | Responsibility |
|---|---|---|
| Routes / screens | `app/**` | Render, user intents, optimistic local state |
| Feature hooks | `features/*/hooks/**` | Screen state, optimistic updates + rollback, event subscriptions |
| Feature services | `features/*/services/**` | Capture parsing, economy, reward intents, achievements, export |
| Command façade | `services/command/EntityCommandService.ts` | Single entry point for domain mutations (delegates to handlers) |
| Command handlers | `services/command/handlers/*.ts` | Validation, locking, repository writes, side effects, events |
| Reconcilers | `services/storage/*ReconcilerService.ts` | Journal replay, graph self-healing, startup convergence |
| Repositories | `repositories/*.ts` | Raw AsyncStorage access, key literals, `*Unlocked` primitives |
| Scheduling / notifications | `services/scheduling/**`, `services/notifications/**` | Recurrence, reminder scheduling, reconciliation, quiet hours |
| Events | `services/events/state-events.ts` | In-memory pub/sub (`tasks_changed`, …). Not durable. |
| Storage registry | `services/storage/storage-keys.ts` | Owned-key authority + backup/restore classification |

Commands are the canonical mutation boundary for **domain entities** (Workspace, Task, Habit, Checklist, Resource); UI state (`UiStateRepository`) and bootstrap/onboarding writes are the documented exceptions.

---

## 1. Startup and recovery ✅ (sequence) / ⚠️ (failure isolation)

```
app/_layout.tsx:74  runStartupRecovery()
  └─ services/startup/startup-recovery.ts:39
       1. BackupService.recoverInterruptedRestore()          services/storage/backup.service.ts:240
       2. MoveReconcilerService.reconcileAll()               services/storage/MoveReconcilerService.ts:17
       3. ConversionReconcilerService.reconcileAll()         services/storage/ConversionReconcilerService.ts:15
       4. MoveReconcilerService.reconcileHistoricalGhosts()  MoveReconcilerService.ts:453
       5. cleanupRecycleBin()                                repositories/RecycleBinRepository.ts:166
       6. GraphReconcilerService.reconcileAll()              services/storage/GraphReconcilerService.ts
       7. resolveAllRewardIntents()  [try/catch]             features/profile/services/reward-intent.service.ts:190
       8. NotificationReconcilerService.reconcileAll() [try/catch]
```

- Steps 1–6 propagate failures; only steps 7–8 are individually tolerated (`startup-recovery.ts:45-62`).
- `app/_layout.tsx:74-83` awaits the whole sequence **before** the onboarding route decision; if any of steps 1–6 throws, `runStartupRecovery` rejects, the `router.replace` calls never run, and the error is only logged (`_layout.tsx:85-87`). See finding **P1**.
- Every step is internally locked and intended to be idempotent (verified in tests listed in `verification-coverage.md`).
- Ordering rationale (settle storage before deriving graph/notifications) is implemented as documented.

---

## 2. Capture → create ✅

```
UnifiedCapture (features/capture/components/UnifiedCapture.tsx:622,797)
  → analyzeDuplicate()                         features/capture/services/duplicate-detection.service.ts:411
  → saveParsedItem()                           features/capture/services/CaptureService.ts:58
      → EntityCommandService.createTask | createHabit | createChecklist | createResource
          → TaskCommandHandler.createTask       services/command/handlers/TaskCommandHandler.ts:1494
          → HabitCommandHandler.createHabit
          → ChecklistCommandHandler.createChecklist
          → ResourceCommandHandler.createResource
             • partition lock `pebble:v1:<type>s:<ws>`
             • repository write (`save*Unlocked` / `save*`)
             • scheduleCreationNotifications(...)  → reminders.service.scheduleReminderBatch
             • emitStateChange("<type>s_changed")
      → recordDailyHistorySnapshot() [fire-and-forget]  services/analytics/productivity-history.service.ts
```

- Duplicate detection is advisory only: `saveParsedItem` accepts but ignores `bypassDuplicateCheck` (`CaptureService.ts:58-62`), and the check is performed by the screen.
- `useTasksState.handleSaveParsedItem` (`useTasksState.ts:518`) is a second, unreferenced creation path (dead code — consistent with `AI_CONTEXT.md` §5.1).

---

## 3. Workspace lifecycle ✅ (delete/restore) / ⚠️ (archive)

### 3.1 Delete (recycle) ✅
```
WorkspaceModal.tsx:246  /  useWorkspaceState.handleDeleteWorkspace
  → WorkspaceCommandHandler.deleteWorkspace             WorkspaceCommandHandler.ts:319
      withLocks([tasks:ws, habits:ws, checklists:ws, resources:ws, ws_lifecycle_ws])
        1. read all four partitions
        2. capture graph edges owned by the package (internal + focus provenance)
        3. RecycleBinRepository.addToRecycleBin("workspace", {list,todos,habits,checklists,resources,relationships}, …, {throwOnError:true})
        4. WorkspaceRepository.deleteWorkspace(ws, {throwOnError:true})   ← commit point
        5. AsyncStorage.multiRemove(four partition keys)                 ← tolerated
        6. GraphRepository.deleteRelationshipsForEntities(allEntityIds)  ← inside the lock
      then (outside lock) cancelReminderIds(...) and emit workspace_changed
```

### 3.2 Restore ✅
```
app/recycle-bin.tsx:166 → storage.service.restoreRecycleBinItems (see §3.4)
WorkspaceCommandHandler.restoreWorkspace               WorkspaceCommandHandler.ts:89
  withLocks(four partitions + ws_lifecycle)
    • tombstone-generation barrier
    • metadata checkpoint (only if not already active) + read-back verification
    • mergeArchivedChildren per partition (writes ONLY ids missing from live state)
    • restoreArchivedRelationships (endpoints re-verified live; idempotent by logical edge)
    • bin entry removed last (tolerated; a retry is idempotent)
  emit workspace_mode_changed (only; children events are not emitted — P6)
```
Tests: `services/command/__tests__/workspaceRestore.test.ts`, `workspaceRestoreRecovery.test.ts`.

### 3.3 Archive / unarchive ⚠️
```
app/(tabs)/tasks.tsx:1157 → EntityCommandService.archiveWorkspace(folder.id)
  → WorkspaceCommandHandler.archiveWorkspace            WorkspaceCommandHandler.ts:291
      read workspaces (no lock) → saveWorkspace({...stale, archivedAt}) (tolerant) → emit workspace_changed
restoreWorkspaceArchive (WorkspaceCommandHandler.ts:265) has the same shape.
```
No lock, no `throwOnError`, no read-back, unconditional success event. See **V2**.

### 3.4 Recycle Bin restore / purge ✅ (purge) / ⚠️ (restore orchestration)
```
app/recycle-bin.tsx:169 (single) / :250 (restore all)
  → storage.service.restoreRecycleBinItems             services/storage/storage.service.ts:284
      • tasks  → EntityCommandService.restoreTasks
      • habit/workspace/resource/checklist → EntityCommandService.restore* (one by one)
      • emits tasks_changed / habits_changed / workspace_mode_changed / resources_changed / checklists_changed
      • no per-item failure isolation; first rejection aborts the rest
app/recycle-bin.tsx:129 → EntityCommandService.permanentlyDeleteRecycleBinItems
  → RecycleBinCommandHandler.permanentlyDeleteItems    services/command/handlers/RecycleBinCommandHandler.ts:73
      • per item → domain permanentlyDelete* (sequential, failure-isolated)
      • bin re-verified on failure; consolidated events emitted after the loop
```

---

## 4. Task lifecycle ✅ (mostly) / ⚠️ (uncomplete reward, bulk isolation)

| Operation | Entry point | Command | Lock | Persistence | Side effects |
|---|---|---|---|---|---|
| Create | capture, `useTaskCrud.onSaveNewTask` | `TaskCommandHandler.createTask` (:1494) | `tasks:<ws>` | `saveTaskUnlocked` | notifications, events, analytics, widget |
| Update | detail/quick-edit/calendar | `updateTask` (:1151) | `tasks:<ws>` | `saveTaskUnlocked` | reminder reschedule (fire-and-forget cancel), events |
| Complete | list/calendar/today/focus/popup | `completeTask` (:1392) | `tasks:<ws>` | intent → `saveTaskUnlocked` → award | awaited reminder cancel, plugin, events, analytics, widget |
| Uncomplete | list/calendar/today | `uncompleteTask` (:1284) | `tasks:<ws>` then **released** | `saveTaskUnlocked` | reward reversal **after** lock release (:1332) — **F5** |
| Move | drag / move sheet | `moveTask` (:862) | `withLocks([source,target])` + move journal | write target, delete source | journal removed last, events |
| Recycle | swipe/undo/clear | `recycleTask` (:779) | partition + journal + bin | bin snapshot (strict) → delete partition | journal removal, reminder cancel (F&F), events |
| Restore | undo / bin | `restoreTask` (:315) | target partition | tombstone check, journal intent, persist, bin removal | reminder reschedule, events |
| Bulk complete | selection bar | `completeTasks` (:987) | per item | per item | **no per-item isolation** — **F4** |
| Bulk archive | selection bar | `archiveTasks` (:958) | per item (`updateTask`) | per item | **no per-item isolation** — **F4** |
| Reorder | drag list | `reorderTasks` (:62) | repo key | `applyTaskOrder` (order-only merge) | event, analytics |
| Permanent delete | archive / bin | `permanentlyDeleteTask` (:516) | partition | tombstone, delete partition, bin removal, graph edges | reminder cancel, events |

The completion path is the documented two-write protocol (`docs/integrity_status.md` #20):
`ensureRewardIntent` (throws → abort before any state change) → entity write → `awardOwedRewardUnlocked` (failure keeps the intent).

---

## 5. Habit lifecycle ✅ (complete/uncomplete) / ⚠️ (reversal, calendar semantics)

- Complete: `HabitCommandHandler.completeHabit` (:548) — partition lock, date-keyed completion entry, streak recomputation, intent → `saveHabitUnlocked` → award, then plugin/events/analytics.
- Uncomplete: `uncompleteHabit` (:481) — lock, filter today's entry, persist, **release**, then `reversePebbleReward(habit:<id>:<today>)` (:530) — **F5**.
- Bulk complete: `completeHabits` (:673) — **per-item failure isolation** (contrast with tasks).
- Calendar completion: `app/(tabs)/calendar.tsx:228` decides complete/uncomplete with `isHabitCompletedToday(habit, selectedDate)` but the commands always mutate **today** (`getTodayDateKey()` in `uncompleteHabit:497`, `completeHabit:564`) — **F2**.
- Calendar drag/daily planner: writes `reminder.triggerAt` only, while calendar placement is derived from `schedule` (`getStructuredSchedule`, `scheduling.service.ts:58-100`) — **F3**.

---

## 6. Checklist lifecycle ✅ (reward) / ⚠️ (nothing major)

- `toggleChecklistItem` (`ChecklistCommandHandler.ts:649`): partition lock → date/occurrence resolution → lifecycle guard → compute completion → `ensureRewardIntent` (one-time latch) → `saveChecklistUnlocked` → `awardOwedRewardUnlocked`; after the lock, `resolveOwedRewardsForEntity` repairs a previously failed award, and reminder cancellation/rescheduling is applied per transition.
- Recurring checklists use `occurrenceHistory[dateKey]`; `pebbleAwarded` is a checklist-wide one-time latch (never cleared, never reversed).
- Scheduling: `schedule` is used by the calendar (`useCalendarState.ts:656-696`); reminders are scheduled via `rescheduleChecklistReminders`.
- Other mutations (`addChecklistItem`, `deleteChecklistItem`, `mergeChecklistItems`, `updateChecklist`, `moveChecklist`, `recycle/restore`, occurrences) all take the same partition lock.

---

## 7. Resource lifecycle ✅

- Create/update/archive/move/recycle/restore/permanent delete all route through `ResourceCommandHandler`.
- Permanent delete (`ResourceCommandHandler.ts:289`) writes tombstones, purges active + bin, deletes graph edges under the partition lock.
- Resource links are stored as `resourceIds` on Task/Habit/Checklist and mutated with `update*`; UI reads them directly (`ResourceRelationships.tsx:65-67`). `GraphReconcilerService` prunes dangling ids.
- `GraphCommandHandler.createRelationship` / `deleteRelationship` / `deleteRelationshipsForEntities` have **no production callers** (only the focus path writes edges via `GraphRepository.saveRelationship`).

---

## 8. Conversion (Task ⇄ Habit) ✅

```
ConvertTaskToHabit.tsx:602 / HabitDetailContent.tsx:497
  → ConversionCommandHandler.convertTaskToHabit (:201)
      withLocks([conversion_journal, tasks:ws, habits:ws, relationships])  (sorted)
        PREPARED journal → destination entity → journal DESTINATION_WRITTEN
        → source deletion → relationship retarget → journal removal
  → Service.ConversionReconcilerService.reconcileAll (startup) rolls forward/back
```
Verified by `services/command/__tests__/conversionHostileVerification.test.ts` and `services/storage/__tests__/ConversionReconcilerHostileVerification.test.ts` (crash at each boundary, repeated recovery, edge retarget).

---

## 9. Focus ✅ (timer completion) / ⚠️ (stopwatch reset, incremental stats)

```
app/(tabs)/focus.tsx → useFocusState
  start/pause  → saveActiveSession("todoapp:focus:current_session")   useFocusState.ts:561
  pause/bg     → logPartialMinutes → FocusStatsRepository.addFocusMinutes (F&F, no session id)
  expiry/recovery → completeTimerSession(sessionId = focus_timer_<startTime>)  :600
      → EntityCommandService.recordFocusSession           services/command/handlers/SystemCommandHandler.ts:60
          withLock(`pebble:v1:focus_completion:<sessionId>`)
            ensureRewardIntent(focus:<sessionId>)
            GraphRepository.saveFocusSession (upsert by id)
            FocusStatsRepository.creditCompletedSession (durable id ledger)
            awardOwedRewardUnlocked
            GraphRepository.saveRelationship(`rel_focus_<sessionId>_<targetId>`)
      success → clearActiveSession()  (marker is released only after the command resolves)
  stopwatch reset → clearStopwatchState() then recordFocusSession() with a swallowed failure  :825-851 — **F1**
```
`refreshFocusStats()` re-derives displayed counters from the session ledger (`useFocusState.ts:772`), which is the correct source of truth; the persisted `FocusStatsRepository.completedToday` is a separate monotonic counter (see P7).

---

## 10. Scheduling and reminders ✅ (canonical path) / ⚠️ (habit drag)

- `Reminder` is `{enabled, triggerAt, notificationIds}` on Task/Habit/Checklist; there is no Reminder entity.
- Scheduling: `scheduleReminderBatch` returns OS ids; canonical persistence of those ids happens through `TaskRepository.updateNotificationIds` / `HabitRepository…` / `ChecklistRepository…` with an expected-state snapshot (CAS), called from command handlers and from `NotificationReconcilerService`.
- Rendering: `getStructuredSchedule` reads only `schedule.date/startTime/endTime/durationMinutes` for all three domains.
- Recurrence: `services/scheduling/recurrence.service.ts` + `recurrence-mapper.ts`; date keys are local (`shared/utils/date-key.ts`).
- Reconciliation: `NotificationReconcilerService.performReconcileAll` (`:169`) rebuilds expected notifications from domain state, cancels stale/duplicate/unowned ones, repairs missing ones, and applies quiet-hours/category policy. Tests: 14 files under `services/notifications/__tests__`.
- Non-canonical scheduling write: web re-arm during tasks load persists whole task records (`useTasksState.ts:448-470`) — **V1**.

---

## 11. Rewards ✅

```
completion command
  ensureRewardIntent(intent)                → repositories/RewardIntentRepository.ts:addIntent  (throws on failure)
  entity write
  awardOwedRewardUnlocked(intent)           → features/profile/services/pebble.service.ts:earnPebbleWithOutcome
                                              (economy lock; idempotent by rewardId; 15/day cap)
  failure → intent retained; recovery via startup `resolveAllRewardIntents` or the command's replay path
reversal (uncomplete) → reversePebbleReward(rewardId)   (outside the partition lock — F5)
```
Validators (`reward-intent.service.ts:isRewardStillOwed`): Task must still be completed; Habit must still have the intent's `dateKey` completion; Checklist must still carry the latch and match the expected reward id; Focus session must exist in `pebble:v1:focus_sessions`. All are tombstone-aware.

---

## 12. Backup / restore / clear ✅

```
Settings screen → BackupService.generateStructuredBackup()   (owned keys, payload v1)
Settings screen → BackupService.restoreFromBackup(json)
  → validateBackupPayload()  (before any mutation)
  → lock every involved key via _acquireRestoreLocks (hierarchy: partitions, conversion_journal, move_journal, recycle_bin, others)
  → durable RESTORE_INTENT_KEY
  → multiRemove(owned minus preserved) → multiSet(payload) → remove intent  (rollback on write failure)
  → notification flush + NotificationReconcilerService.reconcileAll
startup → BackupService.recoverInterruptedRestore()  (replays the intent under locks)
```
Policy authority: `services/storage/storage-keys.ts` (`PEBBLE_BACKUP_PAYLOAD_KEYS`, `…_PRESERVED_KEYS`, `…_EPHEMERAL_KEYS`, `…_RESET_KEYS`, `classifyKeyForRestore`). Tests: `storageKeyRegistry.test.ts`, `BackupService.test.ts`.

`BackupService.clearAllData()` removes every owned key under the restore lock hierarchy and resets graph cache. `services/storage/storage-utils.ts:clearRepositoryStorage` is a *different* predicate used only by tests (V5).

---

## 13. UI state, events and cross-screen refresh ✅ (mechanism) / ⚠️ (gaps noted)

- `emitStateChange` is in-memory only; handlers emit **after** the durable write.
- Subscribers reload from repositories: Today (`useTodayDashboard`), Workspaces (`useWorkspaceState`), Tasks/Habits/Checklists/Resources (`useTasksState`, `useChecklistState`, `useResourceState`), Calendar (`useCalendarState`), Focus (`useFocusState`), Mascot.
- Optimistic updates with targeted rollback exist in `useTaskCrud` (toggle/title/move/category), `useHabitCrud.deleteHabit`, list deletes.
- Known gaps: `WorkspaceCommandHandler.restoreWorkspace` emits only `workspace_mode_changed` (P6); `useTasksState` bulk handlers have no `try/catch` (F4); several hooks swallow failures after rollback with no user feedback (F6).
- UI-only persistence (`UiStateRepository`, mascot keys, capture drafts) is separated from domain partitions.

---

## 14. Inferred / not fully verified paths

- OS-level notification delivery, background timer expiry and lock-screen behavior were not exercised (no device run).
- The in-memory mutex is per JS runtime; a second process/device is outside its protection (documented in `docs/integrity_status.md`, "INHERENT LIMITS").
- Calendar drag/drop UI geometry and gesture handlers were traced statically; only the command calls were verified.
- `NotificationListener` deep-link/snooze flows were inspected at the command boundary, not end-to-end through the OS.
