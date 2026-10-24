# Pebble Integrity Status

> **Truth as of 2026-10-24.** Verified against the active codebase on this date. If the code has changed since, the code wins.

This document tracks the verified state of data-integrity vulnerabilities in the current codebase.

## CLOSED

The following vulnerabilities have been fixed and hostile-verified in current production code.

### 1. Destructive Split-Brain Move Conflict
- **Affected Code**: `services/storage/MoveReconcilerService.ts`
- **Current Fix**: If both Source and Target are independently edited before journal reconciliation, the reconciler triggers Case D: it deterministically forks the source into a new conflict ghost while preserving the target's independent edits.
- **Verification**: `services/storage/__tests__/MoveReconcilerService.test.ts` (Split-Brain scenarios).

### 2. Backup Restore Persistence Rollback
- **Affected Code**: `services/storage/backup.service.ts`
- **Current Fix**: The native OS notification cancellation (`cancelAllScheduledNotificationsAsync`) was extracted outside the domain atomic write `try/catch` block. Native OS exceptions no longer roll back successful domain persistence.
- **Verification**: `services/storage/__tests__/backupRestore.phase0.test.ts`

### 3. MoveReconciler / Workspace Deletion Race
- **Affected Code**: `services/storage/MoveReconcilerService.ts`
- **Current Fix**: The reconciler explicitly verifies that the `targetWorkspaceId` still exists in metadata *before* writing to the partition. If the workspace was deleted mid-move, the move is aborted and safely left in the source workspace.
- **Verification**: `services/storage/__tests__/moveReconcilerWorkspaceDeletionHostileVerification.test.ts`

### 4. Recycle Bin Concurrent RMW Corruption
- **Affected Code**: `repositories/RecycleBinRepository.ts`
- **Current Fix**: All read-modify-write operations on the global Recycle Bin are now protected by the `pebble:v1:recycle_bin` mutex lock, preventing simultaneous mutations from overwriting snapshots.
- **Verification**: `services/storage/__tests__/recycleBinConcurrency.test.ts`

### 5. Bulk Revision Stale-Memory Overwrites
- **Affected Code**: `repositories/TaskRepository.ts`, `HabitRepository.ts`
- **Current Fix**: Bulk operations (`saveTasks`, `saveHabits`) enforce the monotonic revision invariant by fetching the authoritative persisted state immediately before overwriting, guaranteeing `newRevision = persistedRevision + 1`.
- **Verification**: `services/command/__tests__/bulkRevisionIntegrity.test.ts`

### 6. Move Journal Sequential Failure Loss
- **Affected Code**: `services/storage/MoveReconcilerService.ts`
- **Current Fix**: `reconcileAll` groups pending intents by `entityId`, sorts them chronologically, and safely discards superseded operations, ensuring only the latest user intent is executed.
- **Verification**: `services/storage/__tests__/MoveReconcilerService.test.ts`

### 7. Task Restore Journal Removal Bug
- **Affected Code**: `services/command/handlers/TaskCommandHandler.ts` (`restoreTasks`)
- **Current Fix**: Durable MoveJournal recovery intents are only deleted *after* the domain persistence (`saveTasksUnlocked`) successfully completes. If a specific workspace save fails, the intent survives for the reconciler to pick up.
- **Verification**: `services/command/__tests__/restoreJournalIntegrity.test.ts`

### 8. Resource Detail Screen Direct Persistence Bypass
- **Affected Code**: `features/details/resources/ResourceDetailContent.tsx`
- **Current Fix**: The detail screen mutated Resources through `ResourceRepository.saveResource` directly, skipping the command boundary (lifecycle guard, locked fresh-state merge, `resources_changed` events, analytics). It now routes all mutations through `EntityCommandService.updateResource` / `toggleArchiveResource`, restoring the UI → Command → Repository ownership path.
- **Verification**: `ResourceCommandHandler.concurrency.test.ts`, `ResourceCommandHandler.toggleArchive.regression.test.ts`, full suite.

### 9. Graph Reconciler Missing From Startup Recovery
- **Affected Code**: `app/_layout.tsx` → `services/startup/startup-recovery.ts`
- **Current Fix**: `GraphReconcilerService.reconcileAll()` was only invoked during backup restore. It is now part of the startup recovery sequence, running after restore/move/conversion/recycle-bin steps and before notification reconciliation, so dangling/stale relationship edges self-heal on every launch.
- **Verification**: `services/startup/__tests__/startupRecovery.test.ts`, `RelationshipGraphIntegrity.test.ts` (15/18/19/20/21/22), `CrossDomainIntegrity.test.ts`.

### 10. clearCompletedTasks Stale-Selection Race
- **Affected Code**: `services/command/handlers/TaskCommandHandler.ts` (`clearCompletedTasks` / `recycleTasks`)
- **Current Fix**: `clearCompletedTasks` selected completed tasks from an unlocked snapshot, and `recycleTasks`' under-lock re-read did not re-validate the completed predicate — a concurrent `updateTask` (e.g. un-completing the task) landing between selection and lock commit could be silently recycled by the stale clear. `recycleTasks` now accepts an optional `filter` predicate that is applied to the fresh under-lock read; `clearCompletedTasks` passes the completed predicate, so presence + predicate are validated atomically under the partition lock. Lock acquisition order is unchanged (partition → move-journal → recycle-bin), so no new ABBA risk.
- **Verification**: `services/command/__tests__/clearCompleted.test.ts` (stale-snapshot guard, move, concurrent-recycle, idempotency, and MoveReconciler recovery scenarios).

