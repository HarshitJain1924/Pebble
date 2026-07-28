import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Linking,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";

import {
    TaskRepository,
    HabitRepository,
    WorkspaceRepository,
} from "@/repositories";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { TimeSelectorDial } from "@/shared/components/ui/TimeSelectorDial";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Resource, type Habit, type RecurrenceRule, Workspace, Task, INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } from "@/shared/types/domain.types";
import { ResourceRepository } from "@/repositories";
import { getAllHistory } from "@/services/analytics/productivity-history.service";
import { getDateKey, getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import {
    cancelReminderIds,
    rescheduleHabitReminders,
    rescheduleTodoReminders,
    scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import { recurrenceRuleToScheduler } from "@/services/scheduling/recurrence-mapper";
import { emitStateChange } from "@/services/events/state-events";
import {
    addToRecycleBin,
    getRecycleBinItems,
    saveRecycleBinItems,
} from "@/services/storage/storage.service";

import { CategoryChip } from "@/shared/components/design-system";
import { TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";

const CATEGORY_OPTIONS = TASK_CATEGORY_META.map((cat) => ({
  key: cat.key,
  label: cat.label,
  color: cat.tint,
  icon: cat.icon as any,
}));

const PRIORITY_OPTIONS = [
  { key: "low" as const, label: "Low", color: "#10B981" },
  { key: "medium" as const, label: "Medium", color: "#F59E0B" },
  { key: "high" as const, label: "High", color: "#EF4444" },
];

export default function TaskDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    type: "task" | "habit";
    date?: string;
  }>();
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
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

  // === FORM STATE ===
  // Basic fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("work");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [workspaceId, setWorkspaceId] = useState(INBOX_WORKSPACE_ID);

  // Schedule: only schedule.date (canonical V3)
  const [scheduleDate, setScheduleDate] = useState("inbox");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Reminder: only notification time — no weekdays (owned by recurrence)
  const [reminderTime, setReminderTime] = useState<{ hour: number; minute: number } | undefined>(undefined);
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  // Recurrence: canonical RecurrenceRule fields
  const [recurrenceType, setRecurrenceType] = useState<string>("none");
  const [intervalVal, setIntervalVal] = useState<number>(1);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState<number>(1);

  // Time & Recurrence pickers state
  const [showDeleteSafetyModal, setShowDeleteSafetyModal] = useState(false);
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false);

  // Resources state
  const [resourcesSheetVisible, setResourcesSheetVisible] = useState(false);
  const [linkPickerVisible, setLinkPickerVisible] = useState(false);
  const [resourcesList, setResourcesList] = useState<Resource[]>([]);
  const [linkedCollectionIds, setLinkedCollectionIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<
    "All" | "Links" | "Notes" | "Images"
  >("All");

  // Viewing/Preview states
  const [viewingNote, setViewingNote] = useState<Resource | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const allResources = useMemo(() => {
    return resourcesList;
  }, [resourcesList]);

  const linkedResources = useMemo(() => {
    return allResources.filter((res) => linkedCollectionIds.includes(res.id));
  }, [allResources, linkedCollectionIds]);

  const totalResourceItems = useMemo(() => {
    return linkedResources.length;
  }, [linkedResources]);

  const resourcePreviewText = useMemo(() => {
    if (linkedResources.length === 0) return "";
    return linkedResources.map((res) => res.title).join(", ");
  }, [linkedResources]);

  const allResourceItems = useMemo(() => {
    return [...linkedResources].sort((a, b) => b.createdAt - a.createdAt);
  }, [linkedResources]);

  const filteredResourceItems = useMemo(() => {
    if (activeFilter === "All") return allResourceItems;
    if (activeFilter === "Links")
      return allResourceItems.filter(
        (item) => item.type === "link" || !!item.attachments?.[0]?.uri,
      );
    if (activeFilter === "Notes")
      return allResourceItems.filter((item) => item.type === "note");
    return allResourceItems;
  }, [allResourceItems, activeFilter]);

  // Helper: compute epoch timestamp from hour/minute + schedule date (must be defined BEFORE hasChanges)
  const computeTriggerEpoch = (hour: number, minute: number, dateStr: string): number | undefined => {
    if (dateStr && dateStr !== "inbox") {
      return new Date(dateStr + `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).getTime();
    }
    // No specific date — use today as fallback for scheduling
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  const hasChanges = useMemo(() => {
    if (!item) return false;

    // Compare basic fields
    if (title.trim() !== (item.title || "").trim()) return true;
    if (description.trim() !== (item.description || "").trim()) return true;
    const itemCategory = item.categoryId || item.category || "work";
    if (category !== itemCategory) return true;
    if (priority !== (item.priority || "medium")) return true;
    if (workspaceId !== (item.workspaceId || INBOX_WORKSPACE_ID)) return true;

    // Compare schedule — canonical only
    const itemScheduleDate = item.schedule?.date || "inbox";
    if (isTask && scheduleDate !== itemScheduleDate) return true;

    // Compare reminder — canonical only (compare triggerAt epoch)
    const itemReminderTriggerAt = item.reminder?.triggerAt;
    const formReminderTriggerAt = reminderTime
      ? computeTriggerEpoch(reminderTime.hour, reminderTime.minute, scheduleDate)
      : undefined;
    if (formReminderTriggerAt !== itemReminderTriggerAt) return true;

    // Compare linked collections
    const sortedLinkedCurrent = [...linkedCollectionIds].sort();
    const sortedLinkedItem = [...(item.linkedCollectionIds || [])].sort();
    if (
      JSON.stringify(sortedLinkedCurrent) !== JSON.stringify(sortedLinkedItem)
    )
      return true;

    // Compare recurrence — canonical only
    const itemRecType = item.recurrence?.frequency || "none";
    if (recurrenceType !== itemRecType) return true;

    if (recurrenceType !== "none") {
      const rec = item.recurrence || {};
      if (recurrenceType === "custom") {
        if (intervalVal !== (rec.interval || 1)) return true;
      }
      if (recurrenceType === "weekly") {
        const sortedRecDaysCurrent = [...recurrenceDays].sort();
        const sortedRecDaysItem = [...(rec.daysOfWeek || [])].sort();
        if (
          JSON.stringify(sortedRecDaysCurrent) !==
          JSON.stringify(sortedRecDaysItem)
        )
          return true;
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
    scheduleDate,
    reminderTime,
    linkedCollectionIds,
    recurrenceType,
    intervalVal,
    recurrenceDays,
    recurrenceDayOfMonth,
    isTask,
  ]);

  // Load Workspaces & Item Data
  useEffect(() => {
    loadData();
  }, [itemId, itemType]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load workspaces via WorkspaceRepository
      const folderList = await WorkspaceRepository.getWorkspaces();
      const loadedWorkspaces =
        folderList.length > 0
          ? folderList.map((f) => ({
              id: f.id,
              name: f.name,
              emoji: f.emoji || "📁",
              color: f.color || "#6366F1",
              createdAt: f.createdAt,
              updatedAt: f.updatedAt || Date.now(),
              archivedAt: f.archivedAt,
            }))
          : [
              {
                id: INBOX_WORKSPACE_ID,
                name: "Inbox",
                emoji: "📥",
                color: "#6366F1",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ];
      setWorkspaces(loadedWorkspaces);
      const folderIds = Array.from(
        new Set([INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID, ...folderList.map((f) => f.id)]),
      );

      // Load resources directly from ResourceRepository for all workspace folders
      const allLoadedResources: Resource[] = [];
      for (const fId of folderIds) {
        const resMap = await ResourceRepository.getResources(fId);
        Object.values(resMap).forEach((r: any) => {
          allLoadedResources.push(r as Resource);
        });
      }
      setResourcesList(allLoadedResources);

      if (itemType === "task") {
        let foundTask = null;
        for (const fId of folderIds) {
          const task = await TaskRepository.getTask(itemId, fId);
          if (task) {
            foundTask = { ...task, workspaceId: fId };
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
      } else {
        // habit
        let foundHabit = null;
        for (const fId of folderIds) {
          const habit = await HabitRepository.getHabit(itemId, fId);
          if (habit) {
            foundHabit = {
              ...habit,
              workspaceId: fId,
            };
            break;
          }
        }
        if (foundHabit) {
          setItem(foundHabit);
          initForm(foundHabit);

          // Load completion stats from history
          try {
            const history = await getAllHistory();
            const relevantEntries = history.filter(
              (entry) => entry.totalHabits > 0,
            );
            const completedEntries = history.filter((entry) =>
              entry.completedHabitTitles?.includes(foundHabit.title),
            );
            const completedCount = completedEntries.length;
            setTimesCompleted(completedCount);

            // Gather all unique date strings where the habit was completed
            const dates = completedEntries
              .map((entry) => entry.date)
              .filter(Boolean);
            setCompletedDates(dates);

            if (relevantEntries.length > 0) {
              setCompletionRate(
                Math.round((completedCount / relevantEntries.length) * 100),
              );
            } else {
              setCompletionRate(0);
            }
          } catch (e) {
            console.warn("Failed to load habit completion stats:", e);
          }
        } else {
          Alert.alert("Error", "Habit not found.");
          router.back();
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
    setCategory(data.categoryId || data.category || "work");
    setPriority(data.priority || "medium");
    setWorkspaceId(data.workspaceId || INBOX_WORKSPACE_ID);

    // Schedule: canonical schedule.date only
    setScheduleDate(data.schedule?.date || "inbox");

    // Reminder: canonical reminder.triggerAt only — no fallback to flat fields
    if (data.reminder?.triggerAt) {
      const d = new Date(data.reminder.triggerAt);
      setReminderTime({ hour: d.getHours(), minute: d.getMinutes() });
    } else {
      setReminderTime(undefined);
    }

    setLinkedCollectionIds(data.linkedCollectionIds || []);

    // Recurrence: canonical recurrence fields only
    const rec = data.recurrence;
    if (rec) {
      setRecurrenceType(rec.frequency || "custom");
      setIntervalVal(rec.interval || 1);
      setRecurrenceDays(rec.daysOfWeek || []);
      setRecurrenceDayOfMonth(rec.dayOfMonth || 1);
    } else {
      setRecurrenceType("none");
      setIntervalVal(1);
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
      setShowEditRecurringModal(true);
    } else {
      saveChanges(false);
    }
  };

  const saveChanges = async (thisOccurrenceOnly: boolean) => {
    setShowEditRecurringModal(false);
    try {
      const isTask = itemType === "task";

      // Build canonical RecurrenceRule
      let updatedRecurrence = null;
      if (recurrenceType !== "none") {
        updatedRecurrence = {
          frequency: recurrenceType,
          interval: intervalVal,
          ...(recurrenceType === "weekly" ? { daysOfWeek: recurrenceDays } : {}),
          ...(recurrenceType === "monthly" ? { dayOfMonth: recurrenceDayOfMonth } : {}),
        };
      }

      // Compute canonical Reminder
      let updatedReminder: { enabled: boolean; triggerAt: number; notificationIds?: string[] } | undefined;
      if (reminderTime) {
        updatedReminder = {
          enabled: true,
          triggerAt: computeTriggerEpoch(reminderTime.hour, reminderTime.minute, scheduleDate) || Date.now(),
        };
      } else {
        updatedReminder = { enabled: false, triggerAt: 0 };
      }

      // Capture saved object for immediate UI refresh
      let savedItemForRefresh: any = null;

      if (thisOccurrenceOnly) {
        // Exception logic:
        // 1. Create a non-recurring copy for selectedOccurrenceDate
        const newId = `${itemType}-${Date.now()}`;
        const newCopy = {
          ...item,
          id: newId,
          title: title.trim(),
          description: description.trim(),
          categoryId: category,
          category,
          priority,
          workspaceId,
          recurrence: undefined, // non-recurring copy
          schedule: isTask ? { date: selectedOccurrenceDate } : undefined,
          reminder: reminderTime
            ? {
                enabled: true,
                triggerAt: computeTriggerEpoch(reminderTime.hour, reminderTime.minute, selectedOccurrenceDate) || Date.now(),
              }
            : undefined,
          lastUpdated: getDateKey(),
          completed: false,
          completedToday: false,
          streak: 0,
          linkedCollectionIds,
        };

        // 2. Add current date to exceptions of the master
        const updatedMaster = {
          ...item,
          recurrenceExceptions: [
            ...(item.recurrenceExceptions || []),
            selectedOccurrenceDate,
          ],
          lastUpdated: getDateKey(),
        };

        savedItemForRefresh = updatedMaster;

        // 3. Save both via Repository
        if (isTask) {
          await TaskRepository.saveTask({
            ...updatedMaster,
            workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
          });
          await TaskRepository.saveTask({
            ...newCopy,
            workspaceId,
          });
        } else {
          await HabitRepository.saveHabit({
            ...updatedMaster,
            workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
          });
          await HabitRepository.saveHabit({
            ...newCopy,
            workspaceId,
          });
        }

        // 4. Schedule reminders for new copy — from canonical reminder
        if (reminderTime) {
          await scheduleReminderBatch({
            kind: itemType === "task" ? "todo" : "habit",
            itemId: newId,
            title: title.trim(),
            category,
            dailyTime: { hour: reminderTime.hour, minute: reminderTime.minute },
            escalationMinutes: [120, 240],
            channelId:
              Platform.OS === "android"
                ? isTask
                  ? "todo-reminders"
                  : "daily-habits"
                : undefined,
          });
        }
      } else {
        // Master update logic — canonical V3 fields only
        const updatedItem = {
          ...item,
          title: title.trim(),
          description: description.trim(),
          categoryId: category,
          category,
          priority,
          workspaceId,
          schedule: isTask ? { date: scheduleDate } : undefined,
          reminder: updatedReminder,
          recurrence: updatedRecurrence,
          lastUpdated: getDateKey(),
          linkedCollectionIds,
          completed: item.completed ?? item.status === 'completed',
          status: item.status || (item.completed ? 'completed' : 'todo'),
          archived: item.archived ?? !!item.archivedAt,
          archivedAt: item.archivedAt,
        };

        // Strip legacy scheduling fields — V3 canonical fields only
        delete updatedItem.reminderHour;
        delete updatedItem.reminderMinute;
        delete updatedItem.reminderDays;
        delete updatedItem.scheduledDate;

        // Cancel previous notifications
        await cancelReminderIds(item.notificationIds || []);

        // Schedule new notifications — from canonical reminder + recurrence
        let notificationIds: string[] = [];
        let alarmId: string | undefined;
        let alarmTime: number | undefined;

        if (reminderTime) {
          // For non-recurring tasks WITH a specific schedule date, use oneTimeAt (DATE trigger)
          // so the notification fires once at the correct date+time, not daily.
          // For inbox tasks (no specific date) or recurring tasks, use dailyTime + recurrence.
          const hasSpecificDate = isTask && scheduleDate && scheduleDate !== "inbox";
          const isNonRecurring = recurrenceType === "none";

          if (hasSpecificDate && isNonRecurring) {
            // One-time notification for a specific date
            const oneTimeDate = new Date(
              scheduleDate + `T${String(reminderTime.hour).padStart(2, "0")}:${String(reminderTime.minute).padStart(2, "0")}:00`,
            );
            const scheduled = await scheduleReminderBatch({
              kind: itemType === "task" ? "todo" : "habit",
              itemId: item.id,
              title: title.trim(),
              category,
              oneTimeAt: oneTimeDate,
              escalationMinutes: [120, 240],
              channelId:
                Platform.OS === "android"
                  ? isTask
                    ? "todo-reminders"
                    : "daily-habits"
                  : undefined,
            });
            notificationIds = scheduled.ids;
            alarmId = scheduled.primaryId;
            alarmTime = scheduled.alarmTime;
          } else {
            // Inbox tasks (no date) or recurring: use dailyTime + recurrence
            const scheduled = await scheduleReminderBatch({
              kind: itemType === "task" ? "todo" : "habit",
              itemId: item.id,
              title: title.trim(),
              category,
              dailyTime: { hour: reminderTime.hour, minute: reminderTime.minute },
              dailyDays: recurrenceType === "weekly" ? recurrenceDays : undefined,
              recurrence: recurrenceRuleToScheduler(updatedRecurrence as RecurrenceRule),
              escalationMinutes: [120, 240],
              channelId:
                Platform.OS === "android"
                  ? isTask
                    ? "todo-reminders"
                    : "daily-habits"
                  : undefined,
            });
            notificationIds = scheduled.ids;
            alarmId = scheduled.primaryId;
            alarmTime = scheduled.alarmTime;
          }
        }

        updatedItem.notificationIds = notificationIds;
        updatedItem.alarmId = alarmId;
        updatedItem.alarmTime = alarmTime;

        savedItemForRefresh = { ...updatedItem, workspaceId };

        if (isTask) {
          const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;
          if (oldFolderId !== workspaceId) {
            await TaskRepository.deleteTask(item.id, oldFolderId);
          }
          await TaskRepository.saveTask({
            ...updatedItem,
            workspaceId,
          });
        } else {
          const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;
          if (oldFolderId !== workspaceId) {
            await HabitRepository.deleteHabit(item.id, oldFolderId);
          }
          await HabitRepository.saveHabit({
            ...updatedItem,
            workspaceId,
          });
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");

      // Immediate local state update
      setItem(savedItemForRefresh);
      setIsEditing(false);
      showToast("Changes saved");
      initForm(savedItemForRefresh);

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
        lastUpdated: getDateKey(),
        completed: false,
        completedToday: false,
        streak: 0,
        bestStreak: 0,
        createdAt: Date.now(),
      };

      if (isTask) {
        await TaskRepository.saveTask({
          ...duplicate,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });
      } else {
        await HabitRepository.saveHabit({
          ...duplicate,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });
      }

      // Schedule reminders for duplicate — from canonical reminder
      if (item.reminder?.triggerAt) {
        const triggerDate = new Date(item.reminder.triggerAt);
        await scheduleReminderBatch({
          kind: itemType === "task" ? "todo" : "habit",
          itemId: newId,
          title: duplicate.title,
          category: item.category,
          dailyTime: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes() },
          dailyDays: item.recurrence?.daysOfWeek,
          recurrence: recurrenceRuleToScheduler(item.recurrence),
          escalationMinutes: [120, 240],
          channelId:
            Platform.OS === "android"
              ? isTask
                ? "todo-reminders"
                : "daily-habits"
              : undefined,
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

      // Cancel previous reminders
      await cancelReminderIds(item.notificationIds || []);

      if (isTask) {
        // Convert Task -> Habit
        const newHabit: Habit = {
          id: newId,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
          title: title.trim(),
          description: description.trim() || undefined,
          categoryId: (category as any) || "work",
          recurrence: { frequency: "daily", interval: 1 },
          completionHistory: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await TaskRepository.deleteTask(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
        );
        await HabitRepository.saveHabit(newHabit);

        emitStateChange("tasks_changed");
        emitStateChange("habits_changed");
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        router.replace(`/task-details?id=${newId}&type=habit`);
      } else {
        // Convert Habit -> Task
        const newTodo: Task = {
          id: newId,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
          title: title.trim(),
          description: description.trim() || undefined,
          status: "todo",
          priority: (priority as any) || "none",
          categoryId: (category as any) || "work",
          schedule: { date: getDateKey() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await HabitRepository.deleteHabit(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
        );
        await TaskRepository.saveTask({
          ...newTodo,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });

        // Schedule reminder for new task — from canonical reminder
        if (item.reminder?.triggerAt) {
          const triggerDate = new Date(item.reminder.triggerAt);
          await scheduleReminderBatch({
            kind: "todo",
            itemId: newId,
            title: newTodo.title,
            category: item.category || "work",
            dailyTime: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes() },
            dailyDays: item.recurrence?.daysOfWeek,
            recurrence: recurrenceRuleToScheduler(item.recurrence),
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
          });
        }

        emitStateChange("tasks_changed");
        emitStateChange("habits_changed");
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
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
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteItem(false),
          },
        ],
      );
    }
  };

  const deleteItem = async (thisOccurrenceOnly: boolean) => {
    setShowDeleteSafetyModal(false);
    try {
      const isTask = itemType === "task";

      if (thisOccurrenceOnly) {
        const updatedItem = {
          ...item,
          recurrenceExceptions: [
            ...(item.recurrenceExceptions || []),
            selectedOccurrenceDate,
          ],
          lastUpdated: getDateKey(),
        };

        if (isTask) {
          await TaskRepository.saveTask({
            ...updatedItem,
            workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
          });
        } else {
          await HabitRepository.saveHabit({
            ...updatedItem,
            workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
          });
        }
      } else {
        const originalWorkspace =
          workspaces.find((w) => w.id === (item.workspaceId || INBOX_WORKSPACE_ID))?.name ||
          "Inbox";

        await cancelReminderIds(item.notificationIds || []);

        await addToRecycleBin(
          isTask ? "task" : "habit",
          item,
          originalWorkspace,
        );

        if (isTask) {
          await TaskRepository.deleteTask(
            item.id,
            item.workspaceId || INBOX_WORKSPACE_ID,
          );
        } else {
          await HabitRepository.deleteHabit(
            item.id,
            item.workspaceId || INBOX_WORKSPACE_ID,
          );
        }

        showUndo({
          message: `Deleted "${item.title}"`,
          onUndo: async () => {
            const binItems = await getRecycleBinItems();
            await saveRecycleBinItems(
              binItems.filter((bi) => bi.id !== item.id),
            );

            if (isTask) {
              const rescheduled = await rescheduleTodoReminders(item);
              await TaskRepository.saveTask({
                ...rescheduled,
                workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
              });
              emitStateChange("tasks_changed");
            } else {
              const rescheduled = await rescheduleHabitReminders(item);
              await HabitRepository.saveHabit({
                ...rescheduled,
                workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
              });
              emitStateChange("habits_changed");
            }
          },
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");
      router.back();
    } catch (e) {
      console.warn("Failed to delete item", e);
    }
  };

  const toggleDaySelection = (idx: number) => {
    setRecurrenceDays((curr) =>
      curr.includes(idx) ? curr.filter((d) => d !== idx) : [...curr, idx],
    );
  };



  if (loading || !item) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Text style={{ color: colors.textMuted }}>
          Loading premium details...
        </Text>
      </SafeAreaView>
    );
  }

  const formatCreatedDate = () => {
    if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } catch (e) {
        // fallback
      }
    }
    if (item.createdDate) {
      try {
        const parts = item.createdDate.split("-");
        if (parts.length === 3) {
          const d = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2]),
          );
          return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
        return item.createdDate;
      } catch (e) {
        return item.createdDate;
      }
    }
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const itemCategoryMeta =
    CATEGORY_OPTIONS.find((c) => c.key === category) || CATEGORY_OPTIONS[0];
  const itemPriorityMeta =
    PRIORITY_OPTIONS.find((p) => p.key === priority) || PRIORITY_OPTIONS[1];

  // Helper to format reminder time for display
  const formatReminderDisplay = () => {
    if (item.reminder?.triggerAt) {
      const d = new Date(item.reminder.triggerAt);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return "No reminder scheduled";
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isEditing
            ? `Edit ${isTask ? "Task" : "Habit"}`
            : `${isTask ? "Task" : "Habit"} Details`}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            if (isEditing) {
              handleSave();
            } else {
              setIsEditing(true);
            }
          }}
          style={[
            styles.headerBtnTextRow,
            {
              backgroundColor: isEditing
                ? `${colors.primary}22`
                : "transparent",
            },
          ]}
        >
          <Feather
            name={isEditing ? "check" : "edit-2"}
            size={16}
            color={colors.primary}
          />
          <Text
            style={{ color: colors.primary, fontWeight: "700", marginLeft: 4 }}
          >
            {isEditing ? "Save" : "Edit"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isEditing ? 120 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {(item.archived || item.archivedAt) && (
          <View
            style={[
              styles.archiveBanner,
              {
                backgroundColor: `${colors.warning}15`,
                borderColor: colors.warning,
              },
            ]}
          >
            <Feather name="archive" size={16} color={colors.warning} />
            <Text
              style={{
                color: colors.warning,
                marginLeft: 8,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              This item is currently archived.
            </Text>
          </View>
        )}

        {/* View Mode */}
        {!isEditing ? (
          <View style={{ gap: 20 }}>
            {/* Title Section */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              {item.description ? (
                <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                  {item.description}
                </Text>
              ) : (
                <Text
                  style={[
                    styles.itemDesc,
                    { color: colors.textMuted, fontStyle: "italic" },
                  ]}
                >
                  No notes added
                </Text>
              )}
            </View>

            {/* Badges Grid */}
            <View style={styles.badgeRow}>
              {/* Item Type */}
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isTask
                      ? "rgba(59, 130, 246, 0.12)"
                      : "rgba(245, 158, 11, 0.12)",
                    borderColor: isTask ? "#3B82F6" : "#F59E0B",
                  },
                ]}
              >
                <Feather
                  name={isTask ? "check-square" : "activity"}
                  size={12}
                  color={isTask ? "#3B82F6" : "#F59E0B"}
                />
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: isTask ? "#3B82F6" : "#F59E0B",
                      fontWeight: "700",
                    },
                  ]}
                >
                  {isTask ? "Task" : "Habit"}
                </Text>
              </View>

              {/* Priority */}
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: `${itemPriorityMeta.color}15`,
                    borderColor: itemPriorityMeta.color,
                  },
                ]}
              >
                <Feather name="flag" size={12} color={itemPriorityMeta.color} />
                <Text
                  style={[styles.badgeText, { color: itemPriorityMeta.color }]}
                >
                  {itemPriorityMeta.label}
                </Text>
              </View>

              {/* Category */}
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: `${itemCategoryMeta.color}15`,
                    borderColor: itemCategoryMeta.color,
                    paddingLeft: 4,
                  },
                ]}
              >
                <CategoryChip category={category} size="xs" />
                <Text
                  style={[
                    styles.badgeText,
                    { color: itemCategoryMeta.color, marginLeft: 4 },
                  ]}
                >
                  {itemCategoryMeta.label}
                </Text>
              </View>

              {/* Workspace */}
              {isTask && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: `${colors.primary}15`,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Feather name="folder" size={12} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>
                    {workspaces.find((w) => w.id === (item.workspaceId || item.folderId))?.name ||
                      "Inbox"}
                  </Text>
                </View>
              )}

              {/* Status */}
              {isTask ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: (item.completed || item.status === 'completed')
                        ? `${colors.success}15`
                        : `${colors.error}15`,
                      borderColor: (item.completed || item.status === 'completed')
                        ? colors.success
                        : colors.error,
                    },
                  ]}
                >
                  <Feather
                    name={(item.completed || item.status === 'completed') ? "check-circle" : "circle"}
                    size={12}
                    color={(item.completed || item.status === 'completed') ? colors.success : colors.error}
                  />
                  <Text
                    style={[
                      styles.badgeText,
                      { color: (item.completed || item.status === 'completed') ? colors.success : colors.error },
                    ]}
                  >
                    {(item.completed || item.status === 'completed') ? "Completed" : "Pending"}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: (item.completedToday || item.completionHistory?.some?.((c: any) => c.date === getDateKey()))
                        ? `${colors.success}15`
                        : `${colors.warning}15`,
                      borderColor: item.completedToday
                        ? colors.success
                        : colors.warning,
                    },
                  ]}
                >
                  <Feather
                    name={item.completedToday ? "check-circle" : "circle"}
                    size={12}
                    color={
                      item.completedToday ? colors.success : colors.warning
                    }
                  />
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color: item.completedToday
                          ? colors.success
                          : colors.warning,
                      },
                    ]}
                  >
                    {item.completedToday ? "Done Today" : "Not Done Today"}
                  </Text>
                </View>
              )}
            </View>

            {/* Metadata Fields Section */}
            <View
              style={[
                styles.metaCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {/* Schedule (canonical) — Tasks Only */}
              {isTask && (
                <>
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather
                        name="calendar"
                        size={16}
                        color={colors.textMuted}
                      />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>
                        Schedule
                      </Text>
                    </View>
                    <Text
                      style={[styles.metaValue, { color: colors.textMuted }]}
                    >
                      {scheduleDate === "inbox"
                        ? "Inbox"
                        : scheduleDate || "None"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.rowDivider,
                      { backgroundColor: colors.border },
                    ]}
                  />
                </>
              )}

              {/* Reminder (canonical) */}
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="bell" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>
                    Reminder
                  </Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {item.reminder?.triggerAt
                    ? formatReminderDisplay()
                    : "No reminder scheduled"}
                </Text>
              </View>

              <View
                style={[styles.rowDivider, { backgroundColor: colors.border }]}
              />

              {/* Recurrence (canonical) */}
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="repeat" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>
                    Repeat
                  </Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {getRecurrenceLabel(item.recurrence) || "None"}
                </Text>
              </View>

              <View
                style={[styles.rowDivider, { backgroundColor: colors.border }]}
              />

              {/* Dates */}
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="calendar" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>
                    Created
                  </Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {formatCreatedDate()}
                </Text>
              </View>

              {item.lastUpdated && (
                <>
                  <View
                    style={[
                      styles.rowDivider,
                      { backgroundColor: colors.border },
                    ]}
                  />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="edit" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>
                        Updated
                      </Text>
                    </View>
                    <Text
                      style={[styles.metaValue, { color: colors.textMuted }]}
                    >
                      {item.lastUpdated}
                    </Text>
                  </View>
                </>
              )}

              {!isTask && (
                <>
                  <View
                    style={[
                      styles.rowDivider,
                      { backgroundColor: colors.border },
                    ]}
                  />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather name="zap" size={16} color={colors.textMuted} />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>
                        Current Streak
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.metaValue,
                        { color: colors.warning, fontWeight: "700" },
                      ]}
                    >
                      🔥 {item.streak || 0} days
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.rowDivider,
                      { backgroundColor: colors.border },
                    ]}
                  />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather
                        name="award"
                        size={16}
                        color={colors.textMuted}
                      />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>
                        Best Streak
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.metaValue,
                        { color: colors.warning, fontWeight: "700" },
                      ]}
                    >
                      🏆 {item.bestStreak || 0} days
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.rowDivider,
                      { backgroundColor: colors.border },
                    ]}
                  />
                  <View style={styles.metaRow}>
                    <View style={styles.metaRowLeft}>
                      <Feather
                        name="check-circle"
                        size={16}
                        color={colors.textMuted}
                      />
                      <Text style={[styles.metaLabel, { color: colors.text }]}>
                        Total Completions
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.metaValue,
                        { color: colors.textMuted, fontWeight: "600" },
                      ]}
                    >
                      {timesCompleted ?? 0} completions
                      {completionRate !== null
                        ? ` (${completionRate}% rate)`
                        : ""}
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                setResourcesSheetVisible(true);
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: `${colors.primary}15`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="folder" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    {linkedCollectionIds.length}{" "}
                    {linkedCollectionIds.length === 1
                      ? "Resource"
                      : "Resources"}
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {resourcePreviewText || "No resources attached"}
                  </Text>
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            {/* Completion History Calendar (Habits Only) */}
            {!isTask && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "700",
                    marginLeft: 4,
                  }}
                >
                  Completion Calendar
                </Text>
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    overflow: "hidden",
                    padding: 8,
                  }}
                >
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
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={handleConvert}
              >
                <Feather name="refresh-cw" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Convert to {isTask ? "Habit" : "Task"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={handleDuplicate}
              >
                <Feather name="copy" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Duplicate Item
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={async () => {
                  try {
                    const nextArchived = !(item.archived || item.archivedAt);
                    const isTask = itemType === "task";

                    await cancelReminderIds(item.notificationIds || []);
                    let notificationIds: string[] = [];
                    if (
                      !nextArchived &&
                      item.reminder?.triggerAt
                    ) {
                      const triggerDate = new Date(item.reminder.triggerAt);
                      // If the item has a specific schedule date (not inbox), use oneTimeAt
                      // so the notification fires once at the correct date+time.
                      const scheduleDate = item.schedule?.date || "inbox";
                      const hasSpecificDate = isTask && scheduleDate && scheduleDate !== "inbox";
                      const isNonRecurring = !item.recurrence;

                      if (hasSpecificDate && isNonRecurring) {
                        const oneTimeDate = new Date(
                          scheduleDate +
                            `T${String(triggerDate.getHours()).padStart(2, "0")}:${String(triggerDate.getMinutes()).padStart(2, "0")}:00`,
                        );
                        const scheduled = await scheduleReminderBatch({
                          kind: itemType === "task" ? "todo" : "habit",
                          itemId: item.id,
                          title: item.title,
                          category: item.category,
                          oneTimeAt: oneTimeDate,
                          escalationMinutes: [120, 240],
                          channelId:
                            Platform.OS === "android"
                              ? isTask
                                ? "todo-reminders"
                                : "daily-habits"
                              : undefined,
                        });
                        notificationIds = scheduled.ids;
                      } else {
                        const scheduled = await scheduleReminderBatch({
                          kind: itemType === "task" ? "todo" : "habit",
                          itemId: item.id,
                          title: item.title,
                          category: item.category,
                          dailyTime: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes() },
                          dailyDays: item.recurrence?.daysOfWeek,
                          recurrence: recurrenceRuleToScheduler(item.recurrence),
                          escalationMinutes: [120, 240],
                          channelId:
                            Platform.OS === "android"
                              ? isTask
                                ? "todo-reminders"
                                : "daily-habits"
                              : undefined,
                        });
                        notificationIds = scheduled.ids;
                      }
                    }

                    const updatedItem = {
                      ...item,
                      archivedAt: nextArchived ? Date.now() : undefined,
                      notificationIds,
                      lastUpdated: getDateKey(),
                    };

                    if (isTask) {
                      await TaskRepository.saveTask({
                        ...updatedItem,
                        workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
                      });
                    } else {
                      await HabitRepository.saveHabit({
                        ...updatedItem,
                        workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
                      });
                    }

                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    ).catch(() => {});
                    emitStateChange(
                      isTask ? "tasks_changed" : "habits_changed",
                    );
                    router.back();
                  } catch (e) {
                    console.warn("Failed to archive/restore", e);
                  }
                }}
              >
                <Feather
                  name={(item.archived || item.archivedAt) ? "unlock" : "archive"}
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  {(item.archived || item.archivedAt) ? "Restore from Archive" : "Archive Item"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  {
                    backgroundColor: `${colors.error}10`,
                    borderColor: `${colors.error}33`,
                  },
                ]}
                onPress={handleDeletePress}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>
                  Delete Item
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ===== EDIT MODE ===== */
          <View style={{ gap: 16 }}>
            {/* Title Input */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                Name
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                  },
                ]}
                value={title}
                onChangeText={setTitle}
                placeholder="Item Title"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Description Input */}
            {isTask && (
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Notes
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.02)"
                        : "#fff",
                      minHeight: 70,
                      textAlignVertical: "top",
                    },
                  ]}
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
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                Category
              </Text>
              <View style={styles.pillsContainer}>
                {CATEGORY_OPTIONS.map((cat) => {
                  const isSelected = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: isSelected
                            ? `${cat.color}22`
                            : colors.card,
                          borderColor: isSelected ? cat.color : colors.border,
                        },
                      ]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <CategoryChip category={cat.key} size="xs" />
                      <Text
                        style={{
                          color: isSelected ? cat.color : colors.text,
                          fontSize: 13,
                          fontWeight: "600",
                          marginLeft: 6,
                        }}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Priority Selector */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                Priority
              </Text>
              <View style={styles.pillsContainer}>
                {PRIORITY_OPTIONS.map((prio) => {
                  const isSelected = priority === prio.key;
                  return (
                    <TouchableOpacity
                      key={prio.key}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: isSelected
                            ? `${prio.color}22`
                            : colors.card,
                          borderColor: isSelected ? prio.color : colors.border,
                        },
                      ]}
                      onPress={() => setPriority(prio.key)}
                    >
                      <Text
                        style={{
                          color: isSelected ? prio.color : colors.text,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
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
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Workspace
                </Text>
                <View style={styles.pillsContainer}>
                  {workspaces.map((ws) => {
                    const isSelected = workspaceId === ws.id;
                    return (
                      <TouchableOpacity
                        key={ws.id}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: isSelected
                              ? `${colors.primary}22`
                              : colors.card,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        onPress={() => setWorkspaceId(ws.id)}
                      >
                        <Text
                          style={{
                            color: isSelected ? colors.primary : colors.text,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {ws.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* === SCHEDULE (canonical) === */}
            {isTask && (
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Schedule
                </Text>
                <View style={styles.pillsContainer}>
                  {[
                    { label: "Today", val: getDateKey() },
                    {
                      label: "Tomorrow",
                      val: getDateKey(new Date(Date.now() + 86400000)),
                    },
                    { label: "Inbox", val: "inbox" },
                  ].map((opt) => {
                    const isSelected = scheduleDate === opt.val;
                    return (
                      <TouchableOpacity
                        key={opt.val}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: isSelected
                              ? `${colors.primary}22`
                              : colors.card,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setScheduleDate(opt.val);
                          setShowDatePicker(false);
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? colors.primary : colors.text,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    style={[
                      styles.pill,
                      {
                        backgroundColor:
                          showDatePicker ||
                          !["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(scheduleDate)
                            ? `${colors.primary}22`
                            : colors.card,
                        borderColor:
                          showDatePicker ||
                          !["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(scheduleDate)
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                    onPress={() => setShowDatePicker(!showDatePicker)}
                  >
                    <Feather name="calendar" size={12} color={colors.primary} />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 13,
                        fontWeight: "600",
                        marginLeft: 4,
                      }}
                    >
                      {!["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(scheduleDate)
                        ? scheduleDate
                        : "Custom..."}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showDatePicker && (
                  <View
                    style={{
                      marginTop: 12,
                      borderRadius: 12,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Calendar
                      current={scheduleDate !== "inbox" ? scheduleDate : undefined}
                      onDayPress={(day: any) => {
                        setScheduleDate(day.dateString);
                        setShowDatePicker(false);
                      }}
                      theme={{
                        backgroundColor: colors.card,
                        calendarBackground: colors.card,
                        textSectionTitleColor: colors.textMuted,
                        selectedDayBackgroundColor: colors.primary,
                        selectedDayTextColor: "#ffffff",
                        todayTextColor: colors.primary,
                        dayTextColor: colors.text,
                        textDisabledColor: colors.textMuted + "50",
                        monthTextColor: colors.text,
                        arrowColor: colors.primary,
                      }}
                      markedDates={
                        scheduleDate && scheduleDate !== "inbox"
                          ? {
                              [scheduleDate]: {
                                selected: true,
                                selectedColor: colors.primary,
                              },
                            }
                          : {}
                      }
                    />
                  </View>
                )}
              </View>
            )}

            {/* === REMINDER (canonical — time only, no weekdays) === */}
            <View
              style={[
                styles.metaCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  padding: 12,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => setTimePickerVisible(!timePickerVisible)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 4,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Feather name="bell" size={16} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "600",
                      marginLeft: 8,
                    }}
                  >
                    Reminder
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                    {reminderTime
                      ? `${String(reminderTime.hour).padStart(2, "0")}:${String(reminderTime.minute).padStart(2, "0")}`
                      : "Off"}
                  </Text>
                  <Feather
                    name={timePickerVisible ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.textMuted}
                    style={{ marginLeft: 6 }}
                  />
                </View>
              </TouchableOpacity>

              {timePickerVisible && (
                <View style={{ marginTop: 12 }}>
                  <TimeSelectorDial
                    colors={colors}
                    initialHour={reminderTime?.hour ?? 9}
                    initialMinute={reminderTime?.minute ?? 0}
                    onSave={(h, m) => {
                      setReminderTime({ hour: h, minute: m });
                      setTimePickerVisible(false);
                    }}
                    saveLabel="Confirm Time"
                  />
                  <TouchableOpacity
                    style={{ alignSelf: "center", marginTop: 8 }}
                    onPress={() => {
                      setReminderTime(undefined);
                      setTimePickerVisible(false);
                    }}
                  >
                    <Text
                      style={{
                        color: colors.error,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      Disable Reminder
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* === REPEAT (canonical RecurrenceRule — weekdays live here only) === */}
            <View
              style={[
                styles.metaCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  padding: 12,
                  gap: 12,
                },
              ]}
            >
              <Text
                style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}
              >
                Repeat
              </Text>

              <View style={styles.recurrencePillsRow}>
                {["none", "daily", "weekly", "monthly", "custom"].map((r) => {
                  const isSelected = recurrenceType === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.recurrencePillBtn,
                        {
                          backgroundColor: isSelected
                            ? `${colors.primary}22`
                            : colors.cardLight,
                          borderColor: isSelected
                            ? colors.primary
                            : "transparent",
                          borderWidth: 1,
                        },
                      ]}
                      onPress={() => setRecurrenceType(r)}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.primary : colors.text,
                          fontSize: 12,
                          fontWeight: "600",
                          textTransform: "capitalize",
                        }}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {recurrenceType === "weekly" && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Repeat on days:
                  </Text>
                  <View style={styles.daysSelectionRow}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => {
                      const isDaySelected = recurrenceDays.includes(idx);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.dayCircleBtn,
                            {
                              backgroundColor: isDaySelected
                                ? colors.primary
                                : colors.cardLight,
                              borderColor: isDaySelected
                                ? colors.primary
                                : colors.border,
                              borderWidth: 1,
                            },
                          ]}
                          onPress={() => toggleDaySelection(idx)}
                        >
                          <Text
                            style={{
                              color: isDaySelected ? "#fff" : colors.text,
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
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
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Day of month:
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                        width: 60,
                        textAlign: "center",
                      },
                    ]}
                    value={String(recurrenceDayOfMonth)}
                    onChangeText={(val) => {
                      const num = Number(val);
                      if (!isNaN(num) && num >= 1 && num <= 31) {
                        setRecurrenceDayOfMonth(num);
                      }
                    }}
                    keyboardType="number-pad"
                  />
                </View>
              )}

              {recurrenceType === "custom" && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Every how many days?
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                        width: 80,
                        textAlign: "center",
                      },
                    ]}
                    value={String(intervalVal)}
                    onChangeText={(val) => {
                      const num = Number(val);
                      if (!isNaN(num) && num >= 1) {
                        setIntervalVal(num);
                      }
                    }}
                    keyboardType="number-pad"
                  />
                </View>
              )}
            </View>

            {/* Cancel / Save buttons */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12, marginBottom: 40 }}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  {
                    flex: 1,
                    backgroundColor: colors.cardLight,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setIsEditing(false);
                  initForm(item);
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  {
                    flex: 1,
                    backgroundColor: hasChanges ? colors.primary : colors.cardLight,
                    opacity: hasChanges ? 1 : 0.6,
                  },
                ]}
                disabled={!hasChanges}
                onPress={handleSave}
              >
                <Text style={{ color: hasChanges ? "#FFFFFF" : colors.textMuted, fontWeight: "700" }}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Edit recurring modal */}
        <Modal visible={showEditRecurringModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                Edit Recurring Task
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>
                Do you want to edit only this occurrence or all occurrences?
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: `${colors.primary}15` }]}
                  onPress={() => saveChanges(true)}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>
                    This occurrence
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]}
                  onPress={() => saveChanges(false)}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    All occurrences
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Delete safety modal */}
        <Modal visible={showDeleteSafetyModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                Delete Recurring Task
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>
                Delete only this occurrence or all occurrences?
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: `${colors.error}15` }]}
                  onPress={() => deleteItem(true)}
                >
                  <Text style={{ color: colors.error, fontWeight: "700" }}>
                    Only this occurrence
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: colors.error }]}
                  onPress={() => deleteItem(false)}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    All occurrences
                  </Text>
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
          {/* Resources sheet content — see truncated section */}
        </Modal>

        {/* Link Resources Picker Modal */}
        <Modal
          visible={linkPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setLinkPickerVisible(false)}
        >
          {/* Link picker content — see truncated section */}
        </Modal>

        {/* Note Reader Modal */}
        {viewingNote && (
          <Modal
            visible={!!viewingNote}
            transparent
            animationType="fade"
            onRequestClose={() => setViewingNote(null)}
          >
            {/* Note reader content — see truncated section */}
          </Modal>
        )}

        {/* Image Lightbox Modal */}
        {viewingImage && (
          <Modal
            visible={!!viewingImage}
            transparent
            animationType="fade"
            onRequestClose={() => setViewingImage(null)}
          >
            {/* Image lightbox content — see truncated section */}
          </Modal>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 40,    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  headerBtnTextRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scrollContent: {
    padding: 16,
  },
  archiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  itemTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  },
  itemDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  metaRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  rowDivider: {
    height: 1,
    marginVertical: 4,
  },
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
    marginLeft: 2,
  },
  textInput: {
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  pillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  recurrencePillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  recurrencePillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  daysSelectionRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCard: {
    width: "85%",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  modalBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
});
