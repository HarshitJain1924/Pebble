import React, { useEffect, useState, useMemo } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  Modal,
  Linking,
  Pressable,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type Todo, type Habit, type TaskList, type Collection, type CollectionItem } from "@/modules/types";
import { TODOS_STORAGE_KEY, DAILY_STORAGE_KEY, HISTORY_STORAGE_KEY, addToRecycleBin, getRecycleBinItems, saveRecycleBinItems, getCollections, saveCollections } from "@/services/storage";
import { emitStateChange } from "@/services/stateEvents";
import { cancelReminderIds, scheduleReminderBatch, rescheduleTodoReminders, rescheduleHabitReminders } from "@/services/reminders";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import { getRecurrenceLabel, getDateKey } from "@/services/recurrence";
import { useUndo } from "@/components/ui/UndoContext";

const CATEGORY_OPTIONS = [
  { key: "work", label: "Work", color: "#3B82F6", icon: "briefcase" as const },
  { key: "personal", label: "Personal", color: "#10B981", icon: "user" as const },
  { key: "health", label: "Health", color: "#F59E0B", icon: "activity" as const },
  { key: "learning", label: "Learning", color: "#A855F7", icon: "book-open" as const },
  { key: "creative", label: "Creative", color: "#EC4899", icon: "feather" as const },
  { key: "focus", label: "Focus", color: "#6366F1", icon: "target" as const },
];

const PRIORITY_OPTIONS = [
  { key: "low" as const, label: "Low", color: "#10B981" },
  { key: "medium" as const, label: "Medium", color: "#F59E0B" },
  { key: "high" as const, label: "High", color: "#EF4444" },
];

