import AsyncStorage from "@react-native-async-storage/async-storage";
import { type RecycleBinItem, type Todo, type Habit } from "@/modules/types";

export const TODOS_STORAGE_KEY = "todoapp:v1";
export const DAILY_STORAGE_KEY = "todoapp:daily:v1";
export const HISTORY_STORAGE_KEY = "todoapp:history:v1";
export const PROFILE_STORAGE_KEY = "todoapp:profile:v1";
export const SETTINGS_STORAGE_KEY = "todoapp:settings:v1";
export const NOTIF_LOG_STORAGE_KEY = "todoapp:notifications:log:v1";
export const RECYCLE_BIN_STORAGE_KEY = "todoapp:recycle_bin:v1";

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
  itemType: "task" | "habit" | "workspace",
  data: any,
  originalLocation: string
): Promise<void> {
  try {
    const items = await getRecycleBinItems();
    const newItem: RecycleBinItem = {
      id: itemType === "workspace" ? data.list?.id : (data.id || String(Date.now())),
      title: itemType === "workspace" ? data.list?.name : (data.title || "Untitled"),
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

export async function restoreRecycleBinItems(itemsToRestore: RecycleBinItem[]): Promise<void> {
  if (itemsToRestore.length === 0) return;

  const { rescheduleTodoReminders, rescheduleHabitReminders } = await import("./reminders");

  const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
  const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);

  const todosState = rawTodos ? JSON.parse(rawTodos) : { lists: [], selectedList: "default", todos: {} };
  const habitsState = rawHabits ? JSON.parse(rawHabits) : { dailyHabits: [] };

  if (!todosState.todos) todosState.todos = {};
  if (!todosState.lists) todosState.lists = [];
  if (!habitsState.dailyHabits) habitsState.dailyHabits = [];

  let tasksRestored = false;
  let habitsRestored = false;

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

  const binItems = await getRecycleBinItems();
  const restoreIds = new Set(itemsToRestore.map((i) => i.id));
  const remaining = binItems.filter((i) => !restoreIds.has(i.id));
  await saveRecycleBinItems(remaining);
}