### 11. Bulk Habit Completion Failure Isolation
- **Affected Code**: `services/command/handlers/HabitCommandHandler.ts` (`completeHabits`)
- **Current Fix**: Bulk Habit completion is per-item failure-isolated; a failure affecting one selected Habit does not roll back or prevent independent selected Habits from being processed, and committed changes still trigger aggregate state notification. (Does not claim transactional/atomic batch semantics).
- **Verification**: `services/command/__tests__/completeHabitsConcurrency.test.ts` (hostile concurrency, concurrent move/recycle, mid-batch failure isolation, and idempotency scenarios).

### 12. Checklist Item Concurrency & Dual-Level State Integrity
- **Affected Code**: `services/command/handlers/ChecklistCommandHandler.ts` (`toggleChecklistItem`, `deleteChecklistItem`, etc.)
- **Current Guarantee**: Checklist item mutations are strictly serialized under the partition mutex `pebble:v1:checklists:${workspaceId}` with fresh under-lock reads. Dual-level state (item completion, occurrence-isolated recurrence history, monotonic revisions, and exact-once pebble rewards) is preserved without lost updates, phantom resurrection on concurrent move/recycle/permanent deletion, or lifecycle guard bypass.
- **Verification**: `services/command/__tests__/toggleChecklistItemConcurrency.test.ts` (hostile concurrency across distinct items, concurrent deletion, concurrent move, concurrent recycle, concurrent permanent deletion, rapid double-toggle, idempotent re-completion, and multi-date occurrence isolation).

### 13. Resource Permanent Deletion & Multi-Repository Boundary Integrity
- **Affected Code**: `services/command/handlers/ResourceCommandHandler.ts` (`permanentlyDeleteResource`)
- **Current Guarantee**: Resource permanent deletion safely serializes under partition mutex `pebble:v1:resources:${workspaceId}`, checks active partition and recycle bin, registers durable tombstones in `TombstoneRepository`, purges active records, removes recycle bin items, and prunes graph relationship edges. Interleaving with concurrent updates, moves, recycles, and restores converges cleanly without resurrecting ghosts or zombies. Dangling `resourceIds` on tasks, habits, and checklists are self-healed by `GraphReconcilerService` without clobbering revisions or timestamps.
- **Verification**: `services/command/__tests__/permanentlyDeleteResourceConcurrency.test.ts` (hostile concurrency against update, move, recycle, restore, double invocation, graph edge removal, dangling resourceIds reconciliation, generation bumps, and relationship races).

### 14. Resource Reference (resourceIds) Concurrency & GraphReconciler Race
- **Affected Code**: `services/storage/GraphReconcilerService.ts` (`reconcileAll`), `TaskRepository.ts`, `HabitRepository.ts`, `ChecklistRepository.ts` (`updateResourceIds`)
- **Current Fix**: When `updateResourceIds` rejects a stale snapshot due to concurrent user mutation (`res === "state_changed"`), the reconciler refreshes both the entity AND the active workspace resources (`ResourceRepository.getResources(workspaceId)`). This prevents newly created resources added concurrently from being falsely identified as invalid and stripped. Targeted updates preserve `revision`, `updatedAt`, and `lifecycleGeneration`, while entity deletion/move/recycle cleanly rejects with `'not_found'` or `'state_changed'`, preventing ghost resurrection.
- **Verification**: `services/storage/__tests__/GraphReconcilerResourceIdsRace.test.ts` (T1/T2/T3 interleaving, newly added reference preservation, user unlinking, metadata preservation, concurrent deletion/ghost prevention, habit parity, checklist parity).

### 15. Move Journal Removal Durability & Idempotent Crash Recovery
- **Affected Code**: `repositories/MoveJournalRepository.ts`, `services/storage/MoveReconcilerService.ts`, `services/command/handlers/TaskCommandHandler.ts` (`moveTask`, `recycleTask`, `restoreTasks`)
- **Current Guarantee**: Move Journal removal is intentionally a separate persistence write after domain mutations. Under hostile crashes where domain writes commit (target written, source deleted) but journal removal fails or is interrupted, the lingering journal entry is deterministically handled by `MoveReconcilerService.reconcileAll()`. Reconciler detects the committed state (`!sourceData && targetData`), leaves the target entity intact, preserves any subsequent user edits, prevents source resurrection, and idempotently cleans the journal. If crashes occur during partial domain writes or chained moves, reconciler safely converges without duplicating entities or resurrecting deleted/tombstoned data.
- **Verification**: `services/storage/__tests__/MoveJournalRemovalDurability.test.ts` (domain commit + journal crash + subsequent target edit preservation; partial write crash; chained moves to 3rd workspace; tombstone protection against zombie resurrection; and double recovery idempotency).

