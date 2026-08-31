import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
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
import { generateId } from "@/shared/utils/id";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import {
  DetailActions,
  DetailHeader,
  DetailRow,
  DetailSection,
  DetailShell,
} from "@/features/details";
import {
  ResourceAttachmentPicker,
  ConnectedResourcesView,
} from "@/features/details/resources";
import {
  useChecklistDetailForm,
  computeTriggerEpoch,
} from "@/features/details/checklist/hooks/useChecklistDetailForm";
import { ChecklistDetailForm } from "@/features/details/checklist/components/ChecklistDetailForm";

export interface ChecklistDetailContentProps {
  checklistId: string;
  /** Whether the screen should open directly in edit mode (route `edit=true`). */
  initialEdit?: boolean;
  onBack: () => void;
}

/**
 * Checklist Detail screen on the shared Detail System. Owns checklist loading,
 * the edit-form state group, view/edit modes, the workspace + link-resource
 * pickers, and all checklist mutations (routed through EntityCommandService).
 */
export const ChecklistDetailContent: React.FC<ChecklistDetailContentProps> = ({
  checklistId,
  initialEdit,
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

  // Editor sub-states
  const [workspacePickerVisible, setWorkspacePickerVisible] = useState(false);
  const [linkPickerVisible, setLinkPickerVisible] = useState(false);

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

  const completedCount = useMemo(() => {
    return form.items.filter((it) => it.completed).length;
  }, [form.items]);

  const totalCount = form.items.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const currentWorkspace = useMemo(() => {
    return (
      workspaces.find((ws) => ws.id === form.workspaceId) || {
        name: "Inbox",
        emoji: "📥",
      }
    );
  }, [workspaces, form.workspaceId]);

  const hasChanges = useMemo(() => {
    if (!item) return false;
    if (form.title.trim() !== (item.title || "").trim()) return true;
    if (form.description.trim() !== (item.description || "").trim()) return true;
    if (form.workspaceId !== (item.workspaceId || INBOX_WORKSPACE_ID))
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
    if ((form.startTime || undefined) !== (item.schedule?.startTime || undefined))
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

  const loadData = useCallback(async () => {
    if (!checklistId) return;
    setLoading(true);
    try {
      // 1. Load workspaces
      const loadedFolders = await WorkspaceRepository.getWorkspaces();
      const loadedWorkspaces: Workspace[] = loadedFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
        color: folder.color,
        revision: folder.revision || 1,
        lifecycleGeneration: folder.lifecycleGeneration || 1,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt || Date.now(),
        archivedAt: folder.archivedAt,
      }));
      setWorkspaces(loadedWorkspaces);

      const folderIds = Array.from(
        new Set([
          INBOX_WORKSPACE_ID,
          MY_PEBBLES_WORKSPACE_ID,
          ...loadedFolders.map((f) => f.id),
        ]),
      );

      // 2. Load resources
      const allLoadedResources: Resource[] = [];
      for (const fId of folderIds) {
        const resMap = await ResourceRepository.getResources(fId);
        Object.values(resMap).forEach((r) => {
          allLoadedResources.push(r);
        });
      }
      setResourcesList(allLoadedResources);

      // 3. Load checklist item
      let foundChecklist: Checklist | undefined;

      for (const fId of folderIds) {
        const checklist = await ChecklistRepository.getChecklist(checklistId, fId);
        if (checklist) {
          foundChecklist = checklist;
          break;
        }
      }

      if (foundChecklist) {
        setItem(foundChecklist);
        reset(foundChecklist);
      } else {
        Alert.alert("Error", "Checklist not found.");
        onBack();
      }
    } catch (e) {
      console.warn("Failed to load checklist details", e);
    } finally {
      setLoading(false);
    }
  }, [checklistId, onBack, reset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert("Title Required", "Please enter a checklist title.");
      return;
    }
    if (!item) return;

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
          durationMinutes: form.durationMinutes || (form.startTime ? 45 : undefined),
          allDay: !form.startTime,
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
          (form.scheduleDate !== "inbox" ? form.scheduleDate : dateKeyFromDate(new Date()));

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
          frequency: form.recurrenceType as any,
          interval: form.intervalVal || 1,
          daysOfWeek:
            form.recurrenceType === "weekly" ? form.recurrenceDays : undefined,
          dayOfMonth:
            form.recurrenceType === "monthly"
              ? form.recurrenceDayOfMonth
              : undefined,
        };
      } else {
        recurrenceObj = undefined;
      }

      const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;

      await EntityCommandService.updateChecklist(item.id, oldFolderId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
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

      const updatedChecklist: Checklist = {
        ...item,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        workspaceId: form.workspaceId,
        items: form.items,
        resourceIds: form.linkedCollectionIds,
        schedule: scheduleObj,
        reminder: reminderObj,
        recurrence: recurrenceObj,
        updatedAt: Date.now(),
      };

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      setIsEditing(false);
      showToast("Changes saved");
      setItem(updatedChecklist);
      reset(updatedChecklist);
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

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
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
    if (!item?.schedule?.date || item.schedule.date === "inbox") {
      return "Unscheduled";
    }
    const dateStr = item.schedule.date;
    if (item.schedule.startTime) {
      const durStr = item.schedule.durationMinutes
        ? ` (${item.schedule.durationMinutes}m)`
        : "";
      return `${dateStr} at ${item.schedule.startTime}${durStr}`;
    }
    return `${dateStr} (All Day)`;
  }, [item?.schedule]);

  const reminderDisplay = useMemo(() => {
    if (!item?.reminder?.enabled || !item.reminder.triggerAt) {
      return "Off";
    }
    const d = new Date(item.reminder.triggerAt);
    return formatReminderTime(d.getHours(), d.getMinutes()) || "On";
  }, [item?.reminder]);

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

  const header = (
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <DetailHeader
        title={isEditing ? "Edit Checklist" : "Checklist Details"}
        onBack={handleBack}
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
              styles.saveBtn,
              {
                backgroundColor: isEditing
                  ? hasChanges
                    ? colors.primary
                    : colors.card
                  : "transparent",
              },
            ]}
            disabled={isEditing && !hasChanges}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? "Save checklist" : "Edit checklist"}
          >
            <Text
              style={{
                color: isEditing
                  ? hasChanges
                    ? "#FFFFFF"
                    : colors.textMuted
                  : colors.primary,
                fontWeight: "700",
                fontSize: 13,
              }}
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
      <DetailShell header={header} contentContainerStyle={{ paddingBottom: 60 }}>
        {!isEditing ? (
          /* ===== DETAILS VIEW ===== */
          <View style={{ gap: Spacing.xl }}>
            {/* Title and Workspace Header */}
            <View>
              <Text style={[styles.itemTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <Text style={{ fontSize: 14 }}>
                  {currentWorkspace.emoji || "📁"}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {currentWorkspace.name}
                </Text>
              </View>
            </View>

            {/* Description (if present) */}
            {item.description ? (
              <DetailSection title="Description">
                <Text
                  style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}
                >
                  {item.description}
                </Text>
              </DetailSection>
            ) : null}

            {/* Progress */}
            <DetailSection title="Progress">
              <DetailRow
                label="Progress"
                value={`${completedCount} of ${totalCount} completed`}
                icon={<Feather name="activity" size={16} color={colors.primary} />}
              />
              {/* Progress bar */}
              <View
                style={[
                  styles.progressTrack,
                  {
                    backgroundColor: isLight
                      ? "rgba(0,0,0,0.06)"
                      : "rgba(255,255,255,0.08)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </DetailSection>

            {/* Checklist Items */}
            <DetailSection title="Checklist Items">
              {form.items.length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    textAlign: "center",
                    paddingVertical: 12,
                  }}
                >
                  No items in this checklist.
                </Text>
              ) : (
                form.items.map((cIt) => (
                  <View
                    key={cIt.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Feather
                      name={cIt.completed ? "check-circle" : "circle"}
                      size={16}
                      color={
                        cIt.completed ? colors.primary : colors.textMuted
                      }
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "500",
                        color: cIt.completed ? colors.textMuted : colors.text,
                        textDecorationLine: cIt.completed
                          ? "line-through"
                          : "none",
                        flex: 1,
                      }}
                    >
                      {cIt.title}
                    </Text>
                  </View>
                ))
              )}
            </DetailSection>

            {/* Schedule & Timing Metadata */}
            <DetailSection title="Schedule & Timing">
              <DetailRow
                label="Schedule"
                value={scheduleDisplay}
                icon={<Feather name="calendar" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Reminder"
                value={reminderDisplay}
                icon={<Feather name="bell" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Repeat"
                value={getRecurrenceLabel(item.recurrence) || "None"}
                icon={<Feather name="repeat" size={16} color={colors.textMuted} />}
              />
              <DetailRow
                label="Created Date"
                value={createdDate}
                icon={
                  <Feather name="calendar" size={16} color={colors.textMuted} />
                }
              />
            </DetailSection>

            {/* Attached Resources Preview (Interactive Carousel) */}
            <ConnectedResourcesView
              resources={linkedResources}
              onAttachPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setLinkPickerVisible(true);
              }}
              onUnlink={handleToggleResource}
              workspaceId={form.workspaceId}
            />

            {/* Actions */}
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <DetailActions
                actions={[
                  {
                    key: "duplicate",
                    label: "Duplicate Checklist",
                    icon: <Feather name="copy" size={16} color={colors.text} />,
                    onPress: handleDuplicate,
                  },
                ]}
              />
              <DetailActions
                actions={[
                  {
                    key: "archive",
                    label: "Archive Checklist",
                    icon: (
                      <Feather name="archive" size={16} color={colors.text} />
                    ),
                    onPress: () => {
                      Alert.alert(
                        "Archive Checklist",
                        "Archive this checklist?",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Archive", onPress: handleArchive },
                        ],
                      );
                    },
                  },
                  {
                    key: "delete",
                    label: "Delete Checklist",
                    tone: "danger",
                    icon: <Feather name="trash-2" size={16} color="#FFFFFF" />,
                    onPress: () => {
                      Alert.alert(
                        "Delete Checklist",
                        "Delete this checklist permanently?",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: handleDelete,
                          },
                        ],
                      );
                    },
                  },
                ]}
              />
            </View>
          </View>
        ) : (
          /* ===== EDITING VIEW ===== */
          <ChecklistDetailForm
            form={form}
            update={update}
            toggleDay={toggleDay}
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
      <Modal visible={workspacePickerVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <AppCard
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select Workspace
              </Text>
              <TouchableOpacity
                onPress={() => setWorkspacePickerVisible(false)}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close workspace selector"
              >
                <Feather name="x" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {workspaces.map((ws) => (
                <TouchableOpacity
                  key={ws.id}
                  style={[
                    styles.pickerRow,
                    {
                      backgroundColor:
                        form.workspaceId === ws.id
                          ? `${colors.primary}15`
                          : "transparent",
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Light,
                    ).catch(() => {});
                    update({ workspaceId: ws.id });
                    setWorkspacePickerVisible(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${ws.name} workspace`}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}>
                    {ws.emoji || "📁"}
                  </Text>
                  <Text
                    style={{
                      color:
                        form.workspaceId === ws.id
                          ? colors.primary
                          : colors.text,
                      fontWeight:
                        form.workspaceId === ws.id ? "700" : "500",
                      fontSize: 15,
                    }}
                  >
                    {ws.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </AppCard>
        </View>
      </Modal>

      {/* RESOURCE LIST PICKER MODAL */}
      <ResourceAttachmentPicker
        visible={linkPickerVisible}
        onClose={() => setLinkPickerVisible(false)}
        resources={resourcesList}
        selectedResourceIds={form.linkedCollectionIds}
        onToggle={handleToggleResource}
      />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  itemTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 4,
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  closeBtn: { padding: 4 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
