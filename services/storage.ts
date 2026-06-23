import AsyncStorage from "@react-native-async-storage/async-storage";
import { type RecycleBinItem, type Todo, type Habit, type Collection, type CollectionItem } from "@/modules/types";

export const TODOS_STORAGE_KEY = "todoapp:v1";
export const DAILY_STORAGE_KEY = "todoapp:daily:v1";
export const HISTORY_STORAGE_KEY = "todoapp:history:v1";
export const PROFILE_STORAGE_KEY = "todoapp:profile:v1";
export const SETTINGS_STORAGE_KEY = "todoapp:settings:v1";
export const NOTIF_LOG_STORAGE_KEY = "todoapp:notifications:log:v1";
export const RECYCLE_BIN_STORAGE_KEY = "todoapp:recycle_bin:v1";
export const VAULT_STORAGE_KEY = "todoapp:vault:v1";
export const COLLECTIONS_STORAGE_KEY = "todoapp:collections:v1";

export const DAY_MS = 24 * 60 * 60 * 1000;

export async function getRecycleBinItems(): Promise<RecycleBinItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECYCLE_BIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.items || [];
  } catch (e) {
    console.warn("Failed to read recycle bin items", e);
    return [];
  }
}

export async function saveRecycleBinItems(items: RecycleBinItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECYCLE_BIN_STORAGE_KEY, JSON.stringify({ items }));
  } catch (e) {
    console.warn("Failed to save recycle bin items", e);
  }
}

export async function cleanupRecycleBin(): Promise<void> {
  try {
    const items = await getRecycleBinItems();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * DAY_MS;
    const remaining = items.filter((item) => item.deletedAt >= thirtyDaysAgo);
    
    if (remaining.length !== items.length) {
      // Cancel reminders for permanently deleted items
      const deleted = items.filter((item) => item.deletedAt < thirtyDaysAgo);
      const { cancelReminderIds } = await import("./reminders");
      for (const item of deleted) {
        if (item.itemType === "task" || item.itemType === "habit") {
          if (item.data?.notificationIds) {
            await cancelReminderIds(item.data.notificationIds);
          }
        } else if (item.itemType === "workspace") {
          if (item.data?.todos) {
            for (const t of item.data.todos) {
              if (t.notificationIds) await cancelReminderIds(t.notificationIds);
            }
          }
          if (item.data?.habits) {
            for (const h of item.data.habits) {
              if (h.notificationIds) await cancelReminderIds(h.notificationIds);
            }
          }
        }
      }
      await saveRecycleBinItems(remaining);
    }
  } catch (e) {
    console.warn("Recycle bin auto-cleanup failed", e);
  }
}

