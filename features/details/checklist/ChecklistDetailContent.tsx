import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type {
  Checklist,
  Reminder,
  RecurrenceRule,
  Resource,
  Workspace,
} from "@/shared/types/domain.types";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { emitStateChange } from "@/services/events/state-events";
import {
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { dateKeyFromDate, getTodayDateKey } from "@/shared/utils/date-key";
import { generateId } from "@/shared/utils/id";
import { getChecklistCompletedItemsCountForDate } from "@/shared/utils/domain-selectors";
import { getActiveOccurrenceDateKey } from "@/services/scheduling/recurrence.service";
import { formatReminderDisplay } from "@/services/scheduling/schedule-formatter";
import { DetailShell } from "@/features/details";
import { ResourceAttachmentPicker } from "@/features/details/resources";
import {
  useChecklistDetailForm,
  computeTriggerEpoch,
  effectiveWeeklyDays,
} from "@/features/details/checklist/hooks/useChecklistDetailForm";
import { ChecklistDetailForm } from "@/features/details/checklist/components/ChecklistDetailForm";
import { ChecklistDetailHeader } from "@/features/details/checklist/components/ChecklistDetailHeader";
import { ChecklistDetailView } from "@/features/details/checklist/components/ChecklistDetailView";
import { ChecklistWorkspaceModal } from "@/features/details/checklist/components/ChecklistWorkspaceModal";
import { ChecklistRecurringModal } from "@/features/details/checklist/components/ChecklistRecurringModal";
import { ChecklistAmbientBackground } from "@/features/details/checklist/components/ChecklistAmbientBackground";
import { getChecklistColor } from "@/features/checklists/utils/checklist-colors";

export interface ChecklistDetailContentProps {
  checklistId: string;
  workspaceId?: string;
  /** Whether the screen should open directly in edit mode (route `edit=true`). */
  initialEdit?: boolean;
  /** Occurrence date if opened from an occurrence (e.g. from Calendar). */
  occurrenceDate?: string;
  onBack: () => void;
}

/**
 * Checklist Detail screen orchestrator.
 * Coordinates loading, form state, view/edit mode dispatch, and entity mutations.
 */
export const ChecklistDetailContent: React.FC<ChecklistDetailContentProps> = ({
  checklistId,
  workspaceId,
  initialEdit,
  occurrenceDate,
  onBack,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const { showToast } = useUndo();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(initialEdit === true);
  const [item, setItem] = useState<Checklist | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [resourcesList, setResourcesList] = useState<Resource[]>([]);
  const [isTransitionReady, setIsTransitionReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTransitionReady(true);
    }, 280);
    return () => clearTimeout(timer);
  }, []);

  // Editor modal sub-states
  const [workspacePickerVisible, setWorkspacePickerVisible] = useState(false);
  const [linkPickerVisible, setLinkPickerVisible] = useState(false);
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false);
  const [quickItemText, setQuickItemText] = useState("");

  const {
    form,
    update,
    reset,
    addItem,
    setNewItemText,
    deleteItem,
    renameItem,
    moveItemUp,
    moveItemDown,
    toggleResource,
    toggleDay,
    selectRecurrenceType,
  } = useChecklistDetailForm();

  const linkedResources = useMemo(() => {
    return resourcesList.filter((res) =>
      form.linkedCollectionIds.includes(res.id),
    );
  }, [resourcesList, form.linkedCollectionIds]);

  const handleToggleResource = useCallback(
    async (resId: string) => {
      toggleResource(resId);
      if (!isEditing && item) {
        const nextIds = form.linkedCollectionIds.includes(resId)
          ? form.linkedCollectionIds.filter((id) => id !== resId)
          : [...form.linkedCollectionIds, resId];
        try {
          await EntityCommandService.updateChecklist(item.id, item.workspaceId, {
            resourceIds: nextIds,
          });
          emitStateChange("checklists_changed", "checklist_detail");
        } catch (e) {
          console.warn("Failed to persist resource link", e);
        }
      }
    },
    [toggleResource, isEditing, item, form.linkedCollectionIds],
  );

  // Occurrence resolution for recurring checklists
  const effectiveOccurrenceDate = useMemo(() => {
    if (!item?.recurrence) return undefined;
    if (occurrenceDate) return occurrenceDate;
    return getActiveOccurrenceDateKey(item, getTodayDateKey());
  }, [item?.recurrence, occurrenceDate]);

  const completedCount = useMemo(() => {
    if (item?.recurrence && effectiveOccurrenceDate) {
      return getChecklistCompletedItemsCountForDate(
        item,
        effectiveOccurrenceDate,
      );
    }
    return (item?.items || form.items).filter((it) => it.completed).length;
  }, [item, form.items, effectiveOccurrenceDate]);

  const totalCount = form.items.length;

  const handleToggleItem = useCallback(
    async (itemId: string) => {
      if (!item) return;
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        const targetDate =
          item.recurrence && effectiveOccurrenceDate
            ? effectiveOccurrenceDate
            : undefined;
        await EntityCommandService.toggleChecklistItem(
          item.id,
          itemId,
          item.workspaceId || INBOX_WORKSPACE_ID,
          targetDate,
        );
        emitStateChange("checklists_changed", "checklist_detail");

        const refreshed = await ChecklistRepository.getChecklist(
          item.id,
          item.workspaceId || INBOX_WORKSPACE_ID,
        );
        if (refreshed) {
          setItem(refreshed);
          reset(refreshed);
        }
      } catch (e) {
        console.warn("Failed to toggle checklist item", e);
      }
    },
    [item, effectiveOccurrenceDate, reset],
  );

  const handleQuickAddItem = useCallback(async () => {
    const trimmed = quickItemText.trim();
    if (!trimmed || !item) return;
    const newItem = {
      id: generateId("item-"),
      title: trimmed,
      completed: false,
    };
    const updatedItems = [...(item.items || []), newItem];
    setQuickItemText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await EntityCommandService.updateChecklist(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        { items: updatedItems },
      );
      emitStateChange("checklists_changed", "checklist_detail");
      const refreshed = await ChecklistRepository.getChecklist(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
      );
      if (refreshed) {
        setItem(refreshed);
        reset(refreshed);
      }
    } catch (e) {
      console.warn("Failed to add checklist item", e);
    }
  }, [quickItemText, item, reset]);

  const currentWorkspace = useMemo(() => {
    return (
      workspaces.find((ws) => ws.id === form.workspaceId) || {
        name: "Inbox",
        icon: "inbox",
      }
    );
  }, [workspaces, form.workspaceId]);

  const hasChanges = useMemo(() => {
    if (!item) return false;
    if (form.title.trim() !== (item.title || "").trim()) return true;
    if (form.description.trim() !== (item.description || "").trim()) return true;
    if (form.workspaceId !== (item.workspaceId || INBOX_WORKSPACE_ID))
      return true;
    if ((form.priority || "none") !== (item.priority || "none")) return true;
    if ((form.categoryId || undefined) !== (item.categoryId || undefined))
      return true;

    // Compare items
    if (form.items.length !== item.items.length) return true;
    for (let i = 0; i < form.items.length; i++) {
      if (form.items[i].id !== item.items[i].id) return true;
      if (form.items[i].title.trim() !== item.items[i].title.trim()) return true;
      if (form.items[i].completed !== item.items[i].completed) return true;
    }

    // Compare resourceIds
    const sortedLinkedCurrent = [...form.linkedCollectionIds].sort();
    const sortedLinkedItem = [...(item.resourceIds || [])].sort();
    if (
      JSON.stringify(sortedLinkedCurrent) !== JSON.stringify(sortedLinkedItem)
    )
      return true;

    // Compare schedule
    const itemSchedDate = item.schedule?.date || "inbox";
    if (form.scheduleDate !== itemSchedDate) return true;
    if (
      (form.startTime || undefined) !== (item.schedule?.startTime || undefined)
    )
      return true;
    if (
      (form.durationMinutes || undefined) !==
      (item.schedule?.durationMinutes || undefined)
    )
      return true;

    // Compare reminder
    const itemReminderTriggerAt = item.reminder?.triggerAt;
    const itemReminderDate = itemReminderTriggerAt
      ? dateKeyFromDate(new Date(itemReminderTriggerAt))
      : undefined;
    const itemReminderHour = itemReminderTriggerAt
      ? new Date(itemReminderTriggerAt).getHours()
      : undefined;
    const itemReminderMinute = itemReminderTriggerAt
      ? new Date(itemReminderTriggerAt).getMinutes()
      : undefined;

    const isReminderUnchanged =
      itemReminderTriggerAt !== undefined &&
      form.reminderDate === itemReminderDate &&
      form.reminderTime?.hour === itemReminderHour &&
      form.reminderTime?.minute === itemReminderMinute;

    const formReminderTriggerAt = form.reminderTime
      ? isReminderUnchanged
        ? itemReminderTriggerAt
        : computeTriggerEpoch(
            form.reminderTime.hour,
            form.reminderTime.minute,
            form.reminderDate ||
              (form.scheduleDate !== "inbox" ? form.scheduleDate : undefined),
          )
      : undefined;
    if (formReminderTriggerAt !== itemReminderTriggerAt) return true;

    // Compare recurrence
    const itemRecType = item.recurrence?.frequency || "none";
    if (form.recurrenceType !== itemRecType) return true;

    if (form.recurrenceType !== "none") {
      const rec = item.recurrence || ({} as Partial<RecurrenceRule>);
      if (form.recurrenceType === "custom") {
        if (form.intervalVal !== (rec.interval || 1)) return true;
      }
      if (form.recurrenceType === "weekly") {
        const currentDays = effectiveWeeklyDays(
          form.recurrenceDays,
          form.scheduleDate,
        );
        const itemDays = effectiveWeeklyDays(
          rec.daysOfWeek,
          item.schedule?.date,
        );
        if (JSON.stringify(currentDays) !== JSON.stringify(itemDays))
          return true;
      }
      if (form.recurrenceType === "monthly") {
        if (form.recurrenceDayOfMonth !== (rec.dayOfMonth || 1)) return true;
      }
    }

    return false;
  }, [item, form]);

  const loadData = useCallback(async () => {
    if (!checklistId) return;
    setLoading(true);
    try {
      // 1. FAST PATH: If workspaceId is provided, query target workspace immediately
      let foundChecklist: Checklist | null = null;
      if (workspaceId) {
        foundChecklist = await ChecklistRepository.getChecklist(
          checklistId,
          workspaceId,
        );
      }

      // Fetch workspaces concurrently
      const foldersPromise = WorkspaceRepository.getWorkspaces();

      // If not resolved via direct workspaceId, search candidate workspaces in parallel
      if (!foundChecklist) {
        const loadedFolders = await foldersPromise;
        const candidateIds = Array.from(
          new Set([
            workspaceId || INBOX_WORKSPACE_ID,
            INBOX_WORKSPACE_ID,
            MY_PEBBLES_WORKSPACE_ID,
            ...loadedFolders.map((f) => f.id),
          ]),
        );
        const checklistResults = await Promise.all(
          candidateIds.map((fId) =>
            ChecklistRepository.getChecklist(checklistId, fId),
          ),
        );
        foundChecklist = checklistResults.find(Boolean) || null;
      }

      if (foundChecklist) {
        setItem(foundChecklist);
        reset(foundChecklist);
        // Immediately unblock the UI so user doesn't wait on secondary data
        setLoading(false);
      } else {
        Alert.alert("Error", "Checklist not found.");
        onBack();
        return;
      }

      // 2. Set workspaces state
      const loadedFolders = await foldersPromise;
      const loadedWorkspaces: Workspace[] = loadedFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
        icon: folder.icon,
        iconType: folder.iconType,
        color: folder.color,
        revision: folder.revision || 1,
        lifecycleGeneration: folder.lifecycleGeneration || 1,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt || Date.now(),
        archivedAt: folder.archivedAt,
      }));
      setWorkspaces(loadedWorkspaces);

      // 3. Load resources for the picker concurrently in the background
      const folderIds = Array.from(
        new Set([
          INBOX_WORKSPACE_ID,
          MY_PEBBLES_WORKSPACE_ID,
          ...loadedFolders.map((f) => f.id),
        ]),
      );
      const resMaps = await Promise.all(
        folderIds.map((fId) => ResourceRepository.getResources(fId)),
      );
      const allLoadedResources: Resource[] = resMaps.flatMap((resMap) =>
        Object.values(resMap),
      );
      setResourcesList(allLoadedResources);
    } catch (e) {
      console.warn("Failed to load checklist details", e);
      setLoading(false);
    }
  }, [checklistId, workspaceId, onBack, reset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert("Title Required", "Please enter a checklist title.");
      return;
    }
    if (!item) return;

    if (item.recurrence && occurrenceDate && isEditing) {
      setShowEditRecurringModal(true);
    } else {
      saveChanges(false);
    }
  };

  const saveChanges = async (thisOccurrenceOnly: boolean) => {
    if (!item) return;
    setShowEditRecurringModal(false);

    try {
      let scheduleObj: any = undefined;
      if (form.scheduleDate && form.scheduleDate !== "inbox") {
        let calculatedEndTime: string | undefined = undefined;
        if (form.startTime) {
          const duration = form.durationMinutes || 45;
          const [sh, sm] = form.startTime.split(":").map(Number);
          if (!isNaN(sh) && !isNaN(sm)) {
            const endTotalMin = sh * 60 + sm + duration;
            const eh = Math.floor(endTotalMin / 60) % 24;
            const em = endTotalMin % 60;
            calculatedEndTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
          }
        }
        scheduleObj = {
          date: form.scheduleDate,
          startTime: form.startTime || undefined,
          endTime: calculatedEndTime,
          durationMinutes:
            form.durationMinutes || (form.startTime ? 45 : undefined),
          allDay: !form.startTime ? true : undefined,
        };
      }

      let reminderObj: Reminder | undefined;
      if (form.reminderTime) {
        const itemReminderTriggerAt = item.reminder?.triggerAt;
        const itemReminderDate = itemReminderTriggerAt
          ? dateKeyFromDate(new Date(itemReminderTriggerAt))
          : undefined;
        const itemReminderHour = itemReminderTriggerAt
          ? new Date(itemReminderTriggerAt).getHours()
          : undefined;
        const itemReminderMinute = itemReminderTriggerAt
          ? new Date(itemReminderTriggerAt).getMinutes()
          : undefined;

        const isReminderUnchanged =
          itemReminderTriggerAt !== undefined &&
          form.reminderDate === itemReminderDate &&
          form.reminderTime.hour === itemReminderHour &&
          form.reminderTime.minute === itemReminderMinute;

        const targetDate =
          form.reminderDate ||
          (form.scheduleDate !== "inbox"
            ? form.scheduleDate
            : dateKeyFromDate(new Date()));

        const triggerAt = isReminderUnchanged
          ? itemReminderTriggerAt
          : computeTriggerEpoch(
              form.reminderTime.hour,
              form.reminderTime.minute,
              targetDate,
            );

        reminderObj = {
          enabled: true,
          triggerAt,
          ...(item.reminder?.notificationIds
            ? { notificationIds: item.reminder.notificationIds }
            : {}),
        };
      } else {
        reminderObj = undefined;
      }

      let recurrenceObj: RecurrenceRule | undefined;
      if (form.recurrenceType && form.recurrenceType !== "none") {
        recurrenceObj = {
          frequency: form.recurrenceType as RecurrenceRule["frequency"],
          interval:
            form.recurrenceType === "custom"
              ? form.intervalVal
              : item.recurrence?.interval || 1,
          ...(form.recurrenceType === "custom" && form.recurrenceUnit
            ? { unit: form.recurrenceUnit }
            : {}),
          ...(item.recurrence?.unit ? { unit: item.recurrence.unit } : {}),
          daysOfWeek:
            form.recurrenceType === "weekly"
              ? effectiveWeeklyDays(form.recurrenceDays, form.scheduleDate)
              : undefined,
          dayOfMonth:
            form.recurrenceType === "monthly"
              ? form.recurrenceDayOfMonth
              : undefined,
          ...(form.recurrenceEndDate
            ? { endDate: form.recurrenceEndDate }
            : {}),
          ...(form.recurrenceOccurrences !== undefined
            ? { occurrences: form.recurrenceOccurrences }
            : {}),
        };
      } else {
        recurrenceObj = undefined;
      }

      const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;
      let savedItemForRefresh: Checklist | null = null;

      if (thisOccurrenceOnly && occurrenceDate) {
        const targetOccurrenceDate =
          form.scheduleDate &&
          form.scheduleDate !== (item.schedule?.date || "inbox")
            ? form.scheduleDate
            : occurrenceDate;

        const { occurrenceChecklist } =
          await EntityCommandService.rescheduleChecklistRecurringOccurrence(
            item.id,
            oldFolderId,
            occurrenceDate,
            { date: targetOccurrenceDate },
            { source: "checklist_detail" },
            {
              title: form.title.trim(),
              description: form.description.trim() || undefined,
              priority: form.priority || item.priority || "none",
              categoryId: form.categoryId || undefined,
              items: form.items,
              resourceIds: form.linkedCollectionIds,
              schedule: {
                ...(scheduleObj || { allDay: true }),
                date: targetOccurrenceDate,
              },
              reminder: reminderObj,
            },
          );

        if (form.workspaceId !== oldFolderId) {
          await EntityCommandService.moveChecklist(
            occurrenceChecklist.id,
            oldFolderId,
            form.workspaceId,
          );
        }

        savedItemForRefresh = {
          ...occurrenceChecklist,
          workspaceId: form.workspaceId,
          categoryId: form.categoryId || undefined,
        };
      } else {
        await EntityCommandService.updateChecklist(item.id, oldFolderId, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority || item.priority || "none",
          categoryId: form.categoryId || undefined,
          items: form.items,
          resourceIds: form.linkedCollectionIds,
          schedule: scheduleObj,
          reminder: reminderObj,
          recurrence: recurrenceObj,
        });

        if (oldFolderId !== form.workspaceId) {
          await EntityCommandService.moveChecklist(
            item.id,
            oldFolderId,
            form.workspaceId,
          );
        }

        savedItemForRefresh = {
          ...item,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          workspaceId: form.workspaceId,
          priority: form.priority || item.priority || "none",
          categoryId: form.categoryId || undefined,
          items: form.items,
          resourceIds: form.linkedCollectionIds,
          schedule: scheduleObj,
          reminder: reminderObj,
          recurrence: recurrenceObj,
          updatedAt: Date.now(),
        };
      }

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});

      setIsEditing(false);
      showToast("Changes saved");
      if (savedItemForRefresh) {
        setItem(savedItemForRefresh);
        reset(savedItemForRefresh);
      }
    } catch (e) {
      console.warn("Failed to save changes", e);
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    try {
      const duplicate: Checklist = {
        ...item,
        id: generateId("checklist-"),
        title: `${item.title} (Copy)`,
        priority: item.priority || "none",
        items: (item.items || []).map((item) => ({
          ...item,
          completed: false,
          completedAt: undefined,
        })),
        occurrenceHistory: undefined,
        recurrenceExceptions: undefined,
        pebbleAwarded: undefined,
        reminder: item.reminder
          ? { ...item.reminder, notificationIds: undefined }
          : undefined,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      };

      await EntityCommandService.createChecklist(
        duplicate,
        duplicate.workspaceId || INBOX_WORKSPACE_ID,
        { skipEvents: true, skipAnalytics: true },
      );
      emitStateChange("checklists_changed");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert("Success", "Checklist duplicated successfully!");
      onBack();
    } catch (e) {
      console.warn("Failed to duplicate checklist", e);
    }
  };

  const handleArchive = async () => {
    if (!item) return;
    try {
      await EntityCommandService.updateChecklist(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        {
          archivedAt: Date.now(),
        },
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Checklist archived");
      onBack();
    } catch (e) {
      console.warn("Failed to archive checklist", e);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      const folderId = item.workspaceId || INBOX_WORKSPACE_ID;
      await EntityCommandService.recycleChecklist(item.id, folderId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Checklist moved to Recycle Bin");
      onBack();
    } catch (e) {
      console.warn("Failed to delete checklist", e);
    }
  };

  const handleBack = () => {
    if (isEditing) {
      setIsEditing(false);
      if (item) reset(item);
    } else {
      onBack();
    }
  };

  const scheduleDisplay = useMemo(() => {
    const effectiveDate = occurrenceDate || item?.schedule?.date;
    if (!effectiveDate || effectiveDate === "inbox") {
      return "Unscheduled";
    }
    const dateStr = effectiveDate;
    if (item?.schedule?.startTime) {
      const durStr = item.schedule.durationMinutes
        ? ` (${item.schedule.durationMinutes}m)`
        : "";
      return `${dateStr} at ${item.schedule.startTime}${durStr}`;
    }
    return `${dateStr} (All Day)`;
  }, [item, occurrenceDate]);

  if (loading || !item) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.textMuted }}>Loading checklist...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const createdDate = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : "Unknown";

  const checklistColor = getChecklistColor(
    isEditing ? form.categoryId : item.categoryId,
  );

  return (
    <>
      <DetailShell
        style={{ backgroundColor: isLight ? colors.background : "#101012" }}
        background={
          <ChecklistAmbientBackground
            color={checklistColor}
            isLight={isLight}
          />
        }
        header={
          <ChecklistDetailHeader
            isEditing={isEditing}
            hasChanges={hasChanges}
            isLight={isLight}
            colors={colors}
            onBack={handleBack}
            onSave={handleSave}
            onEdit={() => setIsEditing(true)}
            paused={!isTransitionReady}
          />
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {!isEditing ? (
          <ChecklistDetailView
            item={item}
            items={form.items}
            effectiveOccurrenceDate={effectiveOccurrenceDate}
            completedCount={completedCount}
            totalCount={totalCount}
            currentWorkspace={currentWorkspace}
            linkedResources={linkedResources}
            isLight={isLight}
            colors={colors}
            createdDate={createdDate}
            scheduleDisplay={scheduleDisplay}
            quickItemText={quickItemText}
            setQuickItemText={setQuickItemText}
            onQuickAddItem={handleQuickAddItem}
            onToggleItem={handleToggleItem}
            onOpenLinkPicker={() => setLinkPickerVisible(true)}
            onToggleResource={handleToggleResource}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={handleDelete}
            accentColor={checklistColor}
            paused={!isTransitionReady}
          />
        ) : (
          <ChecklistDetailForm
            form={form}
            update={update}
            toggleDay={toggleDay}
            selectRecurrenceType={selectRecurrenceType}
            addItem={addItem}
            setNewItemText={setNewItemText}
            deleteItem={deleteItem}
            renameItem={renameItem}
            moveItemUp={moveItemUp}
            moveItemDown={moveItemDown}
            toggleResource={toggleResource}
            currentWorkspace={currentWorkspace}
            linkedResources={linkedResources}
            onOpenWorkspacePicker={() => setWorkspacePickerVisible(true)}
            onOpenLinkPicker={() => setLinkPickerVisible(true)}
          />
        )}
      </DetailShell>

      {/* WORKSPACE PICKER MODAL */}
      <ChecklistWorkspaceModal
        visible={workspacePickerVisible}
        workspaces={workspaces}
        selectedWorkspaceId={form.workspaceId}
        colors={colors}
        onSelect={(wsId) => update({ workspaceId: wsId })}
        onClose={() => setWorkspacePickerVisible(false)}
      />

      {/* RESOURCE LIST PICKER MODAL */}
      <ResourceAttachmentPicker
        visible={linkPickerVisible}
        onClose={() => setLinkPickerVisible(false)}
        resources={resourcesList}
        selectedResourceIds={form.linkedCollectionIds}
        onToggle={handleToggleResource}
      />

      {/* RECURRING EDIT MODAL */}
      <ChecklistRecurringModal
        visible={showEditRecurringModal}
        colors={colors}
        onThisOccurrence={() => saveChanges(true)}
        onAllOccurrences={() => saveChanges(false)}
        onClose={() => setShowEditRecurringModal(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
