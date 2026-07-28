import UnifiedCapture from "@/features/capture/components/UnifiedCapture";
import { useVoiceCapture } from "@/features/capture/hooks/useVoiceCapture";
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { loadQuickSuggestions } from "@/features/capture/services/quick-suggestions.service";
import { TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";
import { getWorkspaceSuggestions } from "@/features/workspaces/services/workspace-suggestions.service";
import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import {
  addStateListener,
  emitStateChange,
} from "@/services/events/state-events";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { MascotOverlay } from "@/shared/components/layout/MascotOverlay";
import { AnimatedTabBar } from "@/shared/components/navigation/motion-tabs";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  INBOX_WORKSPACE_ID,
  type Workspace,
} from "@/shared/types/domain.types";
import { Feather } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const SCHED_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SCHED_WEEKDAY_INITS = ["S", "M", "T", "W", "T", "F", "S"];

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  // Modal State
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [activeSegment, setActiveSegment] = useState<
    "task" | "habit" | "vault" | "checklist"
  >("task");
  const [taskTitle, setTaskTitle] = useState("");
  const [checklistItemsText, setChecklistItemsText] = useState("");
  const { showToast } = useUndo();
  const [parsedItem, setParsedItem] = useState<any>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [taskDescription, setTaskDescription] = useState("");
  const [vaultType, setVaultType] = useState<"link" | "note" | "idea">("note");
  const [vaultContent, setVaultContent] = useState("");
  const [vaultUrl, setVaultUrl] = useState("");
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([
    "Gym every weekday at 7am",
    "Study Kubernetes tomorrow at 8pm",
    "Drink water every 2 hours",
    "Pay rent every month on the 1st",
  ]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>(INBOX_WORKSPACE_ID);

  useEffect(() => {
    const unsubWorkspace = addStateListener(
      "workspace_mode_changed",
      (folderId) => {
        if (folderId && folderId !== "null") {
          setSelectedWorkspaceId(folderId);
        }
      },
    );
    const unsubQuickAdd = addStateListener("open_quick_add", () => {
      openQuickAdd();
    });
    return () => {
      unsubWorkspace();
      unsubQuickAdd();
    };
  }, []);
  const [selectedPriority, setSelectedPriority] = useState<
    "low" | "medium" | "high"
  >("medium");
  const [selectedCategory, setSelectedCategory] = useState<string>("work");
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedQuickAddDate, setSelectedQuickAddDate] =
    useState<string>(getDateKey());
  const [selectedQuickAddTime, setSelectedQuickAddTime] = useState<
    string | null
  >(null);
  const [enableReminder, setEnableReminder] = useState<boolean>(false);
  const [showCustomTimePicker, setShowCustomTimePicker] =
    useState<boolean>(false);
  const [workspacePickerVisible, setWorkspacePickerVisible] =
    useState<boolean>(false);
  const [priorityPickerVisible, setPriorityPickerVisible] =
    useState<boolean>(false);
  const [tagsPickerVisible, setTagsPickerVisible] = useState<boolean>(false);
  const [showSchedulerModal, setShowSchedulerModal] = useState<boolean>(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedRepeat, setSelectedRepeat] = useState<
    "none" | "daily" | "weekly" | "monthly"
  >("none");
  const [searchWorkspaceQuery, setSearchWorkspaceQuery] = useState("");
  const [searchTagsQuery, setSearchTagsQuery] = useState("");
  const [showAdvancedOptions, setShowAdvancedOptions] =
    useState<boolean>(false);
  const [schedulerMonth, setSchedulerMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  // Voice Capture Hook Integration
  const {
    status: voiceStatus,
    volume: voiceVolume,
    errorMsg: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceCapture({
    onTranscriptComplete: (finalText) => {
      setTaskTitle(finalText);
    },
    onTranscriptChange: (interimText) => {
      setTaskTitle(interimText);
    },
  });

  // Debounced NLP parsing for Quick Add
  useEffect(() => {
    const trimmed = taskTitle.trim();
    if (!trimmed) {
      setParsedItem(null);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      // Heuristics for Vault auto-selection
      const lTitle = trimmed.toLowerCase();
      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi);
      if (urlMatch) {
        if (activeSegment !== "vault") {
          setActiveSegment("vault");
        }
        setVaultType("link");
        setVaultUrl(urlMatch[0]);
      } else if (
        lTitle.includes("idea:") ||
        lTitle.includes("design") ||
        lTitle.includes("concept") ||
        lTitle.includes("invent")
      ) {
        if (activeSegment !== "vault") {
          setActiveSegment("vault");
        }
        setVaultType("idea");
      } else if (
        lTitle.startsWith("remember") ||
        lTitle.includes("remember ") ||
        lTitle.includes("note:") ||
        lTitle.includes("todo:")
      ) {
        if (activeSegment !== "vault") {
          setActiveSegment("vault");
        }
        setVaultType("note");
      }

      const parsed = parseProductivityText(trimmed);
      setParsedItem(parsed);

      if (parsed.confidence >= 0.7) {
        if (parsed.type === "habit" && activeSegment !== "habit") {
          setActiveSegment("habit");
        } else if (parsed.type === "task" && activeSegment !== "task") {
          setActiveSegment("task");
        }
      }

      if (parsed.type === "task") {
        if (parsed.date) setSelectedQuickAddDate(parsed.date);
        if (parsed.time) {
          setSelectedQuickAddTime(parsed.time);
          setEnableReminder(true);
        }
        if (parsed.priority) setSelectedPriority(parsed.priority);
        if (parsed.category) setSelectedCategory(parsed.category);
        if (parsed.recurrence) {
          setSelectedRepeat(
            parsed.recurrence.type === "weekdays"
              ? "daily"
              : (parsed.recurrence.type as any),
          );
        }

        // Auto workspace suggestions
        try {
          const suggestions = await getWorkspaceSuggestions(
            parsed.title,
            parsed.category || "work",
            workspaces,
            {},
          );
          const top = suggestions[0];
          if (top && top.score >= 70) {
            setSelectedWorkspaceId(top.workspaceId);
          }
        } catch (e) {
          // ignore
        }
      } else if (parsed.type === "habit") {
        if (parsed.priority) setSelectedPriority(parsed.priority);
        if (parsed.category) setSelectedCategory(parsed.category);
        if (parsed.recurrence) {
          setSelectedRepeat(
            parsed.recurrence.type === "weekdays"
              ? "daily"
              : (parsed.recurrence.type as any),
          );
        }
        if (parsed.time) {
          setSelectedQuickAddTime(parsed.time);
          setEnableReminder(true);
        }
        // Auto workspace suggestions for habits
        try {
          const suggestions = await getWorkspaceSuggestions(
            parsed.title,
            parsed.category || "health",
            workspaces,
            {},
          );
          const top = suggestions[0];
          if (top && top.score >= 70) {
            setSelectedWorkspaceId(top.workspaceId);
          }
        } catch (e) {
          // ignore
        }
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [taskTitle, activeSegment, workspaces]);

  const quickAddSheetRef = useRef<BottomSheetModal>(null);

  const loadSmartSuggestions = async (currentWorkspaces: Workspace[]) => {
    try {
      const allTasks: any[] = [];
      const allHabits: any[] = [];
      const workspaceIds = [
        INBOX_WORKSPACE_ID,
        ...currentWorkspaces.map((ws) => ws.id),
      ];
      for (const wsId of workspaceIds) {
        const [tasksMap, habitsMap] = await Promise.all([
          TaskRepository.getTasks(wsId),
          HabitRepository.getHabits(wsId),
        ]);
        allTasks.push(...Object.values(tasksMap));
        allHabits.push(...Object.values(habitsMap));
      }
      const suggestions = await loadQuickSuggestions({
        tasks: allTasks,
        habits: allHabits,
        workspaces: currentWorkspaces,
      });
      if (suggestions.length > 0) setQuickSuggestions(suggestions);
    } catch {
      // keep current suggestions on error
    }
  };

  const openQuickAdd = () => {
    setQuickAddVisible(true);
    // Load workspaces from repository — single source of truth
    WorkspaceRepository.getWorkspaces()
      .then((workspaceList) => {
        const currentWorkspaces = workspaceList.map((ws) => ({
          id: ws.id,
          name: ws.name,
          emoji: ws.emoji || "📁",
          color: ws.color || "#6366F1",
          createdAt: ws.createdAt || Date.now(),
          updatedAt: ws.updatedAt || Date.now(),
        }));
        setWorkspaces(currentWorkspaces);
        setWorkspacesLoaded(true);

        // Set default workspace to Inbox if none selected
        if (!currentWorkspaces.some((w) => w.id === selectedWorkspaceId)) {
          setSelectedWorkspaceId(INBOX_WORKSPACE_ID);
        }

        // Generate smart suggestions from active items & history
        getWorkspaceSuggestions(
          taskTitle,
          selectedCategory || "work",
          currentWorkspaces,
          {},
        )
          .then((suggs) => setQuickSuggestions(suggs as any))
          .catch(() => {});
      })
      .catch(() => {});
    quickAddSheetRef.current?.present();
  };

  const closeQuickAdd = () => {
    quickAddSheetRef.current?.dismiss();
  };

  const schedulerCells = useMemo(() => {
    const cells = [];
    const daysInMonth = new Date(
      schedulerMonth.year,
      schedulerMonth.month + 1,
      0,
    ).getDate();
    const startOffset = new Date(
      schedulerMonth.year,
      schedulerMonth.month,
      1,
    ).getDay();

    for (let i = 0; i < startOffset; i++) {
      cells.push({ type: "empty", key: `empty-${i}` });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${schedulerMonth.year}-${String(schedulerMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        type: "day",
        dateString: dateKey,
        dayNum: d,
        key: `day-${d}`,
      });
    }
    return cells;
  }, [schedulerMonth]);

  const handleSchedulerPrevMonth = () => {
    setSchedulerMonth((prev) => {
      let nextMonth = prev.month - 1;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const handleSchedulerNextMonth = () => {
    setSchedulerMonth((prev) => {
      let nextMonth = prev.month + 1;
      let nextYear = prev.year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const handleSheetChange = (index: number) => {
    if (index === -1) {
      setQuickAddVisible(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskTags([]);
      setSelectedPriority("medium");
      setSelectedCategory("work");
      setCategoryPickerVisible(false);
      setSelectedQuickAddDate(getDateKey());
      setSelectedQuickAddTime(null);
      setEnableReminder(false);
      setShowCustomTimePicker(false);
      setWorkspacePickerVisible(false);
      setPriorityPickerVisible(false);
      setTagsPickerVisible(false);
      setShowSchedulerModal(false);
      setSelectedDuration(null);
      setSelectedRepeat("none");
      setSearchWorkspaceQuery("");
      setSearchTagsQuery("");
      setShowAdvancedOptions(false);
      setVaultType("note");
      setChecklistItemsText("");
      setVaultContent("");
      setVaultUrl("");
      cancelRecording();
      // Reset focus state so next session starts fresh
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      setIsInputFocused(false);
    }
  };

  const validateSelectedWorkspace = (): string => {
    if (
      selectedWorkspaceId &&
      workspaces.some((w) => w.id === selectedWorkspaceId)
    ) {
      return selectedWorkspaceId;
    }
    const inboxExists = workspaces.some((w) => w.id === INBOX_WORKSPACE_ID);
    if (inboxExists) {
      return INBOX_WORKSPACE_ID;
    }
    // This should not happen if initialization is correct, but fall back to Inbox
    return INBOX_WORKSPACE_ID;
  };

  const handleCreateTask = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
      const targetWorkspaceId = validateSelectedWorkspace();
      const titleToSave = parsedItem ? parsedItem.title : trimmed;
      const descToSave = taskDescription.trim() || undefined;
      const priorityToSave = parsedItem?.priority || selectedPriority;
      const dateToSave = parsedItem?.date || selectedQuickAddDate;
      const timeToSave = parsedItem?.time || selectedQuickAddTime;
      const recurrenceToSave = parsedItem?.recurrence;
      const generatedTaskId = String(Date.now());

      let alarmTime: number | undefined;
      let notificationIds: string[] = [];
      let alarmId: string | undefined;

      if (timeToSave && dateToSave !== "inbox") {
        if (recurrenceToSave) {
          try {
            const scheduled = await scheduleReminderBatch({
              kind: "todo",
              itemId: generatedTaskId,
              title: titleToSave,
              category: parsedItem?.category || "work",
              dailyTime: {
                hour: Number(timeToSave.split(":")[0]),
                minute: Number(timeToSave.split(":")[1]),
              },
              recurrence: recurrenceToSave,
              escalationMinutes: [120, 240],
              channelId:
                Platform.OS === "android" ? "todo-reminders" : undefined,
              context: {
                title: titleToSave,
                remainingCount: 1,
                totalCount: 1,
              },
            });
            alarmId = scheduled.primaryId;
            notificationIds = scheduled.ids;
          } catch (e) {
            console.error(
              "Failed to schedule Quick Add recurring task reminder:",
              e,
            );
          }
        } else {
          const [hours, minutes] = timeToSave.split(":").map(Number);
          const [year, monthVal, dayVal] = dateToSave.split("-").map(Number);
          const alarmDate = new Date(
            year,
            monthVal - 1,
            dayVal,
            hours,
            minutes,
            0,
            0,
          );

          if (alarmDate.getTime() > Date.now()) {
            const batch = await scheduleReminderBatch({
              kind: "todo",
              itemId: generatedTaskId,
              title: titleToSave,
              oneTimeAt: alarmDate,
              category: parsedItem?.category || "work",
              channelId:
                Platform.OS === "android" ? "todo-reminders" : undefined,
            });
            alarmTime = batch.alarmTime;
            notificationIds = batch.ids;
            alarmId = batch.primaryId;
          }
        }
      }

      const newTask = {
        id: generatedTaskId,
        title: titleToSave,
        description: descToSave,
        completed: false,
        workspaceId: targetWorkspaceId,
        folderId: targetWorkspaceId,
        category: parsedItem?.category || selectedCategory || "work",
        priority: priorityToSave,
        scheduledDate: dateToSave,
        alarmTime,
        notificationIds,
        alarmId,
        reminderHour: timeToSave ? Number(timeToSave.split(":")[0]) : undefined,
        reminderMinute: timeToSave
          ? Number(timeToSave.split(":")[1])
          : undefined,
        durationMinutes: selectedDuration || undefined,
        recurrence:
          recurrenceToSave ||
          (selectedRepeat !== "none" ? { type: selectedRepeat } : undefined),
        createdAt: Date.now(),
        createdDate: getDateKey(),
      };

      await TaskRepository.saveTask(newTask);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      void recordDailyHistorySnapshot();
      emitStateChange("tasks_changed");

      const wsName =
        workspaces.find((l) => l.id === selectedWorkspaceId)?.name || "Inbox";
      showToast(`✓ Task added to ${wsName}`);

      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add task", e);
    }
  };

  const handleCreateHabit = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
      const targetWorkspaceId = validateSelectedWorkspace();
      const titleToSave = parsedItem ? parsedItem.title : trimmed;
      const priorityToSave = parsedItem?.priority || selectedPriority;
      const recurrenceToSave = parsedItem?.recurrence;

      let reminderDays: number[] | undefined = undefined;
      if (recurrenceToSave) {
        if (recurrenceToSave.type === "weekdays") {
          reminderDays = [1, 2, 3, 4, 5];
        } else if (recurrenceToSave.type === "weekly") {
          reminderDays = recurrenceToSave.days;
        }
      }

      const generatedHabitId = `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let hour: number | undefined;
      let minute: number | undefined;
      let notificationIds: string[] = [];

      if (parsedItem?.time) {
        hour = Number(parsedItem.time.split(":")[0]);
        minute = Number(parsedItem.time.split(":")[1]);

        try {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: generatedHabitId,
            title: titleToSave,
            dailyTime: { hour, minute },
            dailyDays: reminderDays,
            recurrence: recurrenceToSave || undefined,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
            context: {
              title: titleToSave,
              remainingCount: 1,
              totalCount: 1,
              streak: 0,
              bestStreak: 0,
            },
          });
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to schedule quick-add habit reminder:", e);
        }
      }

      const newHabit = {
        id: generatedHabitId,
        title: titleToSave,
        streak: 0,
        bestStreak: 0,
        completedToday: false,
        priority: priorityToSave,
        category: parsedItem?.category || selectedCategory || "health",
        workspaceId: targetWorkspaceId,
        folderId: targetWorkspaceId,
        reminderDays,
        reminderHour: hour,
        reminderMinute: minute,
        recurrence:
          recurrenceToSave ||
          (selectedRepeat !== "none" ? { type: selectedRepeat } : undefined),
        notificationIds,
        createdAt: Date.now(),
        createdDate: getDateKey(),
        startDate: getDateKey(),
      };

      await HabitRepository.saveHabit(newHabit);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      void recordDailyHistorySnapshot();
      emitStateChange("habits_changed");

      const catLabel =
        TASK_CATEGORY_META.find(
          (c) => c.key === (newHabit.category || "health"),
        )?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);

      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add habit", e);
    }
  };

  const handleCreateVaultItem = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
      const targetWorkspaceId = validateSelectedWorkspace();
      const titleToSave = parsedItem ? parsedItem.title : trimmed;

      await ResourceRepository.saveResource({
        id: `res-${Date.now()}`,
        workspaceId: targetWorkspaceId,
        title: titleToSave,
        resourceType: vaultType === "idea" ? "note" : vaultType,
        kind: vaultType === "idea" ? "idea" : undefined,
        payload: {
          content: vaultContent.trim() || undefined,
          url: vaultType === "link" ? vaultUrl.trim() || undefined : undefined,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("resources_changed");

      const wsName =
        workspaces.find((l) => l.id === targetWorkspaceId)?.name || "Inbox";
      showToast(`✓ Resource created in ${wsName}`);

      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add resource item", e);
    }
  };

  const handleCreateChecklist = async () => {
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) return;

    try {
      const targetWorkspaceId = validateSelectedWorkspace();
      const itemsArray = checklistItemsText
        .split(/,|\n/)
        .map((i) => i.trim())
        .filter((i) => i.length > 0);

      const newChecklist = {
        id: Date.now().toString(),
        workspaceId: targetWorkspaceId,
        title: trimmedTitle,
        items: itemsArray.map((title, index) => ({
          id: `${Date.now()}-${index}`,
          title,
          completed: false,
        })),
        createdAt: Date.now(),
      };

      await ChecklistRepository.saveChecklist(newChecklist);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("checklists_changed");

      const wsName =
        workspaces.find((l) => l.id === targetWorkspaceId)?.name || "Inbox";
      showToast(`✓ Checklist "${trimmedTitle}" added to ${wsName}`);

      setChecklistItemsText("");
      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add checklist", e);
    }
  };

  // High-fidelity bottom sheet swipe-down gesture using Reanimated & Gesture Handler
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (quickAddVisible) {
      translateY.value = 0;
    }
  }, [quickAddVisible]);

  const gesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .onUpdate((event) => {
      // Allow drag down
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      } else {
        // slight upward resistance
        translateY.value = event.translationY * 0.15;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 550) {
        // Dismiss smoothly down
        translateY.value = withTiming(600, { duration: 200 }, () => {
          runOnJS(setQuickAddVisible)(false);
        });
      } else {
        // Bounce back up to normal
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const isLight = colorScheme === "light";
  const cardBg = isLight ? "#FFFFFF" : "#18181B";
  const borderColor = isLight ? theme.border : "rgba(255,255,255,0.08)";
  const inputBg = isLight ? "#F1F5F9" : "#09090B";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <AnimatedTabBar {...props} onQuickAddPress={openQuickAdd} />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Today",
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: "Workspaces",
            tabBarIcon: ({ color, size }) => (
              <Feather name="folder" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: "Focus",
            tabBarIcon: ({ color, size }) => (
              <Feather name="target" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
          }}
        />
      </Tabs>

      <MascotOverlay />

      {/* Unified Capture — replaces Quick Add */}
      <UnifiedCapture
        sheetRef={quickAddSheetRef}
        workspaces={workspaces}
        defaultWorkspaceId={selectedWorkspaceId}
        entryTab={undefined}
        onSaveComplete={() => {
          void recordDailyHistorySnapshot();
        }}
      />
    </View>
  );
}

const navStyles = StyleSheet.create({
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  centerTabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(24, 24, 27, 0.82)",
    marginTop: 0,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
});

const modalStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheetContent: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    elevation: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  gestureZone: {
    width: "100%",
    paddingBottom: 8,
  },
  dragLine: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  headerActionText: {
    fontSize: 11,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    borderRadius: 9,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
});
