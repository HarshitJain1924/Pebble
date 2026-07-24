import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform, ScrollView, TextInput as RNTextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useUndo } from "@/shared/components/ui/UndoContext";
import {
    TaskRepository,
    HabitRepository,
    ChecklistRepository,
    WorkspaceRepository,
    ResourceRepository,
} from "@/repositories";
import { DEFAULT_WORKSPACE_ID as DEFAULT_FOLDER_ID } from "@/shared/types/repository.types";

import { Task, Habit, Workspace, Resource, ResourceCollection, Checklist, ChecklistItem } from "@/shared/types/domain.types";

import { pluginManager } from "@/plugin";
import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { getNotificationLogs } from "@/services/scheduling/notifications-log";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { earnPebble, undoLastPebble } from "@/features/profile/services/pebble.service";
import { cancelReminderIds, scheduleReminderBatch, rescheduleTodoReminders, rescheduleHabitReminders } from "@/services/scheduling/reminders.service";
import { getProfile, handleTaskXpChange, handleHabitXpChange, type UserProfile } from "@/features/settings/services/settings.service";
import { addStateListener, emitStateChange } from "@/services/events/state-events";
import {
    DAY_MS,
    addToRecycleBin,
    getRecycleBinItems,
    saveRecycleBinItems,
    getCollections,
    saveCollections,
    getChecklists,
    saveChecklists,
} from "@/services/storage/storage.service";
import { getActiveSuggestions, logTaskCreation, type SmartSuggestion } from "@/features/capture/services/suggestions.service";
import { DEFAULT_TASK_CATEGORY, normalizeTaskCategory, TASK_CATEGORY_META, type TaskCategory } from "@/features/tasks/services/task-categories";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import { isRecurringOccurrenceForDate, getRecurrenceLabel, parseDateKey, dayDiff } from "@/services/scheduling/recurrence.service";
import { normalizeHabitsForToday } from "@/features/habits/services/habit.service";
import { getListColors, getPriorityWeight, getTodoDateKey, getDateKey, isOverdue, formatAlarm, getSelectedDateLabel, WEEKDAY_NAMES, initialTodos, globalLists, globalTodos, globalHabits, globalCollections, globalChecklists, setGlobalLists, setGlobalTodos, setGlobalHabits, setGlobalCollections, setGlobalChecklists } from "@/features/tasks/utils/task-formatting";
import { useWorkspaceState } from "@/features/workspaces/hooks/useWorkspaceState";
import { useTaskFiltering } from "@/features/tasks/hooks/useTaskFiltering";
import { useSelectionState } from "@/features/tasks/hooks/useSelectionState";
import { useResourceState as useCollectionState } from "@/features/resources/hooks/useResourceState";
import { useChecklistState } from "@/features/checklists/hooks/useChecklistState";
import { useReminderState } from "@/services/scheduling/hooks/useReminderState";
import { useResourceLinkState } from "@/features/resources/hooks/useResourceLinkState";

