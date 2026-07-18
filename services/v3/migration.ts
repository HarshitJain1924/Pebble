/**
 * migration.ts
 * ────────────
 * Pebble V1/V2 to V3 Refined Local Data Migration Layer.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    Checklist,
    DEFAULT_FOLDER_ID,
    Folder,
    Habit,
    RecycleBinItem,
    Relationship,
    Resource,
    Task,
    UiState,
} from "./v3Types";

export interface MigrationResult {
  foldersCount: number;
  tasksCount: number;
  habitsCount: number;
  checklistsCount: number;
  resourcesCount: number;
  relationshipsCount: number;
  recycleBinCount: number;
  errors: string[];
  durationMs: number;
}

export async function migrateV1ToV3(): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    foldersCount: 0,
    tasksCount: 0,
    habitsCount: 0,
    checklistsCount: 0,
    resourcesCount: 0,
    relationshipsCount: 0,
    recycleBinCount: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const version = await AsyncStorage.getItem("pebble:schema_version");
    if (version === "v3_refined") {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Load legacy lists or initialize defaults
    const rawTodos = await AsyncStorage.getItem("todoapp:v1");
    let parsedTodos: any = {};
    if (rawTodos) {
      try {
        parsedTodos = JSON.parse(rawTodos);
      } catch (e) {
        console.warn("Failed to parse todoapp:v1", e);
      }
    }

    // ─── 1. Migrate Folders ────────────────────────────────────────────────
    const foldersList: Folder[] = [];
    const legacyLists = parsedTodos.lists || [];
    if (legacyLists.length > 0) {
      legacyLists.forEach((list: any, index: number) => {
        foldersList.push({
          id: list.id,
          name: list.name || "Folder",
          emoji: list.emoji || "📁",
          color: list.color || "#6366F1",
          sortOrder: index,
          createdAt: list.createdAt || Date.now(),
          updatedAt: Date.now(),
        });
        result.foldersCount++;
      });
    } else {
      // Default set
      foldersList.push(
        {
          id: "default",
          name: "My Pebbles",
          emoji: "📋",
          color: "#6366F1",
          sortOrder: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "work",
          name: "Work",
          emoji: "💼",
          color: "#3B82F6",
          sortOrder: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "personal",
          name: "Personal",
          emoji: "🏠",
          color: "#10B981",
          sortOrder: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      );
      result.foldersCount += 3;
    }
    await AsyncStorage.setItem(
      "pebble:v3:folders",
      JSON.stringify(foldersList),
    );

    // ─── 2. Migrate Tasks ──────────────────────────────────────────────────
    if (rawTodos && parsedTodos.todos) {
      const allV1Tasks = Object.entries(parsedTodos.todos).flatMap(
        ([fid, list]: [string, any]) => {
          return (Array.isArray(list) ? list : []).map((item) => ({
            ...item,
            folderId: fid,
          }));
        },
      );

      const folderGroups: Record<string, Task[]> = {};
      allV1Tasks.forEach((t: any) => {
        const fid = t.folderId || DEFAULT_FOLDER_ID;
        if (!folderGroups[fid]) folderGroups[fid] = [];

        // Check if item is scheduled event or normal task
        let scheduledDate = t.scheduledDate || undefined;
        let scheduledTime = t.scheduledTime || undefined;
        let durationMinutes = t.durationMinutes || undefined;

        if (t.isEvent) {
          scheduledDate =
            t.scheduledDate || new Date().toISOString().split("T")[0];
          scheduledTime =
            t.reminderHour !== undefined
              ? `${String(t.reminderHour).padStart(2, "0")}:${String(t.reminderMinute || 0).padStart(2, "0")}`
              : "09:00";
          durationMinutes = t.durationMinutes || 60;
        }

        folderGroups[fid].push({
          id: t.id,
          folderId: fid,
          title: t.title || "Untitled Task",
          createdAt: t.createdAt || Date.now(),
          updatedAt: Date.now(),
          archived: t.archived || false,
          completed: t.completed || false,
          completedAt: t.completed
            ? t.lastUpdated
              ? new Date(t.lastUpdated).getTime()
              : Date.now()
            : undefined,
          priority: t.priority || "medium",
          category: t.category || "work",
          description: t.description || undefined,
          scheduledDate,
          scheduledTime,
          durationMinutes,
          alarmTime: t.alarmTime || undefined,
          alarmId: t.alarmId || undefined,
          notificationIds: t.notificationIds || undefined,
        });
        result.tasksCount++;
      });

      for (const [fid, tasks] of Object.entries(folderGroups)) {
        const key = `pebble:v3:tasks:${fid}`;
        const recordMap: Record<string, Task> = {};
        tasks.forEach((task) => {
          recordMap[task.id] = task;
        });
        await AsyncStorage.setItem(key, JSON.stringify(recordMap));
      }
    }

    // ─── 3. Migrate Habits ─────────────────────────────────────────────────
    const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
    if (rawHabits) {
      try {
        const parsed = JSON.parse(rawHabits);
        const habitsList = parsed.dailyHabits || [];
        const folderGroups: Record<string, Habit[]> = {};

        habitsList.forEach((h: any) => {
          const fid = h.folderId || DEFAULT_FOLDER_ID;
          if (!folderGroups[fid]) folderGroups[fid] = [];

          folderGroups[fid].push({
            id: h.id,
            folderId: fid,
            title: h.title || "Untitled Habit",
            createdAt: h.createdAt || Date.now(),
            updatedAt: Date.now(),
            archived: h.archived || false,
            streak: h.streak || 0,
            bestStreak: h.bestStreak || 0,
            completedDates: h.completedDates || [],
            recurrenceRule: "FREQ=DAILY",
            priority: h.priority || "medium",
            category: h.category || "work",
            recurrence: h.recurrence || undefined,
            description: h.description || undefined,
            reminderHour: h.reminderHour || undefined,
            reminderMinute: h.reminderMinute || undefined,
            reminderDays: h.reminderDays || undefined,
            notificationIds: h.notificationIds || undefined,
          });
          result.habitsCount++;
        });

        for (const [fid, habits] of Object.entries(folderGroups)) {
          const key = `pebble:v3:habits:${fid}`;
          const recordMap: Record<string, Habit> = {};
          habits.forEach((habit) => {
            recordMap[habit.id] = habit;
          });
          await AsyncStorage.setItem(key, JSON.stringify(recordMap));
        }
      } catch (e) {
        console.warn("Failed to parse daily habits", e);
      }
    }

    // ─── 4. Migrate Checklists ─────────────────────────────────────────────
    const rawChecklists = await AsyncStorage.getItem("todoapp:checklists:v1");
    if (rawChecklists) {
      try {
        const parsed = JSON.parse(rawChecklists);
        const folderGroups: Record<string, Checklist[]> = {};

        Object.entries(parsed).forEach(([fid, checklists]: [string, any]) => {
          const targetFid = fid || DEFAULT_FOLDER_ID;
          if (!folderGroups[targetFid]) folderGroups[targetFid] = [];

          checklists.forEach((c: any) => {
            folderGroups[targetFid].push({
              id: c.id,
              folderId: targetFid,
              title: c.title || "Untitled Checklist",
              createdAt: c.createdAt || Date.now(),
              updatedAt: Date.now(),
              archived: c.archived || false,
              items: (c.items || []).map((item: any, idx: number) => ({
                id: item.id || `item-${idx}`,
                title: item.title || "Item",
                completed: item.completed || false,
              })),
            });
            result.checklistsCount++;
          });
        });

        for (const [fid, checklists] of Object.entries(folderGroups)) {
          const key = `pebble:v3:checklists:${fid}`;
          const recordMap: Record<string, Checklist> = {};
          checklists.forEach((checklist) => {
            recordMap[checklist.id] = checklist;
          });
          await AsyncStorage.setItem(key, JSON.stringify(recordMap));
        }
      } catch (e) {
        console.warn("Failed to parse checklists", e);
      }
    }

    // ─── 5. Migrate Resources ──────────────────────────────────────────────
    const rawCollections = await AsyncStorage.getItem("todoapp:collections:v1");
    if (rawCollections) {
      try {
        const parsed = JSON.parse(rawCollections);
        const v3Relationships: Record<string, Relationship> = {};

        for (const [fid, collections] of Object.entries(parsed) as [
          string,
          any[],
        ][]) {
          const targetFid = fid || DEFAULT_FOLDER_ID;
          const v3Resources: Record<string, Resource> = {};

          collections.forEach((collection: any) => {
            (collection.items || []).forEach((item: any) => {
              const body: Resource["body"] = {};
              let resType: Resource["resourceType"] = item.type || "note";
              if (item.kind === "idea") resType = "idea";

              if (item.type === "link") {
                body.url = item.url || "";
              } else if (item.type === "file") {
                body.localUri = item.localUri || "";
                body.mimeType = item.mimeType || "application/octet-stream";
                body.fileSize = item.fileSize || 0;
              } else {
                body.content = item.content || "";
              }

              v3Resources[item.id] = {
                id: item.id,
                folderId: targetFid,
                title: item.title || "Untitled Note",
                createdAt: item.createdAt || Date.now(),
                updatedAt: Date.now(),
                archived: item.archived || false,
                resourceType: resType,
                body,
                tags: item.tags || [],
                pinned: item.pinned || false,
              };
              result.resourcesCount++;

              if (item.linkedItemIds && Array.isArray(item.linkedItemIds)) {
                item.linkedItemIds.forEach((targetId: string) => {
                  const relId = `rel_${item.id}_${targetId}`;
                  v3Relationships[relId] = {
                    id: relId,
                    source: { id: item.id, type: "resource" },
                    target: { id: targetId, type: "task" },
                    relationType: "supports",
                    createdAt: Date.now(),
                  };
                  result.relationshipsCount++;
                });
              }
            });
          });

          await AsyncStorage.setItem(
            `pebble:v3:resources:${targetFid}`,
            JSON.stringify(v3Resources),
          );
        }

        await AsyncStorage.setItem(
          "pebble:v3:relationships",
          JSON.stringify(v3Relationships),
        );
      } catch (e) {
        console.warn("Failed to parse collections", e);
      }
    }

    // ─── 6. Migrate Recycle Bin ────────────────────────────────────────────
    const rawRecycle = await AsyncStorage.getItem("todoapp:recycle_bin:v1");
    if (rawRecycle) {
      try {
        const parsed = JSON.parse(rawRecycle);
        const binItems = parsed.items || [];
        const migratedBin: RecycleBinItem[] = [];

        binItems.forEach((item: any) => {
          let itemType: RecycleBinItem["itemType"] = "task";
          if (item.itemType === "habit") itemType = "habit";
          else if (item.itemType === "checklist") itemType = "checklist";
          else if (
            item.itemType === "collection_item" ||
            item.itemType === "vault"
          )
            itemType = "resource";
          else if (item.itemType === "workspace") itemType = "folder";

          migratedBin.push({
            id: item.id || String(Date.now()),
            title: item.title || "Deleted Item",
            deletedAt: item.deletedAt || Date.now(),
            itemType,
            originalFolderId: item.originalLocation || "default",
            snapshot: JSON.stringify(item.data || {}),
          });
          result.recycleBinCount++;
        });

        await AsyncStorage.setItem(
          "pebble:v3:recycle_bin",
          JSON.stringify(migratedBin),
        );
      } catch (e) {
        console.warn("Failed to parse recycle bin", e);
      }
    }

    // Initialize Default UI State
    const currentUiState = await AsyncStorage.getItem("pebble:v3:ui_state");
    if (!currentUiState) {
      const defaultUi: UiState = {
        activeFolderId: DEFAULT_FOLDER_ID,
        completedOnboarding: true,
        themeCache: "dark",
      };
      await AsyncStorage.setItem(
        "pebble:v3:ui_state",
        JSON.stringify(defaultUi),
      );
    }

    // Write schema version to confirm successful migration
    await AsyncStorage.setItem("pebble:schema_version", "v3_refined");
  } catch (err: any) {
    result.errors.push(err.message || String(err));
  }

  result.durationMs = Date.now() - startTime;
  console.log("Migration refined V3 completed:", result);
  return result;
}
