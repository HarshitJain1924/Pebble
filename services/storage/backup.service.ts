import {
  getProfile,
  getSettings,
} from "@/features/settings/services/settings.service";
import {
  ChecklistRepository,
  GraphRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import {
  INBOX_WORKSPACE_ID,
  type Checklist,
  type FocusSession,
  type Habit,
  type Relationship,
  type Resource,
  type SystemEventLog,
  type Task,
  type Workspace,
} from "@/shared/types/domain.types";
import { deduplicateEntities } from "@/shared/utils/deduplication";
import { withLock } from "@/shared/utils/mutex";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

export interface AppBackup {
  version: number;
  timestamp: number;
  workspaces: Workspace[];
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  resources: Resource[];
  recycleBin: any[];
  focusSessions: FocusSession[];
  relationships: Relationship[];
  systemEvents: SystemEventLog[];
  settings: any;
  profile: any;
}

export class BackupService {
  /**
   * Generates a structured JSON backup of the entire application state.
   */
  static async generateStructuredBackup(): Promise<string> {
    await MoveReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();

    while (true) {
      // 1. Initial read of workspaces to determine the lock keys.
      const initialWorkspaces = await WorkspaceRepository.getWorkspaces();
      const initialWorkspaceIds = Array.from(
        new Set([INBOX_WORKSPACE_ID, ...initialWorkspaces.map((w) => w.id)]),
      );

      const rawLockKeys = [
        "pebble:v1:conversion_journal",
        "pebble:v1:move_journal",
        "pebble:v1:recycle_bin",
        "pebble:v1:workspaces",
      ];
      for (const wsId of initialWorkspaceIds) {
        rawLockKeys.push(`pebble:v1:tasks:${wsId}`);
        rawLockKeys.push(`pebble:v1:habits:${wsId}`);
        rawLockKeys.push(`pebble:v1:checklists:${wsId}`);
        rawLockKeys.push(`pebble:v1:resources:${wsId}`);
      }

      let retry = false;
      let backupJson = "";

      // 2. Acquire global locks in sorted order to prevent all cross-partition and
      //    lifecycle mutations, guaranteeing a consistent snapshot.
      await this._acquireRestoreLocks(rawLockKeys, async () => {
        // Re-read workspaces inside the lock to verify the lock set is completely up to date.
        // Because we hold pebble:v1:workspaces, no workspace can be created, deleted,
        // or updated while we are inside this callback.
        const currentWorkspaces = await WorkspaceRepository.getWorkspaces();
        const currentWorkspaceIds = Array.from(
          new Set([INBOX_WORKSPACE_ID, ...currentWorkspaces.map((w) => w.id)]),
        );

        // If workspaces changed between discovery (outside the lock) and lock acquisition,
        // our acquired partition locks are stale. Release locks and retry.
        const initialSet = new Set(initialWorkspaceIds);
        const currentSet = new Set(currentWorkspaceIds);
        const isStale =
          initialWorkspaceIds.length !== currentWorkspaceIds.length ||
          !currentWorkspaceIds.every((id) => initialSet.has(id)) ||
          !initialWorkspaceIds.every((id) => currentSet.has(id));

        if (isStale) {
          retry = true;
          return;
        }

        const tasks: Task[] = [];
        const habits: Habit[] = [];
        const checklists: Checklist[] = [];
        const resources: Resource[] = [];

        for (const wsId of currentWorkspaceIds) {
          const tsMap = await TaskRepository.getTasks(wsId);
          tasks.push(...Object.values(tsMap));

          const hsMap = await HabitRepository.getHabits(wsId);
          habits.push(...Object.values(hsMap));

          const csMap = await ChecklistRepository.getChecklists(wsId);
          checklists.push(...Object.values(csMap));

          const rsMap = await ResourceRepository.getResources(wsId);
          resources.push(...Object.values(rsMap));
        }

        const recycleBin = await RecycleBinRepository.getRecycleBinItems();
        const focusSessions = await GraphRepository.getFocusSessions();
        const systemEvents = await GraphRepository.getSystemEvents();

        const relsRaw = await AsyncStorage.getItem("pebble:v1:relationships");
        const relationshipsMap = relsRaw ? JSON.parse(relsRaw) : {};
        const relationships = Object.values(relationshipsMap) as Relationship[];

        const settings = await getSettings();
        const profile = await getProfile();

        const stripNotificationIds = <
          T extends { reminder?: { notificationIds?: string[] } },
        >(
          entity: T,
        ): T => {
          if (entity.reminder && entity.reminder.notificationIds) {
            return {
              ...entity,
              reminder: {
                ...entity.reminder,
                notificationIds: undefined,
              },
            };
          }
          return entity;
        };

        const backup: AppBackup = {
          version: 1,
          timestamp: Date.now(),
          workspaces: currentWorkspaces,
          tasks: deduplicateEntities(tasks.map(stripNotificationIds)),
          habits: deduplicateEntities(habits.map(stripNotificationIds)),
          checklists: deduplicateEntities(checklists),
          resources: deduplicateEntities(resources),
          recycleBin: recycleBin.map((binItem) => {
            if (binItem.entityType === "task" || binItem.entityType === "habit") {
              try {
                const parsed = JSON.parse(binItem.snapshot);
                return {
                  ...binItem,
                  snapshot: JSON.stringify(stripNotificationIds(parsed)),
                };
              } catch {
                return binItem;
              }
            }
            return binItem;
          }),
          focusSessions,
          relationships,
          systemEvents,
          settings,
          profile,
        };

        backupJson = JSON.stringify(backup, null, 2);
      });

      if (!retry) {
        return backupJson;
      }
    }
  }

  /**
   * Helper to consistently acquire the global lock hierarchy for restores.
   */
  private static async _acquireRestoreLocks(
    rawLockKeys: string[],
    execute: () => Promise<void>,
  ): Promise<void> {
    const getLockPriority = (key: string): number => {
      if (key === "pebble:v1:conversion_journal") return 1;
      if (key === "pebble:v1:move_journal") return 2;
      if (key === "pebble:v1:recycle_bin") return 3;
      if (
        key.startsWith("pebble:v1:") &&
        !key.includes("move_journal") &&
        !key.includes("recycle_bin") &&
        !key.includes("conversion_journal")
      )
        return 1;
      return 4;
    };

    const lockKeys = rawLockKeys.sort((a, b) => {
      const pA = getLockPriority(a);
      const pB = getLockPriority(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b);
    });

    const acquireLocksInOrder = async (index: number): Promise<void> => {
      if (index >= lockKeys.length) return execute();
      return withLock(lockKeys[index], async () => acquireLocksInOrder(index + 1));
    };

    await acquireLocksInOrder(0);
  }

  /**
   * Recovers from an interrupted restore process.
   */
  static async recoverInterruptedRestore(): Promise<void> {
    const intentRaw = await AsyncStorage.getItem("pebble:v1:backup_restore_intent");
    if (!intentRaw) return;

    console.warn("[BackupService] Interrupted restore detected. Recovering...");
    try {
      const intent = JSON.parse(intentRaw);
      if (intent.keysToRemove && intent.kvPairsToSet) {
        const newlySetKeys = intent.kvPairsToSet.map((k: [string, string]) => k[0]);
        const requiredLocks = [
          "pebble:v1:conversion_journal",
          "pebble:v1:move_journal",
          "pebble:v1:recycle_bin",
        ];
        const rawLockKeys = Array.from(
          new Set([...intent.keysToRemove, ...newlySetKeys, ...requiredLocks]),
        );

        await this._acquireRestoreLocks(rawLockKeys, async () => {
          // RE-VALIDATE INTENT AFTER ACQUIRING LOCKS to prevent stale intent race
          const currentIntentRaw = await AsyncStorage.getItem("pebble:v1:backup_restore_intent");
          if (currentIntentRaw !== intentRaw) {
            console.warn("[BackupService] Interrupted restore intent changed or was removed while waiting for locks. Aborting stale recovery.");
            return;
          }

          await AsyncStorage.multiRemove(intent.keysToRemove);
          await AsyncStorage.multiSet(intent.kvPairsToSet);
          GraphRepository.resetCache();
          
          // Remove intent safely inside the lock
          await AsyncStorage.removeItem("pebble:v1:backup_restore_intent");
        });
      } else {
        // If it was malformed, remove it
        await AsyncStorage.removeItem("pebble:v1:backup_restore_intent");
      }
    } catch (e) {
      console.error("[BackupService] CRITICAL: Failed to recover interrupted restore", e);
      throw e;
    }
  }

  /**
   * Restores application state from a structured JSON backup.
   */
  static async restoreStructuredBackup(jsonString: string): Promise<void> {
    await this.recoverInterruptedRestore();

    // Reconcile pending moves BEFORE taking a snapshot or locks, to ensure active storage is clean.
    await MoveReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();

    let parsed: Partial<AppBackup>;
    try {
      parsed = JSON.parse(jsonString) as Partial<AppBackup>;
    } catch (e) {
      throw new Error("Invalid backup format: Not valid JSON.");
    }

    if (
      !parsed.version ||
      !parsed.workspaces ||
      !Array.isArray(parsed.workspaces)
    ) {
      throw new Error("Invalid backup format: missing version or core data.");
    }

    if (parsed.version !== 1) {
      throw new Error(
        `Unsupported backup version: ${parsed.version}. Only version 1 backups are supported.`,
      );
    }

    const workspaceIds = new Set([
      INBOX_WORKSPACE_ID,
      ...parsed.workspaces.map((w: Workspace) => w.id),
    ]);
    const kvPairsToSet: [string, string][] = [];

    // Stage Workspaces
    kvPairsToSet.push([
      "pebble:v1:workspaces",
      JSON.stringify(parsed.workspaces),
    ]);

    // Stage Workspace-Scoped Entities
    const tasksByWs = this.groupByWorkspace(parsed.tasks || []);
    const habitsByWs = this.groupByWorkspace(parsed.habits || []);
    const checklistsByWs = this.groupByWorkspace(parsed.checklists || []);
    const resourcesByWs = this.groupByWorkspace(parsed.resources || []);

    for (const wsId of Array.from(workspaceIds)) {
      const tsMap: Record<string, Task> = {};
      (tasksByWs[wsId] || []).forEach((t: Task) => (tsMap[t.id] = t));
      kvPairsToSet.push([`pebble:v1:tasks:${wsId}`, JSON.stringify(tsMap)]);

      const hsMap: Record<string, Habit> = {};
      (habitsByWs[wsId] || []).forEach((h: Habit) => (hsMap[h.id] = h));
      kvPairsToSet.push([`pebble:v1:habits:${wsId}`, JSON.stringify(hsMap)]);

      const csMap: Record<string, Checklist> = {};
      (checklistsByWs[wsId] || []).forEach((c: Checklist) => (csMap[c.id] = c));
      kvPairsToSet.push([
        `pebble:v1:checklists:${wsId}`,
        JSON.stringify(csMap),
      ]);

      const rsMap: Record<string, Resource> = {};
      (resourcesByWs[wsId] || []).forEach((r: Resource) => (rsMap[r.id] = r));
      kvPairsToSet.push([`pebble:v1:resources:${wsId}`, JSON.stringify(rsMap)]);
    }

    // Stage Global Entities
    if (parsed.recycleBin && parsed.recycleBin.length > 0) {
      kvPairsToSet.push([
        "pebble:v1:recycle_bin",
        JSON.stringify(parsed.recycleBin),
      ]);
    } else {
      kvPairsToSet.push(["pebble:v1:recycle_bin", "[]"]);
    }

    if (parsed.focusSessions && parsed.focusSessions.length > 0) {
      kvPairsToSet.push([
        "pebble:v1:focus_sessions",
        JSON.stringify(parsed.focusSessions),
      ]);
    } else {
      kvPairsToSet.push(["pebble:v1:focus_sessions", "[]"]);
    }

    if (parsed.systemEvents && parsed.systemEvents.length > 0) {
      kvPairsToSet.push([
        "pebble:v1:system_event_log",
        JSON.stringify(parsed.systemEvents),
      ]);
    } else {
      kvPairsToSet.push(["pebble:v1:system_event_log", "[]"]);
    }

    if (parsed.relationships && parsed.relationships.length > 0) {
      const relMap: Record<string, Relationship> = {};
      parsed.relationships.forEach((r: Relationship) => (relMap[r.id] = r));
      kvPairsToSet.push(["pebble:v1:relationships", JSON.stringify(relMap)]);
    } else {
      kvPairsToSet.push(["pebble:v1:relationships", "{}"]);
    }

    // Stage Settings & Profile
    if (parsed.settings)
      kvPairsToSet.push(["pebble:settings", JSON.stringify(parsed.settings)]);
    if (parsed.profile)
      kvPairsToSet.push(["pebble:profile", JSON.stringify(parsed.profile)]);

    while (true) {
      // Snapshot Current State
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter((key) => {
        return key.startsWith("pebble:") && key !== "pebble:v1:backup_restore_intent";
      });

      // Determine all keys that will be involved (either read, removed, or set)
      const newlySetKeys = kvPairsToSet.map((k) => k[0]);
      // Force inclusion of logical locks that must be respected during restore,
      // regardless of whether they physically exist in AsyncStorage right now.
      const requiredLocks = [
        "pebble:v1:conversion_journal",
        "pebble:v1:move_journal",
        "pebble:v1:recycle_bin",
      ];
      const rawLockKeys = Array.from(
        new Set([...keysToRemove, ...newlySetKeys, ...requiredLocks]),
      );

      let retry = false;

      await this._acquireRestoreLocks(rawLockKeys, async () => {
        // Refresh keysToRemove inside the lock in case new keys were created while waiting
        const lockedKeys = await AsyncStorage.getAllKeys();
        const finalKeysToRemove = lockedKeys.filter((key) =>
          key.startsWith("pebble:") && key !== "pebble:v1:backup_restore_intent",
        );

        // Verify that every key in finalKeysToRemove was actually locked in rawLockKeys.
        // If a new key was created between pre-lock discovery and lock acquisition,
        // we do not hold its lock, so we must release locks and retry.
        const rawLockSet = new Set(rawLockKeys);
        const hasUnlockedKeys = finalKeysToRemove.some((k) => !rawLockSet.has(k));

        if (hasUnlockedKeys) {
          retry = true;
          return;
        }

        // Final concurrency check to prevent silent MoveJournal destruction
        const pendingMoves = await MoveJournalRepository.getOperations();
        if (pendingMoves.length > 0) {
          throw new Error(
            "Concurrent move detected. Cannot safely restore backup while moves are pending.",
          );
        }

        // Final concurrency check to prevent silent ConversionJournal destruction
        const pendingConversions =
          await ConversionJournalRepository.getOperations();
        if (pendingConversions.length > 0) {
          throw new Error(
            "Concurrent conversion detected. Cannot safely restore backup while conversions are pending.",
          );
        }

        // Read current values to allow rollback
        const currentDataRaw = await AsyncStorage.multiGet(finalKeysToRemove);
        const validRollbackData = currentDataRaw.filter(
          (pair) => pair[1] !== null,
        ) as [string, string][];

        try {
          // Write durable intent BEFORE modifying anything
          await AsyncStorage.setItem("pebble:v1:backup_restore_intent", JSON.stringify({
            keysToRemove: finalKeysToRemove,
            kvPairsToSet: kvPairsToSet
          }));

          // Execute Atomic Write (Domain Commit Point)
          await AsyncStorage.multiRemove(finalKeysToRemove);
          await AsyncStorage.multiSet(kvPairsToSet);

          // Remove intent
          await AsyncStorage.removeItem("pebble:v1:backup_restore_intent");

          // Explicitly reset cache immediately after domain commit, while still under lock
          GraphRepository.resetCache();
        } catch (writeError) {
          console.warn(
            "[BackupService] Restore failed during write. Attempting rollback...",
            writeError,
          );
          try {
            await AsyncStorage.multiRemove(newlySetKeys);
            await AsyncStorage.multiSet(validRollbackData);
            await AsyncStorage.removeItem("pebble:v1:backup_restore_intent");
          } catch (rollbackError) {
            console.error(
              "[BackupService] CRITICAL: Rollback failed!",
              rollbackError,
            );
          }
          throw writeError;
        }
      });

      if (!retry) {
        break;
      }
    }

    // Attempt OS Notification flush AFTER successful domain commit.
    // Pre-restore notifications MUST NOT survive, as they may share item IDs
    // but have entirely different schedules in the incoming backup.
    // If this fails, the reconciler will eventually repair it, but we MUST NOT roll back domain state.
    try {
      if (
        typeof Notifications.cancelAllScheduledNotificationsAsync === "function"
      ) {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (e) {
      console.warn(
        "[BackupService] Failed to flush OS notifications after successful restore.",
        e,
      );
    }
  }

  private static groupByWorkspace<T extends { workspaceId?: string }>(
    items: T[],
  ): Record<string, T[]> {
    const map: Record<string, T[]> = {};
    for (const item of items) {
      const ws = item.workspaceId || INBOX_WORKSPACE_ID;
      if (!map[ws]) map[ws] = [];
      map[ws].push(item);
    }
    return map;
  }
}
