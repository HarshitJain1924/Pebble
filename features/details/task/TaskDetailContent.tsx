import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { generateId } from "@/shared/utils/id";

import {
  TaskRepository,
  WorkspaceRepository,
  ResourceRepository,
} from "@/repositories";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  type Resource,
  type RecurrenceRule,
  type Reminder,
  type Task,
  type Workspace,
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  getDateKey,
  getRecurrenceLabel,
} from "@/services/scheduling/recurrence.service";
import { emitStateChange } from "@/services/events/state-events";
import { CategoryChip } from "@/shared/components/design-system";
import {
  DetailActions,
  DetailHeader,
  DetailRow,
  DetailSection,
  DetailShell,
} from "@/features/details";
import { TaskDetailForm } from "@/features/details/task/components/TaskDetailForm";
import {
  computeTriggerEpoch,
  useTaskDetailForm,
} from "@/features/details/task/hooks/useTaskDetailForm";
import {
  getCategoryMeta,
  getPriorityMeta,
} from "@/features/details/options";
import type { TaskDetailItem } from "@/features/details/task/types";

export interface TaskDetailContentProps {
  taskId: string;
  /** Optional workspace hint from the route (used to scope the initial lookup). */
  workspaceId?: string;
  /** The occurrence date (YYYY-MM-DD) this task was opened from. */
  selectedOccurrenceDate: string;
  onBack: () => void;
  /** Called after a successful Task → Habit conversion with the new habit id. */
  onConvertedToHabit: (habitId: string) => void;
}

/**
 * Task-specific detail screen. Owns the Task loading, edit form state, and all
 * Task mutations (save / duplicate / convert / archive / delete) which are
 * delegated through EntityCommandService. Uses the shared Detail System
 * primitives for presentation and is intentionally unaware of Habit.
 */
