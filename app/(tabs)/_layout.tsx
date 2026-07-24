import { MascotOverlay } from "@/shared/components/layout/MascotOverlay";
import { AnimatedTabBar } from "@/shared/components/navigation/motion-tabs";
import { useUndo } from "@/shared/components/ui/UndoContext";
import UnifiedCapture from "@/features/capture/components/UnifiedCapture";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useVoiceCapture } from "@/features/capture/hooks/useVoiceCapture";
import { Resource, ResourceCollection } from "@/shared/types/domain.types";
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { loadQuickSuggestions } from "@/features/capture/services/quick-suggestions.service";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { addStateListener, emitStateChange } from "@/services/events/state-events";
import { getCollections, saveCollections } from "@/services/storage/storage.service";
import { TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";
import {
    TaskRepository,
    HabitRepository,
    ChecklistRepository,
    WorkspaceRepository,
} from "@/repositories";
import { getWorkspaceSuggestions } from "@/features/workspaces/services/workspace-suggestions.service";
import { Feather } from "@expo/vector-icons";
import {
    BottomSheetModal
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Platform,
    StyleSheet,
    View
} from "react-native";
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
  const [folders, setFolders] = useState<any[]>([]);
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([
    "Gym every weekday at 7am",
    "Study Kubernetes tomorrow at 8pm",
    "Drink water every 2 hours",
    "Pay rent every month on the 1st",
  ]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("default");

  useEffect(() => {
    const unsubWorkspace = addStateListener(
      "workspace_mode_changed",
      (folderId) => {
        if (folderId && folderId !== "null") {
          setSelectedFolderId(folderId);
        } else {
          setSelectedFolderId((prev) => (prev && prev !== "null" ? prev : "default"));
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
  const [collectionPickerVisible, setCollectionPickerVisible] =
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

  const [selectedCollectionId, setSelectedCollectionId] =
    useState<string>("default");
  const [availableCollections, setAvailableCollections] = useState<
    ResourceCollection[]
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const allCollections = await getCollections();
        const folderColls = allCollections[selectedFolderId] || [];
        setAvailableCollections(folderColls);
        if (folderColls.length > 0) {
          setSelectedCollectionId(folderColls[0].id);
        } else {
          setSelectedCollectionId("default");
        }
      } catch (e) {
        console.warn("Failed to load collections for quick add", e);
      }
    })();
  }, [selectedFolderId, quickAddVisible]);

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
            folders,
            {},
          );
          const top = suggestions[0];
          if (top && top.score >= 70) {
            setSelectedFolderId(top.workspaceId);
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
            folders,
            {},
          );
          const top = suggestions[0];
          if (top && top.score >= 70) {
            setSelectedFolderId(top.workspaceId);
          }
        } catch (e) {
          // ignore
        }
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [taskTitle, activeSegment, folders]);

  const quickAddSheetRef = useRef<BottomSheetModal>(null);

  const loadSmartSuggestions = async (currentFolders: any[]) => {
    try {
      const allTasks: any[] = [];
      const allHabits: any[] = [];
      const folderIds = Array.from(
        new Set([
          "default",
          "unassigned",
          ...currentFolders.map((folder) => folder.id),
        ]),
      );
      for (const folderId of folderIds) {
        const [tasksMap, habitsMap] = await Promise.all([
          TaskRepository.getTasks(folderId),
          HabitRepository.getHabits(folderId),
        ]);
        allTasks.push(...Object.values(tasksMap));
        allHabits.push(...Object.values(habitsMap));
      }
      const suggestions = await loadQuickSuggestions({
        tasks: allTasks,
        habits: allHabits,
        workspaces: currentFolders,
      });
      if (suggestions.length > 0) setQuickSuggestions(suggestions);
    } catch {
      // keep current suggestions on error
    }
  };

  const openQuickAdd = () => {
    setQuickAddVisible(true);
    // Load folders first, then generate smart suggestions from live data
    WorkspaceRepository.getWorkspaces()
      .then((folderList) => {
        const currentFolders =
          folderList.length > 0
            ? folderList.map((folder) => ({
                id: folder.id,
                name: folder.name,
                emoji: folder.emoji || "📁",
                color: folder.color || "#6366F1",
              }))
            : [
                {
                  id: "default",
                  name: "My Pebbles",
                  emoji: "⚡",
                  color: "#6366F1",
                },
              ];
        setFolders(currentFolders);

        // Generate smart suggestions from active items & history
        const activeIds = currentFolders.map((f) => f.id);
        getWorkspaceSuggestions(taskTitle, selectedCategory || "work", currentFolders, {})
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

  const loadFolders = async () => {
    try {
      const folderList = await WorkspaceRepository.getWorkspaces();
      if (folderList.length > 0) {
        const mappedFolders = folderList.map((folder) => ({
          id: folder.id,
          name: folder.name,
          emoji: folder.emoji || "📁",
          color: folder.color || "#6366F1",
        }));
        setFolders(mappedFolders);
        setSelectedFolderId(mappedFolders[0].id);
        return;
      }

      const defaultFolders = [
        { id: "default", name: "My Pebbles", emoji: "📋", color: "#6366F1" },
      ];
      setFolders(defaultFolders);
      setSelectedFolderId("default");
    } catch (e) {
      console.warn("Failed to load folders for Quick Add", e);
    }
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

  const handleCreateTask = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
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
        folderId: selectedFolderId,
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
        folders.find((l) => l.id === selectedFolderId)?.name || "My Pebbles";
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
        folderId: selectedFolderId,
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
      const allCollections = await getCollections();
      const folderId = selectedFolderId || "unassigned";
      const titleToSave = parsedItem ? parsedItem.title : trimmed;

      const newItem: Resource = {
        id: String(Date.now()),
        type: vaultType === "idea" ? "note" : vaultType,
        title: titleToSave,
        content: vaultContent.trim() || undefined,
        url: vaultType === "link" ? vaultUrl.trim() || undefined : undefined,
        createdAt: Date.now(),
        archived: false,
      };

      if (!allCollections[folderId]) {
        allCollections[folderId] = [];
      }

      let targetCollection = allCollections[folderId].find(
        (c) => c.id === selectedCollectionId,
      );
      if (!targetCollection) {
        targetCollection = allCollections[folderId].find(
          (c) => c.name === "Quick Captures",
        );
      }

      if (!targetCollection) {
        targetCollection = {
          id: `quick-captures-${folderId}-${Date.now()}`,
          workspaceId: folderId,
          name: "Quick Captures",
          emoji: "⚡",
          createdAt: Date.now(),
          items: [],
        };
        allCollections[folderId].push(targetCollection);
      }

      targetCollection.items = [newItem, ...targetCollection.items];

      await saveCollections(allCollections);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("vault_changed");

      const wsName =
        folderId === "unassigned"
          ? "Inbox"
          : folders.find((l) => l.id === folderId)?.name || "Workspace";
      showToast(`✓ Reference added to ${wsName} -> ${targetCollection.name}`);

      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add collection item", e);
    }
  };

  const handleCreateChecklist = async () => {
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) return;

    try {
      const itemsArray = checklistItemsText
        .split(/,|\n/)
        .map((i) => i.trim())
        .filter((i) => i.length > 0);

      const folderId = selectedFolderId || "default";

      const newChecklist = {
        id: Date.now().toString(),
        folderId,
        title: trimmedTitle,
        items: itemsArray.map((title, index) => ({
          id: `${Date.now()}-${index}`,
          title,
          completed: false,
        })),
        archived: false,
        createdAt: Date.now(),
      };

      await ChecklistRepository.saveChecklist(newChecklist);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("checklists_changed");

      const wsName =
        folderId === "unassigned" || folderId === "default"
          ? "My Pebbles"
          : folders.find((l) => l.id === folderId)?.name || "Workspace";
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
        workspaces={
          folders.length > 0
            ? folders
            : [
                {
                  id: "default",
                  name: "My Pebbles",
                  emoji: "📋",
                  color: "#6366F1",
                },
              ]
        }
        defaultWorkspaceId={selectedFolderId}
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
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  titleInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 0,
  },
  categoryWrapper: {
    height: 48,
    marginBottom: 20,
  },
  categoryScroll: {
    alignItems: "center",
    gap: 8,
    paddingRight: 20,
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  categoryText: {
    fontSize: 12,
  },
  habitInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  habitInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  priorityWrapper: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  priorityCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    borderRadius: 19,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  actionPill: {
    borderWidth: 1.2,
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  popupLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
