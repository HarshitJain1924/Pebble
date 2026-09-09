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
  UiStateRepository,
  WorkspaceRepository,
} from "@/repositories";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import {
  getGratitudeHistory,
  GRATITUDE_HISTORY_STORAGE_KEY,
} from "@/services/storage/storage.service";
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

export const PEBBLE_STORAGE_PREFIXES = [
  "pebble:",
  "todoapp:",
  "@pebble_",
  "PEBBLE_",
];

export function isPebbleOwnedKey(key: string): boolean {
  return PEBBLE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

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
  uiState?: any;
  gratitudeHistory?: any[];
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
        const relationships = await GraphRepository.getAllRelationships();
        const settings = await getSettings();
        const profile = await getProfile();
        const uiState = await UiStateRepository.getUiState();
        const gratitudeHistory = await getGratitudeHistory();

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
          uiState,
          gratitudeHistory,
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
   * Validates an incoming parsed backup payload strictly before any mutations or lock acquisitions.
   * Throws an Error with a descriptive message if the backup is malformed, has an unsupported version,
   * contains invalid entity shapes, or has broken cross-entity references.
   */
  static validateBackupPayload(parsed: any): void {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid backup format: Root must be an object.");
    }

    if (
      parsed.version === undefined ||
      parsed.workspaces === undefined ||
      !Array.isArray(parsed.workspaces)
    ) {
      throw new Error("Invalid backup format: missing version or core data.");
    }

    if (parsed.version !== 1) {
      throw new Error(
        `Unsupported backup version: ${parsed.version}. Only version 1 backups are supported.`,
      );
    }

    // Validate section structures if present
    const arraySections = [
      ["tasks", parsed.tasks],
      ["habits", parsed.habits],
      ["checklists", parsed.checklists],
      ["resources", parsed.resources],
      ["recycleBin", parsed.recycleBin],
      ["focusSessions", parsed.focusSessions],
      ["relationships", parsed.relationships],
      ["systemEvents", parsed.systemEvents],
      ["gratitudeHistory", parsed.gratitudeHistory],
    ] as const;

    for (const [sectionName, value] of arraySections) {
      if (value !== undefined && !Array.isArray(value)) {
        throw new Error(
          `Invalid backup format: '${sectionName}' must be an array.`,
        );
      }
    }

    const objectSections = [
      ["settings", parsed.settings],
      ["profile", parsed.profile],
      ["uiState", parsed.uiState],
    ] as const;

    for (const [sectionName, value] of objectSections) {
      if (
        value !== undefined &&
        (typeof value !== "object" || value === null || Array.isArray(value))
      ) {
        throw new Error(
          `Invalid backup format: '${sectionName}' must be an object.`,
        );
      }
    }

    // Validate workspaces
    for (const ws of parsed.workspaces) {
      if (
        !ws ||
        typeof ws !== "object" ||
        typeof ws.id !== "string" ||
        !ws.id.trim()
      ) {
        throw new Error(
          "Invalid backup format: Every workspace must have a non-empty string ID.",
        );
      }
    }

    const validWorkspaceIds = new Set([
      INBOX_WORKSPACE_ID,
      ...parsed.workspaces.map((w: any) => w.id),
    ]);

    // Validate tasks
    if (parsed.tasks) {
      for (const t of parsed.tasks) {
        if (
          !t ||
          typeof t !== "object" ||
          typeof t.id !== "string" ||
          !t.id.trim()
        ) {
          throw new Error(
            "Invalid backup format: Every task must have a non-empty string ID.",
          );
        }
        if (typeof t.title !== "string") {
          throw new Error(
            `Invalid backup format: Task ${t.id} must have a valid title.`,
          );
        }
        if (t.workspaceId && !validWorkspaceIds.has(t.workspaceId)) {
          throw new Error(
            `Invalid reference: Task ${t.id} references non-existent workspace ${t.workspaceId}.`,
          );
        }
      }
    }

    // Validate habits
    if (parsed.habits) {
      for (const h of parsed.habits) {
        if (
          !h ||
          typeof h !== "object" ||
          typeof h.id !== "string" ||
          !h.id.trim()
        ) {
          throw new Error(
            "Invalid backup format: Every habit must have a non-empty string ID.",
          );
        }
        if (typeof h.title !== "string") {
          throw new Error(
            `Invalid backup format: Habit ${h.id} must have a valid title.`,
          );
        }
        if (h.workspaceId && !validWorkspaceIds.has(h.workspaceId)) {
          throw new Error(
            `Invalid reference: Habit ${h.id} references non-existent workspace ${h.workspaceId}.`,
          );
        }
      }
    }

    // Validate checklists
    if (parsed.checklists) {
      for (const c of parsed.checklists) {
        if (
          !c ||
          typeof c !== "object" ||
          typeof c.id !== "string" ||
          !c.id.trim()
        ) {
          throw new Error(
            "Invalid backup format: Every checklist must have a non-empty string ID.",
          );
        }
        if (typeof c.title !== "string") {
          throw new Error(
            `Invalid backup format: Checklist ${c.id} must have a valid title.`,
          );
        }
        if (c.items !== undefined && !Array.isArray(c.items)) {
          throw new Error(
            `Invalid backup format: Checklist ${c.id} items must be an array.`,
          );
        }
        if (c.workspaceId && !validWorkspaceIds.has(c.workspaceId)) {
          throw new Error(
            `Invalid reference: Checklist ${c.id} references non-existent workspace ${c.workspaceId}.`,
          );
        }
      }
    }

    // Validate resources
    if (parsed.resources) {
      for (const r of parsed.resources) {
        if (
          !r ||
          typeof r !== "object" ||
          typeof r.id !== "string" ||
          !r.id.trim()
        ) {
          throw new Error(
            "Invalid backup format: Every resource must have a non-empty string ID.",
          );
        }
        if (typeof r.title !== "string") {
          throw new Error(
            `Invalid backup format: Resource ${r.id} must have a valid title.`,
          );
        }
        if (r.workspaceId && !validWorkspaceIds.has(r.workspaceId)) {
          throw new Error(
            `Invalid reference: Resource ${r.id} references non-existent workspace ${r.workspaceId}.`,
          );
        }
      }
    }

    // Validate recycle bin items
    if (parsed.recycleBin) {
      for (const item of parsed.recycleBin) {
        if (
          !item ||
          typeof item !== "object" ||
          typeof item.id !== "string" ||
          !item.id.trim()
        ) {
          throw new Error(
            "Invalid backup format: Every recycle bin item must have a valid ID.",
          );
        }
      }
    }

    // Validate settings if present
    if (parsed.settings) {
      if (
        parsed.settings.theme !== undefined &&
        !["dark", "light", "system"].includes(parsed.settings.theme)
      ) {
        throw new Error(
          "Invalid backup format: Settings theme must be 'dark', 'light', or 'system'.",
        );
      }
      if (
        parsed.settings.quietHours !== undefined &&
        (typeof parsed.settings.quietHours !== "object" ||
          parsed.settings.quietHours === null ||
          Array.isArray(parsed.settings.quietHours))
      ) {
        throw new Error(
          "Invalid backup format: Settings quietHours must be an object.",
        );
      }
      if (
        parsed.settings.categories !== undefined &&
        (typeof parsed.settings.categories !== "object" ||
          parsed.settings.categories === null ||
          Array.isArray(parsed.settings.categories))
      ) {
        throw new Error(
          "Invalid backup format: Settings categories must be an object.",
        );
      }
    }

    // Validate profile if present
    if (parsed.profile) {
      if (
        parsed.profile.name !== undefined &&
        typeof parsed.profile.name !== "string"
      ) {
        throw new Error("Invalid backup format: Profile name must be a string.");
      }
      if (
        parsed.profile.email !== undefined &&
        typeof parsed.profile.email !== "string"
      ) {
        throw new Error("Invalid backup format: Profile email must be a string.");
      }
    }
  }

  /**
   * Restores application state from a structured JSON backup.
   */
  static async restoreStructuredBackup(jsonString: string): Promise<void> {
    if (typeof jsonString !== "string" || !jsonString.trim()) {
      throw new Error("Invalid backup format: Not valid JSON.");
    }

    let parsed: Partial<AppBackup>;
    try {
      parsed = JSON.parse(jsonString) as Partial<AppBackup>;
    } catch {
      throw new Error("Invalid backup format: Not valid JSON.");
    }

    // STRICT VALIDATION BEFORE MUTATION:
    // Any malformed data, unsupported version, or broken reference fails here,
    // before any locks are acquired and before existing state is touched.
    this.validateBackupPayload(parsed);

    await this.recoverInterruptedRestore();

    // Reconcile pending moves BEFORE taking a snapshot or locks, to ensure active storage is clean.
    await MoveReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();

    const workspaceIds = new Set([
      INBOX_WORKSPACE_ID,
      ...parsed.workspaces!.map((w: Workspace) => w.id),
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

    // Stage UiState
    const defaultActiveWsId =
      parsed.workspaces && parsed.workspaces.length > 0
        ? parsed.workspaces[0].id
        : INBOX_WORKSPACE_ID;
    const restoredTheme =
      parsed.settings?.theme === "light"
        ? "light"
        : "dark";
    const stagedUiState = {
      activeWorkspaceId:
        parsed.uiState?.activeWorkspaceId !== undefined
          ? parsed.uiState.activeWorkspaceId
          : defaultActiveWsId,
      completedOnboarding: true,
      themeCache: parsed.uiState?.themeCache || restoredTheme,
    };
    kvPairsToSet.push(["pebble:v1:ui_state", JSON.stringify(stagedUiState)]);

    // Stage Gratitude History (if provided)
    if (parsed.gratitudeHistory && Array.isArray(parsed.gratitudeHistory)) {
      kvPairsToSet.push([
        GRATITUDE_HISTORY_STORAGE_KEY,
        JSON.stringify(parsed.gratitudeHistory),
      ]);
    }

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
          await AsyncStorage.setItem(
            "pebble:v1:backup_restore_intent",
            JSON.stringify({
              keysToRemove: finalKeysToRemove,
              kvPairsToSet: kvPairsToSet,
            }),
          );

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

    // Reconcile OS notifications for restored entities
    try {
      const { NotificationReconcilerService } = await import(
        "@/services/notifications/NotificationReconcilerService"
      );
      await NotificationReconcilerService.reconcileAll();
    } catch (e) {
      console.warn(
        "[BackupService] Failed to reconcile notifications after restore.",
        e,
      );
    }

    // Emit state changes across all domains
    try {
      const { emitStateChange } = await import("@/services/events/state-events");
      emitStateChange("workspace_changed", "backup_service");
      emitStateChange("tasks_changed", "backup_service");
      emitStateChange("habits_changed", "backup_service");
      emitStateChange("checklists_changed", "backup_service");
      emitStateChange("resources_changed", "backup_service");
      emitStateChange("settings_changed", "backup_service");
      emitStateChange("profile_changed", "backup_service");
      emitStateChange("pebbles_changed", "backup_service");
      emitStateChange("focus_changed", "backup_service");
    } catch (e) {
      console.warn(
        "[BackupService] Failed to emit state events after restore.",
        e,
      );
    }
  }

  /**
   * Orchestrates a complete, safe wipe of all application-owned persistent state.
   * Acquires hierarchical locks over all affected keys, removes all Pebble-owned data,
   * cancels OS notifications, resets in-memory caches, and emits all state refresh events.
   */
  static async clearAllData(): Promise<void> {
    try {
      await MoveReconcilerService.reconcileAll();
      await ConversionReconcilerService.reconcileAll();
    } catch (e) {
      console.warn(
        "[BackupService] Failed to reconcile journals before clearAllData",
        e,
      );
    }

    while (true) {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(isPebbleOwnedKey);

      const requiredLocks = [
        "pebble:v1:conversion_journal",
        "pebble:v1:move_journal",
        "pebble:v1:recycle_bin",
        "pebble:v1:workspaces",
        "pebble:settings",
        "pebble:profile",
        "pebble:v1:ui_state",
      ];
      const rawLockKeys = Array.from(
        new Set([...keysToRemove, ...requiredLocks]),
      );

      let retry = false;

      await this._acquireRestoreLocks(rawLockKeys, async () => {
        const lockedKeys = await AsyncStorage.getAllKeys();
        const finalKeysToRemove = lockedKeys.filter(isPebbleOwnedKey);

        const rawLockSet = new Set(rawLockKeys);
        const hasUnlockedKeys = finalKeysToRemove.some((k) => !rawLockSet.has(k));

        if (hasUnlockedKeys) {
          retry = true;
          return;
        }

        if (finalKeysToRemove.length > 0) {
          await AsyncStorage.multiRemove(finalKeysToRemove);
        }

        GraphRepository.resetCache();
      });

      if (!retry) {
        break;
      }
    }

    // Cancel all scheduled notifications
    try {
      if (
        typeof Notifications.cancelAllScheduledNotificationsAsync === "function"
      ) {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (e) {
      console.warn(
        "[BackupService] Failed to cancel OS notifications during clearAllData",
        e,
      );
    }

    // Emit all state refresh events
    try {
      const { emitStateChange } = await import("@/services/events/state-events");
      emitStateChange("workspace_changed", "clear_all_data");
      emitStateChange("tasks_changed", "clear_all_data");
      emitStateChange("habits_changed", "clear_all_data");
      emitStateChange("checklists_changed", "clear_all_data");
      emitStateChange("resources_changed", "clear_all_data");
      emitStateChange("settings_changed", "clear_all_data");
      emitStateChange("profile_changed", "clear_all_data");
      emitStateChange("pebbles_changed", "clear_all_data");
      emitStateChange("focus_changed", "clear_all_data");
    } catch (e) {
      console.warn(
        "[BackupService] Failed to emit events during clearAllData",
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