export function TaskDetailContent({
  taskId,
  workspaceId: workspaceIdHint,
  selectedOccurrenceDate,
  onBack,
  onConvertedToHabit,
}: TaskDetailContentProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const { showToast, showUndo } = useUndo();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [item, setItem] = useState<TaskDetailItem | null>(null);

  // Modals
  const [showDeleteSafetyModal, setShowDeleteSafetyModal] = useState(false);
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false);

  // Resources state (card + pre-existing stubbed sheet). linkedCollectionIds
  // lives in the form state so it is seeded from the loaded task (matching the
  // pre-extraction initForm) and saved back on update.
  const [resourcesSheetVisible, setResourcesSheetVisible] = useState(false);
  const [resourcesList, setResourcesList] = useState<Resource[]>([]);

  const { form, update, reset, toggleDay } = useTaskDetailForm();

  const linkedResources = useMemo(
    () =>
      resourcesList.filter((res) => form.linkedCollectionIds.includes(res.id)),
    [resourcesList, form.linkedCollectionIds],
  );

  const resourcePreviewText = useMemo(
    () => linkedResources.map((res) => res.title).join(", "),
    [linkedResources],
  );

  const hasChanges = useMemo(() => {
    if (!item) return false;

    // Compare basic fields
    if (form.title.trim() !== (item.title || "").trim()) return true;
    if (form.description.trim() !== (item.description || "").trim())
      return true;
    const itemCategory = item.categoryId || item.category || "work";
    if (form.category !== itemCategory) return true;
    if (form.priority !== (item.priority || "medium")) return true;
    if (form.workspaceId !== (item.workspaceId || INBOX_WORKSPACE_ID))
      return true;

    // Compare schedule — canonical only
    const itemScheduleDate = item.schedule?.date || "inbox";
    if (form.scheduleDate !== itemScheduleDate) return true;

    // Compare reminder — canonical only (compare triggerAt epoch)
    const itemReminderTriggerAt = item.reminder?.triggerAt;
    const formReminderTriggerAt = form.reminderTime
      ? computeTriggerEpoch(
          form.reminderTime.hour,
          form.reminderTime.minute,
          form.scheduleDate,
        )
      : undefined;
    if (formReminderTriggerAt !== itemReminderTriggerAt) return true;

    // Compare linked collections
    const sortedLinkedCurrent = [...form.linkedCollectionIds].sort();
    const sortedLinkedItem = [
      ...(item.resourceIds || item.linkedCollectionIds || []),
    ].sort();
    if (
      JSON.stringify(sortedLinkedCurrent) !==
      JSON.stringify(sortedLinkedItem)
    )
      return true;

    // Compare recurrence — canonical only
    const itemRecType = item.recurrence?.frequency || "none";
    if (form.recurrenceType !== itemRecType) return true;

    if (form.recurrenceType !== "none") {
      const rec = item.recurrence || ({} as Partial<RecurrenceRule>);
      if (form.recurrenceType === "custom") {
        if (form.intervalVal !== (rec.interval || 1)) return true;
      }
      if (form.recurrenceType === "weekly") {
        const sortedRecDaysCurrent = [...form.recurrenceDays].sort();
        const sortedRecDaysItem = [...(rec.daysOfWeek || [])].sort();
        if (
          JSON.stringify(sortedRecDaysCurrent) !==
          JSON.stringify(sortedRecDaysItem)
        )
          return true;
      }
      if (form.recurrenceType === "monthly") {
        if (form.recurrenceDayOfMonth !== (rec.dayOfMonth || 1)) return true;
      }
    }

    return false;
  }, [item, form]);

  // Load Task & supporting data
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

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
        new Set(
          [
            workspaceIdHint,
            INBOX_WORKSPACE_ID,
            MY_PEBBLES_WORKSPACE_ID,
            ...folderList.map((f) => f.id),
          ].filter(Boolean) as string[],
        ),
      );

      // Load resources directly from ResourceRepository for all workspace folders
      const allLoadedResources: Resource[] = [];
      for (const fId of folderIds) {
        const resMap = await ResourceRepository.getResources(fId);
        Object.values(resMap).forEach((r) => {
          allLoadedResources.push(r);
        });
      }
      setResourcesList(allLoadedResources);

      let foundTask: (Task & { workspaceId: string }) | null = null;
      for (const fId of folderIds) {
        const task = await TaskRepository.getTask(taskId, fId);
        if (task) {
          foundTask = { ...task, workspaceId: fId };
          break;
        }
      }
      if (foundTask) {
        setItem(foundTask);
        reset(foundTask);
      } else {
        Alert.alert("Error", "Task not found.");
        onBack();
      }
    } catch (e) {
      console.warn("Failed to load details", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }

    if (item?.recurrence && isEditing) {
      setShowEditRecurringModal(true);
    } else {
      saveChanges(false);
    }
  };

  const saveChanges = async (thisOccurrenceOnly: boolean) => {
    if (!item) return;
    setShowEditRecurringModal(false);
    try {
      // Build canonical RecurrenceRule
      let updatedRecurrence: RecurrenceRule | null = null;
      if (form.recurrenceType !== "none") {
        updatedRecurrence = {
          frequency: form.recurrenceType as RecurrenceRule["frequency"],
          interval: form.intervalVal,
          ...(form.recurrenceType === "weekly"
            ? { daysOfWeek: form.recurrenceDays }
            : {}),
          ...(form.recurrenceType === "monthly"
            ? { dayOfMonth: form.recurrenceDayOfMonth }
            : {}),
        };
      }

      // Compute canonical Reminder
      let updatedReminder: Reminder | undefined;
      if (form.reminderTime) {
        updatedReminder = {
          enabled: true,
          triggerAt: computeTriggerEpoch(
            form.reminderTime.hour,
            form.reminderTime.minute,
            form.scheduleDate,
          ),
        };
      } else {
        updatedReminder = { enabled: false, triggerAt: 0 };
      }

      // Capture saved object for immediate UI refresh
      let savedItemForRefresh: TaskDetailItem | null = null;

      if (thisOccurrenceOnly) {
        // Exception logic:
        // 1. Create a non-recurring copy for selectedOccurrenceDate
        const newId = generateId("task-");
        const newCopy: TaskDetailItem = {
          ...item,
          id: newId,
          title: form.title.trim(),
          description: form.description.trim(),
          categoryId: form.category,
          category: form.category,
          priority: form.priority,
          workspaceId: form.workspaceId,
          recurrence: undefined, // non-recurring copy
          schedule: { date: selectedOccurrenceDate },
          reminder: form.reminderTime
            ? {
                enabled: true,
                triggerAt: computeTriggerEpoch(
                  form.reminderTime.hour,
                  form.reminderTime.minute,
                  selectedOccurrenceDate,
                ),
              }
            : undefined,
          lastUpdated: getDateKey(),
          completed: false,
          completedToday: false,
          streak: 0,
          resourceIds: form.linkedCollectionIds,
        };

        // 2. Add current date to exceptions of the master
        const updatedMaster: TaskDetailItem = {
          ...item,
          recurrenceExceptions: [
            ...(item.recurrenceExceptions || []),
            selectedOccurrenceDate,
          ],
          lastUpdated: getDateKey(),
        };

        savedItemForRefresh = updatedMaster;

        // 3. Persist the master (update) via Repository and the new copy via
        //    ECS (creation). ECS re-schedules notifications from the copy's
        //    canonical reminder, so no manual scheduleReminderBatch is needed.
        await EntityCommandService.updateTask(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
          { recurrenceExceptions: updatedMaster.recurrenceExceptions },
          { skipEvents: true, skipAnalytics: true },
        );
        const createInput: TaskDetailItem & { completed?: boolean } = {
          ...newCopy,
          workspaceId: form.workspaceId,
          status: "todo",
          completed: false,
        };
        await EntityCommandService.createTask(
          createInput,
          form.workspaceId,
          { skipEvents: true, skipAnalytics: true },
        );
      } else {
        // Master update logic — canonical V3 fields only
        const updatedItem: TaskDetailItem = {
          ...item,
          title: form.title.trim(),
          description: form.description.trim(),
          categoryId: form.category,
          category: form.category,
          priority: form.priority,
          workspaceId: form.workspaceId,
          schedule: { date: form.scheduleDate },
          reminder: updatedReminder,
          recurrence: updatedRecurrence ?? undefined,
          lastUpdated: getDateKey(),
          resourceIds: form.linkedCollectionIds,
          completed: item.completed ?? item.status === "completed",
          status: item.status || (item.completed ? "completed" : "todo"),
          archived: item.archived ?? !!item.archivedAt,
          archivedAt: item.archivedAt,
        };

        // Strip legacy scheduling fields — V3 canonical fields only
        delete updatedItem.reminderHour;
        delete updatedItem.reminderMinute;
        delete updatedItem.reminderDays;
        delete updatedItem.scheduledDate;

        // Handle Task via EntityCommandService (owns reminder lifecycle)
        const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;
        if (oldFolderId !== form.workspaceId) {
          await EntityCommandService.moveTask(
            item.id,
            oldFolderId,
            form.workspaceId,
            { skipEvents: true, skipAnalytics: true },
          );
        }
        await EntityCommandService.updateTask(
          item.id,
          form.workspaceId,
          updatedItem,
          { skipEvents: true, skipAnalytics: true, source: "task-details" },
        );
        savedItemForRefresh = { ...updatedItem, workspaceId: form.workspaceId };
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("tasks_changed");

      // Immediate local state update
      setItem(savedItemForRefresh);
      setIsEditing(false);
      showToast("Changes saved");
      reset(savedItemForRefresh);
    } catch (e) {
      console.warn("Failed to save changes", e);
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    try {
      const newId = generateId("task-");
      const duplicate: TaskDetailItem = {
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

      // ECS re-schedules notifications from the duplicate's reminder and
      // attaches the fresh IDs.
      const targetWsId = item.workspaceId || INBOX_WORKSPACE_ID;
      const duplicateInput: TaskDetailItem & { completed?: boolean } = {
        ...duplicate,
        workspaceId: targetWsId,
        status: "todo",
        completed: false,
      };
      await EntityCommandService.createTask(
        duplicateInput,
        targetWsId,
        { skipEvents: true, skipAnalytics: true },
      );

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      emitStateChange("tasks_changed");
      Alert.alert("Success", "Item duplicated successfully!");
      onBack();
    } catch (e) {
      console.warn("Failed to duplicate item", e);
    }
  };

  const handleConvert = async () => {
    if (!item) return;
    try {
      // Convert Task -> Habit
      const newHabit = await EntityCommandService.convertTaskToHabit(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        { source: "ui_convert" },
      );

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      onConvertedToHabit(newHabit.id);
    } catch (e) {
      console.warn("Failed to convert item", e);
    }
  };

  const handleDeletePress = () => {
    if (!item) return;
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
    if (!item) return;
    setShowDeleteSafetyModal(false);
    try {
      if (thisOccurrenceOnly) {
        const updatedItem = {
          ...item,
          recurrenceExceptions: [
            ...(item.recurrenceExceptions || []),
            selectedOccurrenceDate,
          ],
          lastUpdated: getDateKey(),
        };

        await EntityCommandService.updateTask(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
          { recurrenceExceptions: updatedItem.recurrenceExceptions },
          { skipEvents: true, skipAnalytics: true },
        );
      } else {
        const originalWorkspace =
          workspaces.find(
            (w) => w.id === (item.workspaceId || INBOX_WORKSPACE_ID),
          )?.name || "Inbox";

        await EntityCommandService.recycleTask(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
          originalWorkspace,
          { source: "task-details" },
        );

        showUndo({
          message: `Deleted "${item.title}"`,
          onUndo: async () => {
            await EntityCommandService.restoreTask(`rb-${item.id}`, {
              source: "task-details",
            });
          },
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
      emitStateChange("tasks_changed");
      onBack();
    } catch (e) {
      console.warn("Failed to delete item", e);
    }
  };

  const handleToggleArchive = async () => {
    if (!item) return;
    try {
      const nextArchived = !(item.archived || item.archivedAt);
      await EntityCommandService.updateTask(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        { archivedAt: nextArchived ? Date.now() : undefined },
        { skipEvents: true, skipAnalytics: true },
      );

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      emitStateChange("tasks_changed");
      onBack();
    } catch (e) {
      console.warn("Failed to archive/restore", e);
    }
  };

  if (loading || !item) {
    return (
      <SafeAreaView
        style={[
          styles.loading,
          {
            backgroundColor: colors.background,
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
      } catch {
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
      } catch {
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

  const itemCategoryMeta = getCategoryMeta(form.category);
  const itemPriorityMeta = getPriorityMeta(form.priority);

  // Helper to format reminder time for display
  const formatReminderDisplay = () => {
    if (item.reminder?.triggerAt) {
      const d = new Date(item.reminder.triggerAt);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return "No reminder scheduled";
  };

  const scheduleDisplay =
    form.scheduleDate === "inbox" ? "Inbox" : form.scheduleDate || "None";

  const isCompleted = !!(item.completed || item.status === "completed");
  const isArchived = !!(item.archived || item.archivedAt);

  const header = (
    <View
      style={[styles.header, { borderBottomColor: colors.border }]}
    >
      <DetailHeader
        style={styles.headerFlex}
        title={isEditing ? "Edit Task" : "Task Details"}
        onBack={onBack}
        icon={<Feather name="check-square" size={18} color="#3B82F6" />}
        action={
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
              styles.editSaveBtn,
              {
                backgroundColor: isEditing
                  ? `${colors.primary}22`
                  : "transparent",
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? "Save task" : "Edit task"}
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
        }
      />
    </View>
  );

  return (
    <>
      <DetailShell
        header={header}
        contentContainerStyle={{ paddingBottom: isEditing ? 120 : 40 }}
      >
        {isArchived && (
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
          <View style={{ gap: Spacing.xl }}>
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
                    backgroundColor: "rgba(59, 130, 246, 0.12)",
                    borderColor: "#3B82F6",
                  },
                ]}
              >
                <Feather name="check-square" size={12} color="#3B82F6" />
                <Text
                  style={[
                    styles.badgeText,
                    { color: "#3B82F6", fontWeight: "700" },
                  ]}
                >
                  Task
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
                <Feather
                  name="flag"
                  size={12}
                  color={itemPriorityMeta.color}
                />
                <Text
                  style={[
                    styles.badgeText,
                    { color: itemPriorityMeta.color },
                  ]}
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
                <CategoryChip category={form.category} size="xs" />
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
                  {workspaces.find(
                    (w) => w.id === (item.workspaceId || item.folderId),
                  )?.name || "Inbox"}
                </Text>
              </View>

              {/* Status */}
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isCompleted
                      ? `${colors.success}15`
                      : `${colors.error}15`,
                    borderColor: isCompleted
                      ? colors.success
                      : colors.error,
                  },
                ]}
              >
                <Feather
                  name={isCompleted ? "check-circle" : "circle"}
                  size={12}
                  color={isCompleted ? colors.success : colors.error}
                />
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: isCompleted ? colors.success : colors.error,
                    },
                  ]}
                >
                  {isCompleted ? "Completed" : "Pending"}
                </Text>
              </View>
            </View>

            {/* Metadata Fields Section */}
            <DetailSection>
              <DetailRow
                label="Schedule"
                value={scheduleDisplay}
                icon={<Feather name="calendar" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Reminder"
                value={formatReminderDisplay()}
                icon={<Feather name="bell" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Repeat"
                value={getRecurrenceLabel(item.recurrence) || "None"}
                icon={<Feather name="repeat" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Created"
                value={formatCreatedDate()}
                icon={<Feather name="calendar" size={16} color={colors.textMuted} />}
              />
              {item.lastUpdated && (
                <DetailRow
                  label="Updated"
                  value={item.lastUpdated}
                  icon={<Feather name="edit" size={16} color={colors.textMuted} />}
                />
              )}
            </DetailSection>

            {/* Resources Card (Tappable) */}
            <TouchableOpacity
              style={[
                styles.resourcesCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                setResourcesSheetVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Resources"
            >
              <View style={styles.resourcesLeft}>
                <View
                  style={[
                    styles.resourcesIcon,
                    { backgroundColor: `${colors.primary}15` },
                  ]}
                >
                  <Feather name="folder" size={20} color={colors.primary} />
                </View>
                <View style={styles.resourcesText}>
                  <Text style={[styles.resourcesCount, { color: colors.text }]}>
                    {form.linkedCollectionIds.length}{" "}
                    {form.linkedCollectionIds.length === 1
                      ? "Resource"
                      : "Resources"}
                  </Text>
                  <Text
                    style={[styles.resourcesPreview, { color: colors.textMuted }]}
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

            {/* Quick action buttons row */}
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <DetailActions
                actions={[
                  {
                    key: "convert",
                    label: "Convert to Habit",
                    icon: (
                      <Feather name="refresh-cw" size={16} color={colors.primary} />
                    ),
                    onPress: handleConvert,
                  },
                  {
                    key: "duplicate",
                    label: "Duplicate Item",
                    icon: <Feather name="copy" size={16} color={colors.primary} />,
                    onPress: handleDuplicate,
                  },
                ]}
              />
              <DetailActions
                actions={[
                  {
                    key: "archive",
                    label: isArchived ? "Restore from Archive" : "Archive Item",
                    icon: (
                      <Feather
                        name={isArchived ? "unlock" : "archive"}
                        size={16}
                        color={colors.primary}
                      />
                    ),
                    onPress: handleToggleArchive,
                  },
                  {
                    key: "delete",
                    label: "Delete Item",
                    tone: "danger",
                    icon: <Feather name="trash-2" size={16} color="#FFFFFF" />,
                    onPress: handleDeletePress,
                  },
                ]}
              />
            </View>
          </View>
        ) : (
          /* ===== EDIT MODE ===== */
          <TaskDetailForm
            form={form}
            update={update}
            toggleDay={toggleDay}
            workspaces={workspaces}
            hasChanges={hasChanges}
            onSave={handleSave}
            onCancel={() => {
              setIsEditing(false);
              reset(item);
            }}
          />
        )}
      </DetailShell>

      {/* Edit recurring modal */}
      <Modal visible={showEditRecurringModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Edit Recurring Task
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              Do you want to edit only this occurrence or all occurrences?
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { flex: 1, backgroundColor: `${colors.primary}15` },
                ]}
                onPress={() => saveChanges(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  This occurrence
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { flex: 1, backgroundColor: colors.primary },
                ]}
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
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Delete Recurring Task
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              Delete only this occurrence or all occurrences?
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { flex: 1, backgroundColor: `${colors.error}15` },
                ]}
                onPress={() => deleteItem(true)}
              >
                <Text style={{ color: colors.error, fontWeight: "700" }}>
                  Only this occurrence
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { flex: 1, backgroundColor: colors.error },
                ]}
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

      {/* Resources Bottom Sheet — pre-existing stub (see Known Issues) */}
      <Modal
        visible={resourcesSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setResourcesSheetVisible(false)}
      >
        {/* Intentionally empty: pre-existing stub from app/task-details.tsx */}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  headerFlex: {
    flex: 1,
  },
  editSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  archiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
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
  resourcesCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resourcesLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  resourcesIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resourcesText: {
    flex: 1,
  },
  resourcesCount: {
    fontSize: 15,
    fontWeight: "700",
  },
  resourcesPreview: {
    fontSize: 13,
    marginTop: 2,
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
