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
import { getSettings, getProfile, saveSettings, saveProfile } from "@/features/settings/services/settings.service";
import { INBOX_WORKSPACE_ID, type Workspace, type Task, type Habit, type Checklist, type Resource, type FocusSession, type Relationship, type SystemEventLog } from "@/shared/types/domain.types";
import { clearRepositoryStorage } from "./storage-utils";

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

    const backup: AppBackup = {
      version: 1,
      timestamp: Date.now(),
      workspaces,
      tasks,
      habits,
      checklists,
      resources,
      recycleBin,
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
    const parsed = JSON.parse(jsonString) as Partial<AppBackup>;

    if (!parsed.version || !parsed.workspaces) {
      throw new Error("Invalid backup format: missing version or core data.");
    }

    if (parsed.version !== 1) {
      throw new Error(
        `Unsupported backup version: ${parsed.version}. Only version 1 backups are supported.`,
      );
    }

    // 1. Clear existing domain data to avoid merging orphaned items
    await clearRepositoryStorage();

    // 2. Restore Workspaces
    await WorkspaceRepository.saveWorkspaces(parsed.workspaces || []);

    // 3. Restore Workspace-Scoped Entities
    const workspaceIds = Array.from(new Set([INBOX_WORKSPACE_ID, ...(parsed.workspaces || []).map((w) => w.id)]));
    
    const tasksByWs = this.groupByWorkspace(parsed.tasks || []);
    const habitsByWs = this.groupByWorkspace(parsed.habits || []);
    const checklistsByWs = this.groupByWorkspace(parsed.checklists || []);
    const resourcesByWs = this.groupByWorkspace(parsed.resources || []);

    for (const wsId of workspaceIds) {
      await TaskRepository.saveTasks(tasksByWs[wsId] || [], wsId);
      
      const hsMap: Record<string, Habit> = {};
      (habitsByWs[wsId] || []).forEach((h: Habit) => hsMap[h.id] = h);
      await AsyncStorage.setItem(`pebble:v1:habits:${wsId}`, JSON.stringify(hsMap));

      const csMap: Record<string, Checklist> = {};
      (checklistsByWs[wsId] || []).forEach((c: Checklist) => csMap[c.id] = c);
      await AsyncStorage.setItem(`pebble:v1:checklists:${wsId}`, JSON.stringify(csMap));

      const rsMap: Record<string, Resource> = {};
      (resourcesByWs[wsId] || []).forEach((r: Resource) => rsMap[r.id] = r);
      await AsyncStorage.setItem(`pebble:v1:resources:${wsId}`, JSON.stringify(rsMap));
    }

    // 4. Restore Global Entities
    if (parsed.recycleBin && parsed.recycleBin.length > 0) {
      await RecycleBinRepository.saveRecycleBinItems(parsed.recycleBin, { throwOnError: false });
    }

    if (parsed.focusSessions && parsed.focusSessions.length > 0) {
      await AsyncStorage.setItem("pebble:v1:focus_sessions", JSON.stringify(parsed.focusSessions));
    }

    if (parsed.systemEvents && parsed.systemEvents.length > 0) {
      await AsyncStorage.setItem("pebble:v1:system_event_log", JSON.stringify(parsed.systemEvents));
    }

    if (parsed.relationships && parsed.relationships.length > 0) {
      const relMap: Record<string, Relationship> = {};
      parsed.relationships.forEach(r => relMap[r.id] = r);
      await AsyncStorage.setItem("pebble:v1:relationships", JSON.stringify(relMap));
    }
    GraphRepository.resetCache();

    // 5. Restore Settings & Profile
    if (parsed.settings) await saveSettings(parsed.settings);
    if (parsed.profile) await saveProfile(parsed.profile);
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
