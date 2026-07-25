import { type Checklist, Resource, type RecycleBinItem } from "@/shared/types/domain.types";
import {
    TaskRepository,
    HabitRepository,
    ChecklistRepository,
    WorkspaceRepository,
    RecycleBinRepository,
    ResourceRepository,
} from "@/repositories";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const TODOS_STORAGE_KEY = "pebble:tasks";
export const DAILY_STORAGE_KEY = "pebble:habits";
export const HISTORY_STORAGE_KEY = "pebble:history";
export const PROFILE_STORAGE_KEY = "pebble:profile";
export const SETTINGS_STORAGE_KEY = "pebble:settings";
export const NOTIF_LOG_STORAGE_KEY = "pebble:notifications:log";
export const RECYCLE_BIN_STORAGE_KEY = "pebble:recycle_bin";
export const VAULT_STORAGE_KEY = "pebble:vault";
export const COLLECTIONS_STORAGE_KEY = "pebble:collections";
export const CHECKLISTS_STORAGE_KEY = "pebble:checklists";
export const DASHBOARD_FILTER_STORAGE_KEY = "todoapp:dashboard:filter";
export const DASHBOARD_PRIORITY_STORAGE_KEY = "todoapp:dashboard:priority";
const GRATITUDE_HISTORY_STORAGE_KEY = "todoapp:gratitude_history";

export const DAY_MS = 24 * 60 * 60 * 1000;

export async function getRecycleBinItems(): Promise<RecycleBinItem[]> {
  try {
    const repositoryItems = await RecycleBinRepository.getRecycleBinItems();
    return repositoryItems.map((item) => {
      let restoredType: any = "task";
      if (item.itemType === "habit") restoredType = "habit";
      else if (item.itemType === "checklist") restoredType = "checklist";
      else if (item.itemType === "resource") restoredType = "collection_item";
      else if (item.itemType === "folder") restoredType = "workspace";

      let parsedData = {};
      try {
        parsedData = JSON.parse(item.snapshot);
      } catch (e) {}

      return {
        id: item.id,
        title: item.title,
        deletedAt: item.deletedAt,
        itemType: restoredType,
        originalLocation: item.originalFolderId,
        data: parsedData,
      };
    });
  } catch (e) {
    console.warn("Failed to read recycle bin items", e);
    return [];
  }
}

export async function saveRecycleBinItems(
  items: RecycleBinItem[],
): Promise<void> {
  try {
    const repositoryItems = items.map((item) => {
      let itemType: any = "task";
      if (item.itemType === "habit") itemType = "habit";
      else if (item.itemType === "checklist") itemType = "checklist";
      else if (
        item.itemType === "collection_item" ||
        item.itemType === "vault" ||
        item.itemType === "collection"
      )
        itemType = "resource";
      else if (item.itemType === "workspace") itemType = "folder";

      return {
        id: item.id,
        title: item.title,
        deletedAt: item.deletedAt,
        itemType,
        originalFolderId: item.originalLocation,
        snapshot: JSON.stringify(item.data || {}),
      };
    });
    await RecycleBinRepository.saveRecycleBinItems(repositoryItems);
  } catch (e) {
    console.warn("Failed to save recycle bin items", e);
  }
}

export async function addToRecycleBin(
  itemType:
    | "task"
    | "habit"
    | "workspace"
    | "vault"
    | "collection"
    | "collection_item"
    | "checklist"
    | "checklist_item",
  data: any,
  originalLocation: string,
): Promise<void> {
  try {
    let type: any = "task";
    if (itemType === "habit") type = "habit";
    else if (itemType === "checklist") type = "checklist";
    else if (
      itemType === "collection_item" ||
      itemType === "vault" ||
      itemType === "collection"
    )
      type = "resource";
    else if (itemType === "workspace") type = "folder";

    const payload = data;

    await RecycleBinRepository.addToRecycleBin(type, payload, originalLocation);
  } catch (e) {
    console.warn("Failed to add item to recycle bin", e);
  }
}

export async function cleanupRecycleBin(): Promise<void> {
  try {
    await RecycleBinRepository.cleanupRecycleBin();
  } catch (e) {
    console.warn("Recycle bin auto-cleanup failed", e);
  }
}

export interface RecycledIds {
  workspaceIds: Set<string>;
  taskIds: Set<string>;
  habitIds: Set<string>;
  titles: Set<string>;
}

export async function getRecycledIds(): Promise<RecycledIds> {
  const items = await getRecycleBinItems();
  const workspaceIds = new Set<string>();
  const taskIds = new Set<string>();
  const habitIds = new Set<string>();
  const titles = new Set<string>();

  for (const item of items) {
    if (item.itemType === "workspace") {
      workspaceIds.add(item.id);
      titles.add(item.title.toLowerCase().trim());
      if (item.data) {
        if (Array.isArray(item.data.todos)) {
          for (const t of item.data.todos) {
            if (t?.id) {
              taskIds.add(t.id);
              if (t.title) titles.add(t.title.toLowerCase().trim());
            }
          }
        }
        if (Array.isArray(item.data.habits)) {
          for (const h of item.data.habits) {
            if (h?.id) {
              habitIds.add(h.id);
              if (h.title) titles.add(h.title.toLowerCase().trim());
            }
          }
        }
      }
    } else if (item.itemType === "task") {
      taskIds.add(item.id);
      titles.add(item.title.toLowerCase().trim());
    } else if (item.itemType === "habit") {
      habitIds.add(item.id);
      titles.add(item.title.toLowerCase().trim());
    }
  }

  return { workspaceIds, taskIds, habitIds, titles };
}

