# Current State of the Pebble Architecture

This document is the **single authoritative engineering snapshot** for the current Pebble codebase. It supersedes all historical audit reports and reflects the implementation as it currently exists.

## 1. Persistence Architecture
Pebble is a 100% local-first offline application.
- **Storage Engine**: `@react-native-async-storage/async-storage`.
- **Data Format**: Raw JSON strings stored against strictly defined partition keys.

## 2. Storage Key & Partition Model
Data is strictly partitioned by entity type and workspace ID. 
Global keys manage system-level features.
- `pebble:v1:workspaces` - Workspace metadata
- `pebble:v1:tasks:${workspaceId}` - Tasks partition
- `pebble:v1:habits:${workspaceId}` - Habits partition
- `pebble:v1:checklists:${workspaceId}` - Checklists partition
- `pebble:v1:resources:${workspaceId}` - Resources partition
- `pebble:v1:recycle_bin` - Soft-deleted entities
- `pebble:v1:move_journal` (+ `pebble:v1:move_journal_seq`) - Pending cross-workspace moves
- `pebble:v1:conversion_journal` (+ `pebble:v1:conversion_journal_seq`) - Pending task<->habit conversions
- `pebble:v1:relationships` - Relationship graph (also owns `pebble:v1:focus_sessions`, `pebble:v1:system_event_log`)
- `pebble:v1:tombstones` - Durable deletion barriers for permanent deletes
- `pebble:v1:ui_state` - Active workspace, onboarding completion, theme cache
- `pebble:settings` / `pebble:profile` - Global settings & profile
- `pebble:notifications:log` - In-app notification history log

The **authoritative registry of all Pebble-owned keys** (exact keys + dynamic
partition patterns) lives in `services/storage/storage-keys.ts`
(`isPebbleOwnedKey`). Backup, restore, and clear-all all use this single
definition, so the wipe/backup surface cannot drift from the write surface.

### Legacy keys
- `todoapp:onboarding_completed` is a **one-way compatibility mirror** only.
  Canonical onboarding state is `pebble:v1:ui_state.completedOnboarding`
  (see `OnboardingRepository`). The mirror can never override canonical state.
- `pebble:tasks`, `pebble:habits`, `pebble:checklists`, `pebble:collections`,
  `pebble:vault`, `pebble:schema_version` are **dead legacy keys**: nothing in
  the codebase reads or writes them. They are retained in the owned-key
  registry solely so clear-all/restore can remove them — they cannot resurrect
  stale data.

## 3. Repository Responsibilities
Repositories (e.g. `TaskRepository.ts`, `WorkspaceRepository.ts`) are pure data-access objects.
- They enforce exact storage keys and structural normalizations.
- They do NOT contain complex side-effect logic or cross-partition orchestrations.
- They expose both locked (`saveTasks`) and unlocked (`saveTasksUnlocked`) variants for composition in Command Handlers.
- `GraphRepository` maintains an in-memory relationship cache (with rollback on
  write failure). The cache is a pure optimization: it is invalidated by
  `resetCache()` after restore and clear-all, and every mutation persists
  through the locked repository boundary, so it can never become authoritative
  over persisted state.

**Mutation ownership rule:** all persisted domain mutations flow
UI → Command/Service boundary (`EntityCommandService` + command handlers)
→ Repository → AsyncStorage. Reads may stay direct. A known historical bypass
(Resource detail screen calling `ResourceRepository.saveResource` directly)
was converged onto `EntityCommandService.updateResource` /
`toggleArchiveResource`.

## 4. Locking Model & Canonical Lock Ordering
All Read-Modify-Write (RMW) cycles are serialized in memory using the mutex system in `shared/utils/mutex.ts` (`withLock`, `withLocks`).
- **Lock Ordering**: When acquiring multiple locks via `withLocks`, keys are sorted alphabetically by default. However, `BackupService` and `MoveReconcilerService` explicitly bypass alphabetical sorting in favor of strict hierarchical sorting (e.g. Partition Lock -> MoveJournal Lock -> Recycle Bin Lock) because alphabetical sorting is unsafe for the global hierarchy and causes circular ABBA deadlocks.

