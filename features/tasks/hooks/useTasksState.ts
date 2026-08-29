import {
  HabitRepository,
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
  Habit,
  Task,
  Workspace,
  INBOX_WORKSPACE_ID,
} from "@/shared/types/domain.types";

import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { EntityCommandService } from "@/services/command/EntityCommandService";
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
import { loadWorkspaceData } from "@/features/tasks/services/workspace-data-loader";
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
  rearmWebReminders,
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
    toggleArchiveChecklist,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
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

  const focusResourceId =
    typeof params.focusItemId === "string" && params.focusItemType === "resource"
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

  const loadRequestIdRef = useRef(0);

  const loadState = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    console.log("[INSTRUMENT] [useTasksState] loadState() CALLED, requestId =", requestId);
    try {
      // Load workspaces first and use the returned array directly (never read stale state)
      const currentLists = await loadWorkspaces();

      // Query current repositories for ALL folders to preserve counts in WorkspaceGrid
      const {
        todosMap: allTodosMap,
        habits: allHabits,
        checklistsMap: allChecklistsMap,
      } = await loadWorkspaceData(currentLists);

      // Generation counter check — skip commit if a newer load request was initiated
      if (requestId !== loadRequestIdRef.current) {
        console.log(`[useTasksState] loadState() request #${requestId} superseded by #${loadRequestIdRef.current} — skipping commit`);
        return;
      }

      console.log("[INSTRUMENT] [useTasksState] loadState() loaded", Object.keys(allTodosMap).length, "workspaces, calling setTodos(allTodosMap)");
      setTodos(allTodosMap);
      console.log("[INSTRUMENT] [useTasksState] setTodos(allTodosMap) CALLED — allTodosMap keys:", Object.keys(allTodosMap));
      setHabits(allHabits);
      setChecklists(allChecklistsMap);
      await loadResourcesState(selectedWorkspaceId);

      if (requestId !== loadRequestIdRef.current) return;

      try {
        const userProfile = await getProfile();
        if (requestId !== loadRequestIdRef.current) return;
        setProfile(userProfile);
        const logs = await getNotificationLogs();
        if (requestId !== loadRequestIdRef.current) return;
        const hasUnread = logs.some((l: any) => !l.read);
        setHasUnreadNotifs(hasUnread);
      } catch {}

      if (requestId !== loadRequestIdRef.current) return;

      if (Platform?.OS === "web") {
        // Re-arm web reminders after reload through the canonical scheduler.
        // All returned ids are cancellable and the service's cancel-first
        // semantics keep exactly one active schedule per reminder across
        // repeated loadState() runs (focus, events, reloads).
        const rearmedTodos = await rearmWebReminders(
          Object.values(allTodosMap).flat(),
        );
        if (requestId !== loadRequestIdRef.current) return;

        const rearmedById = new Map(rearmedTodos.map((t) => [t.id, t]));
        let todosChanged = false;
        const updatedMap: Record<string, Task[]> = {};
        for (const [listId, listTodos] of Object.entries(allTodosMap)) {
          updatedMap[listId] = listTodos.map((t) => {
            const updated = rearmedById.get(t.id);
            if (updated && updated !== t) {
              todosChanged = true;
              return updated;
            }
            return t;
          });
        }
        if (todosChanged) {
          setTodos(updatedMap);
          void persistState(currentLists, selectedWorkspaceId, updatedMap);
        }
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

    const destinationWorkspaceId =
      targetWorkspaceId || activeWorkspaceId || INBOX_WORKSPACE_ID;

    if (parsed.type === "task") {
      const newTodo = await EntityCommandService.createTask(
        parsed,
        destinationWorkspaceId,
        { source: "tasks_screen" },
      );

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

      pluginManager.dispatchTaskCreated(newTodo);

      const newSuggestion = await logTaskCreation(parsed.title);
      if (newSuggestion) {
        await loadSuggestions();
      }
    } else {
      const newHabit = await EntityCommandService.createHabit(
        parsed,
        destinationWorkspaceId,
        { source: "tasks_screen" },
      );

      const nextHabits = [newHabit, ...habits];
      setHabits(nextHabits);

      const catLabel =
        TASK_CATEGORY_META.find(
          (c) => c.key === (newHabit.categoryId || "health"),
        )?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);
    }

    void syncWidgetData().catch(() => {});
  };



  const handleUpdateExistingFromNLP = async (
    parsed: ParsedProductivityItem,
    existingId: string,
    type: "task" | "habit",
  ) => {
    if (type === "habit") {
      const existing = habits.find((h) => h.id === existingId);
      if (!existing) return;
      const updates: Partial<Habit> = {
        title: parsed.title,
        categoryId: parsed.category || existing.categoryId,
        recurrence: parsed.recurrence
          ? {
              frequency: (parsed.recurrence.type as any) || "daily",
              interval: parsed.recurrence.interval || 1,
              daysOfWeek: parsed.recurrence.days,
            }
          : existing.recurrence,
      };
      
      const updatedHabit = await EntityCommandService.updateHabit(
        existingId,
        existing.workspaceId || INBOX_WORKSPACE_ID,
        updates
      );
      
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

      await EntityCommandService.updateTask(
        existingTask.id,
        existingTask.workspaceId || INBOX_WORKSPACE_ID,
        {
          title: parsed.title,
          categoryId: parsed.category || existingTask.categoryId,
          schedule: parsed.date
            ? { ...existingTask.schedule, date: parsed.date }
            : existingTask.schedule,
          priority: parsed.priority || existingTask.priority,
        },
        { source: "tasks_screen" }
      );

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
              emitStateChange("habits_changed", "tasks_screen");
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

  // Resource focus from "Use Existing" navigation
  useEffect(() => {
    if (focusResourceId) {
      setActiveSegment("resources" as any);
      setWorkspaceSegment("resources");
    }
  }, [focusResourceId]);

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
        revision: h.revision || 1,
        lifecycleGeneration: h.lifecycleGeneration || 1,
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
      const itemsToComplete: { taskId: string; workspaceId: string }[] = [];
      for (const [listId, listTodos] of Object.entries(todos)) {
        for (const t of listTodos) {
          if (selectedItemIds.has(t.id)) {
            itemsToComplete.push({
              taskId: t.id,
              workspaceId: t.workspaceId || listId,
            });
          }
        }
      }

      // Route through ECS so bulk completion has the same lifecycle side effects
      // as single completion (pebble rewards, reminder cancellation, plugin
      // events, widget sync, analytics) and writes the canonical status field.
      const updatedTasks = await EntityCommandService.completeTasks(
        itemsToComplete,
        { source: "tasks_screen" },
      );

      if (updatedTasks.length > 0) {
        const updatedById = new Map(updatedTasks.map((t) => [t.id, t]));
        setTodos((prev) => {
          const next: Record<string, Task[]> = {};
          for (const [listId, listTodos] of Object.entries(prev)) {
            next[listId] = listTodos.map((t) => updatedById.get(t.id) || t);
          }
          return next;
        });
      }
    }

    if (habitIds.length > 0) {
      const itemsToComplete: { habitId: string; workspaceId: string }[] = [];
      for (const h of habits) {
        if (selectedItemIds.has(h.id)) {
          itemsToComplete.push({
            habitId: h.id,
            workspaceId: h.workspaceId || INBOX_WORKSPACE_ID,
          });
        }
      }

      const updatedHabits = await EntityCommandService.completeHabits(
        itemsToComplete,
        { source: "tasks_screen" },
      );

      if (updatedHabits.length > 0) {
        const updatedById = new Map(updatedHabits.map((h) => [h.id, h]));
        setHabits((prev) => prev.map((h) => updatedById.get(h.id) || h));
      }
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
      const itemsToArchive: { taskId: string; workspaceId: string }[] = [];
      for (const [listId, listTodos] of Object.entries(todos)) {
        for (const t of listTodos) {
          if (selectedItemIds.has(t.id)) {
            itemsToArchive.push({
              taskId: t.id,
              workspaceId: t.workspaceId || listId,
            });
          }
        }
      }

      // Route through ECS so bulk archiving cancels native reminders and clears
      // notification IDs exactly like the single-item archive path.
      const updatedTasks = await EntityCommandService.archiveTasks(
        itemsToArchive,
        { source: "tasks_screen" },
      );

      if (updatedTasks.length > 0) {
        const updatedById = new Map(updatedTasks.map((t) => [t.id, t]));
        setTodos((prev) => {
          const next: Record<string, Task[]> = {};
          for (const [listId, listTodos] of Object.entries(prev)) {
            next[listId] = listTodos.map((t) => updatedById.get(t.id) || t);
          }
          return next;
        });
      }
    }

    if (habitIds.length > 0) {
      const itemsToArchive: { habitId: string; workspaceId: string }[] = [];
      for (const h of habits) {
        if (selectedItemIds.has(h.id)) {
          itemsToArchive.push({
            habitId: h.id,
            workspaceId: h.workspaceId || INBOX_WORKSPACE_ID,
          });
        }
      }

      const updatedHabits = await EntityCommandService.archiveHabits(
        itemsToArchive,
        { source: "tasks_screen" },
      );

      if (updatedHabits.length > 0) {
        const updatedById = new Map(updatedHabits.map((h) => [h.id, h]));
        setHabits((prev) => prev.map((h) => updatedById.get(h.id) || h));
      }
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
              const todosToDelete: Task[] = [];
              const itemsToRecycle: { taskId: string; workspaceId: string }[] = [];

              for (const [listId, listTodos] of Object.entries(todos)) {
                for (const t of listTodos) {
                  if (selectedItemIds.has(t.id)) {
                    todosToDelete.push(t);
                    itemsToRecycle.push({
                      taskId: t.id,
                      workspaceId: t.workspaceId || listId,
                    });
                  }
                }
              }

              const { EntityCommandService } = await import(
                "@/services/command/EntityCommandService"
              );
              await EntityCommandService.recycleTasks(itemsToRecycle, {
                originalWorkspaceName,
                source: "tasks_screen",
              });

              const nextTodos = { ...todos };
              for (const listId in nextTodos) {
                nextTodos[listId] = nextTodos[listId].filter(
                  (t) => !selectedItemIds.has(t.id),
                );
              }
              setTodos(nextTodos);

              showUndo({
                message: `Deleted ${taskIds.length} task(s)`,
                onUndo: async () => {
                  try {
                    await EntityCommandService.restoreTasks(taskIds);
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
                  } catch (e) {
                    console.error("Failed to undo task deletion", e);
                  }
                },
              });
            }

            if (habitIds.length > 0) {
              const habitsToDelete = habits.filter((h) =>
                selectedItemIds.has(h.id),
              );

              for (const habit of habitsToDelete) {
                await EntityCommandService.recycleHabit(habit.id, habit.workspaceId || INBOX_WORKSPACE_ID, {
                  source: "tasks_screen"
                });
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
                  try {
                    for (const id of habitIds) {
                      await EntityCommandService.restoreHabit(id);
                    }
                    // Re-read state from current
                    const refreshedHabitsMap =
                      await HabitRepository.getHabits(selectedWorkspaceId);
                    const restored = Object.values(refreshedHabitsMap) as Habit[];
                    await persistHabits(restored);
                    setHabits(restored);
                    emitStateChange("habits_changed", "tasks_screen");
                  } catch (e) {
                    console.error("Failed to undo habit deletion", e);
                  }
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
      const movesToExecute: { id: string; oldWorkspaceId: string }[] = [];
      
      for (const listId in nextTodos) {
        const itemsToKeep: Task[] = [];
        nextTodos[listId].forEach((t) => {
          if (selectedItemIds.has(t.id)) {
            itemsToMove.push({
              ...t,
              workspaceId: targetWorkspaceId,
              updatedAt: Date.now(),
            });
            movesToExecute.push({ id: t.id, oldWorkspaceId: listId });
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
      
      // Execute all moves via EntityCommandService (skipping events to avoid noisy refetches)
      await Promise.all(
        movesToExecute.map((move) =>
          EntityCommandService.moveTask(move.id, move.oldWorkspaceId, targetWorkspaceId, {
            skipEvents: true,
            skipAnalytics: true,
          })
        )
      );
      
      emitStateChange("tasks_changed", "tasks_screen");
    }

    let habitMoveFailed = false;
    if (habitIds.length > 0) {
      // Persist every selected habit through the canonical single-habit move
      // command (save to target workspace, then delete from source) — the same
      // semantics the task branch above uses with moveTask. Events/analytics are
      // consolidated into a single emission below.
      const movesToExecute: { id: string; sourceWorkspaceId: string }[] = [];
      for (const habit of habits) {
        if (selectedItemIds.has(habit.id)) {
          movesToExecute.push({
            id: habit.id,
            sourceWorkspaceId: habit.workspaceId || INBOX_WORKSPACE_ID,
          });
        }
      }

      // allSettled (not all): every move must settle before we reconcile UI
      // state, so on partial failure the reload observes the final persisted
      // state instead of an in-flight move.
      const results = await Promise.allSettled(
        movesToExecute.map((move) =>
          EntityCommandService.moveHabit(
            move.id,
            move.sourceWorkspaceId,
            targetWorkspaceId,
            {
              skipEvents: true,
              skipAnalytics: true,
            },
          )
        ),
      );
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      if (failures.length > 0) {
        // Partial success is possible (each move is independent). Reload from
        // the repository so the UI reflects exactly what was persisted instead
        // of claiming every habit moved.
        habitMoveFailed = true;
        console.warn(
          `Failed to move ${failures.length} of ${results.length} selected habit(s)`,
          failures.map((f) => f.reason),
        );
        await loadHabits();
        emitStateChange("habits_changed", "tasks_screen");
      } else {
        // Persistence succeeded — reflect the move in local UI state.
        const nextHabits = habits.map((h) =>
          selectedItemIds.has(h.id)
            ? { ...h, workspaceId: targetWorkspaceId, updatedAt: Date.now() }
            : h,
        );
        setHabits(nextHabits);
        emitStateChange("habits_changed", "tasks_screen");
      }
    }

    Haptics.notificationAsync(
      habitMoveFailed
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
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
    focusResourceId,
    addChecklist,
    createChecklist: addChecklist,
    updateChecklist,
    updateChecklistTitle: updateChecklist,
    deleteChecklist,
    toggleArchiveChecklist,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    loadChecklistsState,
  };
}