export async function getVaultItems(): Promise<Record<string, any[]>> {
  try {
    const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    console.warn("Failed to read vault items", e);
    return {};
  }
}

export async function saveVaultItems(
  items: Record<string, any[]>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("Failed to save vault items", e);
  }
}



export async function getChecklists(): Promise<Record<string, Checklist[]>> {
  try {
    const checklistsRaw = await AsyncStorage.getItem(CHECKLISTS_STORAGE_KEY);
    if (checklistsRaw) {
      return JSON.parse(checklistsRaw) || {};
    }
    return {};
  } catch (e) {
    console.warn("Failed to read checklists", e);
    return {};
  }
}

export async function saveChecklists(
  checklists: Record<string, Checklist[]>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CHECKLISTS_STORAGE_KEY,
      JSON.stringify(checklists),
    );
  } catch (e) {
    console.warn("Failed to save checklists", e);
  }
}

// ─── Gratitude History ──────────────────────────────────────────────

export type GratitudeHistoryEntry = {
  id: string;
  text: string;
  timestamp: number;
};

export async function getGratitudeHistory(): Promise<GratitudeHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(GRATITUDE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to read gratitude history", e);
    return [];
  }
}

export async function appendGratitudeHistoryEntry(
  entry: GratitudeHistoryEntry,
): Promise<void> {
  try {
    const history = await getGratitudeHistory();
    history.push(entry);
    await AsyncStorage.setItem(
      GRATITUDE_HISTORY_STORAGE_KEY,
      JSON.stringify(history),
    );
  } catch (e) {
    console.warn("Failed to save gratitude history", e);
  }
}

// ─── Dashboard Filters ────────────────────────────────────────────────

export async function getDashboardFilters(): Promise<{
  filter: string | null;
  priority: string | null;
}> {
  try {
    const [filter, priority] = await Promise.all([
      AsyncStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY),
      AsyncStorage.getItem(DASHBOARD_PRIORITY_STORAGE_KEY),
    ]);
    return { filter, priority };
  } catch (e) {
    console.warn("Failed to read dashboard filters", e);
    return { filter: null, priority: null };
  }
}

export async function saveDashboardFilter(filter: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DASHBOARD_FILTER_STORAGE_KEY, filter);
  } catch (e) {
    console.warn("Failed to save dashboard filter", e);
  }
}

export async function saveDashboardPriority(priority: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DASHBOARD_PRIORITY_STORAGE_KEY, priority);
  } catch (e) {
    console.warn("Failed to save dashboard priority", e);
  }
}

// ─── Restore Recycle Bin Items ────────────────────────────────────────

export async function restoreRecycleBinItems(
  itemsToRestore: RecycleBinItem[],
): Promise<void> {
  if (itemsToRestore.length === 0) return;

  const { rescheduleTodoReminders, rescheduleHabitReminders } =
    await import("@/services/scheduling/reminders.service");
  const { emitStateChange } = await import("@/services/events/state-events");

  let tasksRestored = false;
  let habitsRestored = false;
  let foldersRestored = false;
  let checklistsRestored = false;
  let vaultRestored = false;

  for (const item of itemsToRestore) {
    if (item.itemType === "task") {
      const rescheduled = await rescheduleTodoReminders(item.data);
      await TaskRepository.saveTask(rescheduled);
      tasksRestored = true;
    } else if (item.itemType === "habit") {
      const rescheduled = await rescheduleHabitReminders(item.data);
      await HabitRepository.saveHabit(rescheduled);
      habitsRestored = true;
    } else if (item.itemType === "workspace") {
      // Restore list/folder metadata
      await WorkspaceRepository.saveWorkspace(item.data.list);
      foldersRestored = true;

      // Restore child tasks & habits
      if (item.data.todos) {
        for (const t of item.data.todos) {
          const rescheduled = await rescheduleTodoReminders(t);
          await TaskRepository.saveTask(rescheduled);
        }
        tasksRestored = true;
      }
      if (item.data.habits) {
        for (const h of item.data.habits) {
          const rescheduled = await rescheduleHabitReminders(h);
          await HabitRepository.saveHabit(rescheduled);
        }
        habitsRestored = true;
      }
    } else if (
      item.itemType === "collection_item" ||
      item.itemType === "vault" ||
      item.itemType === "resource"
    ) {
      await ResourceRepository.saveResource(item.data);
      vaultRestored = true;
    } else if (item.itemType === "checklist") {
      await ChecklistRepository.saveChecklist(item.data);
      checklistsRestored = true;
    }
  }

  if (tasksRestored) emitStateChange("tasks_changed");
  if (habitsRestored) emitStateChange("habits_changed");
  if (foldersRestored) emitStateChange("workspace_mode_changed");
  if (vaultRestored) emitStateChange("resources_changed");
  if (checklistsRestored) emitStateChange("checklists_changed");

  const binItems = await getRecycleBinItems();
  const restoreIds = new Set(itemsToRestore.map((i) => i.id));
  const remaining = binItems.filter((i) => !restoreIds.has(i.id));
  await saveRecycleBinItems(remaining);
}