**Canonical Workspace Lifecycle Sequence:**
When dealing with workspaces (e.g. `deleteWorkspace` in `WorkspaceCommandHandler.ts`), the locks are acquired hierarchically to ensure atomic snapshotting to the Recycle Bin.

## 5. MoveJournal Architecture
Implemented in `MoveJournalRepository.ts`.
- **Purpose**: Provides crash durability for cross-partition moves, which cannot be atomic in AsyncStorage because they span multiple keys.
- **Format**: Array of `MoveJournalEntry`.

## 6. MoveReconciler Architecture
Implemented in `MoveReconcilerService.ts`.
- **Execution**: Runs on app startup (`reconcileAll`).
- **Coalescing**: Superseded move intents are safely discarded if multiple moves exist for the same entity.
- **Destination Validation**: Verifies that the destination workspace exists *before* inserting. If the target workspace was deleted, the move is safely aborted.
- **Split-Brain Forking**: If a crash occurs and both the Source and Target partitions contain independent user edits post-move, the reconciler resolves the conflict deterministically by *forking* the source ghost into a new conflict entity (Case D) and preserving the original target.

## 7. ConversionJournal Architecture
Implemented in `ConversionJournalRepository.ts`.
- **Purpose**: Provides crash durability for converting Tasks to Habits (and vice-versa).
- **Format**: Array of `ConversionJournalEntry` with explicit two-phase commits (`PREPARED` -> `DESTINATION_WRITTEN`).

## 8. ConversionReconciler Architecture
Implemented in `ConversionReconcilerService.ts`.
- **Execution**: Runs on app startup.
- **Roll Forward/Back**: Evaluates the two-phase commit phase. If `PREPARED` and destination is missing, it rolls back. If `PREPARED` and destination exists, it rolls forward.

## 9. Recycle Bin Architecture
Implemented in `RecycleBinRepository.ts`.
- **Storage**: A single global serialized collection.
- **Integrity**: Protected by the `pebble:v1:recycle_bin` lock. All mutations perform a locked Read-Modify-Write cycle.
- **Workspace Snapshots**: Deleting a workspace serializes its entire contents into a single `RecycleBinItem` snapshot package.

## 10. Workspace Lifecycle
Implemented in `WorkspaceCommandHandler.ts`.
- **Deletion**: Moves the workspace metadata and all partitions (Tasks, Habits) into the Recycle Bin as a snapshot.
- **Restoration**: Unwraps the snapshot and best-effort restores the partitions to their original keys.

## 11. Backup/Restore Architecture
Implemented in `BackupService.ts` and `export.service.ts`.
- **Integrity**: Restore operations perform domain writes inside a `try/catch` block. However, if the domain commit fails, the rollback relies exclusively on JS-memory operations (a `multiRemove` followed by a `multiSet` of original state). This rollback is NOT a durable ACID transaction, meaning a crash during the rollback window will leave the application state corrupted or empty.
- **Isolation**: Native OS operations (like cancelling notifications) are executed *after* the domain commit. Native OS exceptions will not roll back successful domain persistence.
- **Manual Data Export**: Implemented in `export.service.ts` and surfaced in Settings (`app/(tabs)/settings.tsx`). Generates an authoritative full backup using `BackupService.generateStructuredBackup()`, writes a temporary cache file with a deterministic filename (`pebble-backup-YYYY-MM-DD.json`), and presents the native platform share/save sheet (`expo-sharing` with `Share.share` fallback). The operation is strictly read-only with respect to Pebble's stored state, guards against concurrent exports, handles user cancellation gracefully without error alerts, and keeps all exported data under direct user control with zero external server upload or cloud sync.

