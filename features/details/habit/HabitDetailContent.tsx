import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  HabitRepository,
  WorkspaceRepository,
  ResourceRepository,
} from "@/repositories";
import { generateId } from "@/shared/utils/id";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  type Habit,
  type RecurrenceRule,
  type Reminder,
  type Resource,
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  getDateKey,
  getRecurrenceLabel,
} from "@/services/scheduling/recurrence.service";
import {
  cancelReminderIds,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import { recurrenceRuleToScheduler } from "@/services/scheduling/recurrence-mapper";
import { emitStateChange } from "@/services/events/state-events";
import { CategoryChip } from "@/shared/components/design-system";
import {
  DetailActions,
  DetailHeader,
  DetailRow,
  DetailSection,
  DetailShell,
} from "@/features/details";
import {
  getCategoryMeta,
  getPriorityMeta,
} from "@/features/details/options";
import {
  ResourceAttachmentPicker,
  ConnectedResourcesView,
} from "@/features/details/resources";
import { HabitDetailForm } from "@/features/details/habit/components/HabitDetailForm";
import {
  computeTriggerEpoch,
  useHabitDetailForm,
} from "@/features/details/habit/hooks/useHabitDetailForm";
import { useHabitStats } from "@/features/details/habit/hooks/useHabitStats";
import type { HabitDetailItem } from "@/features/details/habit/types";

export interface HabitDetailContentProps {
  habitId: string;
  /** Optional workspace hint from the route (used to scope the initial lookup). */
  workspaceId?: string;
  /** The occurrence date (YYYY-MM-DD) this habit was opened from. */
  selectedOccurrenceDate: string;
  onBack: () => void;
  /** Called after a successful Habit → Task conversion with the new task id. */
  onConvertedToTask: (taskId: string) => void;
}

/**
 * Habit-specific detail screen. Owns the Habit loading, completion statistics,
 * edit form state, and all Habit mutations (save / duplicate / convert /
 * archive / delete) which are delegated through EntityCommandService. Uses the
 * shared Detail System primitives for presentation and is intentionally
 * unaware of Task.
 */
export function HabitDetailContent({
  habitId,
  workspaceId: workspaceIdHint,
  selectedOccurrenceDate,
  onBack,
  onConvertedToTask,
}: HabitDetailContentProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const { showToast, showUndo } = useUndo();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [item, setItem] = useState<HabitDetailItem | null>(null);

  // Modals
  const [showDeleteSafetyModal, setShowDeleteSafetyModal] = useState(false);
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false);

  // Resources state (card + pre-existing stubbed sheet). linkedCollectionIds
  // lives in the form state so it is seeded from the loaded habit (matching
  // the pre-extraction initForm) and saved back on update.
  const [resourcesSheetVisible, setResourcesSheetVisible] = useState(false);
  const [resourcesList, setResourcesList] = useState<Resource[]>([]);

  const { form, update, reset, toggleDay, toggleResource } = useHabitDetailForm();
  const {
    completionRate,
    timesCompleted,
    calendarMarkedDates,
    loadStats,
  } = useHabitStats();

  const linkedResources = useMemo(
    () =>
      resourcesList.filter((res) => form.linkedCollectionIds.includes(res.id)),
    [resourcesList, form.linkedCollectionIds],
  );

  const resourcePreviewText = useMemo(
    () => linkedResources.map((res) => res.title).join(", "),
    [linkedResources],
  );

  const handleToggleResource = useCallback(
    async (resId: string) => {
      toggleResource(resId);
      if (!isEditing && item) {
        const nextIds = form.linkedCollectionIds.includes(resId)
          ? form.linkedCollectionIds.filter((id) => id !== resId)
          : [...form.linkedCollectionIds, resId];
        try {
          await EntityCommandService.updateHabit(item.id, item.workspaceId, {
            resourceIds: nextIds,
          });
          emitStateChange("habits_changed", "habit_detail");
        } catch (e) {
          console.warn("Failed to persist resource link", e);
        }
      }
    },
    [toggleResource, isEditing, item, form.linkedCollectionIds],
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

  // Load Habit & supporting data
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load workspaces via WorkspaceRepository (used to scope the lookup below)
      const folderList = await WorkspaceRepository.getWorkspaces();
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

      let foundHabit: (Habit & { workspaceId: string }) | null = null;
      for (const fId of folderIds) {
        const habit = await HabitRepository.getHabit(habitId, fId);
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
        reset(foundHabit);

        // Load completion stats from history
        await loadStats(foundHabit.title);
      } else {
        Alert.alert("Error", "Habit not found.");
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
      let savedItemForRefresh: HabitDetailItem | null = null;

      if (thisOccurrenceOnly) {
        // Exception logic:
        // 1. Create a non-recurring copy for selectedOccurrenceDate
        const newId = generateId("habit-");
        const newCopy: HabitDetailItem = {
          ...item,
          id: newId,
          title: form.title.trim(),
          description: form.description.trim(),
          categoryId: form.category,
          category: form.category,
          priority: form.priority,
          workspaceId: form.workspaceId,
          recurrence: undefined, // non-recurring copy
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
        const updatedMaster: HabitDetailItem = {
          ...item,
          recurrenceExceptions: [
            ...(item.recurrenceExceptions || []),
            selectedOccurrenceDate,
          ],
          lastUpdated: getDateKey(),
        };

        savedItemForRefresh = updatedMaster;

        // 3. Persist the master (update) and the new copy via ECS. The copy
        //    carries the widened detail-surface recurrence (undefined here), so
        //    the boundary casts to the strict Habit shape — same payload the
        //    pre-extraction path sent.
        await EntityCommandService.updateHabit(
          updatedMaster.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
          { recurrenceExceptions: updatedMaster.recurrenceExceptions },
          { skipEvents: true, skipAnalytics: true },
        );
        await EntityCommandService.createHabit(
          newCopy as Habit,
          form.workspaceId,
          { skipEvents: true, skipAnalytics: true },
        );
      } else {
        // Master update logic — canonical V3 fields only
        const updatedItem: HabitDetailItem = {
          ...item,
          title: form.title.trim(),
          description: form.description.trim(),
          categoryId: form.category,
          category: form.category,
          priority: form.priority,
          workspaceId: form.workspaceId,
          reminder: updatedReminder,
          recurrence: updatedRecurrence,
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

        // Cancel previous notifications for Habits
        await cancelReminderIds(item.reminder?.notificationIds);

        // Schedule new notifications — from canonical reminder + recurrence
        let notificationIds: string[] = [];

        if (form.reminderTime) {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: item.id,
            title: form.title.trim(),
            category: form.category,
            dailyTime: {
              hour: form.reminderTime.hour,
              minute: form.reminderTime.minute,
            },
            dailyDays:
              form.recurrenceType === "weekly"
                ? form.recurrenceDays
                : undefined,
            recurrence: recurrenceRuleToScheduler(
              updatedRecurrence as RecurrenceRule,
            ),
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
          });
          notificationIds = scheduled.ids;
        }

        if (notificationIds.length > 0) {
          updatedItem.reminder = {
            ...(updatedItem.reminder || { enabled: true, triggerAt: 0 }),
            notificationIds,
          };
        }

        savedItemForRefresh = { ...updatedItem, workspaceId: form.workspaceId };

        const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;
        if (oldFolderId !== form.workspaceId) {
          await EntityCommandService.moveHabit(
            item.id,
            oldFolderId,
            form.workspaceId,
            { skipEvents: true, skipAnalytics: true },
          );
        }
        // The payload intentionally keeps the widened detail-surface recurrence
        // (null when the form type is "none") — cast at the command boundary.
        await EntityCommandService.updateHabit(
          item.id,
          form.workspaceId,
          updatedItem as Partial<Habit>,
          { skipEvents: true, skipAnalytics: true, source: "task-details" },
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("habits_changed");

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
      const newId = generateId("habit-");
      const duplicate: HabitDetailItem = {
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

      const targetWsId = item.workspaceId || INBOX_WORKSPACE_ID;
      await EntityCommandService.createHabit(
        {
          ...duplicate,
          workspaceId: targetWsId,
        } as Habit,
        targetWsId,
        { skipEvents: true, skipAnalytics: true },
      );

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      emitStateChange("habits_changed");
      Alert.alert("Success", "Item duplicated successfully!");
      onBack();
    } catch (e) {
      console.warn("Failed to duplicate item", e);
    }
  };

  const handleConvert = async () => {
    if (!item) return;
    try {
      // Convert Habit -> Task
      const newTask = await EntityCommandService.convertHabitToTask(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        { source: "ui_convert" },
      );

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      onConvertedToTask(newTask.id);
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

        await EntityCommandService.updateHabit(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
          { recurrenceExceptions: updatedItem.recurrenceExceptions },
          { skipEvents: true, skipAnalytics: true },
        );
      } else {
        await EntityCommandService.recycleHabit(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
          { source: "task-details" },
        );

        showUndo({
          message: `Deleted "${item.title}"`,
          onUndo: async () => {
            await EntityCommandService.restoreHabit(`rb-${item.id}`, {
              source: "task-details",
            });
          },
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
      emitStateChange("habits_changed");
      onBack();
    } catch (e) {
      console.warn("Failed to delete item", e);
    }
  };

  const handleToggleArchive = async () => {
    if (!item) return;
    try {
      const nextArchived = !(item.archived || item.archivedAt);

      await EntityCommandService.updateHabit(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        { archivedAt: nextArchived ? Date.now() : undefined },
        { skipEvents: true, skipAnalytics: true },
      );

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      emitStateChange("habits_changed");
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

  // Pre-existing display logic: the combined completedToday/history check only
  // tints the badge background, while the icon/color/label follow the legacy
  // completedToday flag exactly as before.
  const isDoneToday = !!(
    item.completedToday ||
    item.completionHistory?.some?.((c: { date: string }) =>
      c.date === getDateKey(),
    )
  );
  const isArchived = !!(item.archived || item.archivedAt);

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <DetailHeader
        style={styles.headerFlex}
        title={isEditing ? "Edit Habit" : "Habit Details"}
        onBack={onBack}
        icon={<Feather name="activity" size={18} color="#F59E0B" />}
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
            accessibilityLabel={isEditing ? "Save habit" : "Edit habit"}
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
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    borderColor: "#F59E0B",
                  },
                ]}
              >
                <Feather name="activity" size={12} color="#F59E0B" />
                <Text
                  style={[
                    styles.badgeText,
                    { color: "#F59E0B", fontWeight: "700" },
                  ]}
                >
                  Habit
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

              {/* Status */}
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isDoneToday
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
            </View>

            {/* Schedule */}
            <DetailSection>
              <DetailRow
                label="Repeat"
                value={getRecurrenceLabel(item.recurrence) || "None"}
                icon={<Feather name="repeat" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Reminder"
                value={formatReminderDisplay()}
                icon={<Feather name="bell" size={16} color={colors.textMuted} />}
              />
            </DetailSection>

            {/* Progress */}
            <DetailSection title="Progress">
              <DetailRow
                label="Current Streak"
                icon={<Feather name="zap" size={16} color={colors.warning} />}
                accessory={
                  <Text style={[styles.streakValue, { color: colors.warning }]}>
                    🔥 {item.streak || 0} days
                  </Text>
                }
              />
              <DetailRow
                label="Best Streak"
                icon={<Feather name="award" size={16} color={colors.warning} />}
                accessory={
                  <Text style={[styles.streakValue, { color: colors.warning }]}>
                    🏆 {item.bestStreak || 0} days
                  </Text>
                }
              />
              <DetailRow
                label="Total Completions"
                icon={
                  <Feather
                    name="check-circle"
                    size={16}
                    color={colors.textMuted}
                  />
                }
                value={`${timesCompleted ?? 0} completions${
                  completionRate !== null ? ` (${completionRate}% rate)` : ""
                }`}
              />
            </DetailSection>

            {/* Details */}
            <DetailSection>
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

            {/* Attached Resources Preview (Interactive Carousel) */}
            <ConnectedResourcesView
              resources={linkedResources}
              onAttachPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setResourcesSheetVisible(true);
              }}
              onUnlink={handleToggleResource}
              workspaceId={item?.workspaceId || workspaceIdHint}
            />

            {/* Completion History Calendar (Habits Only) */}
            <DetailSection title="Completion Calendar">
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
            </DetailSection>

            {/* Quick action buttons row */}
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <DetailActions
                actions={[
                  {
                    key: "convert",
                    label: "Convert to Task",
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
          <HabitDetailForm
            form={form}
            update={update}
            toggleDay={toggleDay}
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

      {/* Resources Attachment Picker */}
      <ResourceAttachmentPicker
        visible={resourcesSheetVisible}
        resources={resourcesList}
        selectedResourceIds={form.linkedCollectionIds}
        onToggle={handleToggleResource}
        onClose={() => setResourcesSheetVisible(false)}
      />
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
  streakValue: {
    fontSize: 14,
    fontWeight: "700",
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
