import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
  UiStateRepository,
} from "@/repositories";
import { useUndo } from "@/shared/components/ui/UndoContext";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Platform,
  TextInput as RNTextInput,
  ScrollView,
} from "react-native";

import {
  Checklist,
  Habit,
  Resource,
  Task,
  Workspace,
  INBOX_WORKSPACE_ID,
} from "@/shared/types/domain.types";

import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import {
  getActiveSuggestions,
  logTaskCreation,
  type SmartSuggestion,
} from "@/features/capture/services/suggestions.service";
import { useChecklistState } from "@/features/checklists/hooks/useChecklistState";
import { useHabitCrud } from "@/features/habits/hooks/useHabitCrud";
import { normalizeHabitsForToday } from "@/features/habits/services/habit.service";
import { useResourceLinkState } from "@/features/resources/hooks/useResourceLinkState";
import { useResourceState } from "@/features/resources/hooks/useResourceState";
import {
  getProfile,
  type UserProfile,
} from "@/features/settings/services/settings.service";
import { useSelectionState } from "@/features/tasks/hooks/useSelectionState";
import { useTaskCrud } from "@/features/tasks/hooks/useTaskCrud";
import { useTaskFiltering } from "@/features/tasks/hooks/useTaskFiltering";
import {
  DEFAULT_TASK_CATEGORY,
  normalizeTaskCategory,
  TASK_CATEGORY_META,
  type TaskCategory,
} from "@/features/tasks/services/task-categories";
import {
  formatAlarm,
  getDateKey,
  getSelectedDateLabel,
  globalHabits,
  globalTodos,
} from "@/features/tasks/utils/task-formatting";
import { useWorkspaceState } from "@/features/workspaces/hooks/useWorkspaceState";
import { pluginManager } from "@/plugin";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import {
  addStateListener,
  emitStateChange,
} from "@/services/events/state-events";
import { useReminderState } from "@/services/scheduling/hooks/useReminderState";
import { getNotificationLogs } from "@/services/scheduling/notifications-log";
import {
  cancelReminderIds,
  rescheduleHabitReminders,
  rescheduleTodoReminders,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import {
  addToRecycleBin,
  getRecycleBinItems,
  saveRecycleBinItems,
} from "@/services/storage/storage.service";

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
    workspaceId?: string;
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

  // Resource state
  const {
    resources,
    loadResourcesState,
    createResource,
    updateResource,
    deleteResource,
    toggleArchiveResource,
  } = useResourceState(selectedWorkspaceId, showToast);

  // Checklist state
  const {
    checklists,
    setChecklists,
    loadChecklistsState,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    toggleChecklistItem,
  } = useChecklistState(selectedWorkspaceId);

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
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(
    null,
  );
  const [isTasksHydrated, setIsTasksHydrated] = useState<boolean>(
    () => globalTodos !== null,
  );
  const [todos, setTodos] = useState<Record<string, Task[]>>(
    () => globalTodos || {},
  );
  const [title, setTitle] = useState("");
  const [selectedTodoCategory, setSelectedTodoCategory] =
    useState<TaskCategory>(DEFAULT_TASK_CATEGORY);
  const [selectedTodoPriority, setSelectedTodoPriority] = useState<
    "low" | "medium" | "high"
  >("medium");


  const [expandedTodoIds, setExpandedTodoIds] = useState<
    Record<string, boolean>
  >({});
  const [taskPositions, setTaskPositions] = useState<Record<string, number>>(
    {},
  );

  // Habits Screen State
  const [habits, setHabits] = useState<Habit[]>(() => globalHabits || []);
  const [habitTitle, setHabitTitle] = useState("");
  const [selectedHabitPriority, setSelectedHabitPriority] = useState<
    "low" | "medium" | "high"
  >("medium");
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [highlightedHabitId, setHighlightedHabitId] = useState<string | null>(
    null,
  );
  const celebrateDateRef = useRef<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(getDateKey());
  const [selectedTodoDate, setSelectedTodoDate] =
    useState<string>(getDateKey());
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);

  // NLP Modal & Heuristic Suggestions States
  const [nlpVisible, setNlpVisible] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<SmartSuggestion[]>(
    [],
  );

  // Filtering hook — manages search, date, filter state & derived memoized lists
  const filtering = useTaskFiltering(
    todos,
    habits,
    selectedWorkspaceId,
    selectedDate,
    workspaces,
  );
  const {
    searchQuery,
    setSearchQuery,
    selectedWorkspacePriorityFilter,
    setSelectedWorkspacePriorityFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedWorkspaceHabitPriorityFilter,
    setSelectedWorkspaceHabitPriorityFilter,

    // Derived values
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

  // Task CRUD operations
  const {
    persistState,
    onSaveNewTask: baseSaveNewTask,
    updateTodoTitle,
    moveTodoToList: baseMoveTodoToList,
    toggleTodo,
    deleteTodo,
    updateTodoCategory,
    clearCompleted,
    convertCollectionItemToTask,
  } = useTaskCrud({
    todos,
    setTodos,
    selectedWorkspaceId,
    workspaces,
    showUndo,
    showToast,
  });

  // Habit CRUD operations
  const {
    persistHabits,
    addHabit: baseAddHabit,
    deleteHabit: baseDeleteHabit,
    toggleHabit: baseToggleHabit,
  } = useHabitCrud({
    habits,
    setHabits,
    selectedWorkspaceId,
    workspaces,
    showUndo,
    showToast,
  });

  const onSaveNewTask = async (newTask: Task) => {
    await baseSaveNewTask(newTask);
  };

  const moveTodoToList = async (
    todoId: string,
    fromListId: string,
    toListId: string,
  ) => {
    await baseMoveTodoToList(todoId, fromListId, toListId);
    setExpandedTodoIds((prev) => {
      const next = { ...prev };
      delete next[todoId];
      return next;
    });
  };

  // Reminder state — needs todos, setTodos, currentTodos, remainingCount, persistState, workspaces
  const {
    alarmMenu,
    setAlarmMenu,
    scheduleAlarm,
    scheduleAlarmWithDays,
    cancelAlarm,
  } = useReminderState(
    todos,
    setTodos,
    selectedWorkspaceId,
    currentTodos,
    remainingCount,
    persistState,
    workspaces,
  );

  // Resource linking state
  const { toggleLinkResource } = useResourceLinkState(
    todos,
    setTodos,
    habits,
    setHabits,
    checklists,
    setChecklists,
    resources,
    selectedWorkspaceId,
    activeWorkspaceId,
    workspaces,
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
    console.log("[INSTRUMENT] [useTasksState] loadState() CALLED");
    try {
      // Load workspaces first and use the returned array directly (never read stale state)
      const currentLists = await loadWorkspaces();

      // Query current repositories for ALL folders to preserve counts in WorkspaceGrid
      const allTodosMap: Record<string, Task[]> = {};
      const allHabits: Habit[] = [];
      const allChecklistsMap: Record<string, Checklist[]> = {};
      const allResourcesMap: Record<string, Resource[]> = {};

      for (const folder of currentLists) {
        const folderId = folder.id;

        // Load tasks
        const folderTasksMap = await TaskRepository.getTasks(folderId);
        allTodosMap[folderId] = Object.values(folderTasksMap);

        // Load habits
        const folderHabitsMap = await HabitRepository.getHabits(folderId);
        allHabits.push(...Object.values(folderHabitsMap));

        // Load checklists
        const checklistsMap = await ChecklistRepository.getChecklists(folderId);
        allChecklistsMap[folderId] = Object.values(checklistsMap);

        // Load flat resources directly from ResourceRepository
        const resourcesMap = await ResourceRepository.getResources(folderId);
        allResourcesMap[folderId] = Object.values(resourcesMap).map(
          (r: any) => ({
            id: r.id,
            workspaceId: r.workspaceId || folderId,
            type: (r.resourceType || r.type || "note") as any,
            kind:
              r.kind ||
              (r.resourceType === "idea" || r.type === "idea"
                ? "idea"
                : undefined),
            title: r.title,
            content:
              r.content !== undefined
                ? r.content
                : r.payload?.content || r.body?.content,
            url: r.url !== undefined ? r.url : r.payload?.url || r.body?.url,
            mediaUri: r.mediaUri,
            previewImageUrl: r.previewImageUrl,
            archived: r.archived || false,
            pinned: r.pinned || false,
            linkedItemIds: r.linkedItemIds || [],
            tags: r.tags || [],
            createdAt: r.createdAt || Date.now(),
            updatedAt: r.updatedAt || Date.now(),
            fileName: r.fileName || r.payload?.fileName || r.body?.fileName,
            fileSize: r.fileSize || r.payload?.fileSize || r.body?.fileSize,
            mimeType: r.mimeType || r.payload?.mimeType || r.body?.mimeType,
            localUri: r.localUri || r.payload?.localUri || r.body?.localUri,
          }),
        );
      }

      console.log("[INSTRUMENT] [useTasksState] loadState() loaded", Object.keys(allTodosMap).length, "workspaces, calling setTodos(allTodosMap)");
      setTodos(allTodosMap);
      console.log("[INSTRUMENT] [useTasksState] setTodos(allTodosMap) CALLED — allTodosMap keys:", Object.keys(allTodosMap));
      setHabits(allHabits);
      setChecklists(allChecklistsMap);
      await loadResourcesState(selectedWorkspaceId);

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
            // Use canonical reminder.triggerAt instead of legacy alarmTime
            const triggerAt = t.reminder?.triggerAt;
            if (triggerAt && triggerAt > Date.now() && t.reminder?.enabled !== false) {
              const delay = triggerAt - Date.now();
              const timeoutId = setTimeout(() => {
                try {
                  new Notification("Task reminder", { body: t.title });
                } catch {
                  Alert.alert("Reminder", t.title);
                }
              }, delay);
              // Store timeout reference in a web-specific field (not legacy alarmId)
              setTodos((current) => {
                const updatedLists = { ...current };
                for (const lid in updatedLists) {
                  updatedLists[lid] = updatedLists[lid].map((tt) =>
                    tt.id === t.id
                      ? { ...tt, _webTimeoutId: `web-${String(timeoutId)}` }
                      : tt,
                  );
                }
                persistState(currentLists, selectedWorkspaceId, updatedLists);
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
  }, [loadWorkspaces, selectedWorkspaceId, persistState, activeWorkspaceId]);

  const loadHabits = useCallback(
    async (workspaceList?: Workspace[]) => {
      try {
        const targetLists =
          workspaceList && workspaceList.length > 0 ? workspaceList : workspaces;
        const allHabits: Habit[] = [];
        for (const folder of targetLists) {
          const folderId = folder.id;
          const folderHabitsMap = await HabitRepository.getHabits(folderId);
          allHabits.push(...Object.values(folderHabitsMap));
        }
        setHabits(allHabits);
      } catch (e) {
        console.warn("Failed to load current habits", e);
        setHabits([]);
      }
    },
    [workspaces],
  );

  const loadSuggestions = useCallback(async () => {
    try {
      const active = await getActiveSuggestions();
      setActiveSuggestions(active);
    } catch {}
  }, []);

  const handleSaveParsedItem = async (
    parsed: ParsedProductivityItem,
    targetWorkspaceId?: string,
  ) => {
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
        const dateObj = new Date(
          year,
          monthVal - 1,
          dayVal,
          hours,
          minutes,
          0,
          0,
        );

        if (parsed.reminderOffsetMinutes) {
          dateObj.setMinutes(
            dateObj.getMinutes() - parsed.reminderOffsetMinutes,
          );
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
              channelId:
                Platform.OS === "android" ? "todo-reminders" : undefined,
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

      const destinationWorkspaceId =
        targetWorkspaceId || activeWorkspaceId || INBOX_WORKSPACE_ID;

      const newTodo: Task = {
        id: generatedTaskId,
        workspaceId: destinationWorkspaceId,
        title: parsed.title,
        status: "todo",
        priority: parsed.priority || "none",
        categoryId: parsed.category || DEFAULT_TASK_CATEGORY,
        schedule: parsed.date ? { date: parsed.date } : undefined,
        reminder: alarmTime
          ? {
              enabled: true,
              triggerAt: alarmTime,
              notificationIds,
            }
          : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const listTodos = todos[destinationWorkspaceId] ?? [];
      const updatedTodos = {
        ...todos,
        [destinationWorkspaceId]: [newTodo, ...listTodos],
      };
      setTodos(updatedTodos);

      const wsName =
        workspaces.find((l) => l.id === destinationWorkspaceId)?.name ||
        "My Pebbles";
      showToast(`✓ Task added to ${wsName}`);

      await persistState(workspaces, selectedWorkspaceId, updatedTodos);
      emitStateChange("tasks_changed", "tasks_screen");
      pluginManager.dispatchTaskCreated(newTodo);

      const newSuggestion = await logTaskCreation(parsed.title);
      if (newSuggestion) {
        await loadSuggestions();
      }
    } else {
      const hour = parsed.time ? Number(parsed.time.split(":")[0]) : undefined;
      const minute = parsed.time
        ? Number(parsed.time.split(":")[1])
        : undefined;
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

      const destinationWorkspaceId =
        targetWorkspaceId || activeWorkspaceId || INBOX_WORKSPACE_ID;

      // Compute canonical triggerAt from parsed hour/minute (habits always recur from today)
      const habitTriggerAt =
        hour !== undefined && minute !== undefined
          ? new Date().setHours(hour, minute, 0, 0)
          : undefined;

      const newHabit: Habit = {
        id: generatedHabitId,
        workspaceId: destinationWorkspaceId,
        title: parsed.title,
        categoryId: parsed.category || "health",
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
        completionHistory: [],
        reminder:
          habitTriggerAt !== undefined
            ? {
                enabled: true,
                triggerAt: habitTriggerAt,
                notificationIds,
              }
            : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const nextHabits = [newHabit, ...habits];
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      const catLabel =
        TASK_CATEGORY_META.find(
          (c) => c.key === (newHabit.categoryId || "health"),
        )?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);

      emitStateChange("habits_changed", "tasks_screen");
    }

    void syncWidgetData().catch(() => {});
    void recordDailyHistorySnapshot();
  };



  const handleUpdateExistingFromNLP = async (
    parsed: ParsedProductivityItem,
    existingId: string,
    type: "task" | "habit",
  ) => {
    if (type === "habit") {
      const existing = habits.find((h) => h.id === existingId);
      if (!existing) return;
      const updatedHabit: Habit = {
        ...existing,
        title: parsed.title,
        categoryId: parsed.category || existing.categoryId,
        recurrence: parsed.recurrence
          ? {
              frequency: (parsed.recurrence.type as any) || "daily",
              interval: parsed.recurrence.interval || 1,
              daysOfWeek: parsed.recurrence.days,
            }
          : existing.recurrence,
        updatedAt: Date.now(),
      };
      await HabitRepository.saveHabit(updatedHabit);
      const next = habits.map((h) => (h.id === updatedHabit.id ? updatedHabit : h));
      setHabits(next);
      await persistHabits(next);
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

      const updatedTask: Task = {
        ...existingTask,
        title: parsed.title,
        categoryId: parsed.category || existingTask.categoryId,
        schedule: parsed.date
          ? { ...existingTask.schedule, date: parsed.date }
          : existingTask.schedule,
        priority: parsed.priority || existingTask.priority,
        updatedAt: Date.now(),
      };

      if (existingTask.reminder?.notificationIds) {
        await cancelReminderIds(existingTask.reminder.notificationIds);
      }
      const rescheduled = await rescheduleTodoReminders(updatedTask);
      await TaskRepository.saveTask({
        ...rescheduled,
        workspaceId: rescheduled.workspaceId || INBOX_WORKSPACE_ID,
      });
      emitStateChange("tasks_changed", "tasks_screen");
      showToast(`✓ Task updated`);
    }
  };

  // Screen-level wrappers that add UI state management on top of the extracted CRUD
  const addHabit = async () => {
    const trimmed = habitTitle.trim();
    if (!trimmed) {
      return;
    }

    await baseAddHabit(trimmed, selectedHabitPriority, selectedTodoCategory);
    setHabitTitle("");
    setSelectedHabitPriority("medium");
  };

  const deleteHabit = async (id: string) => {
    await baseDeleteHabit(id);
  };

  const toggleHabit = async (id: string) => {
    await baseToggleHabit(id);
  };

  useFocusEffect(
    useCallback(() => {
      void loadState();
      void loadSuggestions();
    }, [loadState, loadSuggestions]),
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
    if (
      habits.length > 0 &&
      completedHabitCount === habits.length &&
      celebrateDateRef.current !== today
    ) {
      celebrateDateRef.current = today;
      setShowCelebrate(true);
      const timer = setTimeout(() => setShowCelebrate(false), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [completedHabitCount, habits.length]);

  // AppState reload habit streak check
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
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
      },
    );

    return () => {
      subscription.remove();
    };
  }, [persistHabits]);

  useEffect(() => {
    setSearchQuery("");
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  }, [activeWorkspaceId, workspaceSegment]);

  // Listen for global task and habit updates to sync state immediately
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", (emitterId) => {
      console.log("[INSTRUMENT] [useTasksState] tasks_changed listener FIRED, emitterId =", emitterId);
      if (emitterId !== "tasks_screen") {
        console.log("[INSTRUMENT] [useTasksState] emitterId check PASSED, calling loadState()");
        void loadState();
      } else {
        console.log("[INSTRUMENT] [useTasksState] emitterId check SKIPPED (was tasks_screen)");
      }
    });

    const unsubscribeHabits = addStateListener(
      "habits_changed",
      (emitterId) => {
        if (emitterId !== "tasks_screen") {
          void loadHabits();
        }
      },
    );

    const unsubscribeResources = addStateListener(
      "resources_changed",
      (emitterId) => {
        if (emitterId !== "tasks_screen") {
          void loadResourcesState();
        }
      },
    );

    const unsubscribeChecklists = addStateListener(
      "checklists_changed",
      (emitterId) => {
        if (emitterId !== "tasks_screen") {
          void loadChecklistsState();
        }
      },
    );

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
      unsubscribeResources();
      unsubscribeChecklists();
    };
  }, [loadState, loadHabits, loadResourcesState, loadChecklistsState]);

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
        const folderId = habit.workspaceId || INBOX_WORKSPACE_ID;
        setActiveWorkspaceId(folderId);
        setSelectedWorkspaceId(folderId);
        setHighlightedHabitId(focusHabitId);
        const timer = setTimeout(() => setHighlightedHabitId(null), 2200);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [focusHabitId, habits, setActiveWorkspaceId, setSelectedWorkspaceId]);

  const selectWorkspace = async (listId: string) => {
    setSelectedWorkspaceId(listId);
    if (listId && listId !== "null") {
      await UiStateRepository.saveUiState({ activeWorkspaceId: listId });
    }

    try {
      // Reload current active workspace data
      const activeTasksMap = await TaskRepository.getTasks(listId);
      const activeHabitsMap = await HabitRepository.getHabits(listId);

      const activeTodos: Task[] = Object.values(activeTasksMap).map((t) => ({
        ...t,
        workspaceId: listId,
        updatedAt: t.updatedAt || Date.now(),
      }));

      const activeHabits: Habit[] = Object.values(activeHabitsMap).map((h) => ({
        id: h.id,
        workspaceId: listId,
        title: h.title,
        recurrence: h.recurrence,
        completionHistory: h.completionHistory || [],
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
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
    const index = TASK_CATEGORY_META.findIndex(
      (c) => c.key === selectedTodoCategory,
    );
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

    const dates = [
      getDateKey(today),
      getDateKey(tomorrow),
      getDateKey(nextWeek),
      "inbox",
    ];
    const index = dates.indexOf(selectedTodoDate);
    const nextIndex = (index + 1) % dates.length;
    setSelectedTodoDate(dates[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const toggleExpand = (todoId: string) => {
    setExpandedTodoIds((prev) => ({ ...prev, [todoId]: !prev[todoId] }));
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
      await persistState(workspaces, selectedWorkspaceId, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    }

    if (habitIds.length > 0) {
      const today = getDateKey();
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          const hasToday = h.completionHistory.some((c) => c.date === today);
          const nextHistory = hasToday
            ? h.completionHistory
            : [
                ...h.completionHistory,
                { date: today, completedAt: Date.now() },
              ];
          return {
            ...h,
            completionHistory: nextHistory,
            updatedAt: Date.now(),
          };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
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
            if (t.reminder?.notificationIds) {
              void cancelReminderIds(t.reminder.notificationIds);
            }
            return {
              ...t,
              archivedAt: Date.now(),
              updatedAt: Date.now(),
            };
          }
          return t;
        });
      }
      setTodos(nextTodos);
      await persistState(workspaces, selectedWorkspaceId, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    }

    if (habitIds.length > 0) {
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          if (h.reminder?.notificationIds) {
            void cancelReminderIds(h.reminder.notificationIds);
          }
          return {
            ...h,
            archivedAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
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
            const habitIds = selectedIdsArray.filter((id) =>
              id.startsWith("habit-"),
            );
            const taskIds = selectedIdsArray.filter(
              (id) => !id.startsWith("habit-"),
            );
            const originalWorkspaceName =
              workspaces.find((l) => l.id === selectedWorkspaceId)?.name || "Inbox";

            if (taskIds.length > 0) {
              const listTodos = todos[selectedWorkspaceId] ?? [];
              const todosToDelete = listTodos.filter((t) =>
                selectedItemIds.has(t.id),
              );

              for (const todo of todosToDelete) {
                if (todo.reminder?.notificationIds) {
                  await cancelReminderIds(todo.reminder.notificationIds);
                }
                const folderName =
                  workspaces.find((l) => l.id === (todo.workspaceId || selectedWorkspaceId))
                    ?.name || originalWorkspaceName;
                await addToRecycleBin("task", todo, folderName);
              }

              const nextTodos = { ...todos };
              for (const listId in nextTodos) {
                nextTodos[listId] = nextTodos[listId].filter(
                  (t) => !selectedItemIds.has(t.id),
                );
              }
              setTodos(nextTodos);
              await persistState(workspaces, selectedWorkspaceId, nextTodos);
              emitStateChange("tasks_changed", "tasks_screen");

              showUndo({
                message: `Deleted ${taskIds.length} task(s)`,
                onUndo: async () => {
                  const binItems = await getRecycleBinItems();
                  await saveRecycleBinItems(
                    binItems.filter(
                      (item) => !selectedItemIds.has(item.entityId),
                    ),
                  );

                  const rescheduledTodos = await Promise.all(
                    todosToDelete.map((t) => rescheduleTodoReminders(t)),
                  );

                  for (const todo of rescheduledTodos) {
                    const listId = todo.workspaceId || selectedWorkspaceId;
                    await TaskRepository.saveTask({
                      ...todo,
                      workspaceId: listId,
                    });
                  }
                  // Re-read state from current
                  const refreshedMap =
                    await TaskRepository.getTasks(selectedWorkspaceId);
                  const refreshedTodos = Object.values(refreshedMap) as Task[];
                  const currentTodos = {
                    ...todos,
                    [selectedWorkspaceId]: refreshedTodos,
                  };
                  await persistState(workspaces, selectedWorkspaceId, currentTodos);
                  setTodos(currentTodos);
                  emitStateChange("tasks_changed", "tasks_screen");
                },
              });
            }

            if (habitIds.length > 0) {
              const habitsToDelete = habits.filter((h) =>
                selectedItemIds.has(h.id),
              );

              for (const habit of habitsToDelete) {
                if (habit.reminder?.notificationIds) {
                  await cancelReminderIds(habit.reminder.notificationIds);
                }
                const folderName =
                  workspaces.find((l) => l.id === (habit.workspaceId || INBOX_WORKSPACE_ID))
                    ?.name || "Inbox";
                await addToRecycleBin("habit", habit, folderName);
              }

              const nextHabits = habits.filter(
                (h) => !selectedItemIds.has(h.id),
              );
              setHabits(nextHabits);
              await persistHabits(nextHabits);
              emitStateChange("habits_changed", "tasks_screen");

              showUndo({
                message: `Deleted ${habitIds.length} habit(s)`,
                onUndo: async () => {
                  const binItems = await getRecycleBinItems();
                  await saveRecycleBinItems(
                    binItems.filter(
                      (item) => !selectedItemIds.has(item.entityId),
                    ),
                  );

                  const rescheduledHabits = await Promise.all(
                    habitsToDelete.map((h) => rescheduleHabitReminders(h)),
                  );

                  for (const habit of rescheduledHabits) {
                    await HabitRepository.saveHabit({
                      ...habit,
                      workspaceId: selectedWorkspaceId,
                    });
                  }
                  // Re-read state from current
                  const refreshedHabitsMap =
                    await HabitRepository.getHabits(selectedWorkspaceId);
                  const restored = Object.values(refreshedHabitsMap) as Habit[];
                  await persistHabits(restored);
                  setHabits(restored);
                  emitStateChange("habits_changed", "tasks_screen");
                },
              });
            }

            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            ).catch(() => {});
            setIsBulkSelectActive(false);
            setSelectedItemIds(new Set());
          },
        },
      ],
    );
  };

  const handleBulkMove = async (targetWorkspaceId: string) => {
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
            itemsToMove.push({
              ...t,
              workspaceId: targetWorkspaceId,
              updatedAt: Date.now(),
            });
          } else {
            itemsToKeep.push(t);
          }
        });
        nextTodos[listId] = itemsToKeep;
      }
      if (!nextTodos[targetWorkspaceId]) {
        nextTodos[targetWorkspaceId] = [];
      }
      nextTodos[targetWorkspaceId] = [
        ...itemsToMove,
        ...nextTodos[targetWorkspaceId],
      ];
      setTodos(nextTodos);
      await persistState(workspaces, selectedWorkspaceId, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    }

    if (habitIds.length > 0) {
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          return { ...h, workspaceId: targetWorkspaceId, updatedAt: Date.now() };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

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
    highlightedTodoId,
    setHighlightedTodoId,
    todos,
    setTodos,
    title,
    setTitle,
    selectedTodoCategory,
    setSelectedTodoCategory,
    selectedTodoPriority,
    setSelectedTodoPriority,
    selectedWorkspacePriorityFilter,
    setSelectedWorkspacePriorityFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,

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
    selectedWorkspaceHabitPriorityFilter,
    setSelectedWorkspaceHabitPriorityFilter,
    showCelebrate,
    setShowCelebrate,
    highlightedHabitId,
    setHighlightedHabitId,
    alarmMenu,
    setAlarmMenu,
    listsExpanded,
    setListsExpanded,

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
    checklists,
    setChecklists,

    // Refs
    scrollViewRef,
    addTaskInputRef,

    // Memoized values
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
    deleteHabit: baseDeleteHabit,
    persistState,
    persistHabits,
    selectWorkspace,
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
    cancelAlarm,
    formatAlarm: (ms?: number) => formatAlarm(ms),
    addHabit: baseAddHabit,
    toggleHabit: baseToggleHabit,
    handleBulkComplete,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkMove,
    resources,
    loadResourcesState,
    createResource,
    updateResource,
    deleteResource,
    toggleArchiveResource,
    addChecklist,
    createChecklist: addChecklist,
    updateChecklist,
    updateChecklistTitle: updateChecklist,
    deleteChecklist,
    toggleArchiveChecklist: deleteChecklist,
    toggleChecklistItem,
    addChecklistItem: (id: string, itemTitle: string) => {},
    deleteChecklistItem: (id: string, itemId: string) => {},
    loadChecklistsState,
  };
}