## 12. Task/Habit Revision Semantics
Implemented in `TaskRepository.ts` and `HabitRepository.ts`.
- **Invariant**: `newRevision = (persistedRevision || 0) + 1`
- During bulk writes, the authoritative revision is dynamically derived from the *current persisted state*, rejecting stale client memory states.

### Bulk destructive selections re-validate under the lock
`clearCompletedTasks` selects completed tasks from a snapshot, but the selection
predicate is re-applied to the **fresh under-lock read** inside `recycleTasks`
(optional `filter` option). A task un-completed (or otherwise changed) between
selection and lock commit is never recycled by the stale clear.

### Bulk Habit completion is failure-isolated
Bulk Habit completion is per-item failure-isolated; a failure affecting one selected Habit does not roll back or prevent independent selected Habits from being processed, and committed changes still trigger aggregate state notification. (Does not claim transactional/atomic batch semantics).

### Checklist item mutations maintain partition-locked integrity
Checklist item-level operations (`toggleChecklistItem`, `deleteChecklistItem`, `addChecklistItem`, `mergeChecklistItems`) execute under the partition mutex `pebble:v1:checklists:${workspaceId}` with fresh under-lock reads. They advance revision monotonically, preserve dual-level state (item completion and recurrence occurrence history), honor lifecycle guards, prevent ghost resurrection on concurrent moves/recycles/deletions, and enforce exact-once pebble rewards.

### Resource permanent deletion maintains multi-repository boundary integrity
Resource permanent deletion (`permanentlyDeleteResource`) serializes under `pebble:v1:resources:${workspaceId}`. It safely falls back to the Recycle Bin if missing from active storage, commits durable tombstones, removes active/bin records, and prunes graph relationship edges. Interleaving with concurrent updates, moves, recycles, or restores converges cleanly without resurrecting ghosts or zombies. Dangling `resourceIds` on tasks, habits, and checklists are self-healed by `GraphReconcilerService` via targeted writes without clobbering revisions or timestamps.

## 13. Notification Persistence & Reconciliation
Implemented in `NotificationReconcilerService.ts` and `reminders.service.ts`.
- **Source of Truth**: The domain entity (`task.reminder.triggerAt`) is the sole source of truth.
- **Ephemeral Native State**: The OS-level scheduled notification IDs are considered ephemeral. 
- **Reconciliation**: On startup, `NotificationReconcilerService` scans all entities and rebuilds any missing OS notifications, ensuring eventual consistency.

## 14. Startup Recovery Sequence
The entire sequence lives in `services/startup/startup-recovery.ts`
(`runStartupRecovery`), invoked once from `app/_layout.tsx` before onboarding
resolution. Every step is idempotent and internally locked; the sequence is
NOT a transaction (AsyncStorage cannot provide one) — each step is designed
to converge on repeated runs (RECONCILED model). Order:
1. `BackupService.recoverInterruptedRestore()` - finish any crashed restore
2. `MoveReconcilerService.reconcileAll()` - replay cross-workspace moves
3. `ConversionReconcilerService.reconcileAll()` - roll conversions forward/back
4. `MoveReconcilerService.reconcileHistoricalGhosts()` - prune dead journal intents
5. `cleanupRecycleBin()` - drop expired recycle-bin snapshots
6. `GraphReconcilerService.reconcileAll()` - prune dangling/stale relationship
   edges + dangling resourceIds against the settled entity registry
7. `NotificationReconcilerService.reconcileAll()` - rebuild missing OS
   notifications (failure tolerated; never requests OS permission)

## 15. Crash-Recovery Guarantees
- Cross-workspace moves will eventually complete via journal.
- Entity conversions will eventually roll forward or roll back.
- If the system crashes mid-write, AsyncStorage provides atomic single-key writes or atomic `multiSet` block writes.
- If a target workspace is deleted while a move is pending, data is retained in the source or the source's recycle bin snapshot.