export default function TaskDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; type: "task" | "habit"; date?: string }>();
  const itemId = params.id;
  const itemType = params.type;
  const isTask = itemType === "task";
  const selectedOccurrenceDate = params.date || getDateKey();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";
  const { showToast, showUndo } = useUndo();

  // State Variables
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [workspaces, setWorkspaces] = useState<TaskList[]>([]);
  const [item, setItem] = useState<any>(null);
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const [timesCompleted, setTimesCompleted] = useState<number | null>(null);
  const [completedDates, setCompletedDates] = useState<string[]>([]);

  const calendarMarkedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    completedDates.forEach((dateStr) => {
      marked[dateStr] = {
        selected: true,
        selectedColor: "#F59E0B",
        textColor: "#FFFFFF",
      };
    });
    return marked;
  }, [completedDates]);

  // Form Fields State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<any>("work");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [workspaceId, setWorkspaceId] = useState("default");
  const [scheduledDate, setScheduledDate] = useState("inbox");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reminderHour, setReminderHour] = useState<number | undefined>(undefined);
  const [reminderMinute, setReminderMinute] = useState<number | undefined>(undefined);
  const [reminderDays, setReminderDays] = useState<number[]>([]);
  const [recurrenceType, setRecurrenceType] = useState<string>("none");
  const [intervalVal, setIntervalVal] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<"hours" | "days">("days");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState<number>(1);

  // Time & Recurrence pickers state
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [showDeleteSafetyModal, setShowDeleteSafetyModal] = useState(false);
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false);

  // Resources state
  const [resourcesSheetVisible, setResourcesSheetVisible] = useState(false);
  const [linkPickerVisible, setLinkPickerVisible] = useState(false);
  const [collections, setCollections] = useState<Record<string, Collection[]>>({});
  const [linkedCollectionIds, setLinkedCollectionIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<"All" | "Links" | "Notes" | "Images">("All");
  
  // Quick Add Collection State
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  // Viewing/Preview states
  const [viewingNote, setViewingNote] = useState<CollectionItem | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const allCollectionsList = useMemo(() => {
    return Object.values(collections).flat();
  }, [collections]);

  const linkedCollections = useMemo(() => {
    return allCollectionsList.filter(col => linkedCollectionIds.includes(col.id));
  }, [allCollectionsList, linkedCollectionIds]);

  const totalResourceItems = useMemo(() => {
    return linkedCollections.reduce((sum, col) => sum + (col.items?.filter(item => !item.archived).length || 0), 0);
  }, [linkedCollections]);

  const resourcePreviewText = useMemo(() => {
    if (linkedCollections.length === 0) return "";
    return linkedCollections.map(col => col.name).join(", ");
  }, [linkedCollections]);

  const allResourceItems = useMemo(() => {
    const list: (CollectionItem & { collectionName: string })[] = [];
    linkedCollections.forEach(col => {
      if (col.items) {
        col.items.forEach(item => {
          if (!item.archived) {
            list.push({ ...item, collectionName: col.name });
          }
        });
      }
    });
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [linkedCollections]);

  const filteredResourceItems = useMemo(() => {
    if (activeFilter === "All") return allResourceItems;
    if (activeFilter === "Links") return allResourceItems.filter(item => item.type === "link" || item.url);
    if (activeFilter === "Notes") return allResourceItems.filter(item => item.type === "note");
    if (activeFilter === "Images") return allResourceItems.filter(item => item.type === "image");
    return allResourceItems;
  }, [allResourceItems, activeFilter]);

  const hasChanges = useMemo(() => {
    if (!item) return false;
    
    // Compare basic fields
    if (title.trim() !== (item.title || "").trim()) return true;
    if (description.trim() !== (item.description || "").trim()) return true;
    if (category !== (item.category || "work")) return true;
    if (priority !== (item.priority || "medium")) return true;
    if (workspaceId !== (item.folderId || "default")) return true;
    if (isTask && scheduledDate !== (item.scheduledDate || "inbox")) return true;
    
    // Compare reminders
    if (reminderHour !== item.reminderHour) return true;
    if (reminderMinute !== item.reminderMinute) return true;
    
    const sortedDaysCurrent = [...reminderDays].sort();
    const sortedDaysItem = [...(item.reminderDays || [])].sort();
    if (JSON.stringify(sortedDaysCurrent) !== JSON.stringify(sortedDaysItem)) return true;

    // Compare linked collections
    const sortedLinkedCurrent = [...linkedCollectionIds].sort();
    const sortedLinkedItem = [...(item.linkedCollectionIds || [])].sort();
    if (JSON.stringify(sortedLinkedCurrent) !== JSON.stringify(sortedLinkedItem)) return true;

    // Compare recurrence
    const itemRecType = item.recurrence?.type || "none";
    if (recurrenceType !== itemRecType) return true;
    
    if (recurrenceType !== "none") {
      const rec = item.recurrence || {};
      if (recurrenceType === "interval") {
        if (intervalVal !== (rec.interval || 1)) return true;
        if (intervalUnit !== (rec.unit || "days")) return true;
      }
      if (recurrenceType === "weekly") {
        const sortedRecDaysCurrent = [...recurrenceDays].sort();
        const sortedRecDaysItem = [...(rec.days || [])].sort();
        if (JSON.stringify(sortedRecDaysCurrent) !== JSON.stringify(sortedRecDaysItem)) return true;
      }
      if (recurrenceType === "monthly") {
        if (recurrenceDayOfMonth !== (rec.dayOfMonth || 1)) return true;
      }
    }
    
    return false;
  }, [
    item,
    title,
    description,
    category,
    priority,
    workspaceId,
    scheduledDate,
    reminderHour,
    reminderMinute,
    reminderDays,
    linkedCollectionIds,
    recurrenceType,
    intervalVal,
    intervalUnit,
    recurrenceDays,
    recurrenceDayOfMonth,
    isTask
  ]);

  // Load Workspaces & Item Data
  useEffect(() => {
    loadData();
  }, [itemId, itemType]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load workspaces
      const rawTodosObj = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let loadedWorkspaces: TaskList[] = [];
      if (rawTodosObj) {
        const parsed = JSON.parse(rawTodosObj);
        loadedWorkspaces = parsed.lists || [];
        setWorkspaces(loadedWorkspaces);
      }

      // Load collections
      const loadedCollections = await getCollections();
      setCollections(loadedCollections);

      if (itemType === "task") {
        if (rawTodosObj) {
          const parsed = JSON.parse(rawTodosObj);
          let foundTask = null;
          for (const listId in parsed.todos) {
            const match = parsed.todos[listId].find((t: any) => t.id === itemId);
            if (match) {
              foundTask = match;
              break;
            }
          }
          if (foundTask) {
            setItem(foundTask);
            initForm(foundTask);
          } else {
            Alert.alert("Error", "Task not found.");
            router.back();
          }
        }
      } else {
        // habit
        const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        if (rawHabits) {
          const parsed = JSON.parse(rawHabits);
          const foundHabit = parsed.dailyHabits?.find((h: any) => h.id === itemId);
          if (foundHabit) {
            setItem(foundHabit);
            initForm(foundHabit);

            // Load completion stats from history
            try {
              const historyRaw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
              if (historyRaw) {
                const history = JSON.parse(historyRaw);
                if (Array.isArray(history)) {
                  const relevantEntries = history.filter((entry: any) => entry.totalHabits > 0);
                  const completedEntries = history.filter((entry: any) =>
                    entry.completedHabitTitles?.includes(foundHabit.title)
                  );
                  const completedCount = completedEntries.length;
                  setTimesCompleted(completedCount);

                  // Gather all unique date strings where the habit was completed
                  const dates = completedEntries.map((entry: any) => entry.date).filter(Boolean);
                  setCompletedDates(dates);

                  if (relevantEntries.length > 0) {
                    setCompletionRate(Math.round((completedCount / relevantEntries.length) * 100));
                  } else {
                    setCompletionRate(0);
                  }
                }
              } else {
                setTimesCompleted(0);
                setCompletionRate(0);
                setCompletedDates([]);
              }
            } catch (e) {
              console.warn("Failed to load habit completion stats:", e);
            }
          } else {
            Alert.alert("Error", "Habit not found.");
            router.back();
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load details", e);
    } finally {
      setLoading(false);
    }
  };

  const initForm = (data: any) => {
    setTitle(data.title || "");
    setDescription(data.description || "");
    setCategory(data.category || "work");
    setPriority(data.priority || "medium");
    setWorkspaceId(data.folderId || "default");
    setScheduledDate(data.scheduledDate || "inbox");
    setReminderHour(data.reminderHour);
    setReminderMinute(data.reminderMinute);
    setReminderDays(data.reminderDays || []);
    setLinkedCollectionIds(data.linkedCollectionIds || []);

    if (data.recurrence) {
      setRecurrenceType(data.recurrence.type);
      setIntervalVal(data.recurrence.interval || 1);
      setIntervalUnit(data.recurrence.unit || "days");
      setRecurrenceDays(data.recurrence.days || []);
      setRecurrenceDayOfMonth(data.recurrence.dayOfMonth || 1);
    } else {
      setRecurrenceType("none");
      setIntervalVal(1);
      setIntervalUnit("days");
      setRecurrenceDays([]);
      setRecurrenceDayOfMonth(1);
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    if (item.recurrence && isEditing) {
      // If it's a recurring item, ask if only this occurrence or all future
      setShowEditRecurringModal(true);
    } else {
      saveChanges(false);
    }
  };

  const saveChanges = async (thisOccurrenceOnly: boolean) => {
    setShowEditRecurringModal(false);
    try {
      const isTask = itemType === "task";
      let updatedRecurrence = null;
      if (recurrenceType !== "none") {
        updatedRecurrence = {
          type: recurrenceType,
          interval: recurrenceType === "interval" ? intervalVal : undefined,
          unit: recurrenceType === "interval" ? intervalUnit : undefined,
          days: recurrenceType === "weekly" ? recurrenceDays : undefined,
          dayOfMonth: recurrenceType === "monthly" ? recurrenceDayOfMonth : undefined,
        };
      }

      if (thisOccurrenceOnly) {
        // Exception logic:
        // 1. Create a non-recurring copy for selectedOccurrenceDate
        const newId = `${itemType}-${Date.now()}`;
        const newCopy = {
          ...item,
          id: newId,
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          folderId: workspaceId,
          recurrence: undefined, // remove recurrence
          scheduledDate: isTask ? selectedOccurrenceDate : undefined,
          reminderHour,
          reminderMinute,
          reminderDays: [], // clear weekly repeats
          lastUpdated: getDateKey(),
          completed: false,
          completedToday: false,
          streak: 0,
          linkedCollectionIds, // Add linked collections to the copy
        };

        // 2. Add current date to exceptions of the master
        const updatedMaster = {
          ...item,
          recurrenceExceptions: [...(item.recurrenceExceptions || []), selectedOccurrenceDate],
          lastUpdated: getDateKey(),
        };

        // 3. Save both
        if (isTask) {
          const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            // Replace master
            for (const listId in state.todos) {
              state.todos[listId] = state.todos[listId].map((t: Todo) =>
                t.id === item.id ? updatedMaster : t
              );
            }
            // Add copy
            if (!state.todos[workspaceId]) {
              state.todos[workspaceId] = [];
            }
            state.todos[workspaceId].unshift(newCopy);
            await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
          }
        } else {
          const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            state.dailyHabits = state.dailyHabits.map((h: Habit) =>
              h.id === item.id ? updatedMaster : h
            );
            state.dailyHabits.unshift(newCopy);
            await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
          }
        }

        // 4. Schedule reminders for new copy
        if (reminderHour !== undefined && reminderMinute !== undefined) {
          await scheduleReminderBatch({
            kind: itemType === "task" ? "todo" : "habit",
            itemId: newId,
            title: title.trim(),
            category,
            dailyTime: { hour: reminderHour, minute: reminderMinute },
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? (isTask ? "todo-reminders" : "daily-habits") : undefined,
          });
        }
      } else {
        // Master update logic
        const updatedItem = {
          ...item,
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          folderId: workspaceId,
          scheduledDate: isTask ? scheduledDate : undefined,
          reminderHour,
          reminderMinute,
          reminderDays: recurrenceType === "weekly" ? recurrenceDays : recurrenceType === "weekdays" ? [1, 2, 3, 4, 5] : reminderDays,
          recurrence: updatedRecurrence,
          lastUpdated: getDateKey(),
          linkedCollectionIds, // Save linked collections
        };

        // Cancel previous notifications
        await cancelReminderIds(item.notificationIds || []);

        // Schedule new notifications
        let notificationIds: string[] = [];
        let alarmId: string | undefined;
        let alarmTime: number | undefined;

        if (reminderHour !== undefined && reminderMinute !== undefined) {
          const dailyDays = recurrenceType === "weekly" ? recurrenceDays : recurrenceType === "weekdays" ? [1, 2, 3, 4, 5] : undefined;
          
          const scheduled = await scheduleReminderBatch({
            kind: itemType === "task" ? "todo" : "habit",
            itemId: item.id,
            title: title.trim(),
            category,
            dailyTime: { hour: reminderHour, minute: reminderMinute },
            dailyDays,
            recurrence: updatedRecurrence ? (updatedRecurrence as any) : undefined,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? (isTask ? "todo-reminders" : "daily-habits") : undefined,
          });
          notificationIds = scheduled.ids;
          alarmId = scheduled.primaryId;
          alarmTime = scheduled.alarmTime;
        }

        updatedItem.notificationIds = notificationIds;
        updatedItem.alarmId = alarmId;
        updatedItem.alarmTime = alarmTime;

        if (isTask) {
          const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            // Delete from old list (if workspace changed)
            for (const listId in state.todos) {
              state.todos[listId] = state.todos[listId].filter((t: Todo) => t.id !== item.id);
            }
            // Add to new list
            if (!state.todos[workspaceId]) state.todos[workspaceId] = [];
            state.todos[workspaceId].push(updatedItem);
            await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
          }
        } else {
          const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            state.dailyHabits = state.dailyHabits.map((h: Habit) =>
              h.id === item.id ? updatedItem : h
            );
            await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");
      setIsEditing(false);
      showToast("Changes saved");
      loadData();
    } catch (e) {
      console.warn("Failed to save changes", e);
    }
  };

  const handleDuplicate = async () => {
    try {
      const isTask = itemType === "task";
      const newId = `${itemType}-${Date.now()}`;
      const duplicate = {
        ...item,
        id: newId,
        title: `${item.title} (Copy)`,
        createdDate: getDateKey(),
        lastUpdated: getDateKey(),
        completed: false,
        completedToday: false,
        streak: 0,
        bestStreak: 0,
        createdAt: Date.now(),
      };

      if (isTask) {
        const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        if (raw) {
          const state = JSON.parse(raw);
          const fId = item.folderId || "default";
          if (!state.todos[fId]) state.todos[fId] = [];
          state.todos[fId].unshift(duplicate);
          await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
        }
      } else {
        const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        if (raw) {
          const state = JSON.parse(raw);
          state.dailyHabits.unshift(duplicate);
          await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
        }
      }

      // Schedule reminders for duplicate if they exist
      if (item.reminderHour !== undefined && item.reminderMinute !== undefined) {
        await scheduleReminderBatch({
          kind: itemType === "task" ? "todo" : "habit",
          itemId: newId,
          title: duplicate.title,
          category: item.category,
          dailyTime: { hour: item.reminderHour, minute: item.reminderMinute },
          dailyDays: item.reminderDays,
          recurrence: item.recurrence,
          escalationMinutes: [120, 240],
          channelId: Platform.OS === "android" ? (isTask ? "todo-reminders" : "daily-habits") : undefined,
        });
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");
      Alert.alert("Success", "Item duplicated successfully!");
      router.back();
    } catch (e) {
      console.warn("Failed to duplicate item", e);
    }
  };

  const handleConvert = async () => {
    try {
      const isTask = itemType === "task";
      const newId = isTask ? `habit-${Date.now()}` : String(Date.now());
      const baseProperties = {
        title: item.title,
        description: item.description,
        category: item.category || "work",
        priority: item.priority || "medium",
        folderId: item.folderId || "default",
        reminderHour: item.reminderHour,
        reminderMinute: item.reminderMinute,
        reminderDays: item.reminderDays,
        recurrence: item.recurrence,
        createdDate: item.createdDate || getDateKey(),
        lastUpdated: getDateKey(),
        createdAt: Date.now(),
      };

      // Cancel previous reminders
      await cancelReminderIds(item.notificationIds || []);

      if (isTask) {
        // Convert Task -> Habit
        const newHabit: Habit = {
          ...baseProperties,
          id: newId,
          streak: 0,
          bestStreak: 0,
          completedToday: false,
        };

        // Remove from tasks storage
        const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        if (rawTodos) {
          const state = JSON.parse(rawTodos);
          const fId = item.folderId || "default";
          if (state.todos[fId]) {
            state.todos[fId] = state.todos[fId].filter((t: Todo) => t.id !== item.id);
          }
          await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
        }

        // Add to habits storage
        const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        const habitsState = rawHabits ? JSON.parse(rawHabits) : { dailyHabits: [] };
        habitsState.dailyHabits.unshift(newHabit);
        await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(habitsState));

        // Schedule new habit reminder
        if (baseProperties.reminderHour !== undefined && baseProperties.reminderMinute !== undefined) {
          await scheduleReminderBatch({
            kind: "habit",
            itemId: newId,
            title: baseProperties.title,
            category: baseProperties.category,
            dailyTime: { hour: baseProperties.reminderHour, minute: baseProperties.reminderMinute },
            dailyDays: baseProperties.reminderDays,
            recurrence: baseProperties.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
          });
        }

        emitStateChange("tasks_changed");
        emitStateChange("habits_changed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace(`/task-details?id=${newId}&type=habit`);
      } else {
        // Convert Habit -> Task
        const newTodo: Todo = {
          ...baseProperties,
          id: newId,
          completed: false,
          scheduledDate: getDateKey(),
        };

        // Remove from habits storage
        const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        if (rawHabits) {
          const state = JSON.parse(rawHabits);
          state.dailyHabits = state.dailyHabits.filter((h: Habit) => h.id !== item.id);
          await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
        }

        // Add to tasks storage
        const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        if (rawTodos) {
          const state = JSON.parse(rawTodos);
          const fId = item.folderId || "default";
          if (!state.todos[fId]) state.todos[fId] = [];
          state.todos[fId].unshift(newTodo);
          await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
        }

        // Schedule new task reminder
        if (baseProperties.reminderHour !== undefined && baseProperties.reminderMinute !== undefined) {
          await scheduleReminderBatch({
            kind: "todo",
            itemId: newId,
            title: baseProperties.title,
            category: baseProperties.category,
            dailyTime: { hour: baseProperties.reminderHour, minute: baseProperties.reminderMinute },
            dailyDays: baseProperties.reminderDays,
            recurrence: baseProperties.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
          });
        }

        emitStateChange("tasks_changed");
        emitStateChange("habits_changed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace(`/task-details?id=${newId}&type=task`);
      }
    } catch (e) {
      console.warn("Failed to convert item", e);
    }
  };

  const handleDeletePress = () => {
    if (item.recurrence) {
      setShowDeleteSafetyModal(true);
    } else {
      Alert.alert(
        "Delete Item",
        "Are you sure you want to permanently delete this item?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteItem(false) },
        ]
      );
    }
  };

  const deleteItem = async (thisOccurrenceOnly: boolean) => {
    setShowDeleteSafetyModal(false);
    try {
      const isTask = itemType === "task";

      if (thisOccurrenceOnly) {
        // Exclude this occurrence date
        const updatedItem = {
          ...item,
          recurrenceExceptions: [...(item.recurrenceExceptions || []), selectedOccurrenceDate],
          lastUpdated: getDateKey(),
        };

        if (isTask) {
          const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            for (const listId in state.todos) {
              state.todos[listId] = state.todos[listId].map((t: Todo) =>
                t.id === item.id ? updatedItem : t
              );
            }
            await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
          }
        } else {
          const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            state.dailyHabits = state.dailyHabits.map((h: Habit) =>
              h.id === item.id ? updatedItem : h
            );
            await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
          }
        }
      } else {
        // Full delete
        const originalWorkspace = workspaces.find((w) => w.id === (item.folderId || "default"))?.name || "Default";

        await cancelReminderIds(item.notificationIds || []);

        await addToRecycleBin(isTask ? "task" : "habit", item, originalWorkspace);

        if (isTask) {
          const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            for (const listId in state.todos) {
              state.todos[listId] = state.todos[listId].filter((t: Todo) => t.id !== item.id);
            }
            await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
          }
        } else {
          const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
          if (raw) {
            const state = JSON.parse(raw);
            state.dailyHabits = state.dailyHabits.filter((h: Habit) => h.id !== item.id);
            await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
          }
        }

        showUndo({
          message: `Deleted "${item.title}"`,
          onUndo: async () => {
            // Remove from Recycle Bin
            const binItems = await getRecycleBinItems();
            await saveRecycleBinItems(binItems.filter((bi) => bi.id !== item.id));

            if (isTask) {
              const rescheduled = await rescheduleTodoReminders(item);
              const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
              if (raw) {
                const state = JSON.parse(raw);
                const listId = rescheduled.folderId || "default";
                if (!state.todos[listId]) state.todos[listId] = [];
                if (!state.todos[listId].some((t: Todo) => t.id === item.id)) {
                  state.todos[listId].push(rescheduled);
                }
                await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
              }
              emitStateChange("tasks_changed");
            } else {
              const rescheduled = await rescheduleHabitReminders(item);
              const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
              if (raw) {
                const state = JSON.parse(raw);
                if (!state.dailyHabits) state.dailyHabits = [];
                if (!state.dailyHabits.some((h: Habit) => h.id === item.id)) {
                  state.dailyHabits.push(rescheduled);
                }
                await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
              }
              emitStateChange("habits_changed");
            }
          },
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");
      router.back();
    } catch (e) {
      console.warn("Failed to delete item", e);
    }
  };

  const toggleDaySelection = (idx: number) => {
    setRecurrenceDays((curr) =>
      curr.includes(idx) ? curr.filter((d) => d !== idx) : [...curr, idx]
    );
  };

  const availableCollectionsForPicker = useMemo(() => {
    return Object.values(collections).flat().filter(c => !c.archived);
  }, [collections]);

  const handleCreateNewCollection = async () => {
    if (!newCollectionName.trim()) return;
    try {
      const newColId = `collection-${Date.now()}`;
      const newCol: Collection = {
        id: newColId,
        workspaceId: workspaceId || "default",
        name: newCollectionName.trim(),
        emoji: "📚",
        createdAt: Date.now(),
        items: [],
      };
      
      const allCols = { ...collections };
      const fId = workspaceId || "default";
      if (!allCols[fId]) allCols[fId] = [];
      allCols[fId].push(newCol);
      
      await saveCollections(allCols);
      setCollections(allCols);
      
      // Auto-select the newly created collection
      setLinkedCollectionIds(prev => [...prev, newColId]);
      
      setNewCollectionName("");
      setIsCreatingCollection(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.warn("Failed to create collection", e);
    }
  };

  if (loading || !item) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textMuted }}>Loading premium details...</Text>
      </SafeAreaView>
    );
  }

  const formatCreatedDate = () => {
    if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      } catch (e) {
        // fallback
      }
    }
    if (item.createdDate) {
      try {
        const parts = item.createdDate.split("-");
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
        return item.createdDate;
      } catch (e) {
        return item.createdDate;
      }
    }
    const d = new Date();
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const itemCategoryMeta = CATEGORY_OPTIONS.find((c) => c.key === category) || CATEGORY_OPTIONS[0];
  const itemPriorityMeta = PRIORITY_OPTIONS.find((p) => p.key === priority) || PRIORITY_OPTIONS[1];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isEditing ? `Edit ${isTask ? "Task" : "Habit"}` : `${isTask ? "Task" : "Habit"} Details`}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            if (isEditing) {
              handleSave();
            } else {
              setIsEditing(true);
            }
          }}
          style={[styles.headerBtnTextRow, { backgroundColor: isEditing ? `${colors.primary}22` : "transparent" }]}
        >
          <Feather name={isEditing ? "check" : "edit-2"} size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", marginLeft: 4 }}>
            {isEditing ? "Save" : "Edit"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: isEditing ? 120 : 40 }]} showsVerticalScrollIndicator={false}>
        {item.archived && (
          <View style={[styles.archiveBanner, { backgroundColor: `${colors.warning}15`, borderColor: colors.warning }]}>
            <Feather name="archive" size={16} color={colors.warning} />
            <Text style={{ color: colors.warning, marginLeft: 8, fontSize: 13, fontWeight: "600" }}>
              This item is currently archived.
            </Text>
          </View>
        )}

        {/* View Mode */}
        {!isEditing ? (
          <View style={{ gap: 20 }}>
            {/* Title Section */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
              {item.description ? (
                <Text style={[styles.itemDesc, { color: colors.textMuted }]}>{item.description}</Text>
              ) : (
                <Text style={[styles.itemDesc, { color: colors.textMuted, fontStyle: "italic" }]}>No notes added</Text>
              )}
            </View>

            {/* Badges Grid */}
            <View style={styles.badgeRow}>
              {/* Item Type */}
              <View style={[styles.badge, {
                backgroundColor: isTask ? "rgba(59, 130, 246, 0.12)" : "rgba(245, 158, 11, 0.12)",
                borderColor: isTask ? "#3B82F6" : "#F59E0B"
              }]}>
                <Feather name={isTask ? "check-square" : "activity"} size={12} color={isTask ? "#3B82F6" : "#F59E0B"} />
                <Text style={[styles.badgeText, { color: isTask ? "#3B82F6" : "#F59E0B", fontWeight: "700" }]}>
                  {isTask ? "Task" : "Habit"}
                </Text>
              </View>

              {/* Priority */}
              <View style={[styles.badge, { backgroundColor: `${itemPriorityMeta.color}15`, borderColor: itemPriorityMeta.color }]}>
                <Feather name="flag" size={12} color={itemPriorityMeta.color} />
                <Text style={[styles.badgeText, { color: itemPriorityMeta.color }]}>
                  {itemPriorityMeta.label}
                </Text>
              </View>

              {/* Category */}
              <View style={[styles.badge, { backgroundColor: `${itemCategoryMeta.color}15`, borderColor: itemCategoryMeta.color }]}>
                <Feather name={itemCategoryMeta.icon} size={12} color={itemCategoryMeta.color} />
                <Text style={[styles.badgeText, { color: itemCategoryMeta.color }]}>
                  {itemCategoryMeta.label}
                </Text>
              </View>

              {/* Workspace */}
              {isTask && (
                <View style={[styles.badge, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}>
                  <Feather name="folder" size={12} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>
                    {workspaces.find((w) => w.id === item.folderId)?.name || "Default"}
                  </Text>
                </View>
              )}

              {/* Status */}
              {isTask ? (
                <View style={[styles.badge, {
                  backgroundColor: item.completed ? `${colors.success}15` : `${colors.error}15`,
                  borderColor: item.completed ? colors.success : colors.error
                }]}>
                  <Feather name={item.completed ? "check-circle" : "circle"} size={12} color={item.completed ? colors.success : colors.error} />
                  <Text style={[styles.badgeText, { color: item.completed ? colors.success : colors.error }]}>
                    {item.completed ? "Completed" : "Pending"}
                  </Text>
                </View>
              ) : (
                <View style={[styles.badge, {
                  backgroundColor: item.completedToday ? `${colors.success}15` : `${colors.warning}15`,
                  borderColor: item.completedToday ? colors.success : colors.warning
                }]}>
                  <Feather name={item.completedToday ? "check-circle" : "circle"} size={12} color={item.completedToday ? colors.success : colors.warning} />
                  <Text style={[styles.badgeText, { color: item.completedToday ? colors.success : colors.warning }]}>
                    {item.completedToday ? "Done Today" : "Not Done Today"}
                  </Text>
                </View>
              )}
            </View>

            {/* Metadata Fields Section */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Scheduled Date Row (Tasks Only) */}
              {isTask && (
                <>
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="calendar" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>Scheduled Date</Text>
                    </View>
                    <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                      {scheduledDate === "inbox" ? "Inbox" : scheduledDate || "None"}
                    </Text>
                  </View>
                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                </>
              )}

              {/* Reminder Row */}
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="bell" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>Reminder</Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {item.reminderHour !== undefined && item.reminderMinute !== undefined
                    ? `${String(item.reminderHour).padStart(2, "0")}:${String(item.reminderMinute).padStart(2, "0")}`
                    : "No reminder scheduled"}
                </Text>
              </View>

              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

              {/* Recurrence Row */}
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="repeat" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>Recurrence</Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {getRecurrenceLabel(item.recurrence) || "None"}
                </Text>
              </View>

              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

              {/* Dates */}
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="calendar" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>Created Date</Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {formatCreatedDate()}
                </Text>
              </View>
              
              {item.lastUpdated && (
                <>
                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="edit" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>Last Updated</Text>
                    </View>
                    <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                      {item.lastUpdated}
                    </Text>
                  </View>
                </>
              )}

              {!isTask && (
                <>
                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="zap" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>Current Streak</Text>
                    </View>
                    <Text style={[styles.metaValue, { color: colors.warning, fontWeight: "700" }]}>
                      🔥 {item.streak || 0} days
                    </Text>
                  </View>

                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="award" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>Best Streak</Text>
                    </View>
                    <Text style={[styles.metaValue, { color: colors.warning, fontWeight: "700" }]}>
                      🏆 {item.bestStreak || 0} days
                    </Text>
                  </View>

                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="check-circle" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>Total Completions</Text>
                    </View>
                    <Text style={[styles.metaValue, { color: colors.textMuted, fontWeight: "600" }]}>
                      {timesCompleted ?? 0} completions{completionRate !== null ? ` (${completionRate}% rate)` : ""}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Resources Card (Tappable) */}
            <TouchableOpacity
              style={{
                backgroundColor: colors.card,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: colors.border,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 8,
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setResourcesSheetVisible(true);
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: `${colors.primary}15`,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Feather name="folder" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
                    {linkedCollectionIds.length} {linkedCollectionIds.length === 1 ? "Resource" : "Resources"}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                    {resourcePreviewText || "No resources attached"}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Completion History Calendar (Habits Only) */}
            {!isTask && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginLeft: 4 }}>
                  Completion Calendar
                </Text>
                <View style={{
                  backgroundColor: colors.card,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  overflow: "hidden",
                  padding: 8,
                }}>
                  <Calendar
                    theme={{
                      calendarBackground: colors.card,
                      textSectionTitleColor: colors.textMuted,
                      selectedDayBackgroundColor: "#F59E0B",
                      selectedDayTextColor: "#ffffff",
                      todayTextColor: colors.primary,
                      dayTextColor: colors.text,
                      textDisabledColor: `${colors.textMuted}33`,
                      dotColor: "#F59E0B",
                      selectedDotColor: "#ffffff",
                      arrowColor: colors.primary,
                      monthTextColor: colors.text,
                      textDayFontWeight: "600",
                      textMonthFontWeight: "700",
                      textDayHeaderFontWeight: "700",
                      textDayFontSize: 13,
                      textMonthFontSize: 14,
                      textDayHeaderFontSize: 11,
                    }}
                    markedDates={calendarMarkedDates}
                  />
                </View>
              </View>
            )}

            {/* Quick action buttons row */}
            <View style={{ gap: 12, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleConvert}
              >
                <Feather name="refresh-cw" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Convert to {isTask ? "Habit" : "Task"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleDuplicate}
              >
                <Feather name="copy" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Duplicate Item</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={async () => {
                  try {
                    const nextArchived = !item.archived;
                    const isTask = itemType === "task";

                    await cancelReminderIds(item.notificationIds || []);
                    let notificationIds: string[] = [];
                    if (!nextArchived && item.reminderHour !== undefined && item.reminderMinute !== undefined) {
                      const scheduled = await scheduleReminderBatch({
                        kind: itemType === "task" ? "todo" : "habit",
                        itemId: item.id,
                        title: item.title,
                        category: item.category,
                        dailyTime: { hour: item.reminderHour, minute: item.reminderMinute },
                        dailyDays: item.reminderDays,
                        recurrence: item.recurrence,
                        escalationMinutes: [120, 240],
                        channelId: Platform.OS === "android" ? (isTask ? "todo-reminders" : "daily-habits") : undefined,
                      });
                      notificationIds = scheduled.ids;
                    }

                    const updatedItem = {
                      ...item,
                      archived: nextArchived,
                      notificationIds,
                      lastUpdated: getDateKey(),
                    };

                    if (isTask) {
                      const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
                      if (raw) {
                        const state = JSON.parse(raw);
                        for (const listId in state.todos) {
                          state.todos[listId] = state.todos[listId].map((t: Todo) =>
                            t.id === item.id ? updatedItem : t
                          );
                        }
                        await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
                      }
                    } else {
                      const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
                      if (raw) {
                        const state = JSON.parse(raw);
                        state.dailyHabits = state.dailyHabits.map((h: Habit) =>
                          h.id === item.id ? updatedItem : h
                        );
                        await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
                      }
                    }

                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    emitStateChange(isTask ? "tasks_changed" : "habits_changed");
                    router.back();
                  } catch (e) {
                    console.warn("Failed to archive/restore", e);
                  }
                }}
              >
                <Feather name={item.archived ? "unlock" : "archive"} size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  {item.archived ? "Restore from Archive" : "Archive Item"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: `${colors.error}10`, borderColor: `${colors.error}33` }]}
                onPress={handleDeletePress}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Edit Mode */
          <View style={{ gap: 16 }}>
            {/* Title Input */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Name</Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff" }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Item Title"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Description Input */}
            {isTask && (
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Notes</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff", minHeight: 70, textAlignVertical: "top" }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add details..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
              </View>
            )}

            {/* Category Selector */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Category</Text>
              <View style={styles.pillsContainer}>
                {CATEGORY_OPTIONS.map((cat) => {
                  const isSelected = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[styles.pill, {
                        backgroundColor: isSelected ? `${cat.color}22` : colors.card,
                        borderColor: isSelected ? cat.color : colors.border
                      }]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Feather name={cat.icon} size={12} color={isSelected ? cat.color : colors.textMuted} />
                      <Text style={{ color: isSelected ? cat.color : colors.text, fontSize: 13, fontWeight: "600", marginLeft: 4 }}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Priority Selector */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Priority</Text>
              <View style={styles.pillsContainer}>
                {PRIORITY_OPTIONS.map((prio) => {
                  const isSelected = priority === prio.key;
                  return (
                    <TouchableOpacity
                      key={prio.key}
                      style={[styles.pill, {
                        backgroundColor: isSelected ? `${prio.color}22` : colors.card,
                        borderColor: isSelected ? prio.color : colors.border
                      }]}
                      onPress={() => setPriority(prio.key)}
                    >
                      <Text style={{ color: isSelected ? prio.color : colors.text, fontSize: 13, fontWeight: "700" }}>
                        {prio.label.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Workspace Selector */}
            {isTask && (
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Workspace</Text>
                <View style={styles.pillsContainer}>
                  {workspaces.map((ws) => {
                    const isSelected = workspaceId === ws.id;
                    return (
                      <TouchableOpacity
                        key={ws.id}
                        style={[styles.pill, {
                          backgroundColor: isSelected ? `${colors.primary}22` : colors.card,
                          borderColor: isSelected ? colors.primary : colors.border
                        }]}
                        onPress={() => setWorkspaceId(ws.id)}
                      >
                        <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>
                          {ws.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Scheduled Date Selector (Tasks Only) */}
            {isTask && (
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Scheduled Date</Text>
                <View style={styles.pillsContainer}>
                  {[
                    { label: "Today", val: getDateKey() },
                    { label: "Tomorrow", val: getDateKey(new Date(Date.now() + 86400000)) },
                    { label: "Inbox", val: "inbox" }
                  ].map((opt) => {
                    const isSelected = scheduledDate === opt.val;
                    return (
                      <TouchableOpacity
                        key={opt.val}
                        style={[styles.pill, {
                          backgroundColor: isSelected ? `${colors.primary}22` : colors.card,
                          borderColor: isSelected ? colors.primary : colors.border
                        }]}
                        onPress={() => {
                          setScheduledDate(opt.val);
                          setShowDatePicker(false);
                        }}
                      >
                        <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  
                  <TouchableOpacity
                    style={[styles.pill, {
                      backgroundColor: showDatePicker || !["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(scheduledDate) ? `${colors.primary}22` : colors.card,
                      borderColor: showDatePicker || !["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(scheduledDate) ? colors.primary : colors.border
                    }]}
                    onPress={() => setShowDatePicker(!showDatePicker)}
                  >
                    <Feather name="calendar" size={12} color={colors.primary} />
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginLeft: 4 }}>
                      {!["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(scheduledDate) ? scheduledDate : "Custom..."}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showDatePicker && (
                  <View style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                    <Calendar
                      current={scheduledDate !== "inbox" ? scheduledDate : undefined}
                      onDayPress={(day: any) => {
                        setScheduledDate(day.dateString);
                        setShowDatePicker(false);
                      }}
                      theme={{
                        backgroundColor: colors.card,
                        calendarBackground: colors.card,
                        textSectionTitleColor: colors.textMuted,
                        selectedDayBackgroundColor: colors.primary,
                        selectedDayTextColor: '#ffffff',
                        todayTextColor: colors.primary,
                        dayTextColor: colors.text,
                        textDisabledColor: colors.textMuted + '50',
                        monthTextColor: colors.text,
                        arrowColor: colors.primary,
                      }}
                      markedDates={
                        scheduledDate && scheduledDate !== "inbox"
                          ? { [scheduledDate]: { selected: true, selectedColor: colors.primary } }
                          : {}
                      }
                    />
                  </View>
                )}
              </View>
            )}

            {/* Reminder Setting */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
              <TouchableOpacity
                onPress={() => setTimePickerVisible(!timePickerVisible)}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Feather name="bell" size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: "600", marginLeft: 8 }}>
                    Reminder Schedule
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                    {reminderHour !== undefined && reminderMinute !== undefined
                      ? `${String(reminderHour).padStart(2, "0")}:${String(reminderMinute).padStart(2, "0")}`
                      : "Off"}
                  </Text>
                  <Feather name={timePickerVisible ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </View>
              </TouchableOpacity>

              {timePickerVisible && (
                <View style={{ marginTop: 12 }}>
                  <TimeSelectorDial
                    colors={colors}
                    initialHour={reminderHour ?? 7}
                    initialMinute={reminderMinute ?? 0}
                    initialDays={reminderDays}
                    onSave={(h, m, d) => {
                      setReminderHour(h);
                      setReminderMinute(m);
                      setReminderDays(d || []);
                      setTimePickerVisible(false);
                    }}
                    saveLabel="Confirm Time"
                  />
                  <TouchableOpacity
                    style={{ alignSelf: "center", marginTop: 8 }}
                    onPress={() => {
                      setReminderHour(undefined);
                      setReminderMinute(undefined);
                      setReminderDays([]);
                      setTimePickerVisible(false);
                    }}
                  >
                    <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>Disable Reminder</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Recurrence Pattern Configuration */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 12, gap: 12 }]}>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
                Recurrence Pattern
              </Text>

              <View style={styles.recurrencePillsRow}>
                {["none", "daily", "weekdays", "weekly", "monthly", "interval"].map((r) => {
                  const isSelected = recurrenceType === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.recurrencePillBtn, {
                        backgroundColor: isSelected ? `${colors.primary}22` : colors.cardLight,
                        borderColor: isSelected ? colors.primary : "transparent",
                        borderWidth: 1,
                      }]}
                      onPress={() => setRecurrenceType(r)}
                    >
                      <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {recurrenceType === "weekly" && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>Repeat on days:</Text>
                  <View style={styles.daysSelectionRow}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => {
                      const isDaySelected = recurrenceDays.includes(idx);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.dayCircleBtn, {
                            backgroundColor: isDaySelected ? colors.primary : colors.cardLight,
                            borderColor: isDaySelected ? colors.primary : colors.border,
                            borderWidth: 1,
                          }]}
                          onPress={() => toggleDaySelection(idx)}
                        >
                          <Text style={{ color: isDaySelected ? "#fff" : colors.text, fontSize: 11, fontWeight: "700" }}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {recurrenceType === "monthly" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Repeat on day of month:</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={[styles.numInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardLight }]}
                    value={String(recurrenceDayOfMonth)}
                    onChangeText={(val) => {
                      const num = Number(val);
                      if (!isNaN(num) && num >= 1 && num <= 31) {
                        setRecurrenceDayOfMonth(num);
                      }
                    }}
                  />
                </View>
              )}

              {recurrenceType === "interval" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Repeat every</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={[styles.numInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardLight, width: 50 }]}
                    value={String(intervalVal)}
                    onChangeText={(val) => {
                      const num = Number(val);
                      if (!isNaN(num) && num >= 1) {
                        setIntervalVal(num);
                      }
                    }}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["hours", "days"].map((unit) => {
                      const isUnitSelected = intervalUnit === unit;
                      return (
                        <TouchableOpacity
                          key={unit}
                          style={[styles.unitBtn, {
                            backgroundColor: isUnitSelected ? `${colors.primary}22` : colors.cardLight,
                            borderColor: isUnitSelected ? colors.primary : colors.border,
                            borderWidth: 1,
                          }]}
                          onPress={() => setIntervalUnit(unit as any)}
                        >
                          <Text style={{ color: isUnitSelected ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* Linked Resources Section */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 12, gap: 10 }]}>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
                Linked Resources (Optional)
              </Text>
              
              <View style={{ gap: 8 }}>
                {linkedCollections.map((col) => (
                  <View
                    key={col.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 16 }}>{col.emoji || "📚"}</Text>
                      <View>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{col.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{col.items?.filter(i => !i.archived).length || 0} items</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setLinkedCollectionIds(prev => prev.filter(id => id !== col.id));
                      }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="x" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: colors.primary,
                    backgroundColor: `${colors.primary}05`,
                    marginTop: 4,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setLinkPickerVisible(true);
                  }}
                >
                  <Feather name="plus" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                    Link a Resource List
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.border, alignSelf: "center", width: "50%", marginTop: 12 }]}
              onPress={() => {
                setIsEditing(false);
                initForm(item);
              }}
            >
              <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Discard Edits</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {isEditing && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: 20,
            paddingVertical: 14,
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            elevation: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            zIndex: 999,
          }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => {
              setIsEditing(false);
              initForm(item);
            }}
          >
            <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 2,
              height: 44,
              borderRadius: 12,
              backgroundColor: hasChanges ? colors.primary : colors.cardLight,
              alignItems: "center",
              justifyContent: "center",
              opacity: hasChanges ? 1 : 0.6,
            }}
            disabled={!hasChanges}
            onPress={handleSave}
          >
            <Text style={{ color: hasChanges ? "#FFFFFF" : colors.textMuted, fontWeight: "700", fontSize: 14 }}>
              Save Changes
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Delete safety modal */}
      <Modal visible={showDeleteSafetyModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Recurring Item</Text>
            <Text style={[styles.modalMessage, { color: colors.textMuted }]}>
              Do you want to delete only this specific occurrence or all future occurrences?
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.cardLight }]}
                onPress={() => setShowDeleteSafetyModal(false)}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: `${colors.error}15` }]}
                onPress={() => deleteItem(true)}
              >
                <Text style={{ color: colors.error, fontWeight: "700" }}>Only this occurrence</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.error }]}
                onPress={() => deleteItem(false)}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>All occurrences</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit recurring modal */}
      <Modal visible={showEditRecurringModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Save Recurring Changes</Text>
            <Text style={[styles.modalMessage, { color: colors.textMuted }]}>
              Would you like to save changes for only this occurrence or apply them to all future occurrences?
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.cardLight }]}
                onPress={() => setShowEditRecurringModal(false)}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: `${colors.primary}15` }]}
                onPress={() => saveChanges(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Only this occurrence</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={() => saveChanges(false)}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>All occurrences</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Resources Bottom Sheet */}
      <Modal
        visible={resourcesSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setResourcesSheetVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.4)" }}
            onPress={() => setResourcesSheetVisible(false)}
          />
          <View style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "ios" ? 36 : 24,
            maxHeight: "80%",
            borderWidth: 1.5,
            borderColor: colors.border,
          }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                  {title} Resources
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {totalResourceItems} {totalResourceItems === 1 ? "item" : "items"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setResourcesSheetVisible(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isDark ? "#27272A" : "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Feather name="x" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Filter Chips Bar */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(["All", "Links", "Notes", "Images"] as const).map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: isActive ? colors.primary : (isDark ? "#27272A" : "#E4E4E7"),
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setActiveFilter(filter);
                    }}
                  >
                    <Text style={{ color: isActive ? "#FFFFFF" : colors.text, fontSize: 13, fontWeight: "600" }}>
                      {filter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Resource Items List */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ minHeight: 180, marginBottom: 16 }}>
              {filteredResourceItems.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <Feather name="folder" size={32} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
                    No matching resources found
                  </Text>
                </View>
              ) : (
                filteredResourceItems.map((res) => {
                  let icon = "file-text";
                  let iconColor = "#10B981"; // green
                  if (res.type === "link" || res.url) {
                    icon = "play";
                    iconColor = "#EF4444"; // red
                  } else if (res.type === "image" || res.mediaUri) {
                    icon = "image";
                    iconColor = "#3B82F6"; // blue
                  }

                  return (
                    <TouchableOpacity
                      key={res.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      }}
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        if (res.type === "link" || res.url) {
                          let destUrl = res.url || res.content;
                          if (destUrl) {
                            if (!/^https?:\/\//i.test(destUrl)) {
                              destUrl = "https://" + destUrl;
                            }
                            try {
                              await Linking.openURL(destUrl);
                            } catch (err) {
                              Alert.alert("Error", "Could not open link: " + destUrl);
                            }
                          }
                        } else if (res.type === "note") {
                          setViewingNote(res);
                        } else if (res.type === "image" && res.mediaUri) {
                          setViewingImage(res.mediaUri);
                        }
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          backgroundColor: `${iconColor}15`,
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          <Feather name={icon as any} size={16} color={iconColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                            {res.title}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                            {res.collectionName} • {res.type}
                          </Text>
                        </View>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Footer */}
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderRadius: 14,
                gap: 8,
              }}
              onPress={() => {
                setResourcesSheetVisible(false);
                router.push("/(tabs)/tasks");
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
                Open in Workspace →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Link Resources Picker Modal */}
      <Modal
        visible={linkPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLinkPickerVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.4)" }}
            onPress={() => {
              setLinkPickerVisible(false);
              setIsCreatingCollection(false);
            }}
          />
          <View style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "ios" ? 36 : 24,
            maxHeight: "75%",
            borderWidth: 1.5,
            borderColor: colors.border,
          }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                  Link Resources
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  Select existing collections or create a new one
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setLinkPickerVisible(false);
                  setIsCreatingCollection(false);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isDark ? "#27272A" : "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Feather name="x" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* List */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ minHeight: 180, marginBottom: 16 }}>
              {availableCollectionsForPicker.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <Feather name="folder" size={32} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
                    No collections found. Create one below!
                  </Text>
                </View>
              ) : (
                availableCollectionsForPicker.map((col) => {
                  const isChecked = linkedCollectionIds.includes(col.id);
                  return (
                    <TouchableOpacity
                      key={col.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setLinkedCollectionIds(prev =>
                          isChecked ? prev.filter(id => id !== col.id) : [...prev, col.id]
                        );
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={{ fontSize: 18 }}>{col.emoji || "📚"}</Text>
                        <View>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                            {col.name}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                            {col.items?.filter(i => !i.archived).length || 0} items
                          </Text>
                        </View>
                      </View>
                      <View style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 1.5,
                        borderColor: isChecked ? colors.primary : colors.textMuted,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isChecked ? colors.primary : "transparent",
                      }}>
                        {isChecked && <Feather name="check" size={12} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Quick Create Collection Form */}
            {isCreatingCollection ? (
              <View style={{ gap: 10, marginTop: 8, padding: 12, backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#F8FAFC", borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>Create New Collection</Text>
                <TextInput
                  style={[styles.textInput, { height: 40, color: colors.text, borderColor: colors.border, backgroundColor: isDark ? "#000" : "#fff", paddingVertical: 0 }]}
                  value={newCollectionName}
                  onChangeText={setNewCollectionName}
                  placeholder="Collection Name (e.g. Chord Sheets)"
                  placeholderTextColor={colors.textMuted}
                />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: isDark ? "#27272A" : "#E2E8F0" }}
                    onPress={() => {
                      setIsCreatingCollection(false);
                      setNewCollectionName("");
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
                    onPress={handleCreateNewCollection}
                  >
                    <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "600" }}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                }}
                onPress={() => setIsCreatingCollection(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
                  + Create New Collection
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Note Reader Modal */}
      <Modal
        visible={!!viewingNote}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingNote(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{
            width: "100%",
            backgroundColor: colors.card,
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: colors.border,
            padding: 20,
            maxHeight: "70%",
          }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 4 }}>
              {viewingNote?.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
              {(viewingNote as any)?.collectionName} • Note
            </Text>
            <ScrollView showsVerticalScrollIndicator={true} style={{ marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                {viewingNote?.content || "No content added to this note."}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
              }}
              onPress={() => setViewingNote(null)}
            >
              <Text style={{ color: "#FFF", fontWeight: "700" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Lightbox Modal */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setViewingImage(null)} />
          {viewingImage && (
            <View style={{ width: "90%", height: "70%", justifyContent: "center", alignItems: "center" }}>
              <Feather name="image" size={64} color="#FFF" style={{ opacity: 0.3 }} />
              <Text style={{ color: "#FFF", marginTop: 12, textAlign: "center" }}>Image preview matches: {viewingImage}</Text>
            </View>
          )}
          <TouchableOpacity
            style={{
              position: "absolute",
              top: Platform.OS === "ios" ? 60 : 30,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => setViewingImage(null)}
          >
            <Feather name="x" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerBtnTextRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scrollContent: { padding: 18, paddingBottom: 60 },
  archiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  itemTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  itemDesc: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700", marginLeft: 4, textTransform: "uppercase" },
  metaCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  metaRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaLabel: { fontSize: 15, fontWeight: "500" },
  metaValue: { fontSize: 14, fontWeight: "600" },
  rowDivider: { height: 1, marginVertical: 8 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  deleteBtnText: { fontSize: 14, fontWeight: "700" },
  // Edit Form Styles
  inputWrap: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: "700" },
  textInput: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  recurrencePillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  recurrencePillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  daysSelectionRow: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  dayCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  numInput: {
    width: 40,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  // Modal Backdrop styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalMessage: { fontSize: 14, lineHeight: 20 },
  modalBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  modalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
