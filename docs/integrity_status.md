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

## OPEN / UNVERIFIED

These items exist in current code and have not yet been fully audited or hardened.

### 1. Secondary Command Handler Hardening
- **Exact File**: Remaining secondary operations in `HabitCommandHandler.ts` and `TaskCommandHandler.ts`. (`ChecklistCommandHandler.ts` audited and verified in Phase 10E; `ResourceCommandHandler.ts` audited and verified in Phase 10F).
- **Failure Condition**: Highly concurrent offline cross-partition operations.
- **Impact**: Unknown.
- **Current Evidence**: The audited lifecycle commands (`updateTask`, `completeTask`/`uncompleteTask`, `moveTask`, `recycleTask(s)`, `restoreTask(s)`, `permanentlyDeleteTask`, `updateHabit`, `completeHabit`/`uncompleteHabit`, `archiveHabits`/`completeHabits`, `recycleHabit`, `restoreHabit`) all read fresh state under their partition mutex, honor the lifecycle/revision guard, and persist before emitting events. The effective acquisition order is `partition → move_journal → recycle_bin` (and `conversion_journal → partitions` for conversions); `_acquireRestoreLocks` uses the same hierarchy rather than plain alphabetical order, so no ABBA cycle was found between backup/restore/reconcilers/handlers.
- **Why Existing Recovery Does Not Cover It**: these are the residual operations of each handler that were not individually driven through a hostile interleaving; the UI bulk-save paths that used to bypass this discipline are now order-only merges (CLOSED #22).
- **Confidence Level**: Unverified for the residual operations only.

### 2. Reward Paths Outside Task/Habit Completion
- **Exact File**: `services/command/handlers/ChecklistCommandHandler.ts` (checklist latch), `services/command/handlers/SystemCommandHandler.ts` (focus reward), `features/profile/services/pebble.service.ts` (launch/streak rewards)
- **Failure Condition**: A crash between the entity write and the reward write on those paths.
- **Impact**: A lost or duplicated reward for that occurrence.
- **Current Evidence**: Checklist rewards are latched on the entity (`pebbleAwarded`) and focus rewards are idempotent by stable session id (CLOSED #18); neither uses the reward-intent ledger introduced in CLOSED #20.
- **Why Existing Recovery Does Not Cover It**: The intent ledger is only written by Task/Habit completion. Converting them is possible but not demonstrated to be necessary.
- **Confidence Level**: Unverified for the checklist/focus boundaries; no failure test reproduces a loss there today.

## INHERENT LIMITS (AsyncStorage)

- Restore, workspace restore, move/conversion journal removal and recycle-bin moves are **not** transactions. Each step is a separate `setItem`/`multiRemove` write, so a crash can leave a partially applied state.
- Every such state is made *recoverable*, not atomic: the durable intent/journal (or retained Recycle Bin snapshot) is the source of truth for a retry. Anything that has not reached its journal-removal/snapshot-removal step may be replayed; replay is idempotent and must never be "repaired" by a second, competing mechanism.
- `multiSet`/`multiRemove` are only as atomic as the platform implementation; this codebase treats them as sequential and relies on the journal/intent rather than claiming all-or-nothing semantics.
- The in-memory mutex only serializes work inside one JS runtime. A second device/process writing the same keys is outside its protection; only idempotent recovery makes that safe.
- A completion writes two keys (the entity partition and the reward-intent ledger) and they cannot be committed together. The order makes the failure modes honest: the intent is first, so a failed intent aborts a completion that has not happened yet, while a failed award leaves a durable, replayable intent. The residual window is a crash between the two writes, which leaves a completed entity plus a pending intent — repaired on the next replay or at startup, never paid twice.

## HISTORICAL (No Longer Apply)

The following vulnerabilities were mentioned in historical audits but are now superseded by architectural changes and no longer apply:

- **Semantic Data Loss via Stringification**: Fixed because `MoveReconciler` no longer naively merges conflicting string fields; it forks the entire entity.
- **Deletion Intent Loss**: Fixed via strict target validation and forking.
- **Notification Leak**: Fixed because `MoveReconciler` explicitly strips `notificationIds` from split-brain forks, allowing the `NotificationReconciler` to generate fresh native triggers.