### 16. Workspace Restore Compile Break, Retry Rewrite & Bin Ghost
- **Affected Code**: `services/command/handlers/WorkspaceCommandHandler.ts` (`restoreWorkspace`, `mergeArchivedChildren`)
- **Current Fix**: The metadata checkpoint read `persistedWorkspaces` was never bound, so *every* workspace restore threw `ReferenceError` (the file did not typecheck; 13/14 restore tests failed). It is now read inside the restore lock. In addition, the archived-child merge persisted the *entire* merged partition instead of only the missing ids, which bumped `revision`/`updatedAt` of live entities on every retry — a fake "user edited" signal for `MoveReconcilerService` and an invalidation of the optimistic-concurrency tokens held by open screens. Only the archived ids absent from the live partition are written now.
- **Current Guarantee**: Metadata is the first durable checkpoint; a later child failure aborts with the Recycle Bin snapshot retained; a retry skips the metadata write, never overwrites/rewrites live children that already exist, backfills only the missing archived children, and removes the bin entry only after all four partitions commit. Partial restores are explicit (never claimed atomic).
- **Verification**: `services/command/__tests__/workspaceRestore.test.ts` (checklist/resource partition failure-injection, retry after partial failure preserving an intervening user edit and its revision, live-child preservation, bin retention, plus the existing task/habit/metadata failure cases); `workspaceRestoreRecovery.test.ts`. `npx tsc --noEmit` passes.

