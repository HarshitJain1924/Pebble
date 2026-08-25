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

## OPEN / UNVERIFIED

These items exist in current code and have not yet been fully audited or hardened.

### 1. Un-atomic Journal Removal
- **Exact File**: `services/storage/MoveReconcilerService.ts` and `ConversionReconcilerService.ts`
- **Exact Code Path**: Reconcilers perform a domain write via `AsyncStorage.multiSet`, followed immediately by a separate `removeOperationsUnlocked` write to the journal.
- **Failure Condition**: The app crashes between the `multiSet` and the journal removal.
- **Impact**: Idempotent redundant execution. The journal entry survives, and on next boot, the reconciler redundantly re-executes the operation.
- **Why Existing Recovery Does Not Cover It**: Because the operations are separate writes, the window of failure inherently exists. While technically safe due to idempotency, it is technically an un-atomic write boundary.
- **Confidence Level**: Low severity (P2), but architecturally impure.

### 2. Secondary Command Handler Hardening
- **Exact File**: `ChecklistCommandHandler.ts`, `ResourceCommandHandler.ts`, and remaining operations in `HabitCommandHandler.ts` and `TaskCommandHandler.ts`.
- **Failure Condition**: Highly concurrent offline cross-partition operations.
- **Impact**: Unknown.
- **Why Existing Recovery Does Not Cover It**: While Workspace, Task (core), and Recycle Bin have received full mutex lock verification, the secondary commands have not been explicitly subjected to hostile concurrency tests.
- **Confidence Level**: Unverified.

## HISTORICAL (No Longer Apply)

The following vulnerabilities were mentioned in historical audits but are now superseded by architectural changes and no longer apply:

- **Semantic Data Loss via Stringification**: Fixed because `MoveReconciler` no longer naively merges conflicting string fields; it forks the entire entity.
- **Deletion Intent Loss**: Fixed via strict target validation and forking.
- **Notification Leak**: Fixed because `MoveReconciler` explicitly strips `notificationIds` from split-brain forks, allowing the `NotificationReconciler` to generate fresh native triggers.
