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
- `pebble:v1:move_journal` - Pending cross-workspace moves
- `pebble:v1:conversion_journal` - Pending task<->habit conversions

## 3. Repository Responsibilities
Repositories (e.g. `TaskRepository.ts`, `WorkspaceRepository.ts`) are pure data-access objects.
- They enforce exact storage keys and structural normalizations.
- They do NOT contain complex side-effect logic or cross-partition orchestrations.
- They expose both locked (`saveTasks`) and unlocked (`saveTasksUnlocked`) variants for composition in Command Handlers.

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
Implemented in `BackupService.ts`.
- **Integrity**: Restore operations perform domain writes inside a `try/catch` block. However, if the domain commit fails, the rollback relies exclusively on JS-memory operations (a `multiRemove` followed by a `multiSet` of original state). This rollback is NOT a durable ACID transaction, meaning a crash during the rollback window will leave the application state corrupted or empty.
- **Isolation**: Native OS operations (like cancelling notifications) are executed *after* the domain commit. Native OS exceptions will not roll back successful domain persistence.

## 12. Task/Habit Revision Semantics
Implemented in `TaskRepository.ts` and `HabitRepository.ts`.
- **Invariant**: `newRevision = (persistedRevision || 0) + 1`
- During bulk writes, the authoritative revision is dynamically derived from the *current persisted state*, rejecting stale client memory states.

## 13. Notification Persistence & Reconciliation
Implemented in `NotificationReconcilerService.ts` and `reminders.service.ts`.
- **Source of Truth**: The domain entity (`task.reminder.triggerAt`) is the sole source of truth.
- **Ephemeral Native State**: The OS-level scheduled notification IDs are considered ephemeral. 
- **Reconciliation**: On startup, `NotificationReconcilerService` scans all entities and rebuilds any missing OS notifications, ensuring eventual consistency.

## 14. Startup Recovery Sequence
At boot, Pebble runs the following idempotently:
1. `MoveReconcilerService.reconcileAll()`
2. `ConversionReconcilerService.reconcileAll()`
3. `NotificationReconcilerService.reconcile()`

## 15. Crash-Recovery Guarantees
- Cross-workspace moves will eventually complete via journal.
- Entity conversions will eventually roll forward or roll back.
- If the system crashes mid-write, AsyncStorage provides atomic single-key writes or atomic `multiSet` block writes.
- If a target workspace is deleted while a move is pending, data is retained in the source or the source's recycle bin snapshot.

## 16. Known Limitations
- Native SQLite is not used; `AsyncStorage` forces string serialization overhead on large arrays.
- `FlatList` performance degrades on extremely deeply nested `Checklist` structures (as noted in `docs/architecture/decision_log.md`).

## 17. Current Test-Suite Status
- **Total Tests**: 731 passing
- **Total Suites**: 86 passing
- (Recorded at 2026-08-25).

## 18. Explicit List of Verified Integrity Mechanisms
- **Monotonic Revisions**: `TaskRepository.ts` (lines 140+).
- **Recycle Bin Locked RMW**: `RecycleBinRepository.ts` (lines 53+).
- **Split-Brain Conflict Forking**: `MoveReconcilerService.ts` (Case D).
- **Move Target Existence Check**: `MoveReconcilerService.ts` (`targetExists` validation).
- **Native OS Isolation in Backup**: `BackupService.ts` (`restoreStructuredBackup`).
- **Alphabetical Lock Acquisition**: `mutex.ts` (`withLocks`).