### 17. Backup Restore Key Policy & Pre-Mutation Bin Validation
- **Affected Code**: `services/storage/storage-keys.ts`, `services/storage/backup.service.ts` (`validateBackupPayload`)
- **Current Fix**: Restore policy is now a complete four-way declaration instead of an implicit default: `PEBBLE_BACKUP_PAYLOAD_KEYS` (restored), `PEBBLE_RESTORE_PRESERVED_KEYS`, `PEBBLE_RESTORE_EPHEMERAL_KEYS`, `PEBBLE_RESTORE_RESET_KEYS` (deliberate destruction, with the reason per group). `classifyKeyForRestore` is the single classifier and `getRestorePolicy` delegates to it, so behavior is unchanged but every owned key now carries an explicit decision. Recycle-bin items are validated before mutation: an unparseable `snapshot` or an unsupported `entityType` now rejects the whole backup instead of becoming a permanently un-restorable bin entry.
- **Current Guarantee**: Device-local preferences survive; in-flight keys are cleared; tombstones and dataset-scoped economy ledgers are deliberately reset (documented rationale: the restored dataset must not inherit the replaced dataset's deletion lineage or counted rewards); malformed bin payloads fail before the destructive remove/write.
- **Verification**: `services/storage/__tests__/storageKeyRegistry.test.ts` (classification completeness, set disjointness, dynamic-partition classification, explicit ledger/tombstone reset policy, preserved-vs-reset restore behavior); `services/storage/__tests__/BackupService.test.ts` (malformed bin snapshot / unsupported entity type rejected with zero `multiRemove` calls).

### 18. Focus Completion Crash-Boundary Idempotency
- **Affected Code**: `services/command/handlers/SystemCommandHandler.ts` (`recordFocusSession`), `repositories/FocusStatsRepository.ts`, `repositories/GraphRepository.ts` (`saveFocusSession`)
- **Current Guarantee**: Per stable session id, the session upsert, the stats credit (durable `creditedSessionIds` ledger), the Pebble award (`focus:<sessionId>` reward id) and the focus→target edge (deterministic id + endpoint dedupe) are each individually idempotent, so a retry converges after a crash at *any* boundary. Verified for: crash between the session write and the stats credit, crash between the stats credit and the reward, and crash between the reward and the relationship edge. No duplicate session rows, minutes, rewards, or edges.
- **Verification**: `services/command/__tests__/focusSessionCompletion.test.ts` (8 tests, including the three new crash-boundary retries, concurrent double completion, and partial-minute remainder crediting).

### 19. Conversion Journal Roll-Forward Edge Transfer
- **Affected Code**: `services/storage/ConversionReconcilerService.ts` (`retargetRelationships`, both directions)
- **Current Fix**: The journal removal is the last write, and the reconciler already converged after a crash anywhere between destination write and journal removal. The one remaining hole was the roll-forward crash *after* the source deletion but *before* the graph edges were re-pointed: the `target exists / source missing` branch cleared the journal without completing the transfer, so `GraphReconcilerService` later pruned the edges and the converted entity silently lost its links. Both directions now re-point edges to the destination before clearing the journal.
- **Current Guarantee**: A retry cannot lose both source and destination, cannot duplicate the destination entity, and cannot duplicate edges (`saveRelationshipUnlocked` matches by endpoints, so the retarget is idempotent). Redundant execution after a crash between the final domain write and journal removal is safe.
- **Verification**: `services/storage/__tests__/ConversionReconcilerHostileVerification.test.ts` (new `I2` crash-boundary edge-retarget tests for both directions, `I3` repeated-recovery idempotency, plus the existing A–K matrix); `services/command/__tests__/conversionHostileVerification.test.ts` (handler-level crash at PREPARED / DESTINATION_WRITTEN / source deletion / journal deletion, double conversion, concurrent edits).

### 20. Completion Reward Durability (Task / Habit)
- **Affected Code**: `repositories/RewardIntentRepository.ts`, `features/profile/services/reward-intent.service.ts`, `services/command/handlers/TaskCommandHandler.ts` (`completeTask`), `services/command/handlers/HabitCommandHandler.ts` (`completeHabit`), `services/startup/startup-recovery.ts`
- **Current Fix**: The reward was persisted *after* the entity, and every replay of an already-completed entity returned before `earnPebble`, so a crash (or a failed economy write) between the two writes lost the Pebble permanently. Completion now records a durable owed-reward intent (`pebble:v1:reward_intents`, keyed by `rewardId`) BEFORE the completed state and credits it under the same partition lock; the already-completed replay settles a pending intent, and `runStartupRecovery` drains the ledger.
- **Current Guarantee**: exactly-once per reward id. Crediting is idempotent by `rewardId`; resolution pays only while the entity is still in the rewarded state (a completed Task, or a Habit with a completion entry for the intent's `dateKey`) and never pays an uncompleted, recycled, deleted or tombstoned entity; the 15/day cap keeps its documented "dropped, no backlog" behavior.
- **Two-write policy (intent vs. award)**: AsyncStorage cannot write the entity and the intent atomically, so the two failures are treated differently by design. (a) If the AWARD cannot be written after a durable intent, the completion still commits and the intent is repaired by replay or startup recovery. (b) If the INTENT itself cannot be written, the completion **aborts before persisting the completed state** (`RewardIntentPersistenceError`): no entity change, no `tasks_changed`/`habits_changed` event, no plugin dispatch, no analytics, no reward. Committing instead would produce a completed entity whose reward could never be recovered if the award also failed — the exact state the ledger exists to prevent. This matches the existing completion contract, where a failed domain write already rejects the command before any side effect; the earlier claim that "reward bookkeeping can never fail a completion" was too strong and is narrowed to (a).
- **Verification**: `services/command/__tests__/rewardDurability.test.ts` (18 tests). Existing coverage: failure between the entity write and the award, replay settlement, uncompletion/delete before recovery, out-of-band settlement, habit day scoping, concurrent completions plus concurrent recovery. Fail-closed coverage: Task and Habit with **both** the intent ledger and the Pebble log unwritable (command rejects with `RewardIntentPersistenceError`, entity unchanged, zero events/plugin dispatches, zero rewards, zero intents); intent-only failure (award path never attempted); retry after storage recovery yields exactly one reward and one completion entry; orphan intent left by an entity-write failure is discarded by startup with no payout; the already-completed replay path does not fail on an unreadable ledger. All eight fail-closed tests were confirmed to fail against the previous swallow-and-continue implementation (temporary revert, then restored). The intent key is registered as an owned ephemeral key (cleared by backup restore); the registry-completeness test passes.

### 21. Workspace Recycle → Restore Graph Edges
- **Affected Code**: `services/command/handlers/WorkspaceCommandHandler.ts` (`deleteWorkspace`, `restoreWorkspace`, `isWorkspaceOwnedEdge`, `restoreArchivedRelationships`)
- **Current Fix**: The workspace package snapshot now carries `relationships`, and the children's edges are deleted INSIDE the lifecycle lock (previously after release, where a concurrent restore could re-add edges that the committed recycle then deleted). Restore re-adds only edges whose endpoints are verifiably live again.
- **Current Guarantee**: internal edges (both endpoints in the package) and focus-provenance edges (session still in the surviving ledger) survive recycle → restore. Edges to entities in another dataset are not resurrected, because their liveness cannot be verified from the package. Replay is idempotent by logical edge and never recreates a dangling edge. The snapshot change is additive (`relationships` is optional), so older packages still restore.
- **Verification**: `services/command/__tests__/workspaceRestore.test.ts` (edges restored / cross-workspace edges dropped; focus provenance restored only with a live session; dangling edges not resurrected; an edge-restore failure retains the bin entry and the retry completes with exactly one edge; replaying a retained snapshot does not duplicate).

### 22. Stale Bulk Snapshot Writes (`reorderWorkspaces` / `reorderTasks`)
- **Affected Code**: `repositories/WorkspaceRepository.ts` (`applyWorkspaceOrder`), `repositories/TaskRepository.ts` (`applyTaskOrder`), `WorkspaceCommandHandler.reorderWorkspaces`, `TaskCommandHandler.reorderTasks`
- **Current Fix**: Both reorder commands wrote the caller's snapshot wholesale. `saveWorkspaces` replaced the collection (a concurrently created workspace was deleted, a stale record reverted a rename, a concurrent delete was resurrected), and `saveTasks` rewrote every supplied record (bumping `revision`/`updatedAt`, reverting a rename, re-opening a completed task). Reorder is now an order-only merge under the existing key lock: persisted records keep their own fields, persisted-but-unknown records are appended, ids that are no longer persisted are never resurrected, and the snapshot is written verbatim only when nothing is persisted (first-run bootstrap).
- **Current Guarantee**: a reorder cannot lose a create, revert a rename or completion, resurrect a delete, or bump revisions. `saveWorkspaces`/`saveTasks` remain unchanged for seeding and other bulk uses.
- **Verification**: `services/command/__tests__/bulkSnapshotOrdering.test.ts` (8 tests). The three workspace and three task cases were confirmed to fail against the previous write path by temporarily restoring it (3 failures each, then reverted).

### 23. Checklist Reward Durability (one-time latch)
- **Affected Code**: `services/command/handlers/ChecklistCommandHandler.ts` (`toggleChecklistItem`), `features/profile/services/reward-intent.service.ts` (Checklist validator + `resolveOwedRewardsForEntity`), `repositories/RewardIntentRepository.ts` (intent domain widened to `checklist`)
- **Current Fix**: The checklist set `pebbleAwarded: true` and then called `earnPebble`, which swallows a failed reward write — so a failed credit left the one-time latch permanently set with no Pebble, and every later toggle saw the latch and returned. Worse, the reward was credited *before* the checklist was persisted, so a failed save could credit a completion that never committed. The order is now intent → completion+latch → award: the latch and the completion are published together, and the award runs only after they are durable.
- **Current Guarantee**: at most one Pebble ever per checklist (recurring series included — the latch never clears and no reversal exists); nothing is awarded for an incomplete checklist; a retry or concurrent toggle cannot duplicate it. A failed award keeps a durable intent, settled by startup recovery or by the next committed toggle (`resolveOwedRewardsForEntity`, since a later toggle does not know the winning occurrence's reward id). A Checklist intent is paid only when the checklist still exists, still carries `pebbleAwarded`, its reward id is exactly the one that checklist could have earned (bare id, or `:<dateKey>` for the occurrence), and it is not tombstoned — so an intent orphaned by a failed save or a deleted checklist is discarded, never paid.
- **Verification**: `services/command/__tests__/checklistFocusRewardDurability.test.ts` (7 Checklist tests: reward-write failure then exactly-once recovery plus no double award on later toggles, next-toggle replay repair, entity-write failure discards the intent with no payout, intent-write failure aborts with no state change/event, incomplete checklist earns nothing, concurrent toggles plus concurrent recovery award once, recurring latch across two occurrences after a failed award). Six of the seven fail against the previous implementation (verified by temporary revert; restored). Daily-cap behavior is covered in the Focus block below.

### 24. Focus Reward Durability (session identity)
- **Affected Code**: `services/command/handlers/SystemCommandHandler.ts` (`recordFocusSession`), `features/profile/services/reward-intent.service.ts` (Focus validator + per-session partition key)
- **Current Fix**: `earnPebble` swallowed a failed reward write while the command still resolved, so `useFocusState.completeTimerSession` released the active-session recovery marker (`todoapp:focus:current_session`) with nothing left to retry — the session was durable, its stats credited, and the Pebble gone. The command now records the owed reward (`focus:<sessionId>`) FIRST, persists the session and the stats credit, then credits the reward from that intent.
- **Current Guarantee**: per stable session id, exactly one session row, one stats credit, one `focuses_on` edge and one Pebble, including across retries and a partial failure. A failed award after the session exists keeps a durable intent that replay or startup recovery settles. A failed intent write aborts the command **before** the session is persisted, so the timer's recovery marker is still valid and the next attempt reuses the same id (the marker is released by the hook only after the command resolves). A session that never persisted is never paid: the Focus validator requires the session id to exist in `pebble:v1:focus_sessions`. Resolution takes the per-session `pebble:v1:focus_completion:<sessionId>` lock (not the session-ledger key) so it cannot re-enter the mutex the validator's read acquires, and its order `focus_completion → focus_sessions` matches the command's. The 15/day cap keeps its documented "dropped, no backlog" behavior for both new domains.
- **Verification**: `services/command/__tests__/checklistFocusRewardDurability.test.ts` (6 Focus tests: reward-write failure then exactly-once recovery, no payout for a session that never persisted, intent-write failure aborts with no session/stats/reward and the retry succeeds, retry does not duplicate session/stats/relationship/reward, focus daily cap, checklist daily cap). `services/command/__tests__/focusSessionCompletion.test.ts` was updated where it encoded the old contract (a failed award rejecting the command) to the durable-intent contract; the other seven cases are unchanged and pass. Five of the six new Focus tests plus the four rewritten/related ones fail against the previous implementation (verified by temporary revert; restored).

### 25. Workspace Lifecycle Locking, Strict Writes and Pre-Lock Decisions
- **Affected Code**: `services/command/handlers/WorkspaceCommandHandler.ts` (`archiveWorkspace`, `restoreWorkspaceArchive`, `updateWorkspace`, `permanentlyDeleteWorkspace`, `reorderWorkspaces`, `restoreWorkspace`), `repositories/WorkspaceRepository.ts` (`saveWorkspace`, `saveWorkspaces`, `applyWorkspaceOrder`)
- **Current Fix**: Archive and unarchive read, decide and write inside `ws_lifecycle_<id>`, run the lifecycle guard, bump `revision`, and persist strictly; the children's reminders are cancelled after the commit. `updateWorkspace` keeps `id`, `createdAt` and `archivedAt` from the persisted record, so a rename whose snapshot predates a concurrent archive can no longer silently unarchive. `permanentlyDeleteWorkspace` now reads the bin item, the archived package, the active metadata and the child partitions **inside** the locks, so a concurrent restore can no longer be purged from a stale pre-lock snapshot. `reorderWorkspaces` writes with `throwOnError: true`, and `saveWorkspace(s)`/`applyWorkspaceOrder` are now strict by default (`tolerateFailure: true` is the explicit opt-out).
- **Current Guarantee**: a lifecycle command reports success only after its write committed; the locked decision observes the state it is about to destroy; a rename cannot revert an archive and a reorder cannot report a failed write as success.
- **Verification**: `services/command/__tests__/workspaceHostileVerification.test.ts` (lifecycle lock coverage and strict writes, delete fail-closed, restore crash recoverability, recycle-bin preservation); `services/command/__tests__/workspaceArchive.test.ts`; `services/command/__tests__/bulkSnapshotOrdering.test.ts` (reorder merge semantics, unchanged by the strict-write change).

### 26. Reward Reversal Serialization (Task / Habit)
- **Affected Code**: `services/command/handlers/TaskCommandHandler.ts` (`uncompleteTask`), `services/command/handlers/HabitCommandHandler.ts` (`recycleHabit`)
- **Current Fix**: `reversePebbleReward` ran after the partition lock was released. Interleaving with a re-completion deleted a reward that a *completed* entity had just legitimately earned: uncomplete writes `todo` → concurrent `completeTask` writes `completed` and settles on `already_earned` → the reversal then removes that entry, leaving a completed entity with no Pebble and no intent. The reversal now runs inside the same partition lock, immediately after the committed uncomplete/recycle write.
- **Current Guarantee**: a reversal can only observe completions that committed before it, so it cannot delete a reward produced by a concurrent valid completion. A failed reversal keeps the ledger entry (over-credit, never loss); a later re-completion settles on `already_earned`, so the net result is still exactly one Pebble.
- **Verification**: `services/command/__tests__/rewardDurability.test.ts` (extended with the complete/uncomplete and recycle interleavings around reversal, including the failed-write case).

### 27. Focus Stopwatch Recovery and Incremental Minute Crediting
- **Affected Code**: `features/focus/hooks/useFocusState.ts` (`swReset`, `flushPendingStopwatchSession`, `logPartialMinutes`, `creditFocusTime`), `repositories/FocusStatsRepository.ts`, `services/command/handlers/SystemCommandHandler.ts`
- **Current Fix**: `swReset` cleared `todoapp:focus:current_stopwatch` and the React state **before** `recordFocusSession` settled, so a rejected command lost the session outright (its elapsed time existed only in memory). It now writes a durable recovery record (`todoapp:focus:pending_stopwatch_session`, carrying the same stable `focus_sw_<start>` session id) first, clears the UI only after that write commits, and clears the record only after the command resolves; every sync trigger retries a retained record idempotently. Incremental minutes previously advanced `loggedMinutesInCurrentSessionRef` while the stats write was unawaited, so a failed write silently lost those minutes and the completion never re-credited them. The checkpoint now advances only after the credit commits, the credit is serialized against overlapping ticks, and the active-session marker is written after the credit settles so its `loggedMinutes` matches what was actually credited.
- **Current Guarantee**: a finished stopwatch session is recoverable across a crash or a failed write, and repeated recovery converges on one session, one stats credit, one relationship and one Pebble (the command is idempotent on the stable session id). Incremental minutes are never silently dropped.
- **Verification**: `features/focus/hooks/__tests__/useFocusSessionDurability.test.tsx` (pending-record retry, timer path unchanged); `services/command/__tests__/focusSessionCompletion.test.ts` (session/stats/reward crash boundaries).

### 28. Habit Calendar Date Scope and Schedule Placement
- **Affected Code**: `app/(tabs)/calendar.tsx` (`handleToggleCompleteHabit`), `features/calendar/hooks/useCalendarState.ts` (daily planner + week/month drag for habits), `features/habits/hooks/useHabitCrud.ts`, `features/calendar/components/CalendarItemPopover.tsx`
- **Current Fix**: habit completion commands operate on **today's** occurrence, but the calendar computed the toggle from the selected date and called them unconditionally — tapping a historical/future date wrote today's completion (and reward) while the visible day stayed untouched. The off-today affordance is now hidden and every caller is guarded. Habit drag/plan wrote only `reminder.triggerAt`, so the habit kept its old slot ("Anytime") while its notification moved; habits now write `schedule` through `calculateRescheduledTask`, matching Tasks and Checklists (schedule = placement, reminder = delivery). `useHabitCrud` resolves the partition from `habit.workspaceId` instead of `selectedWorkspaceId` (a divergent selection made the command return `null`, an indistinguishable no-op) and surfaces a failed toggle instead of producing an unhandled rejection.
- **Current Guarantee**: a toggle affects only the occurrence it can actually mutate; a reschedule moves the calendar slot and the reminder consistently; a habit is addressed in its own workspace.
- **Verification**: `features/calendar/hooks/__tests__/habitCalendarScheduling.test.ts` (placement written for planner + drags); `features/calendar/components/__tests__/CalendarItemPopover.test.tsx` (off-today affordance hidden); `features/habits/hooks/__tests__/useHabitCrud.workspace.test.tsx` (workspace routing, failure toast, no silent no-op).

### 29. Bulk Task Complete/Archive Failure Isolation
- **Affected Code**: `services/command/handlers/TaskCommandHandler.ts` (`completeTasks`, `archiveTasks`), `features/tasks/hooks/useTasksState.ts` (`handleBulkComplete`, `handleBulkArchive`)
- **Current Fix**: both loops awaited each item without a `try/catch`, so one lifecycle-guard rejection, `RewardIntentPersistenceError` or missing task aborted the batch after earlier items had already committed — the hook's projection never ran, no aggregate event fired, and the rejection escaped the press handler. Tasks now use the Habit pattern: per-item isolation, the committed subset is returned and emitted, and the hook contains an unexpected rejection with a truthful toast.
- **Current Guarantee**: committed items are reflected in UI state and events even when a later item fails; the outcome is reported as full or partial rather than silently rolled back. Not claimed: transactional batch atomicity (AsyncStorage cannot provide it).
- **Verification**: `services/command/__tests__/bulkLifecycleParity.test.ts` (bulk/per-item parity for completion and archiving, already-completed skips, aggregate event).

### 30. Single Recycle-Bin Restore Orchestrator and Bin-Id Resolution
- **Affected Code**: `services/command/handlers/RecycleBinCommandHandler.ts` (`restoreItems`), `services/command/EntityCommandService.ts` (`restoreRecycleBinItems`), `services/storage/storage.service.ts` (removal of the duplicate orchestrator), `app/recycle-bin.tsx`, `features/workspaces/components/WorkspaceModal.tsx`
- **Current Fix**: a second restore coordinator lived in the storage service with its own event policy; its loop had no `try/catch`, so one failing habit/workspace/resource aborted every remaining item in "Restore All", and `successfulRestoreIds` was collected but never returned. Restore now runs through `RecycleBinCommandHandler.restoreItems`, which calls the canonical per-entity restore handlers, isolates per-item failures, reports which items were restored, and emits one event per domain that actually changed. `WorkspaceModal`'s undo passes the workspace entity id instead of hardcoding `rb-<id>`; the command resolves the live bin entry (including `rb-<id>-g<generation>`) itself.
- **Current Guarantee**: one restore path, truthful partial results, no domain left without its change event, and no duplicated bin-id shape knowledge in components.
- **Verification**: `services/command/__tests__/restoreResolution.test.ts` (entity-id and bin-id resolution, batch partial failure with the failed item left retryable, per-domain events, mixed-domain batch); `app/recycle-bin` screen tests; full suite.

### 31. Startup Recovery Step Isolation
- **Affected Code**: `services/startup/startup-recovery.ts`, `app/_layout.tsx`
- **Current Fix**: only the reward-intent and notification steps were failure-contained. A rejection from restore recovery, move/conversion replay, recycle-bin cleanup or graph reconciliation propagated out of `runStartupRecovery`, skipping every later step — and the layout's single `try` then skipped `OnboardingService.isOnboardingCompleted()` and the routing calls. Each step is now awaited through a `settle()` helper that logs and continues (ordering preserved), and routing runs independently of recovery success.
- **Current Guarantee**: one failing recovery step cannot suppress unrelated replay, pruning, journal repair or onboarding/navigation initialization. Not claimed: a failed step is repaired later in the same run.
- **Verification**: `services/startup/__tests__/startupRecovery.test.ts` (each step's failure isolated, later steps still run, ordering preserved).

### 32. Storage Ownership, Dependency Direction and Raw-Key Reads
- **Affected Code**: `services/storage/storage-utils.ts` (`clearRepositoryStorage`), `services/storage/storage-keys.ts` (`isPreservedByContentReset`), `shared/utils/schedule-time.ts` (new), `services/command/shared/schedule-reminder-normalizer.ts`, `ChecklistCommandHandler.ts`, `TaskCommandHandler.ts`, `HabitCommandHandler.ts`, `features/details/task/hooks/useTaskDetailForm.ts`, `features/tasks/hooks/useTasksState.ts`, `app/profile/stats.tsx`, `features/profile/services/achievement-stats.service.ts`
- **Current Fix**: (a) `clearRepositoryStorage` used a second ownership predicate (`key.startsWith("pebble:")`), missing every owned `todoapp:*` key while deleting any non-registry key with that prefix; it now uses `isPebbleOwnedKey` and leaves device-local presentation state and the onboarding flag alone. (b) The command layer imported `computeTriggerEpoch` from a React hook module; the pure helper now lives in `shared/utils/schedule-time.ts` and the hook re-exports it. (c) The web reminder re-arm wrote whole Task records with a pre-scheduling snapshot (fire-and-forget), which could revert a concurrent completion/rename and bump its revision; it now persists notification ids through `TaskRepository.updateNotificationIds` (expected-state CAS) and cancels the ids it scheduled when the CAS loses. (d) Profile screens and the achievement service read `pebble:history`/`todoapp:focus:stats` directly; they now use `getAllHistory()` and `FocusStatsRepository.getFocusStats()`.
- **Current Guarantee**: one ownership predicate, no service→hook dependency, no domain record overwritten by the load-time re-arm, and one reader per persisted key.
- **Verification**: `services/storage/__tests__/storageKeyRegistry.test.ts`, `services/storage/__tests__/BackupService.test.ts` (`clearRepositoryStorage` preserves onboarding), `services/storage/__tests__/lifecycleGenerationRevisionTombstones.test.ts` (reset still cleanses tombstones and journals), `services/scheduling/__tests__/webReminderLifecycle.test.ts` (re-arm identity); `npx tsc --noEmit` passes. **Gap:** the re-arm CAS write itself has no dedicated hook-level failure-injection test; it is covered only by the repository CAS tests and the re-arm identity tests.

### 33. Derived Statistics Hygiene
- **Affected Code**: `repositories/FocusStatsRepository.ts`, `services/analytics/productivity-history.service.ts`
- **Current Fix**: `completedToday` was incremented on every completion and never rolled over, so it reported a lifetime count as "today"; it now carries `completedTodayDate` and is read/credited as a daily counter (a stale day reports 0 and the next credit resets it). `recordDailyHistorySnapshot` was an unlocked read-modify-write invoked fire-and-forget by nearly every command; it now holds the `pebble:v1:history` lock across its read and write.
- **Current Guarantee**: a daily counter cannot silently become lifetime, and concurrent history snapshots cannot regress today's entry to a stale value.
- **Verification**: `repositories/__tests__` focus-stats coverage and `services/analytics` history coverage; full suite. These are derived caches, not domain truth.

## OPEN / UNVERIFIED

These items exist in current code and have not yet been fully audited or hardened.

### 1. Secondary Command Handler Hardening
- **Exact File**: Remaining secondary operations in `HabitCommandHandler.ts` and `TaskCommandHandler.ts`. (`ChecklistCommandHandler.ts` audited and verified in Phase 10E; `ResourceCommandHandler.ts` audited and verified in Phase 10F).
- **Failure Condition**: Highly concurrent offline cross-partition operations.
- **Impact**: Unknown.
- **Current Evidence**: The audited lifecycle commands (`updateTask`, `completeTask`/`uncompleteTask`, `moveTask`, `recycleTask(s)`, `restoreTask(s)`, `permanentlyDeleteTask`, `updateHabit`, `completeHabit`/`uncompleteHabit`, `archiveHabits`/`completeHabits`, `recycleHabit`, `restoreHabit`) all read fresh state under their partition mutex, honor the lifecycle/revision guard, and persist before emitting events. The effective acquisition order is `partition → move_journal → recycle_bin` (and `conversion_journal → partitions` for conversions); `_acquireRestoreLocks` uses the same hierarchy rather than plain alphabetical order, so no ABBA cycle was found between backup/restore/reconcilers/handlers.
- **Why Existing Recovery Does Not Cover It**: these are the residual operations of each handler that were not individually driven through a hostile interleaving; the UI bulk-save paths that used to bypass this discipline are now order-only merges (CLOSED #22).
- **Confidence Level**: Unverified for the residual operations only.

### 2. Reward Paths Outside Completion Commands
- **Exact File**: `features/profile/services/pebble.service.ts` (launch/streak/first-run rewards and any other `earnPebble` caller outside the completion commands)
- **Failure Condition**: A crash between the event that earns the reward and the reward write.
- **Impact**: A lost reward for that event.
- **Current Evidence**: Task/Habit (CLOSED #20), Checklist and Focus (CLOSED #23/#24) now all use the durable reward-intent ledger. Remaining callers are launch/streak-style rewards that are not tied to a persisted entity transition, so there is nothing for a validator to check.
- **Why Existing Recovery Does Not Cover It**: The intent ledger requires a durable "rewarded state" to validate against; those rewards have none.
- **Confidence Level**: Unverified for the remaining non-completion callers; no failure test reproduces a loss there today.

### 3. GraphRepository In-Memory Cache (P3) — deferred by design
- **Exact File**: `repositories/GraphRepository.ts` (`ensureLoadedUnlocked`, `saveRelationshipUnlocked`)
- **Failure Condition**: a writer outside this class (a second JS runtime, manual storage tooling, or a restore that forgot `resetCache`) is invisible to the cache, and the next edge write persists the cached map over it.
- **Current Evidence**: every single-runtime path is covered — backup restore and `clearAllData` call `resetCache`, and all graph writes go through the repository. The failure mode requires a second writer, which the app does not have.
- **Decision**: not fixed. Dropping or version-checking the cache would add a read to every edge write to defend against a writer that does not exist; revisit only if a second runtime/process is introduced. The per-process mutex limit is documented under INHERENT LIMITS.
- **Confidence Level**: verified as an accepted architectural limit, not a latent bug.

### 4. Device and End-to-End Checks Not Run
- **What is unverified**: nothing below was exercised in this environment (no simulator/device, no notification delivery, no real web timer).
  - Calendar drag/plan placement on a real device, and the hidden off-today habit affordance on device.
  - OS notification delivery/cancellation in response to reschedule, archive and completion (only the scheduling/cancellation calls and their awaited ordering are tested).
  - Web load-time reminder re-arm against a real browser timer, including the CAS-lost path that cancels the ids it just scheduled.
  - Focus stopwatch recovery after a real process kill (the marker/retry logic is unit-tested with injected failures).
- **Impact**: residual behavior risk on device only; command-level and storage-level guarantees above are covered by Jest.

## INHERENT LIMITS (AsyncStorage)

- Restore, workspace restore, move/conversion journal removal and recycle-bin moves are **not** transactions. Each step is a separate `setItem`/`multiRemove` write, so a crash can leave a partially applied state.
- Every such state is made *recoverable*, not atomic: the durable intent/journal (or retained Recycle Bin snapshot) is the source of truth for a retry. Anything that has not reached its journal-removal/snapshot-removal step may be replayed; replay is idempotent and must never be "repaired" by a second, competing mechanism.
- `multiSet`/`multiRemove` are only as atomic as the platform implementation; this codebase treats them as sequential and relies on the journal/intent rather than claiming all-or-nothing semantics.
- The in-memory mutex only serializes work inside one JS runtime. A second device/process writing the same keys is outside its protection; only idempotent recovery makes that safe.
- A rewarding command writes at least three keys — the reward-intent ledger, the rewarded state (entity partition for Task/Habit/Checklist, the focus-session ledger for Focus), and the Pebble log — and none of them commit together. The order (intent → rewarded state → award) is what keeps the failure modes honest: a failed intent aborts a completion that has not happened yet, a failed rewarded-state write leaves an intent that the domain validator rejects, and a failed award leaves a durable, replayable intent. The residual window is a crash after the rewarded state commits, which leaves that state plus a pending intent — repaired on the next replay or at startup, never paid twice.

## HISTORICAL (No Longer Apply)

The following vulnerabilities were mentioned in historical audits but are now superseded by architectural changes and no longer apply:

- **Semantic Data Loss via Stringification**: Fixed because `MoveReconciler` no longer naively merges conflicting string fields; it forks the entire entity.
- **Deletion Intent Loss**: Fixed via strict target validation and forking.
- **Notification Leak**: Fixed because `MoveReconciler` explicitly strips `notificationIds` from split-brain forks, allowing the `NotificationReconciler` to generate fresh native triggers.
