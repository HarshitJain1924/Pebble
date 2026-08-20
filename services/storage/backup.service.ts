import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
  GraphRepository,
} from "@/repositories";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { getSettings, getProfile } from "@/features/settings/services/settings.service";
import { INBOX_WORKSPACE_ID, type Workspace, type Task, type Habit, type Checklist, type Resource, type FocusSession, type Relationship, type SystemEventLog } from "@/shared/types/domain.types";
import { clearRepositoryStorage } from "./storage-utils";
import { deduplicateEntities } from "@/shared/utils/deduplication";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
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

    const workspaces = await WorkspaceRepository.getWorkspaces();
    const workspaceIds = Array.from(new Set([INBOX_WORKSPACE_ID, ...workspaces.map((w) => w.id)]));

    const tasks: Task[] = [];
    const habits: Habit[] = [];
    const checklists: Checklist[] = [];
    const resources: Resource[] = [];

    for (const wsId of workspaceIds) {
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
    
    // For relationships, we must read the internal state or get all. 
    // Since getRelated is per item, we might need to read raw for relationships.
    const relsRaw = await AsyncStorage.getItem("pebble:v1:relationships");
    const relationshipsMap = relsRaw ? JSON.parse(relsRaw) : {};
    const relationships = Object.values(relationshipsMap) as Relationship[];

    const settings = await getSettings();
    const profile = await getProfile();

    const stripNotificationIds = <T extends { reminder?: { notificationIds?: string[] } }>(entity: T): T => {
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
      workspaces,
      tasks: deduplicateEntities(tasks.map(stripNotificationIds)),
      habits: deduplicateEntities(habits.map(stripNotificationIds)),
      checklists: deduplicateEntities(checklists),
      resources: deduplicateEntities(resources),
      recycleBin: recycleBin.map(binItem => {
        if (binItem.entityType === 'task' || binItem.entityType === 'habit') {
           try {
             const parsed = JSON.parse(binItem.snapshot);
             return { ...binItem, snapshot: JSON.stringify(stripNotificationIds(parsed)) };
           } catch { return binItem; }
        }
        return binItem;
      }),
      focusSessions,
      relationships,
      systemEvents,
      settings,
      profile,
    };

    return JSON.stringify(backup, null, 2);
  }

  /**
   * Restores application state from a structured JSON backup.
   */
  static async restoreStructuredBackup(jsonString: string): Promise<void> {
    let parsed: Partial<AppBackup>;
    try {
      parsed = JSON.parse(jsonString) as Partial<AppBackup>;
    } catch (e) {
      throw new Error("Invalid backup format: Not valid JSON.");
    }

    if (!parsed.version || !parsed.workspaces || !Array.isArray(parsed.workspaces)) {
      throw new Error("Invalid backup format: missing version or core data.");
    }

    if (parsed.version !== 1) {
      throw new Error(
        `Unsupported backup version: ${parsed.version}. Only version 1 backups are supported.`,
      );
    }

    const workspaceIds = new Set([INBOX_WORKSPACE_ID, ...parsed.workspaces.map((w: Workspace) => w.id)]);
    const kvPairsToSet: [string, string][] = [];

    // Stage Workspaces
    kvPairsToSet.push(["pebble:v1:workspaces", JSON.stringify(parsed.workspaces)]);

    // Stage Workspace-Scoped Entities
    const tasksByWs = this.groupByWorkspace(parsed.tasks || []);
    const habitsByWs = this.groupByWorkspace(parsed.habits || []);
    const checklistsByWs = this.groupByWorkspace(parsed.checklists || []);
    const resourcesByWs = this.groupByWorkspace(parsed.resources || []);

    for (const wsId of Array.from(workspaceIds)) {
      const tsMap: Record<string, Task> = {};
      (tasksByWs[wsId] || []).forEach((t: Task) => tsMap[t.id] = t);
      kvPairsToSet.push([`pebble:v1:tasks:${wsId}`, JSON.stringify(tsMap)]);

      const hsMap: Record<string, Habit> = {};
      (habitsByWs[wsId] || []).forEach((h: Habit) => hsMap[h.id] = h);
      kvPairsToSet.push([`pebble:v1:habits:${wsId}`, JSON.stringify(hsMap)]);

      const csMap: Record<string, Checklist> = {};
      (checklistsByWs[wsId] || []).forEach((c: Checklist) => csMap[c.id] = c);
      kvPairsToSet.push([`pebble:v1:checklists:${wsId}`, JSON.stringify(csMap)]);

      const rsMap: Record<string, Resource> = {};
      (resourcesByWs[wsId] || []).forEach((r: Resource) => rsMap[r.id] = r);
      kvPairsToSet.push([`pebble:v1:resources:${wsId}`, JSON.stringify(rsMap)]);
    }

    // Stage Global Entities
    if (parsed.recycleBin && parsed.recycleBin.length > 0) {
      kvPairsToSet.push(["pebble:v1:recycle_bin", JSON.stringify(parsed.recycleBin)]);
    } else {
      kvPairsToSet.push(["pebble:v1:recycle_bin", "[]"]);
    }

    if (parsed.focusSessions && parsed.focusSessions.length > 0) {
      kvPairsToSet.push(["pebble:v1:focus_sessions", JSON.stringify(parsed.focusSessions)]);
    } else {
      kvPairsToSet.push(["pebble:v1:focus_sessions", "[]"]);
    }

    if (parsed.systemEvents && parsed.systemEvents.length > 0) {
      kvPairsToSet.push(["pebble:v1:system_event_log", JSON.stringify(parsed.systemEvents)]);
    } else {
      kvPairsToSet.push(["pebble:v1:system_event_log", "[]"]);
    }

    if (parsed.relationships && parsed.relationships.length > 0) {
      const relMap: Record<string, Relationship> = {};
      parsed.relationships.forEach((r: Relationship) => relMap[r.id] = r);
      kvPairsToSet.push(["pebble:v1:relationships", JSON.stringify(relMap)]);
    } else {
      kvPairsToSet.push(["pebble:v1:relationships", "{}"]);
    }

    // Stage Settings & Profile
    if (parsed.settings) kvPairsToSet.push(["pebble:settings", JSON.stringify(parsed.settings)]);
    if (parsed.profile) kvPairsToSet.push(["pebble:profile", JSON.stringify(parsed.profile)]);

    // Snapshot Current State
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => {
      return key.startsWith("pebble:");
    });

    // Read current values to allow rollback
    const currentDataRaw = await AsyncStorage.multiGet(keysToRemove);
    const validRollbackData = currentDataRaw.filter(pair => pair[1] !== null) as [string, string][];

    try {
      // Execute Atomic Write (Domain Commit Point)
      await AsyncStorage.multiRemove(keysToRemove);
      await AsyncStorage.multiSet(kvPairsToSet);
      
      // Explicitly reconcile any pending moves that might have been backed up.
      await MoveReconcilerService.reconcileAll();
      GraphRepository.resetCache();
    } catch (e) {
      // Rollback on Failure
      console.warn("[BackupService] Restore failed during write. Attempting rollback...", e);
      try {
        const newlySetKeys = kvPairsToSet.map(k => k[0]);
        await AsyncStorage.multiRemove(newlySetKeys);
        await AsyncStorage.multiSet(validRollbackData);
      } catch (rollbackError) {
        console.error("[BackupService] CRITICAL: Rollback failed!", rollbackError);
      }
      throw e;
    }

    // Attempt OS Notification flush AFTER successful domain commit.
    // Pre-restore notifications MUST NOT survive, as they may share item IDs
    // but have entirely different schedules in the incoming backup.
    // If this fails, the reconciler will eventually repair it, but we MUST NOT roll back domain state.
    try {
      if (typeof Notifications.cancelAllScheduledNotificationsAsync === "function") {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (e) {
      console.warn("[BackupService] Failed to flush OS notifications after successful restore.", e);
    }
  }

  private static groupByWorkspace<T extends { workspaceId?: string }>(items: T[]): Record<string, T[]> {
    const map: Record<string, T[]> = {};
    for (const item of items) {
      const ws = item.workspaceId || INBOX_WORKSPACE_ID;
      if (!map[ws]) map[ws] = [];
      map[ws].push(item);
    }
    return map;
  }
}
