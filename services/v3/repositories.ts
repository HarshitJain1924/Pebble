/**
 * repositories.ts
 * ───────────────
 * Consolidated Repository implementation for Pebble V3.
 * Data is partitioned by folderId in AsyncStorage.
 * Extends runtime mapping to support legacy frontend keys (workspaceId, payload)
 * while persisting clean V3 structure (folderId, body) in database files.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    Checklist,
    DEFAULT_FOLDER_ID,
    FocusSession,
    Folder,
    Habit,
    RecycleBinItem,
    Relationship,
    Resource,
    SystemEventLog,
    Task,
    UiState,
} from "./v3Types";

// ─── 1. Folder Repository ──────────────────────────────────────────────────

export class FolderRepository {
  private static readonly FOLDERS_KEY = "pebble:v3:folders";

  static async getFolders(): Promise<Folder[]> {
    try {
      const raw = await AsyncStorage.getItem(this.FOLDERS_KEY);
      if (!raw) return [];
      const folders: Folder[] = JSON.parse(raw);
      return folders.sort((a, b) => a.sortOrder - b.sortOrder);
    } catch (e) {
      console.warn("Failed to get V3 folders", e);
      return [];
    }
  }

  static async saveFolder(folder: Folder): Promise<void> {
    try {
      const folders = await this.getFolders();
      const idx = folders.findIndex((f) => f.id === folder.id);
      if (idx >= 0) {
        folders[idx] = { ...folder, updatedAt: Date.now() };
      } else {
        folders.push({ ...folder, updatedAt: Date.now() });
      }
      await AsyncStorage.setItem(this.FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.warn("Failed to save V3 folder", e);
    }
  }

  static async saveFolders(folders: Folder[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.warn("Failed to save V3 folders batch", e);
    }
  }

  static async deleteFolder(id: string): Promise<void> {
    try {
      let folders = await this.getFolders();
      folders = folders.filter((f) => f.id !== id);
      await AsyncStorage.setItem(this.FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.warn("Failed to delete V3 folder", e);
    }
  }
}

// ─── 2. Activity Repository ───────────────────────────────────────────────

export class ActivityRepository {
  private static getTasksKey(folderId: string) {
    return `pebble:v3:tasks:${folderId}`;
  }
  private static getHabitsKey(folderId: string) {
    return `pebble:v3:habits:${folderId}`;
  }
  private static getChecklistsKey(folderId: string) {
    return `pebble:v3:checklists:${folderId}`;
  }

  // Tasks
  static async getTask(id: string, folderId: string): Promise<Task | null> {
    const key = this.getTasksKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, Task> = JSON.parse(raw);
    const task = records[id] || null;
    if (task) {
      // Inject legacy compatibility fields
      return {
        ...task,
        workspaceId: task.folderId || folderId,
        dueDate: task.dueDate || task.scheduledDate,
      } as any;
    }
    return null;
  }

  static async getTasks(folderId: string): Promise<Record<string, Task>> {
    const key = this.getTasksKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, task]: [string, any]) => {
      records[id] = {
        ...task,
        workspaceId: task.folderId || folderId,
        dueDate: task.dueDate || task.scheduledDate,
      };
    });
    return records;
  }

  static async saveTask(task: any): Promise<void> {
    const folderId = task.folderId || task.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getTasksKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Task> = raw ? JSON.parse(raw) : {};

    const cleanTask: Task = {
      id: task.id,
      folderId,
      title: task.title,
      completed: task.completed,
      completedAt: task.completedAt,
      priority: task.priority || "medium",
      category: task.category || "work",
      createdAt: task.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: task.archived || false,
      description: task.description || undefined,
      scheduledDate: task.scheduledDate || task.dueDate || undefined,
      scheduledTime: task.scheduledTime || undefined,
      durationMinutes: task.durationMinutes || undefined,
      alarmTime: task.alarmTime || undefined,
      alarmId: task.alarmId || undefined,
      notificationIds: task.notificationIds || undefined,
    };

    records[task.id] = cleanTask;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteTask(id: string, folderId: string): Promise<void> {
    const key = this.getTasksKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Task> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  // Habits
  static async getHabit(id: string, folderId: string): Promise<Habit | null> {
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, Habit> = JSON.parse(raw);
    const habit = records[id] || null;
    if (habit) {
      return {
        ...habit,
        workspaceId: habit.folderId || folderId,
      } as any;
    }
    return null;
  }

  static async getHabits(folderId: string): Promise<Record<string, Habit>> {
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, habit]: [string, any]) => {
      records[id] = {
        ...habit,
        workspaceId: habit.folderId || folderId,
      };
    });
    return records;
  }

  static async saveHabit(habit: any): Promise<void> {
    const folderId = habit.folderId || habit.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Habit> = raw ? JSON.parse(raw) : {};

    const cleanHabit: Habit = {
      id: habit.id,
      folderId,
      title: habit.title,
      streak: habit.streak || 0,
      bestStreak: habit.bestStreak || 0,
      completedDates: habit.completedDates || [],
      recurrenceRule: habit.recurrenceRule || "FREQ=DAILY",
      priority: habit.priority || "medium",
      category: habit.category || "work",
      recurrence: habit.recurrence || undefined,
      createdAt: habit.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: habit.archived || false,
      description: habit.description || undefined,
      reminderHour: habit.reminderHour || undefined,
      reminderMinute: habit.reminderMinute || undefined,
      reminderDays: habit.reminderDays || undefined,
      notificationIds: habit.notificationIds || undefined,
    };

    records[habit.id] = cleanHabit;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteHabit(id: string, folderId: string): Promise<void> {
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Habit> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  // Checklists
  static async getChecklist(
    id: string,
    folderId: string,
  ): Promise<Checklist | null> {
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, Checklist> = JSON.parse(raw);
    const checklist = records[id] || null;
    if (checklist) {
      return {
        ...checklist,
        workspaceId: checklist.folderId || folderId,
      } as any;
    }
    return null;
  }

  static async getChecklists(
    folderId: string,
  ): Promise<Record<string, Checklist>> {
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, checklist]: [string, any]) => {
      records[id] = {
        ...checklist,
        workspaceId: checklist.folderId || folderId,
      };
    });
    return records;
  }

  static async saveChecklist(checklist: any): Promise<void> {
    const folderId =
      checklist.folderId || checklist.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Checklist> = raw ? JSON.parse(raw) : {};

    const cleanChecklist: Checklist = {
      id: checklist.id,
      folderId,
      title: checklist.title,
      createdAt: checklist.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: checklist.archived || false,
      items: checklist.items || [],
    };

    records[checklist.id] = cleanChecklist;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteChecklist(id: string, folderId: string): Promise<void> {
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Checklist> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}

// ─── 3. Resource Repository ───────────────────────────────────────────────

export class ResourceRepository {
  private static getResourcesKey(folderId: string) {
    return `pebble:v3:resources:${folderId}`;
  }

  static async getResource(
    id: string,
    folderId: string,
  ): Promise<Resource | null> {
    const key = this.getResourcesKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, Resource> = JSON.parse(raw);
    const resource = records[id] || null;
    if (resource) {
      return {
        ...resource,
        workspaceId: resource.folderId || folderId,
        payload: resource.body || resource.payload || {},
      } as any;
    }
    return null;
  }

  static async getResources(
    folderId: string,
  ): Promise<Record<string, Resource>> {
    const key = this.getResourcesKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, resource]: [string, any]) => {
      records[id] = {
        ...resource,
        workspaceId: resource.folderId || folderId,
        payload: resource.body || resource.payload || {},
        body: resource.body || resource.payload || {},
      };
    });
    return records;
  }

  static async saveResource(resource: any): Promise<void> {
    const folderId =
      resource.folderId || resource.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getResourcesKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Resource> = raw ? JSON.parse(raw) : {};

    const body = resource.body || resource.payload || {};

    const cleanResource: Resource = {
      id: resource.id,
      folderId,
      title: resource.title,
      resourceType: resource.resourceType,
      createdAt: resource.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: resource.archived || false,
      pinned: resource.pinned || false,
      tags: resource.tags || [],
      body,
    };

    records[resource.id] = cleanResource;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteResource(id: string, folderId: string): Promise<void> {
    const key = this.getResourcesKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Resource> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}

// ─── 4. Graph Repository ───────────────────────────────────────────────────

export interface RelationshipIndex {
  sourceIndex: Record<string, string[]>;
  targetIndex: Record<string, string[]>;
}

export class GraphRepository {
  private static readonly RELATIONSHIPS_KEY = "pebble:v3:relationships";
  private static readonly FOCUS_SESSIONS_KEY = "pebble:v3:focus_sessions";
  private static readonly SYSTEM_EVENT_LOG_KEY = "pebble:v3:system_event_log";

  private static relationships: Record<string, Relationship> = {};
  private static index: RelationshipIndex = {
    sourceIndex: {},
    targetIndex: {},
  };
  private static loaded = false;

  static resetCache() {
    this.relationships = {};
    this.index = {
      sourceIndex: {},
      targetIndex: {},
    };
    this.loaded = false;
  }

  private static async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(this.RELATIONSHIPS_KEY);
      this.relationships = raw ? JSON.parse(raw) : {};
      this.rebuildIndex();
      this.loaded = true;
    } catch (e) {
      console.warn("Failed to load V3 relationships", e);
    }
  }

  private static rebuildIndex() {
    const sourceIdx: Record<string, string[]> = {};
    const targetIdx: Record<string, string[]> = {};

    Object.values(this.relationships).forEach((rel) => {
      const sId = rel.source.id;
      const tId = rel.target.id;

      if (!sourceIdx[sId]) sourceIdx[sId] = [];
      if (!targetIdx[tId]) targetIdx[tId] = [];

      sourceIdx[sId].push(rel.id);
      targetIdx[tId].push(rel.id);
    });

    this.index = { sourceIndex: sourceIdx, targetIndex: targetIdx };
  }

  static async saveRelationship(rel: Relationship): Promise<void> {
    await this.ensureLoaded();
    this.relationships[rel.id] = rel;
    this.rebuildIndex();
    await AsyncStorage.setItem(
      this.RELATIONSHIPS_KEY,
      JSON.stringify(this.relationships),
    );
  }

  static async deleteRelationship(id: string): Promise<void> {
    await this.ensureLoaded();
    if (this.relationships[id]) {
      delete this.relationships[id];
      this.rebuildIndex();
      await AsyncStorage.setItem(
        this.RELATIONSHIPS_KEY,
        JSON.stringify(this.relationships),
      );
    }
  }

  static async getBacklinks(itemId: string): Promise<Relationship[]> {
    await this.ensureLoaded();
    const relIds = this.index.targetIndex[itemId] || [];
    return relIds.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getForwardLinks(itemId: string): Promise<Relationship[]> {
    await this.ensureLoaded();
    const relIds = this.index.sourceIndex[itemId] || [];
    return relIds.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getRelated(itemId: string): Promise<Relationship[]> {
    await this.ensureLoaded();
    const back = this.index.targetIndex[itemId] || [];
    const forward = this.index.sourceIndex[itemId] || [];
    const union = Array.from(new Set([...back, ...forward]));
    return union.map((id) => this.relationships[id]).filter(Boolean);
  }

  // Focus Sessions
  static async saveFocusSession(session: any): Promise<void> {
    const raw = await AsyncStorage.getItem(this.FOCUS_SESSIONS_KEY);
    const sessions: FocusSession[] = raw ? JSON.parse(raw) : [];

    const folderId =
      session.folderId || session.workspaceId || DEFAULT_FOLDER_ID;
    const target = session.target ||
      session.linkedItem || { id: "", type: "task" };

    const cleanSession: FocusSession = {
      id: session.id,
      folderId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      target,
      // legacy fields
      workspaceId: folderId,
      linkedItem: target,
    } as any;

    sessions.push(cleanSession);
    await AsyncStorage.setItem(
      this.FOCUS_SESSIONS_KEY,
      JSON.stringify(sessions),
    );
  }

  static async getFocusSessions(folderId?: string): Promise<FocusSession[]> {
    const raw = await AsyncStorage.getItem(this.FOCUS_SESSIONS_KEY);
    const sessions: FocusSession[] = raw ? JSON.parse(raw) : [];
    if (folderId) {
      return sessions.filter(
        (s) => s.folderId === folderId || (s as any).workspaceId === folderId,
      );
    }
    return sessions;
  }

  // System Event Logs
  static async logSystemEvent(event: any): Promise<void> {
    const raw = await AsyncStorage.getItem(this.SYSTEM_EVENT_LOG_KEY);
    const logs: SystemEventLog[] = raw ? JSON.parse(raw) : [];

    const folderId = event.folderId || event.workspaceId || DEFAULT_FOLDER_ID;

    const cleanLog: SystemEventLog = {
      id: event.id,
      folderId,
      itemId: event.itemId,
      itemType: event.itemType,
      action: event.action,
      timestamp: event.timestamp,
      metadata: event.metadata,
      // legacy fields
      workspaceId: folderId,
    } as any;

    logs.push(cleanLog);
    await AsyncStorage.setItem(this.SYSTEM_EVENT_LOG_KEY, JSON.stringify(logs));
  }

  static async getSystemEvents(folderId?: string): Promise<SystemEventLog[]> {
    const raw = await AsyncStorage.getItem(this.SYSTEM_EVENT_LOG_KEY);
    const logs: SystemEventLog[] = raw ? JSON.parse(raw) : [];
    if (folderId) {
      return logs.filter(
        (l) => l.folderId === folderId || (l as any).workspaceId === folderId,
      );
    }
    return logs;
  }
}

// ─── 5. Recycle Bin Repository ─────────────────────────────────────────────

export class RecycleBinRepository {
  private static readonly RECYCLE_BIN_KEY = "pebble:v3:recycle_bin";
  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  static async getRecycleBinItems(): Promise<RecycleBinItem[]> {
    try {
      const raw = await AsyncStorage.getItem(this.RECYCLE_BIN_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("Failed to get recycle bin items", e);
      return [];
    }
  }

  static async saveRecycleBinItems(items: RecycleBinItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.RECYCLE_BIN_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("Failed to save recycle bin items", e);
    }
  }

  static async addToRecycleBin(
    itemType: RecycleBinItem["itemType"],
    item: any,
    originalFolderId: string,
  ): Promise<void> {
    try {
      const items = await this.getRecycleBinItems();
      const newItem: RecycleBinItem = {
        id: item.id || String(Date.now()),
        title: item.title || item.name || "Untitled",
        deletedAt: Date.now(),
        itemType,
        originalFolderId,
        snapshot: JSON.stringify(item),
      };
      await this.saveRecycleBinItems([newItem, ...items]);
    } catch (e) {
      console.warn("Failed to add item to recycle bin", e);
    }
  }

  static async cleanupRecycleBin(): Promise<void> {
    try {
      const items = await this.getRecycleBinItems();
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * this.DAY_MS;
      const remaining = items.filter((item) => item.deletedAt >= thirtyDaysAgo);
      if (remaining.length !== items.length) {
        await this.saveRecycleBinItems(remaining);
      }
    } catch (e) {
      console.warn("Recycle bin cleanup failed", e);
    }
  }
}

export async function clearV3RepositoryStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => key.startsWith("pebble:v3:"));
    const extraKeys = ["pebble:schema_version"];

    await AsyncStorage.multiRemove([...keysToRemove, ...extraKeys]);
    GraphRepository.resetCache();
  } catch (e) {
    console.warn("Failed to clear V3 repository storage", e);
  }
}

// ─── 6. UI State Repository ───────────────────────────────────────────────

export class UiStateRepository {
  private static readonly UI_STATE_KEY = "pebble:v3:ui_state";

  static async getUiState(): Promise<UiState> {
    try {
      const raw = await AsyncStorage.getItem(this.UI_STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to read V3 UiState", e);
    }
    return {
      activeFolderId: DEFAULT_FOLDER_ID,
      completedOnboarding: false,
      themeCache: "dark",
    };
  }

  static async saveUiState(state: Partial<UiState>): Promise<void> {
    try {
      const current = await this.getUiState();
      const updated = { ...current, ...state };
      await AsyncStorage.setItem(this.UI_STATE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save V3 UiState", e);
    }
  }
}