// Re-export utility for backward compatibility with consumers
export { getDateKey };
export function useTasksState() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    focusItemId?: string;
    focusItemType?: string;
    segment?: string;
    category?: string;
    quickAdd?: string;
    folderId?: string;
  }>();

  const {
    workspaces,
    isWorkspacesHydrated,
    setWorkspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceSegment,
    setWorkspaceSegment,
    activeSegment,
    setActiveSegment,
    workspaceModalVisible,
    setWorkspaceModalVisible,
    editingWorkspaceId,
    setEditingWorkspaceId,
    listsExpanded,
    setListsExpanded,
    loadWorkspaces,
    handleSelectWorkspace,
    handleBackToWorkspaces,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    // compatibility aliases
    lists,
    setLists,
    selectedList,
    setSelectedList,
    openedFolderId,
    setOpenedFolderId,
    folderSegment,
    setFolderSegment,
    folderModalVisible,
    setFolderModalVisible,
    editingFolderId,
    setEditingFolderId,
  } = useWorkspaceState();

  // Selection state
  const {
    isBulkSelectActive,
    setIsBulkSelectActive,
    selectedItemIds,
    setSelectedItemIds,
    clearSelection,
    toggleItemSelection,
    selectAll,
    deselectAll,
    isItemSelected,
    selectionCount,
  } = useSelectionState();

  const { showUndo, showToast } = useUndo();

  // Collection state
  const {
    collections,
    setCollections,
    loadVaultState,
    createCollection,
    deleteCollection,
    renameCollection,
    addCollectionItem,
    updateCollectionItem,
    deleteCollectionItem,
    toggleArchiveCollectionItem,
    togglePinCollectionItem,
  } = useCollectionState(selectedList, showToast);

  // Checklist state
  const {
    checklists,
    setChecklists,
    loadChecklistsState,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    toggleChecklistItem,
  } = useChecklistState(selectedList);

  const scrollViewRef = useRef<ScrollView>(null);
  const addTaskInputRef = useRef<RNTextInput>(null);
  const focusTodoId =
    typeof params.focusItemId === "string" && params.focusItemType === "todo"
      ? params.focusItemId
      : null;

  const focusHabitId =
    typeof params.focusItemId === "string" && params.focusItemType === "habit"
      ? params.focusItemId
      : null;

  // Tasks Screen State (local state not extracted yet)
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(null);
  const [isTasksHydrated, setIsTasksHydrated] = useState<boolean>(() => globalTodos !== null);
  const [todos, setTodos] = useState<Record<string, Task[]>>(() => globalTodos || {});
  const [title, setTitle] = useState("");
  const [selectedTodoCategory, setSelectedTodoCategory] = useState<TaskCategory>(DEFAULT_TASK_CATEGORY);
  const [selectedTodoPriority, setSelectedTodoPriority] = useState<"low" | "medium" | "high">("medium");

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [expandedTodoIds, setExpandedTodoIds] = useState<Record<string, boolean>>({});
  const [taskPositions, setTaskPositions] = useState<Record<string, number>>({});

  // Habits Screen State
  const [habits, setHabits] = useState<Habit[]>(() => globalHabits || []);
  const [habitTitle, setHabitTitle] = useState("");
  const [selectedHabitPriority, setSelectedHabitPriority] = useState<"low" | "medium" | "high">("medium");
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [highlightedHabitId, setHighlightedHabitId] = useState<string | null>(null);
  const celebrateDateRef = useRef<string | null>(null);

  const [addingTask, setAddingTask] = useState<Task | null>(null);
  const [selectedTodoDate, setSelectedTodoDate] = useState<string>(getDateKey());
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);

  // NLP Modal & Heuristic Suggestions States
  const [nlpVisible, setNlpVisible] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<SmartSuggestion[]>([]);

  // Filtering hook — manages search, date, filter state & derived memoized lists
  const filtering = useTaskFiltering(todos, habits, lists, selectedList);
  const {
    searchQuery,
    setSearchQuery,
    selectedListPriorityFilter,
    setSelectedListPriorityFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedListHabitPriorityFilter,
    setSelectedListHabitPriorityFilter,
    selectedDate,
    setSelectedDate,

    // Derived values
    weekDaysStrip,
    formatSelectedDayName,
    currentTodos,
    filteredTodos,
    overdueTodos,
    todayTodos,
    upcomingTodos,
    inboxTodos,
    remainingCount,
    completedCount,
    unfinishedHabitCount,
    displayedHabits,
    completedHabitCount,
    habitCompletionPct,
    longestStreak,
  } = filtering;

  // Task Actions
  const persistState = useCallback(async (listsToSave: Workspace[], selected: string, todosToSave: Record<string, Task[]>) => {
    try {
      await AsyncStorage.setItem("pebble:core:active_workspace", selected);
      await AsyncStorage.setItem("pebble:core:workspaces", JSON.stringify(listsToSave));

      const activeTodos = todosToSave[selected] || [];
      const records: Record<string, any> = {};
      activeTodos.forEach((todo) => {
        records[todo.id] = {
          id: todo.id,
          workspaceId: selected,
          title: todo.title,
          createdAt: todo.createdAt || Date.now(),
          updatedAt: Date.now(),
          archived: todo.archived || false,
          completed: todo.completed,
          completedAt: todo.completed ? Date.now() : undefined,
          priority: todo.priority || "medium",
          dueDate: todo.scheduledDate,
          category: todo.category,
        };
      });
      await AsyncStorage.setItem(`pebble:core:tasks:${selected}`, JSON.stringify(records));
      void recordDailyHistorySnapshot();
    } catch (e) {
      console.warn("Failed to persist current state:", e);
    }
  }, []);

  // Reminder state — needs todos, setTodos, currentTodos, remainingCount, persistState, lists
  const {
    alarmMenu,
    setAlarmMenu,
    scheduleAlarm,
    scheduleAlarmWithDays,
    cancelAlarm,
    formatAlarm: formatAlarmFromHook,
  } = useReminderState(todos, setTodos, selectedList, currentTodos, remainingCount, persistState, lists);

  const persistHabits = useCallback(async (nextHabits: Habit[]) => {
    try {
      await Promise.all(
        nextHabits.map((h) =>
          HabitRepository.saveHabit({
            id: h.id,
            folderId: h.folderId || selectedList,
            title: h.title,
            streak: h.streak || 0,
            bestStreak: h.bestStreak || 0,
            completedDates: h.completedToday ? [getDateKey()] : [],
            recurrenceRule: "FREQ=DAILY",
            createdAt: h.createdAt || Date.now(),
            archived: h.archived || false,
          }),
        ),
      );
      void recordDailyHistorySnapshot();
    } catch (e) {
      console.warn("Failed to persist current habits:", e);
    }
  }, [selectedList]);

  // Resource linking state
  const { toggleLinkResource } = useResourceLinkState(
    todos,
    setTodos,
    habits,
    setHabits,
    checklists,
    setChecklists,
    collections,
    setCollections,
    selectedList,
    openedFolderId,
    lists,
    persistState,
    persistHabits,
  );

  // Sync parameters (only sync category and quickAdd — workspace params handled by useWorkspaceState)
  useEffect(() => {
    if (typeof params.category === "string") {
      setSelectedTodoCategory(normalizeTaskCategory(params.category));
      setActiveSegment("tasks");
    }
  }, [params.category]);

  useEffect(() => {
    if (params.quickAdd !== "task") {
      return;
    }

    setActiveSegment("tasks");
    const timer = setTimeout(() => {
      addTaskInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [params.quickAdd]);

  const loadState = useCallback(async () => {
    try {
      // Load workspaces first and use the returned array directly (never read stale state)
      const currentLists = await loadWorkspaces();

      // Query current repositories for ALL folders to preserve counts in WorkspaceGrid
      const allTodosMap: Record<string, Task[]> = {};
      const allHabits: Habit[] = [];
      const allChecklistsMap: Record<string, Checklist[]> = {};
      const allCollectionsMap: Record<string, ResourceCollection[]> = {};

      for (const folder of currentLists) {
        const folderId = folder.id;

        // Load tasks
        const folderTasksMap = await TaskRepository.getTasks(folderId);
        allTodosMap[folderId] = Object.values(folderTasksMap).map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
          priority: t.priority,
          scheduledDate: t.dueDate,
          folderId,
          createdAt: t.createdAt,
          category: t.category as any,
        }));

        // Load habits
        const folderHabitsMap = await HabitRepository.getHabits(folderId);
        const folderHabitsList = Object.values(folderHabitsMap).map((h) => ({
          id: h.id,
          title: h.title,
          streak: h.streak,
          bestStreak: h.bestStreak,
          completedToday: h.completedDates.includes(getDateKey()),
          folderId,
          createdAt: h.createdAt,
        }));
        allHabits.push(...folderHabitsList);

        // Load checklists
        const checklistsMap = await ChecklistRepository.getChecklists(folderId);
        allChecklistsMap[folderId] = Object.values(checklistsMap).map((c) => ({
          id: c.id,
          folderId,
          title: c.title,
          items: c.items || [],
          createdAt: c.createdAt,
          archived: c.archived || false,
        }));

        // Load collections
        const metadataRaw = await AsyncStorage.getItem(`pebble:core:collections_metadata:${folderId}`);
        const collectionsMeta: { id: string; name: string; emoji: string }[] = metadataRaw ? JSON.parse(metadataRaw) : [];

        if (collectionsMeta.length === 0) {
          collectionsMeta.push({ id: "default_vault", name: "Vault", emoji: "📦" });
        }

        const resourcesMap = await ResourceRepository.getResources(folderId);
        const repositoryResources = Object.values(resourcesMap);

        allCollectionsMap[folderId] = collectionsMeta.map((meta) => {
          const matchingItems: Resource[] = repositoryResources
            .filter((r) => r.tags?.includes(`collection_${meta.id}`))
            .map((r) => ({
              id: r.id,
              type: r.resourceType as any,
              title: r.title,
              content: r.resourceType === "note" || r.resourceType === "idea" ? (r.payload as any).content : undefined,
              url: r.resourceType === "link" ? (r.payload as any).url : undefined,
              localUri: r.resourceType === "file" ? (r.payload as any).localUri : undefined,
              fileSize: r.resourceType === "file" ? (r.payload as any).fileSize : undefined,
              mimeType: r.resourceType === "file" ? (r.payload as any).mimeType : undefined,
              createdAt: r.createdAt,
              pinned: r.pinned || false,
              archived: r.archived || false,
              kind: r.resourceType === "idea" ? ("idea" as const) : undefined,
            }));

          if (meta.id === "default_vault") {
            const untagged = repositoryResources
              .filter((r) => !r.tags?.some((t) => t.startsWith("collection_")))
              .map((r) => ({
                id: r.id,
                type: r.resourceType as any,
                title: r.title,
                content: r.resourceType === "note" || r.resourceType === "idea" ? (r.payload as any).content : undefined,
                url: r.resourceType === "link" ? (r.payload as any).url : undefined,
                localUri: r.resourceType === "file" ? (r.payload as any).localUri : undefined,
                fileSize: r.resourceType === "file" ? (r.payload as any).fileSize : undefined,
                mimeType: r.resourceType === "file" ? (r.payload as any).mimeType : undefined,
                createdAt: r.createdAt,
                pinned: r.pinned || false,
                archived: r.archived || false,
                kind: r.resourceType === "idea" ? ("idea" as const) : undefined,
              }));
            matchingItems.push(...untagged);
          }

          return {
            id: meta.id,
            workspaceId: folderId,
            name: meta.name,
            emoji: meta.emoji,
            createdAt: Date.now(),
            items: matchingItems,
          };
        });
      }

      setTodos(allTodosMap);
      setHabits(allHabits);
      setChecklists(allChecklistsMap);
      setCollections(allCollectionsMap);

      try {
        const userProfile = await getProfile();
        setProfile(userProfile);
        const logs = await getNotificationLogs();
        const hasUnread = logs.some((l: any) => !l.read);
        setHasUnreadNotifs(hasUnread);
      } catch {}

      if (Platform.OS === "web") {
        Object.values(allTodosMap).forEach((listTodos) => {
          listTodos.forEach((t: any) => {
            if (t.alarmTime && !t.alarmId && t.alarmTime > Date.now()) {
              const delay = t.alarmTime - Date.now();
              const timeoutId = setTimeout(() => {
                try {
                  new Notification("Task reminder", { body: t.title });
                } catch {
                  Alert.alert("Reminder", t.title);
                }
              }, delay);
              setTodos((current) => {
                const updatedLists = { ...current };
                for (const lid in updatedLists) {
                  updatedLists[lid] = updatedLists[lid].map((tt) =>
                    tt.id === t.id ? { ...tt, alarmId: `web-${String(timeoutId)}` } : tt
                  );
                }
                persistState(currentLists, selectedList, updatedLists);
                return updatedLists;
              });
            }
          });
        });
      }
      setIsTasksHydrated(true);
    } catch (e) {
      console.warn("Failed to load state", e);
      setIsTasksHydrated(true);
    }
  }, [loadWorkspaces, selectedList, persistState, activeWorkspaceId]);

  const loadHabits = useCallback(async (workspaceList?: Workspace[]) => {
    try {
      const targetLists = workspaceList && workspaceList.length > 0 ? workspaceList : lists;
      const allHabits: Habit[] = [];
      for (const folder of targetLists) {
        const folderId = folder.id;
        const folderHabitsMap = await HabitRepository.getHabits(folderId);
        const folderHabitsList = Object.values(folderHabitsMap).map((h) => ({
          id: h.id,
          title: h.title,
          streak: h.streak,
          bestStreak: h.bestStreak,
          completedToday: h.completedDates.includes(getDateKey()),
          folderId,
          createdAt: h.createdAt,
        }));
        allHabits.push(...folderHabitsList);
      }
      setHabits(allHabits);
    } catch (e) {
      console.warn("Failed to load current habits", e);
      setHabits([]);
    }
  }, [lists]);

  const loadSuggestions = useCallback(async () => {
    try {
      const active = await getActiveSuggestions();
      setActiveSuggestions(active);
    } catch {}
  }, []);

  const handleSaveParsedItem = async (parsed: ParsedProductivityItem, targetWorkspaceId?: string) => {
    if (!parsed.title || parsed.title.trim() === "") return;

    if (parsed.type === "task") {
      const generatedTaskId = String(Date.now());
      let alarmTime: number | undefined;
      let notificationIds: string[] = [];
      let alarmId: string | undefined;

      if (parsed.time && parsed.recurrence) {
        try {
          const scheduled = await scheduleReminderBatch({
            kind: "todo",
            itemId: generatedTaskId,
            title: parsed.title,
            category: parsed.category || DEFAULT_TASK_CATEGORY,
            dailyTime: {
              hour: Number(parsed.time.split(":")[0]),
              minute: Number(parsed.time.split(":")[1]),
            },
            recurrence: parsed.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
            context: {
              title: parsed.title,
              remainingCount: 1,
              totalCount: 1,
            },
          });
          alarmId = scheduled.primaryId;
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to schedule NLP recurring task reminder:", e);
        }
      } else if (parsed.time && parsed.date) {
        const [hours, minutes] = parsed.time.split(":").map(Number);
        const [year, monthVal, dayVal] = parsed.date.split("-").map(Number);
        const dateObj = new Date(year, monthVal - 1, dayVal, hours, minutes, 0, 0);

        if (parsed.reminderOffsetMinutes) {
          dateObj.setMinutes(dateObj.getMinutes() - parsed.reminderOffsetMinutes);
        }

        if (dateObj.getTime() > Date.now()) {
          alarmTime = dateObj.getTime();
          try {
            const scheduled = await scheduleReminderBatch({
              kind: "todo",
              itemId: generatedTaskId,
              title: parsed.title,
              category: parsed.category || DEFAULT_TASK_CATEGORY,
              oneTimeAt: dateObj,
              escalationMinutes: [120, 240],
              channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
              context: {
                title: parsed.title,
                remainingCount: 1,
                totalCount: 1,
              },
            });
            alarmId = scheduled.primaryId;
            notificationIds = scheduled.ids;
          } catch (e) {
            console.error("Failed to schedule NLP task reminder:", e);
          }
        }
      }

      const destinationWorkspaceId = targetWorkspaceId || openedFolderId || "default";

      const newTodo: Task = {
        id: generatedTaskId,
        title: parsed.title,
        completed: false,
        category: parsed.category || DEFAULT_TASK_CATEGORY,
        priority: parsed.priority || "medium",
        scheduledDate: parsed.date || "inbox",
        alarmTime,
        alarmId,
        notificationIds,
        reminderHour: parsed.time ? Number(parsed.time.split(":")[0]) : undefined,
        reminderMinute: parsed.time ? Number(parsed.time.split(":")[1]) : undefined,
        recurrence: parsed.recurrence,
        folderId: destinationWorkspaceId,
        createdAt: Date.now(),
        createdDate: getDateKey(),
      };

      const listTodos = todos[destinationWorkspaceId] ?? [];
      const updatedTodos = {
        ...todos,
        [destinationWorkspaceId]: [newTodo, ...listTodos],
      };
      setTodos(updatedTodos);

      const wsName = lists.find((l) => l.id === destinationWorkspaceId)?.name || "My Pebbles";
      showToast(`✓ Task added to ${wsName}`);

      await persistState(lists, selectedList, updatedTodos);
      emitStateChange("tasks_changed", "tasks_screen");
      pluginManager.dispatchTaskCreated(newTodo);

      const newSuggestion = await logTaskCreation(parsed.title);
      if (newSuggestion) {
        await loadSuggestions();
      }
    } else {
      const hour = parsed.time ? Number(parsed.time.split(":")[0]) : undefined;
      const minute = parsed.time ? Number(parsed.time.split(":")[1]) : undefined;
      let notificationIds: string[] = [];

      let reminderDays: number[] | undefined = undefined;
      if (parsed.recurrence) {
        if (parsed.recurrence.type === "weekdays") {
          reminderDays = [1, 2, 3, 4, 5];
        } else if (parsed.recurrence.type === "weekly") {
          reminderDays = parsed.recurrence.days;
        }
      }

      const generatedHabitId = `habit-${Date.now()}`;
      if (hour !== undefined && minute !== undefined) {
        try {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: generatedHabitId,
            title: parsed.title,
            dailyTime: { hour, minute },
            dailyDays: reminderDays,
            recurrence: parsed.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
            context: {
              title: parsed.title,
              remainingCount: 1,
              totalCount: 1,
              streak: 0,
              bestStreak: 0,
            },
          });
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to schedule NLP habit reminder:", e);
        }
      }

      const destinationWorkspaceId = targetWorkspaceId || openedFolderId || "default";

      const newHabit: Habit = {
        id: generatedHabitId,
        title: parsed.title,
        streak: 0,
        bestStreak: 0,
        completedToday: false,
        priority: parsed.priority || "medium",
        reminderDays,
        reminderHour: hour,
        reminderMinute: minute,
        recurrence: parsed.recurrence,
        notificationIds,
        category: parsed.category || "health",
        folderId: destinationWorkspaceId,
        createdAt: Date.now(),
        createdDate: getDateKey(),
        startDate: getDateKey(),
      };

      const nextHabits = [newHabit, ...habits];
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      const catLabel = TASK_CATEGORY_META.find((c) => c.key === (newHabit.category || "health"))?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);

      emitStateChange("habits_changed", "tasks_screen");
    }

    void syncWidgetData().catch(() => {});
    void recordDailyHistorySnapshot();
  };

  const handleUpdateExistingFromNLP = async (
    parsed: ParsedProductivityItem,
    existingId: string,
    type: "task" | "habit"
  ) => {
    if (type === "habit") {
      const existing = habits.find((h) => h.id === existingId);
      if (!existing) return;
      const updatedHabit = {
        ...existing,
        title: parsed.title,
        category: parsed.category || existing.category,
        reminderHour: parsed.time ? Number(parsed.time.split(":")[0]) : existing.reminderHour,
        reminderMinute: parsed.time ? Number(parsed.time.split(":")[1]) : existing.reminderMinute,
        recurrence: parsed.recurrence || existing.recurrence,
        priority: parsed.priority || existing.priority,
      };

      let reminderDays: number[] | undefined = undefined;
      if (updatedHabit.recurrence) {
        if (updatedHabit.recurrence.type === "weekdays") {
          reminderDays = [1, 2, 3, 4, 5];
        } else if (updatedHabit.recurrence.type === "weekly") {
          reminderDays = updatedHabit.recurrence.days;
        }
      }
      updatedHabit.reminderDays = reminderDays;

      await handleSaveEditedHabit(updatedHabit);
      showToast(`✓ Habit updated`);
    } else {
      let existingTask: Task | undefined;
      for (const listId in todos) {
        const found = todos[listId].find((t) => t.id === existingId);
        if (found) {
          existingTask = found;
          break;
        }
      }
      if (!existingTask) return;

      const [hours, minutes] = parsed.time ? parsed.time.split(":").map(Number) : [undefined, undefined];

      const updatedTask = {
        ...existingTask,
        title: parsed.title,
        category: parsed.category || existingTask.category,
        scheduledDate: parsed.date || existingTask.scheduledDate,
        reminderHour: hours !== undefined ? hours : existingTask.reminderHour,
        reminderMinute: minutes !== undefined ? minutes : existingTask.reminderMinute,
        recurrence: parsed.recurrence || existingTask.recurrence,
        priority: parsed.priority || existingTask.priority,
      };

      onSaveEditedTask(updatedTask);
      showToast(`✓ Task updated`);
    }
  };

  const handleSaveEditedHabit = async (updated: Habit) => {
    let notificationIds = updated.notificationIds || [];

    const original = habits.find((h) => h.id === updated.id);
    const reminderChanged =
      updated.reminderHour !== original?.reminderHour ||
      updated.reminderMinute !== original?.reminderMinute ||
      JSON.stringify(updated.reminderDays || []) !== JSON.stringify(original?.reminderDays || []) ||
      JSON.stringify(updated.recurrence) !== JSON.stringify(original?.recurrence);

    if (reminderChanged) {
      await cancelReminderIds(original?.notificationIds);
      notificationIds = [];

      if (updated.reminderHour !== undefined && updated.reminderMinute !== undefined) {
        let reminderDays: number[] | undefined = undefined;
        if (updated.recurrence) {
          if (updated.recurrence.type === "weekdays") {
            reminderDays = [1, 2, 3, 4, 5];
          } else if (updated.recurrence.type === "weekly") {
            reminderDays = updated.recurrence.days;
          }
        }

        try {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: updated.id,
            title: updated.title,
            dailyTime: { hour: updated.reminderHour, minute: updated.reminderMinute },
            dailyDays: reminderDays,
            recurrence: updated.recurrence || undefined,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
            context: {
              title: updated.title,
              remainingCount: 1,
              totalCount: 1,
              streak: updated.streak,
              bestStreak: updated.bestStreak,
            },
          });
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to reschedule habit reminder:", e);
        }
      }
    }

    const finalHabit = {
      ...updated,
      notificationIds,
    };

    const exists = habits.some((h) => h.id === finalHabit.id);
    let nextHabits;
    if (exists) {
      nextHabits = habits.map((h) => (h.id === finalHabit.id ? finalHabit : h));
    } else {
      nextHabits = [finalHabit, ...habits];
    }
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    emitStateChange("habits_changed");
  };

  const handleDeleteEditedHabit = async (id: string) => {
    await deleteHabit(id);
  };

  useFocusEffect(
    useCallback(() => {
      void loadState();
      void loadSuggestions();
    }, [loadState, loadSuggestions])
  );

  // Sync notification permissions and channels
  useEffect(() => {
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") {
          await Notifications.requestPermissionsAsync();
        }
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("todo-reminders", {
            name: "Task Reminders",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
          await Notifications.setNotificationChannelAsync("daily-habits", {
            name: "Daily Habits",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
      } catch {}
    })();
  }, []);

  // Streak Celebration effect
  useEffect(() => {
    const today = getDateKey();
    if (habits.length > 0 && completedHabitCount === habits.length && celebrateDateRef.current !== today) {
      celebrateDateRef.current = today;
      setShowCelebrate(true);
      const timer = setTimeout(() => setShowCelebrate(false), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [completedHabitCount, habits.length]);

  // AppState reload habit streak check
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") {
        return;
      }

      setHabits((current) => {
        const normalized = normalizeHabitsForToday(current);
        if (JSON.stringify(normalized) !== JSON.stringify(current)) {
          void persistHabits(normalized).then(() => {
            emitStateChange("habits_changed");
          });
          return normalized;
        }
        return current;
      });
    });

    return () => {
      subscription.remove();
    };
  }, [persistHabits]);

  useEffect(() => {
    setSearchQuery("");
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  }, [openedFolderId, activeSegment]);

  // Listen for global task and habit updates to sync state immediately
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", (emitterId) => {
      if (emitterId !== "tasks_screen") {
        void loadState();
      }
    });

    const unsubscribeHabits = addStateListener("habits_changed", (emitterId) => {
      if (emitterId !== "tasks_screen") {
        void loadHabits();
      }
    });

    const unsubscribeVault = addStateListener("vault_changed", (emitterId) => {
      if (emitterId !== "tasks_screen") {
        void loadVaultState();
      }
    });

    const unsubscribeChecklists = addStateListener("checklists_changed", (emitterId) => {
      if (emitterId !== "tasks_screen") {
        void loadChecklistsState();
      }
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
      unsubscribeVault();
      unsubscribeChecklists();
    };
  }, [loadState, loadHabits, loadVaultState, loadChecklistsState]);

  // Alarms highlight scroll triggers
  useEffect(() => {
    if (focusTodoId) {
      setActiveSegment("tasks");
      setHighlightedTodoId(focusTodoId);
      setExpandedTodoIds((prev) => ({ ...prev, [focusTodoId]: true }));

      const y = taskPositions[focusTodoId];
      if (y !== undefined) {
        scrollViewRef.current?.scrollTo({
          y: y - 80,
          animated: true,
        });
      }

      const timer = setTimeout(() => setHighlightedTodoId(null), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTodoId, taskPositions]);

  useEffect(() => {
    if (focusHabitId && habits.length > 0) {
      const habit = habits.find((h) => h.id === focusHabitId);
      if (habit) {
        const folderId = habit.folderId || "default";
        setOpenedFolderId(folderId);
        setSelectedList(folderId);
        setHighlightedHabitId(focusHabitId);
        const timer = setTimeout(() => setHighlightedHabitId(null), 2200);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [focusHabitId, habits]);

  const selectList = async (listId: string) => {
    setSelectedList(listId);
    await AsyncStorage.setItem("pebble:core:active_workspace", listId);

    try {
      // Reload current active workspace data
      const activeTasksMap = await TaskRepository.getTasks(listId);
      const activeHabitsMap = await HabitRepository.getHabits(listId);

      const activeTodos: Task[] = Object.values(activeTasksMap).map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        priority: t.priority,
        scheduledDate: t.dueDate,
        folderId: listId,
        createdAt: t.createdAt,
        category: t.category as any,
      }));

      const activeHabits: Habit[] = Object.values(activeHabitsMap).map((h) => ({
        id: h.id,
        title: h.title,
        streak: h.streak,
        bestStreak: h.bestStreak,
        completedToday: h.completedDates.includes(getDateKey()),
        folderId: listId,
        createdAt: h.createdAt,
      }));

      setTodos((prev) => ({
        ...prev,
        [listId]: activeTodos,
      }));
      setHabits(activeHabits);
      emitStateChange("workspace_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to reload on workspace switch:", e);
    }
  };

  const cycleCategory = () => {
    const index = TASK_CATEGORY_META.findIndex((c) => c.key === selectedTodoCategory);
    const nextIndex = (index + 1) % TASK_CATEGORY_META.length;
    setSelectedTodoCategory(TASK_CATEGORY_META[nextIndex].key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const cyclePriority = () => {
    const priorities: ("high" | "medium" | "low")[] = ["high", "medium", "low"];
    const index = priorities.indexOf(selectedTodoPriority);
    const nextIndex = (index + 1) % priorities.length;
    setSelectedTodoPriority(priorities[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const cycleDate = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const dates = [getDateKey(today), getDateKey(tomorrow), getDateKey(nextWeek), "inbox"];
    const index = dates.indexOf(selectedTodoDate);
    const nextIndex = (index + 1) % dates.length;
    setSelectedTodoDate(dates[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const onSaveNewTask = async (newTask: Task) => {
    if (!newTask.title || newTask.title.trim() === "") return;

    const targetFolderId = newTask.folderId || selectedList || "default";
    const taskWithCreatedAt = {
      ...newTask,
      createdAt: newTask.createdAt || Date.now(),
    };

    const listTodos = todos[targetFolderId] ?? [];
    const updatedTodos = {
      ...todos,
      [targetFolderId]: [{ ...taskWithCreatedAt, folderId: targetFolderId }, ...listTodos],
    };
    setTodos(updatedTodos);

    const wsName = lists.find((l) => l.id === targetFolderId)?.name || "My Pebbles";
    showToast(`✓ Task added to ${wsName}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    await persistState(lists, selectedList, updatedTodos);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");

    pluginManager.dispatchTaskCreated(taskWithCreatedAt);
    setAddingTask(null);
  };

  const updateTodoTitle = async (id: string, newTitle: string) => {
    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((todo) => (todo.id === id ? { ...todo, title: newTitle } : todo));
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const moveTodoToList = async (todoId: string, fromListId: string, toListId: string) => {
    const sourceTodos = todos[fromListId] ?? [];
    const targetTodos = todos[toListId] ?? [];
    const todoToMove = sourceTodos.find((t) => t.id === todoId);
    if (!todoToMove) return;

    const updated = {
      ...todos,
      [fromListId]: sourceTodos.filter((t) => t.id !== todoId),
      [toListId]: [todoToMove, ...targetTodos],
    };

    setTodos(updated);
    await persistState(lists, selectedList, updated);
    setExpandedTodoIds((prev) => {
      const next = { ...prev };
      delete next[todoId];
      return next;
    });
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const toggleTodo = async (id: string) => {
    const listTodos = todos[selectedList] ?? [];
    const todo = listTodos.find((t) => t.id === id);
    if (!todo) return;
    const nextCompleted = !todo.completed;
    const { xpAwarded } = await handleTaskXpChange(todo, nextCompleted);
    const updatedTodo = { ...todo, completed: nextCompleted, xpAwarded };

    if (nextCompleted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const currentListTodos = todos[selectedList] ?? [];
    const updatedList = currentListTodos.map((t) => (t.id === id ? updatedTodo : t));
    const updatedTodos = { ...todos, [selectedList]: updatedList };
    setTodos(updatedTodos);

    if (nextCompleted) {
      pluginManager.dispatchTaskCompleted(updatedTodo);
      await earnPebble("task");
    } else {
      pluginManager.dispatchTaskUncompleted(updatedTodo);
      await undoLastPebble("task");
    }
    await persistState(lists, selectedList, updatedTodos);
    await syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const deleteTodo = async (id: string) => {
    const listTodos = todos[selectedList] ?? [];
    const toDelete = listTodos.find((t) => t.id === id);
    if (!toDelete) return;

    const originalWorkspace = lists.find((l) => l.id === selectedList)?.name || "Default";

    await cancelReminderIds(toDelete.notificationIds ?? (toDelete.alarmId ? [toDelete.alarmId] : []));

    await addToRecycleBin("task", toDelete, originalWorkspace);

    const currentListTodos = todos[selectedList] ?? [];
    const updatedTodos = {
      ...todos,
      [selectedList]: currentListTodos.filter((todo) => todo.id !== id),
    };
    setTodos(updatedTodos);

    pluginManager.dispatchTaskDeleted(id);
    await persistState(lists, selectedList, updatedTodos);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");

    showUndo({
      message: `Deleted "${toDelete.title}"`,
      onUndo: async () => {
        const binItems = await getRecycleBinItems();
        await saveRecycleBinItems(binItems.filter((item) => item.id !== id));

        const rescheduled = await rescheduleTodoReminders(toDelete);

        const currentTasksMap = await TaskRepository.getTasks(selectedList);
        const listTodos = Object.values(currentTasksMap).map((t: any) => ({
          ...t,
          folderId: selectedList,
          scheduledDate: t.scheduledDate || t.dueDate,
        })) as Task[];
        if (!listTodos.some((t) => t.id === id)) {
          await TaskRepository.saveTask({ ...rescheduled, folderId: selectedList });
          const updatedTodosMap = await TaskRepository.getTasks(selectedList);
          const updatedList = Object.values(updatedTodosMap).map((t: any) => ({
            ...t,
            folderId: selectedList,
            scheduledDate: t.scheduledDate || t.dueDate,
          })) as Task[];
          const updated = { ...todos, [selectedList]: updatedList };
          await persistState(lists, selectedList, updated);
          setTodos(updated);
        }

        void syncWidgetData().catch(() => {});
        emitStateChange("tasks_changed", "tasks_screen");
      },
    });
  };

  const updateTodoCategory = async (todoId: string, newCategory: TaskCategory) => {
    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((todo) => (todo.id === todoId ? { ...todo, category: newCategory } : todo));
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const toggleExpand = (todoId: string) => {
    setExpandedTodoIds((prev) => ({ ...prev, [todoId]: !prev[todoId] }));
  };

  const clearCompleted = async () => {
    const listTodos = todos[selectedList] ?? [];
    for (const t of listTodos) {
      if (t.completed) {
        await cancelReminderIds(t.notificationIds ?? (t.alarmId ? [t.alarmId] : []));
      }
    }
    const updated = {
      ...todos,
      [selectedList]: listTodos.filter((todo) => !todo.completed),
    };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  // Habits Business Logic
  const addHabit = async () => {
    const trimmed = habitTitle.trim();
    if (!trimmed) {
      return;
    }

    const next: Habit = {
      id: `habit-${Date.now()}`,
      title: trimmed,
      streak: 0,
      bestStreak: 0,
      completedToday: false,
      priority: selectedHabitPriority,
      category: selectedTodoCategory || "health",
      folderId: selectedList || "default",
      createdAt: Date.now(),
      createdDate: getDateKey(),
      startDate: getDateKey(),
    };

    const nextHabits = [next, ...habits];
    setHabits(nextHabits);
    await persistHabits(nextHabits);
    void syncWidgetData().catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");

    const catLabel = TASK_CATEGORY_META.find((c) => c.key === (next.category || "health"))?.label || "Health";
    showToast(`✓ Habit added to ${catLabel}`);
    setHabitTitle("");
    setSelectedHabitPriority("medium");
  };

  const deleteHabit = async (id: string) => {
    const target = habits.find((habit) => habit.id === id);
    if (!target) return;

    const originalWorkspace = lists.find((l) => l.id === (target.folderId || "default"))?.name || "Default";

    await cancelReminderIds(target.notificationIds ?? []);

    await addToRecycleBin("habit", target, originalWorkspace);

    const updated = habits.filter((habit) => habit.id !== id);
    setHabits(updated);
    await persistHabits(updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");

    showUndo({
      message: `Deleted "${target.title}"`,
      onUndo: async () => {
        const binItems = await getRecycleBinItems();
        await saveRecycleBinItems(binItems.filter((item) => item.id !== id));

        const rescheduled = await rescheduleHabitReminders(target);

        const currentHabitsMap = await HabitRepository.getHabits(selectedList);
        const currentHabits = Object.values(currentHabitsMap).map((h: any) => ({
          ...h,
          folderId: selectedList,
          completedToday: h.completedDates?.includes(getDateKey()) || false,
        })) as Habit[];
        if (!currentHabits.some((h) => h.id === id)) {
          await HabitRepository.saveHabit({ ...rescheduled, folderId: selectedList });
          const restored = [...currentHabits, rescheduled];
          await persistHabits(restored);
          setHabits(restored);
        }

        void syncWidgetData().catch(() => {});
        emitStateChange("habits_changed", "tasks_screen");
      },
    });
  };

  const toggleHabit = async (id: string) => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
    const habit = habits.find((h) => h.id === id);
    if (!habit) return;

    let updatedHabit;
    const isCompleting = !habit.completedToday;
    const { xpAwardedDate } = await handleHabitXpChange(habit, isCompleting, today);
    if (isCompleting) {
      let nextStreak = 1;
      if (habit.lastCompletedDate === today) {
        nextStreak = habit.streak || 1;
      } else if (habit.lastCompletedDate === yesterday) {
        nextStreak = habit.streak + 1;
      }
      updatedHabit = {
        ...habit,
        completedToday: true,
        lastCompletedDate: today,
        streak: nextStreak,
        bestStreak: Math.max(habit.bestStreak, nextStreak),
        xpAwardedDate,
      };

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      const rolledBackStreak = Math.max(0, habit.streak - 1);
      updatedHabit = {
        ...habit,
        completedToday: false,
        streak: rolledBackStreak,
        lastCompletedDate: rolledBackStreak > 0 ? yesterday : undefined,
        xpAwardedDate,
      };
    }

    const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    if (isCompleting) {
      await earnPebble("habit");
    } else {
      await undoLastPebble("habit");
    }

    pluginManager.dispatchHabitCompleted(updatedHabit);
    void recordDailyHistorySnapshot();
    await syncWidgetData().catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");
  };

  const recoverHabitStreak = async (id: string, method: "pebbles" | "focus"): Promise<boolean> => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
    const habit = habits.find((h) => h.id === id);
    if (!habit || !habit.previousStreak) return false;

    // Verify eligibility
    const isWithinRecoveryWindow = habit.streakBrokenDate && (dayDiff(habit.streakBrokenDate, today) <= 1);
    if (!isWithinRecoveryWindow) return false;

    if (method === "pebbles") {
      const { spendGems } = require("@/features/profile/services/pebble.service");
      const success = await spendGems(1);
      if (!success) return false;
    }

    const restoredStreak = habit.previousStreak;
    const updatedHabit = {
      ...habit,
      streak: restoredStreak,
      bestStreak: Math.max(habit.bestStreak, restoredStreak),
      lastCompletedDate: yesterday,
      previousStreak: undefined,
      streakBrokenDate: undefined,
    };

    const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");
    emitStateChange("pebbles_changed", "tasks_screen");
    return true;
  };

  const onSaveEditedTask = async (updatedTask: Task) => {
    const original = Object.values(todos).flat().find((t) => t.id === updatedTask.id);
    if (original?.notificationIds) {
      await cancelReminderIds(original.notificationIds);
    }

    const rescheduledTask = await rescheduleTodoReminders(updatedTask);

    const allLists = { ...todos };
    for (const listId in allLists) {
      allLists[listId] = allLists[listId].map((t) => (t.id === rescheduledTask.id ? rescheduledTask : t));
    }

    let foundListId = selectedList;
    for (const listId in allLists) {
      if (allLists[listId].find((t) => t.id === rescheduledTask.id)) {
        foundListId = listId;
        break;
      }
    }
    if (rescheduledTask.folderId && rescheduledTask.folderId !== foundListId) {
      allLists[foundListId] = allLists[foundListId].filter((t) => t.id !== rescheduledTask.id);
      if (!allLists[rescheduledTask.folderId]) allLists[rescheduledTask.folderId] = [];
      allLists[rescheduledTask.folderId].push(rescheduledTask);
    }

    setTodos(allLists);
    await persistState(lists, selectedList, allLists);
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const handleBulkComplete = async () => {
    const selectedIdsArray = Array.from(selectedItemIds);
    const habitIds = selectedIdsArray.filter((id) => id.startsWith("habit-"));
    const taskIds = selectedIdsArray.filter((id) => !id.startsWith("habit-"));

    if (taskIds.length > 0) {
      const nextTodos = { ...todos };
      for (const listId in nextTodos) {
        nextTodos[listId] = nextTodos[listId].map((t) => {
          if (selectedItemIds.has(t.id)) {
            return { ...t, completed: true, lastUpdated: getDateKey() };
          }
          return t;
        });
      }
      setTodos(nextTodos);
      await persistState(lists, selectedList, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    }

    if (habitIds.length > 0) {
      const today = getDateKey();
      const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          let nextStreak = 1;
          if (h.lastCompletedDate === today) {
            nextStreak = h.streak || 1;
          } else if (h.lastCompletedDate === yesterday) {
            nextStreak = h.streak + 1;
          }
          return {
            ...h,
            completedToday: true,
            lastCompletedDate: today,
            streak: nextStreak,
            bestStreak: Math.max(h.bestStreak || 0, nextStreak),
            lastUpdated: today,
          };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  const handleBulkArchive = async () => {
    const selectedIdsArray = Array.from(selectedItemIds);
    const habitIds = selectedIdsArray.filter((id) => id.startsWith("habit-"));
    const taskIds = selectedIdsArray.filter((id) => !id.startsWith("habit-"));

    if (taskIds.length > 0) {
      const nextTodos = { ...todos };
      for (const listId in nextTodos) {
        nextTodos[listId] = nextTodos[listId].map((t) => {
          if (selectedItemIds.has(t.id)) {
            void cancelReminderIds(t.notificationIds || []);
            return { ...t, archived: true, notificationIds: [], lastUpdated: getDateKey() };
          }
          return t;
        });
      }
      setTodos(nextTodos);
      await persistState(lists, selectedList, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    }

    if (habitIds.length > 0) {
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          void cancelReminderIds(h.notificationIds || []);
          return { ...h, archived: true, notificationIds: [], lastUpdated: getDateKey() };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  const handleBulkDelete = () => {
    const itemCount = selectedItemIds.size;
    Alert.alert(
      "Delete Selected",
      `Are you sure you want to delete the ${itemCount} selected item(s)? They will be moved to the Recycle Bin.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const selectedIdsArray = Array.from(selectedItemIds);
            const habitIds = selectedIdsArray.filter((id) => id.startsWith("habit-"));
            const taskIds = selectedIdsArray.filter((id) => !id.startsWith("habit-"));
            const originalWorkspaceName = lists.find((l) => l.id === selectedList)?.name || "Default";

            if (taskIds.length > 0) {
              const listTodos = todos[selectedList] ?? [];
              const todosToDelete = listTodos.filter((t) => selectedItemIds.has(t.id));

              for (const todo of todosToDelete) {
                await cancelReminderIds(todo.notificationIds || []);
                const folderName = lists.find((l) => l.id === (todo.folderId || selectedList))?.name || originalWorkspaceName;
                await addToRecycleBin("task", todo, folderName);
              }

              const nextTodos = { ...todos };
              for (const listId in nextTodos) {
                nextTodos[listId] = nextTodos[listId].filter((t) => !selectedItemIds.has(t.id));
              }
              setTodos(nextTodos);
              await persistState(lists, selectedList, nextTodos);
              emitStateChange("tasks_changed", "tasks_screen");

              showUndo({
                message: `Deleted ${taskIds.length} task(s)`,
                onUndo: async () => {
                  const binItems = await getRecycleBinItems();
                  await saveRecycleBinItems(binItems.filter((item) => !selectedItemIds.has(item.id)));

                  const rescheduledTodos = await Promise.all(
                    todosToDelete.map((t) => rescheduleTodoReminders(t))
                  );

                  for (const todo of rescheduledTodos) {
                    const listId = todo.folderId || selectedList;
                    await TaskRepository.saveTask({ ...todo, folderId: listId });
                  }
                  // Re-read state from current
                  const refreshedMap = await TaskRepository.getTasks(selectedList);
                  const refreshedTodos = Object.values(refreshedMap).map((t: any) => ({
                    ...t,
                    folderId: selectedList,
                    scheduledDate: t.scheduledDate || t.dueDate,
                  })) as Task[];
                  const currentTodos = { ...todos, [selectedList]: refreshedTodos };
                  await persistState(lists, selectedList, currentTodos);
                  setTodos(currentTodos);
                  emitStateChange("tasks_changed", "tasks_screen");
                },
              });
            }

            if (habitIds.length > 0) {
              const habitsToDelete = habits.filter((h) => selectedItemIds.has(h.id));

              for (const habit of habitsToDelete) {
                await cancelReminderIds(habit.notificationIds || []);
                const folderName = lists.find((l) => l.id === (habit.folderId || "default"))?.name || "Default";
                await addToRecycleBin("habit", habit, folderName);
              }

              const nextHabits = habits.filter((h) => !selectedItemIds.has(h.id));
              setHabits(nextHabits);
              await persistHabits(nextHabits);
              emitStateChange("habits_changed", "tasks_screen");

              showUndo({
                message: `Deleted ${habitIds.length} habit(s)`,
                onUndo: async () => {
                  const binItems = await getRecycleBinItems();
                  await saveRecycleBinItems(binItems.filter((item) => !selectedItemIds.has(item.id)));

                  const rescheduledHabits = await Promise.all(
                    habitsToDelete.map((h) => rescheduleHabitReminders(h))
                  );

                  for (const habit of rescheduledHabits) {
                    await HabitRepository.saveHabit({ ...habit, folderId: selectedList });
                  }
                  // Re-read state from current
                  const refreshedHabitsMap = await HabitRepository.getHabits(selectedList);
                  const restored = Object.values(refreshedHabitsMap).map((h: any) => ({
                    ...h,
                    folderId: selectedList,
                    completedToday: h.completedDates?.includes(getDateKey()) || false,
                  })) as Habit[];
                  await persistHabits(restored);
                  setHabits(restored);
                  emitStateChange("habits_changed", "tasks_screen");
                },
              });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            setIsBulkSelectActive(false);
            setSelectedItemIds(new Set());
          },
        },
      ]
    );
  };

  const handleBulkMove = async (targetFolderId: string) => {
    setIsMoveModalVisible(false);
    const selectedIdsArray = Array.from(selectedItemIds);
    const habitIds = selectedIdsArray.filter((id) => id.startsWith("habit-"));
    const taskIds = selectedIdsArray.filter((id) => !id.startsWith("habit-"));

    if (taskIds.length > 0) {
      const nextTodos = { ...todos };
      const itemsToMove: Task[] = [];
      for (const listId in nextTodos) {
        const itemsToKeep: Task[] = [];
        nextTodos[listId].forEach((t) => {
          if (selectedItemIds.has(t.id)) {
            itemsToMove.push({ ...t, folderId: targetFolderId, lastUpdated: getDateKey() });
          } else {
            itemsToKeep.push(t);
          }
        });
        nextTodos[listId] = itemsToKeep;
      }
      if (!nextTodos[targetFolderId]) {
        nextTodos[targetFolderId] = [];
      }
      nextTodos[targetFolderId] = [...itemsToMove, ...nextTodos[targetFolderId]];
      setTodos(nextTodos);
      await persistState(lists, selectedList, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    }

    if (habitIds.length > 0) {
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          return { ...h, folderId: targetFolderId, lastUpdated: getDateKey() };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

  const convertCollectionItemToTask = async (item: Resource, targetWorkspaceId?: string) => {
    try {
      const destinationWorkspaceId = targetWorkspaceId || "default";
      const newTask: Task = {
        id: String(Date.now()),
        title: item.title,
        description: item.content || undefined,
        completed: false,
        category: "work",
        priority: "medium",
        scheduledDate: getDateKey(),
        folderId: destinationWorkspaceId === "unassigned" ? "default" : destinationWorkspaceId,
        createdAt: Date.now(),
        createdDate: getDateKey(),
      };

      await TaskRepository.saveTask({
        ...newTask,
        folderId: newTask.folderId || "default",
        scheduledDate: newTask.scheduledDate,
      });
      const refreshedTasksMap = await TaskRepository.getTasks(newTask.folderId || "default");
      const refreshedTodos = Object.values(refreshedTasksMap).map((t: any) => ({
        ...t,
        folderId: newTask.folderId || "default",
        scheduledDate: t.scheduledDate || t.dueDate,
      })) as Task[];
      setTodos({ ...todos, [newTask.folderId || "default"]: refreshedTodos });

      await earnPebble("task");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");
      emitStateChange("profile_changed", "tasks_screen");
      showToast("✓ Task created from reference (+10 XP!)");
    } catch (e) {
      console.warn("Failed to convert collection item to task", e);
    }
  };

  return {
    workspaces,
    setWorkspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceSegment,
    setWorkspaceSegment,
    workspaceModalVisible,
    setWorkspaceModalVisible,
    editingWorkspaceId,
    setEditingWorkspaceId,
    handleSelectWorkspace,
    handleBackToWorkspaces,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    toggleLinkResource,
    activeSegment,
    setActiveSegment,
    folderSegment,
    setFolderSegment,
    selectedDate,
    setSelectedDate,
    searchQuery,
    setSearchQuery,
    isBulkSelectActive,
    setIsBulkSelectActive,
    selectedItemIds,
    setSelectedItemIds,
    isMoveModalVisible,
    setIsMoveModalVisible,
    openedFolderId,
    setOpenedFolderId,
    folderModalVisible,
    setFolderModalVisible,
    editingFolderId,
    setEditingFolderId,
    highlightedTodoId,
    setHighlightedTodoId,
    lists,
    setLists,
    selectedList,
    setSelectedList,
    todos,
    setTodos,
    title,
    setTitle,
    selectedTodoCategory,
    setSelectedTodoCategory,
    selectedTodoPriority,
    setSelectedTodoPriority,
    selectedListPriorityFilter,
    setSelectedListPriorityFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    editingTask,
    setEditingTask,
    editingHabit,
    setEditingHabit,
    expandedTodoIds,
    setExpandedTodoIds,
    taskPositions,
    setTaskPositions,
    habits,
    setHabits,
    habitTitle,
    setHabitTitle,
    selectedHabitPriority,
    setSelectedHabitPriority,
    selectedListHabitPriorityFilter,
    setSelectedListHabitPriorityFilter,
    showCelebrate,
    setShowCelebrate,
    highlightedHabitId,
    setHighlightedHabitId,
    alarmMenu,
    setAlarmMenu,
    listsExpanded,
    setListsExpanded,
    addingTask,
    setAddingTask,
    selectedTodoDate,
    setSelectedTodoDate,
    isAddingHabit,
    setIsAddingHabit,
    statsExpanded,
    setStatsExpanded,
    profile,
    setProfile,
    hasUnreadNotifs,
    setHasUnreadNotifs,
    nlpVisible,
    setNlpVisible,
    activeSuggestions,
    setActiveSuggestions,
    collections,
    setCollections,
    checklists,
    setChecklists,

    // Refs
    scrollViewRef,
    addTaskInputRef,

    // Memoized values
    weekDaysStrip,
    formatSelectedDayName,
    filteredTodos,
    overdueTodos,
    todayTodos,
    upcomingTodos,
    inboxTodos,
    remainingCount,
    completedCount,
    unfinishedHabitCount,
    displayedHabits,
    completedHabitCount,
    habitCompletionPct,
    longestStreak,

    // Callbacks & Handlers
    isTasksHydrated,
    isHydrated: isWorkspacesHydrated && isTasksHydrated,
    loadState,
    loadHabits,
    loadSuggestions,
    handleSaveParsedItem,
    handleUpdateExistingFromNLP,
    handleSaveEditedHabit,
    handleDeleteEditedHabit,
    persistState,
    persistHabits,
    selectList,
    cycleCategory,
    cyclePriority,
    cycleDate,
    getSelectedDateLabel,
    onSaveNewTask,
    updateTodoTitle,
    moveTodoToList,
    toggleTodo,
    deleteTodo,
    updateTodoCategory,
    toggleExpand,
    clearCompleted,
    scheduleAlarm,
    scheduleAlarmWithDays,
    onSaveEditedTask,
    cancelAlarm,
    formatAlarm: formatAlarmFromHook,
    addHabit,
    deleteHabit,
    toggleHabit,
    recoverHabitStreak,
    handleBulkComplete,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkMove,
    createCollection,
    deleteCollection,
    renameCollection,
    addCollectionItem,
    updateCollectionItem,
    deleteCollectionItem,
    toggleArchiveCollectionItem,
    togglePinCollectionItem,
    convertCollectionItemToTask,
    loadVaultState,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    toggleChecklistItem,
    loadChecklistsState,
  };
}