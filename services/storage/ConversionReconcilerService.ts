import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { HabitRepository, TaskRepository } from "@/repositories";
import { withLocks } from "@/shared/utils/mutex";
import type { ConversionJournalEntry } from "@/shared/types/domain.types";

export class ConversionReconcilerService {
  private static readonly RECONCILER_LOCK = "pebble:v1:reconciler_running";

  /**
   * Idempotently replay all pending conversion operations in the journal.
   * Guarantees crash-safe resolution for Habit <-> Task conversions.
   */
  static async reconcileAll(): Promise<void> {
    await withLocks([this.RECONCILER_LOCK], async () => {
      const operations = await ConversionJournalRepository.getOperations();
      if (operations.length === 0) return;

      console.log(`[ConversionReconciler] Found ${operations.length} pending conversion operations.`);

      for (const op of operations) {
        try {
          await this.reconcileOperation(op);
        } catch (e) {
          console.error(`[ConversionReconciler] Failed to reconcile operation ${op.operationId}`, e);
          // Throw so that if called during Backup, the backup crashes rather than serializing duplicates.
          throw e;
        }
      }
    });
  }

  private static getPartitionKey(entityType: string, workspaceId: string): string {
    return `pebble:v1:${entityType}s:${workspaceId}`;
  }

  private static async reconcileOperation(op: ConversionJournalEntry): Promise<void> {
    // 1. Determine partition names based on operationType
    const isHabitToTask = op.operationType === "habit_to_task";
    const habitsKey = this.getPartitionKey("habit", isHabitToTask ? op.sourceWorkspaceId : op.targetWorkspaceId);
    const tasksKey = this.getPartitionKey("task", isHabitToTask ? op.targetWorkspaceId : op.sourceWorkspaceId);
    const journalKey = "pebble:v1:conversion_journal";

    // 2. Alphabetical sort to prevent ABBA deadlocks
    const sortedKeys = [journalKey, habitsKey, tasksKey].sort();

    await withLocks(sortedKeys, async () => {
      if (isHabitToTask) {
        await this.reconcileHabitToTask(op);
      } else {
        await this.reconcileTaskToHabit(op);
      }
    });
  }

  private static async reconcileHabitToTask(op: ConversionJournalEntry): Promise<void> {
    // Check if the destination Task actually exists in storage
    const tasksMap = await TaskRepository.getTasks(op.targetWorkspaceId);
    const taskExists = !!tasksMap[op.targetId];

    if (op.phase === "PREPARED") {
      // The journal says we intended to convert, but we don't know if the destination wrote.
      if (taskExists) {
        // Destination WAS written before crash. Roll forward.
        console.warn(`[ConversionReconciler] Found PREPARED but destination Task ${op.targetId} exists. Rolling forward.`);
        await HabitRepository.deleteHabitUnlocked(op.sourceId, op.sourceWorkspaceId);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      } else {
        // Destination was NOT written. Roll back safely.
        console.warn(`[ConversionReconciler] Found PREPARED and destination Task ${op.targetId} is missing. Rolling back.`);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      }
    } else if (op.phase === "DESTINATION_WRITTEN") {
      // The journal says the destination was definitively written.
      // We must roll forward.
      console.log(`[ConversionReconciler] Found DESTINATION_WRITTEN. Finalizing source deletion.`);
      await HabitRepository.deleteHabitUnlocked(op.sourceId, op.sourceWorkspaceId);
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
    }
  }

  private static async reconcileTaskToHabit(op: ConversionJournalEntry): Promise<void> {
    // Check if the destination Habit actually exists in storage
    const habitsMap = await HabitRepository.getHabits(op.targetWorkspaceId);
    const habitExists = !!habitsMap[op.targetId];

    if (op.phase === "PREPARED") {
      if (habitExists) {
        // Destination WAS written. Roll forward.
        console.warn(`[ConversionReconciler] Found PREPARED but destination Habit ${op.targetId} exists. Rolling forward.`);
        await TaskRepository.deleteTaskUnlocked(op.sourceId, op.sourceWorkspaceId);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      } else {
        // Destination was NOT written. Roll back.
        console.warn(`[ConversionReconciler] Found PREPARED and destination Habit ${op.targetId} is missing. Rolling back.`);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      }
    } else if (op.phase === "DESTINATION_WRITTEN") {
      console.log(`[ConversionReconciler] Found DESTINATION_WRITTEN. Finalizing source deletion.`);
      await TaskRepository.deleteTaskUnlocked(op.sourceId, op.sourceWorkspaceId);
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
    }
  }
}
