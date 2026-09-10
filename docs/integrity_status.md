# Pebble Integrity Status

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

## OPEN / UNVERIFIED

These items exist in current code and have not yet been fully audited or hardened.

### 1. Conversion Journal Removal Atomicity
- **Exact File**: `services/storage/ConversionReconcilerService.ts` and `repositories/ConversionJournalRepository.ts`
- **Exact Code Path**: Reconcilers perform a domain write, followed by a separate `removeOperationUnlocked` write to the conversion journal. (Move Journal removal was audited and hostile-verified safe in Phase 10H; Conversion Journal remains unverified).
- **Failure Condition**: The app crashes between the destination write/source deletion and journal removal.
- **Impact**: Idempotent redundant execution during startup recovery.
- **Why Existing Recovery Does Not Cover It**: Separate write boundaries exist in non-ACID AsyncStorage.
- **Confidence Level**: Low severity (P2), but architecturally un-atomic.

### 2. Secondary Command Handler Hardening
- **Exact File**: Remaining secondary operations in `HabitCommandHandler.ts` and `TaskCommandHandler.ts`. (`ChecklistCommandHandler.ts` audited and verified in Phase 10E; `ResourceCommandHandler.ts` audited and verified in Phase 10F).
- **Failure Condition**: Highly concurrent offline cross-partition operations.
- **Impact**: Unknown.
- **Why Existing Recovery Does Not Cover It**: While Workspace, Task (core), Checklist, Resource, and Recycle Bin have received full mutex lock verification, remaining secondary commands have not been explicitly subjected to hostile concurrency tests.
- **Confidence Level**: Unverified.

## HISTORICAL (No Longer Apply)

The following vulnerabilities were mentioned in historical audits but are now superseded by architectural changes and no longer apply:

- **Semantic Data Loss via Stringification**: Fixed because `MoveReconciler` no longer naively merges conflicting string fields; it forks the entire entity.
- **Deletion Intent Loss**: Fixed via strict target validation and forking.
- **Notification Leak**: Fixed because `MoveReconciler` explicitly strips `notificationIds` from split-brain forks, allowing the `NotificationReconciler` to generate fresh native triggers.