## 16. Graph Reconciliation Location
`GraphReconcilerService.reconcileAll()` runs at startup (step 6 above) and
after backup restore. It is the self-healing path for the relationship graph
(RECONCILED integrity model): it prunes dangling edges, prunes edges whose
lifecycleGeneration no longer matches the active entity, deduplicates edges,
and cleans dangling resourceIds on tasks/habits/checklists via targeted
repository writes. Command handlers also clean the graph synchronously on
delete; the reconciler is the crash-safety net for interruptions between the
two operations.

## 17. Notification Permission Lifecycle
OS notification permission is requested **only** after explicit user intent
(Alert Center "Enable Alerts"). Nothing at cold launch, screen mount, or
reconciliation triggers the native prompt. The canonical lifecycle lives in
`services/notifications/notification-permission.ts`: already-granted installs
are never re-prompted; a permanent denial routes to system Settings instead
of re-invoking the native request. Onboarding does not require notification
permission.

## 18. Known Limitations
- Native SQLite is not used; `AsyncStorage` forces string serialization overhead on large arrays.
- `FlatList` performance degrades on extremely deeply nested `Checklist` structures (as noted in `docs/architecture/decision_log.md`).

## 19. Current Test-Suite Status
- **Total Tests**: 1874 passing
- **Total Suites**: 208 passing
- (Recorded at 2026-09-11; includes notification permission lifecycle, startup recovery sequence, cross-domain integrity suites, bulk habit completion failure isolation, checklist item concurrency, resource hostile concurrency, resource reference concurrency audit, Move Journal removal durability audit, UI/UX Phase 1 manual data export suite, UI/UX Phase 2 contextual empty-state system, and UI/UX Phase 3 global accessibility semantic hardening).

## 20. Explicit List of Verified Integrity Mechanisms
- **Monotonic Revisions**: `TaskRepository.ts` (lines 140+).
- **Recycle Bin Locked RMW**: `RecycleBinRepository.ts` (lines 53+).
- **Split-Brain Conflict Forking**: `MoveReconcilerService.ts` (Case D).
- **Move Target Existence Check**: `MoveReconcilerService.ts` (`targetExists` validation).
- **Native OS Isolation in Backup**: `BackupService.ts` (`restoreStructuredBackup`).
- **Alphabetical Lock Acquisition**: `mutex.ts` (`withLocks`).

## 21. Accessibility Semantics & Interaction Baseline (UI/UX Phase 3)
- Major user-facing interactive surfaces were audited and hardened with semantic accessibility props without altering visual layout or component architecture.
- `PressableScale` establishes the interactive button baseline: automatically defaults `accessibilityRole="button"` for pressable elements, merges `disabled` states into `accessibilityState`, and enforces a default `hitSlop={8}` touch target padding.
- `AnimatedCheckbox` establishes the checkbox baseline: `accessible={true}`, `accessibilityRole="checkbox"`, `accessibilityState={{ checked, disabled }}`, contextual dynamic labels, and `hitSlop={8}`.
- `SegmentedSwitcher` establishes tablist semantics: container `accessibilityRole="tablist"`, options `accessibilityRole="tab"` with `accessibilityState={{ selected }}`.
- `AppCard` defaults interactive surfaces to `accessibilityRole="button"`.
- User-facing icon-only actions (navigation back/close, clear search, delete, restore, file picker, voice recording states, ambient sound player/transport controls, calendar navigation) provide contextual accessibility labels and roles.
- Stateful controls (task/habit/checklist completion, accordion expanded/collapsed states, filter pills, calendar day selections, timer presets, voice recording states, ambient mute) expose explicit `accessibilityState` (`checked`, `selected`, `expanded`, `busy`, `disabled`).
- Decorative illustrations and mascots (e.g. `EmptyState`) are marked `accessible={false}` and `importantForAccessibility="no"` to avoid screen-reader noise.