export async function addToRecycleBin(
  itemType: "task" | "habit" | "workspace" | "vault" | "collection" | "collection_item",
  data: any,
  originalLocation: string
): Promise<void> {
  try {
    const items = await getRecycleBinItems();
    const newItem: RecycleBinItem = {
      id: itemType === "workspace" ? data.list?.id : (data.id || String(Date.now())),
      title:
        itemType === "workspace"
          ? data.list?.name
          : itemType === "collection"
            ? data.name
            : (data.title || "Untitled"),
      deletedAt: Date.now(),
      itemType,
      originalLocation,
      data,
    };
    await saveRecycleBinItems([newItem, ...items]);
  } catch (e) {
    console.warn("Failed to add item to recycle bin", e);
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

export async function saveVaultItems(items: Record<string, any[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("Failed to save vault items", e);
  }
}

export async function getCollections(): Promise<Record<string, Collection[]>> {
  try {
    const collectionsRaw = await AsyncStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (collectionsRaw) {
      return JSON.parse(collectionsRaw) || {};
    }

    // Trigger migration if collections do not exist yet but legacy vault items do
    const legacyVaultRaw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
    if (legacyVaultRaw) {
      const legacyVault: Record<string, any[]> = JSON.parse(legacyVaultRaw) || {};
      const migratedCollections: Record<string, Collection[]> = {};

      Object.entries(legacyVault).forEach(([folderId, items]) => {
        if (!items || items.length === 0) return;

        const defaultCollection: Collection = {
          id: `migrated-quick-captures-${folderId}-${Date.now()}`,
          workspaceId: folderId,
          name: "Quick Captures",
          emoji: "⚡",
          createdAt: Date.now(),
          items: items.map((item: any) => ({
            id: item.id || String(Date.now() + Math.random()),
            type: (item.type === "idea" ? "note" : item.type) || "note",
            title: item.title,
            content: item.content || undefined,
            url: item.url || undefined,
            createdAt: item.createdAt || Date.now(),
            archived: item.archived || false,
          })),
        };
        migratedCollections[folderId] = [defaultCollection];
      });

      await AsyncStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(migratedCollections));
      return migratedCollections;
    }

    return {};
  } catch (e) {
    console.warn("Failed to read collections", e);
    return {};
  }
}

export async function saveCollections(collections: Record<string, Collection[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
  } catch (e) {
    console.warn("Failed to save collections", e);
  }
}

export async function restoreRecycleBinItems(itemsToRestore: RecycleBinItem[]): Promise<void> {
  if (itemsToRestore.length === 0) return;

  const { rescheduleTodoReminders, rescheduleHabitReminders } = await import("./reminders");
  const { emitStateChange } = await import("./stateEvents");

  const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
  const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);

  const todosState = rawTodos ? JSON.parse(rawTodos) : { lists: [], selectedList: "default", todos: {} };
  const habitsState = rawHabits ? JSON.parse(rawHabits) : { dailyHabits: [] };

  if (!todosState.todos) todosState.todos = {};
  if (!todosState.lists) todosState.lists = [];
  if (!habitsState.dailyHabits) habitsState.dailyHabits = [];

  let tasksRestored = false;
  let habitsRestored = false;
  let vaultRestored = false;

  for (const item of itemsToRestore) {
    if (item.itemType === "task") {
      const rescheduled = await rescheduleTodoReminders(item.data);
      const folderId = rescheduled.folderId || "default";
      if (!todosState.todos[folderId]) todosState.todos[folderId] = [];
      if (!todosState.todos[folderId].some((t: Todo) => t.id === rescheduled.id)) {
        todosState.todos[folderId].push(rescheduled);
        tasksRestored = true;
      }
    } else if (item.itemType === "habit") {
      const rescheduled = await rescheduleHabitReminders(item.data);
      if (!habitsState.dailyHabits.some((h: Habit) => h.id === rescheduled.id)) {
        habitsState.dailyHabits.push(rescheduled);
        habitsRestored = true;
      }
    } else if (item.itemType === "workspace") {
      const workspaceId = item.data.list.id;
      
      if (!todosState.lists.some((l: any) => l.id === workspaceId)) {
        todosState.lists.push(item.data.list);
        tasksRestored = true;
      }

      const rescheduledTodos = await Promise.all(
        (item.data.todos || []).map((t: any) => rescheduleTodoReminders(t))
      );
      const currentTodos = todosState.todos[workspaceId] || [];
      const mergedTodos = [...currentTodos];
      rescheduledTodos.forEach((todo) => {
        if (!mergedTodos.some((t) => t.id === todo.id)) {
          mergedTodos.push(todo);
          tasksRestored = true;
        }
      });
      todosState.todos[workspaceId] = mergedTodos;

      const rescheduledHabits = await Promise.all(
        (item.data.habits || []).map((h: any) => rescheduleHabitReminders(h))
      );
      const filteredHabits = habitsState.dailyHabits.filter((h: any) => h.folderId !== workspaceId);
      habitsState.dailyHabits = [...filteredHabits, ...rescheduledHabits];
      habitsRestored = true;
    } else if (item.itemType === "collection") {
      const workspaceId = item.data.workspaceId || "unassigned";
      const allCollections = await getCollections();
      if (!allCollections[workspaceId]) allCollections[workspaceId] = [];
      if (!allCollections[workspaceId].some((c: Collection) => c.id === item.data.id)) {
        allCollections[workspaceId] = [item.data, ...allCollections[workspaceId]];
        await saveCollections(allCollections);
        vaultRestored = true;
      }
    } else if (item.itemType === "collection_item") {
      const workspaceId = item.originalLocation.split(":")[0] || "unassigned";
      const collectionId = item.originalLocation.split(":")[1];
      const allCollections = await getCollections();
      if (allCollections[workspaceId]) {
        const collection = allCollections[workspaceId].find((c: Collection) => c.id === collectionId);
        if (collection) {
          if (!collection.items.some((i: CollectionItem) => i.id === item.data.id)) {
            collection.items = [item.data, ...collection.items];
            await saveCollections(allCollections);
            vaultRestored = true;
          }
        }
      }
    } else if (item.itemType === "vault") {
      const folderId = item.data.folderId || "unassigned";
      const allCollections = await getCollections();
      if (!allCollections[folderId]) allCollections[folderId] = [];
      let defaultColl = allCollections[folderId].find((c: Collection) => c.name === "Quick Captures");
      if (!defaultColl) {
        defaultColl = {
          id: `quick-captures-${folderId}-${Date.now()}`,
          workspaceId: folderId,
          name: "Quick Captures",
          emoji: "⚡",
          createdAt: Date.now(),
          items: [],
        };
        allCollections[folderId].push(defaultColl);
      }
      if (!defaultColl.items.some((i: CollectionItem) => i.id === item.data.id)) {
        defaultColl.items.push({
          id: item.data.id,
          type: (item.data.type === "idea" ? "note" : item.data.type) || "note",
          title: item.data.title,
          content: item.data.content,
          url: item.data.url,
          createdAt: item.data.createdAt || Date.now(),
          archived: item.data.archived || false,
        });
        await saveCollections(allCollections);
        vaultRestored = true;
      }
    }
  }

  const keyValuePairs: [string, string][] = [];
  if (tasksRestored) {
    keyValuePairs.push([TODOS_STORAGE_KEY, JSON.stringify(todosState)]);
  }
  if (habitsRestored) {
    keyValuePairs.push([DAILY_STORAGE_KEY, JSON.stringify(habitsState)]);
  }

  if (keyValuePairs.length > 0) {
    await AsyncStorage.multiSet(keyValuePairs);
  }

  if (tasksRestored) emitStateChange("tasks_changed");
  if (habitsRestored) emitStateChange("habits_changed");
  if (vaultRestored) emitStateChange("vault_changed");

  const binItems = await getRecycleBinItems();
  const restoreIds = new Set(itemsToRestore.map((i) => i.id));
  const remaining = binItems.filter((i) => !restoreIds.has(i.id));
  await saveRecycleBinItems(remaining);
}

