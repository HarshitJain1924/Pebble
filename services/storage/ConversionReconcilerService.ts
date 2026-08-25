import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { generateEntityFingerprint } from "@/shared/utils/fingerprint";
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

    const habitsMap = await HabitRepository.getHabits(op.sourceWorkspaceId);
    const habitExists = !!habitsMap[op.sourceId];

    if (!taskExists && habitExists) {
      console.warn(`[ConversionReconciler] Destination Task ${op.targetId} missing but source Habit exists. Rolling back.`);
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }

    if (taskExists && habitExists) {
      const task = tasksMap[op.targetId];
      const habit = habitsMap[op.sourceId];

      const targetMatches = op.targetCreatedAt ? task.createdAt === op.targetCreatedAt : true;
      const fingerprintMatches = op.targetFingerprint ? generateEntityFingerprint(task) === op.targetFingerprint : true;
      const sourceMatches = op.sourceRevision ? habit.revision === op.sourceRevision : true;

      if (!targetMatches || !fingerprintMatches) {
        console.warn(`[ConversionReconciler] Destination Task ${op.targetId} identity/fingerprint mismatch. Preserving source.`);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
        return;
      }

      if (!sourceMatches) {
        console.warn(`[ConversionReconciler] Source Habit ${op.sourceId} mutated (revision: ${habit.revision} vs expected: ${op.sourceRevision}). Preserving source.`);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
        return;
      }

      console.warn(`[ConversionReconciler] Both entities exist and match identity. Rolling forward by deleting source Habit ${op.sourceId}.`);
      await HabitRepository.deleteHabitUnlocked(op.sourceId, op.sourceWorkspaceId);
      
      const verifyHabitsMap = await HabitRepository.getHabits(op.sourceWorkspaceId);
      if (verifyHabitsMap[op.sourceId]) {
        throw new Error(`[ConversionReconciler] Durable write verification failed: Source Habit ${op.sourceId} still exists.`);
      }

      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }

    if (taskExists && !habitExists) {
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }

    if (!taskExists && !habitExists) {
      console.warn(`[ConversionReconciler] Both entities missing for operation ${op.operationId}. Removing journal.`);
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }
  }

  private static async reconcileTaskToHabit(op: ConversionJournalEntry): Promise<void> {
    // Check if the destination Habit actually exists in storage
    const habitsMap = await HabitRepository.getHabits(op.targetWorkspaceId);
    const habitExists = !!habitsMap[op.targetId];

    const tasksMap = await TaskRepository.getTasks(op.sourceWorkspaceId);
    const taskExists = !!tasksMap[op.sourceId];

    if (!habitExists && taskExists) {
      console.warn(`[ConversionReconciler] Destination Habit ${op.targetId} missing but source Task exists. Rolling back.`);
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }

    if (habitExists && taskExists) {
      const habit = habitsMap[op.targetId];
      const task = tasksMap[op.sourceId];

      const targetMatches = op.targetCreatedAt ? habit.createdAt === op.targetCreatedAt : true;
      const fingerprintMatches = op.targetFingerprint ? generateEntityFingerprint(habit) === op.targetFingerprint : true;
      const sourceMatches = op.sourceRevision ? task.revision === op.sourceRevision : true;

      if (!targetMatches || !fingerprintMatches) {
        console.warn(`[ConversionReconciler] Destination Habit ${op.targetId} identity/fingerprint mismatch. Preserving source.`);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
        return;
      }

      if (!sourceMatches) {
        console.warn(`[ConversionReconciler] Source Task ${op.sourceId} mutated (revision mismatch). Preserving source.`);
        await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
        return;
      }

      console.warn(`[ConversionReconciler] Both entities exist and match identity. Rolling forward by deleting source Task ${op.sourceId}.`);
      await TaskRepository.deleteTaskUnlocked(op.sourceId, op.sourceWorkspaceId);
      
      const verifyTasksMap = await TaskRepository.getTasks(op.sourceWorkspaceId);
      if (verifyTasksMap[op.sourceId]) {
        throw new Error(`[ConversionReconciler] Durable write verification failed: Source Task ${op.sourceId} still exists.`);
      }

      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }

    if (habitExists && !taskExists) {
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }

    if (!habitExists && !taskExists) {
      console.warn(`[ConversionReconciler] Both entities missing for operation ${op.operationId}. Removing journal.`);
      await ConversionJournalRepository.removeOperationUnlocked(op.operationId);
      return;
    }
  }
}
