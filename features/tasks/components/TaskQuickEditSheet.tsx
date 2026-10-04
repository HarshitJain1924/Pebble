import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Keyboard,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text, AppTextInput as TextInput } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Palette } from "@/shared/constants/theme";
import { Typography } from "@/shared/constants/typography";
import { Spacing } from "@/shared/constants/spacing";
import { Radius } from "@/shared/constants/radii";
import { TaskListPriorityColors } from "@/shared/constants/categoryColors";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { MONTH_NAMES, getResourcePresentation } from "@/features/tasks/utils/task-formatting";
import { getTodayDateKey, getOffsetDateKey } from "@/shared/utils/date-key";
import type { Task, TaskPriority } from "@/shared/types/domain.types";

interface TaskQuickEditSheetProps {
  visible: boolean;
  onClose: () => void;
  item: Task;
  colors: any;
  isDark: boolean;
  isCompleted: boolean;
  onToggleComplete: () => void;
  onEditTodo?: () => void;
  onSetAlarm?: () => void;
  onOpenDatePicker: () => void;
  onDeleteTodo: () => void;
  linkedResources: any[];
  totalResources: number;
  streamColors: any;
  handleOpenResource: (res: any) => void;
  onOpenLinkSelector: () => void;
}

/**
 * TaskQuickEditSheet
 * ──────────────────
 * Compact, UI-rich "Task Quick Edit" surface.
 * Replaces the generic TaskItem overflow action sheet.
 *
 * Structure:
 *   [ Drag Handle ]                                [ Delete (Quiet) ]
 *   ○  [ Title (editable inline) ]
 *      [ Note (editable inline / "Add a note...") ]
 *   [ ⚑ Priority ] [ 🔔 Reminder ] [ 📅 Schedule ] [ 📎 Resources ]  (horizontal rail)
 *   [ Optional Inline Priority or Resource disclosure ]
 *   ──────────────────────────────────────────────────────────────
 *   Open full details                                              ›
 */
function useSafeInsets() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

export function TaskQuickEditSheet({
  visible,
  onClose,
  item,
  colors,
  isDark,
  isCompleted,
  onToggleComplete,
  onEditTodo,
  onSetAlarm,
  onOpenDatePicker,
  onDeleteTodo,
  linkedResources,
  totalResources,
  streamColors,
  handleOpenResource,
  onOpenLinkSelector,
}: TaskQuickEditSheetProps) {
  // Local edit states for Title and Note
  const [localTitle, setLocalTitle] = useState(item.title);
  const [localDescription, setLocalDescription] = useState(item.description || "");

  // Inline disclosures within the sheet
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showResourcesInline, setShowResourcesInline] = useState(false);

  // Sync with item whenever it changes or sheet opens
  useEffect(() => {
    setLocalTitle(item.title);
    setLocalDescription(item.description || "");
  }, [item.title, item.description, visible]);

  const saveTitleIfChanged = useCallback(async (newTitle: string) => {
    const trimmed = newTitle.trim();
    if (trimmed && trimmed !== item.title) {
      try {
        await EntityCommandService.updateTask(item.id, item.workspaceId, { title: trimmed });
      } catch (e) {
        console.warn("[TaskQuickEdit] Failed to update task title", e);
      }
    }
  }, [item.id, item.title, item.workspaceId]);

  const saveDescriptionIfChanged = useCallback(async (newDesc: string) => {
    const trimmed = newDesc.trim();
    const current = (item.description || "").trim();
    if (trimmed !== current) {
      try {
        await EntityCommandService.updateTask(item.id, item.workspaceId, { description: trimmed });
      } catch (e) {
        console.warn("[TaskQuickEdit] Failed to update task description", e);
      }
    }
  }, [item.id, item.description, item.workspaceId]);

  const commitPendingEdits = useCallback(async () => {
    await Promise.all([
      saveTitleIfChanged(localTitle),
      saveDescriptionIfChanged(localDescription),
    ]);
  }, [saveTitleIfChanged, saveDescriptionIfChanged, localTitle, localDescription]);

  const handleClose = useCallback(async () => {
    await commitPendingEdits();
    setShowPriorityPicker(false);
    setShowResourcesInline(false);
    onClose();
  }, [commitPendingEdits, onClose]);

  // Priority computation
  const currentPriority = item.priority || "none";
  const hasPriority = currentPriority !== "none";
  const priorityLabel = useMemo(() => {
    if (!hasPriority) return "Priority";
    return currentPriority.charAt(0).toUpperCase() + currentPriority.slice(1);
  }, [hasPriority, currentPriority]);

  const priorityColor = useMemo(() => {
    if (currentPriority === "high") return TaskListPriorityColors.high.dark;
    if (currentPriority === "medium") return TaskListPriorityColors.medium.dark;
    if (currentPriority === "low") return TaskListPriorityColors.low.dark;
    return colors.textMuted;
  }, [currentPriority, colors.textMuted]);

  // Reminder computation
  const hasReminder = Boolean(item.reminder?.enabled && item.reminder?.triggerAt);
  const reminderLabel = useMemo(() => {
    if (!hasReminder || !item.reminder?.triggerAt) return "Reminder";
    const d = new Date(item.reminder.triggerAt);
    return formatReminderTime(d.getHours(), d.getMinutes()) || "Reminder";
  }, [hasReminder, item.reminder?.triggerAt]);

  // Schedule computation
  const scheduleDate = item.schedule?.date;
  const hasSchedule = Boolean(scheduleDate && scheduleDate !== "inbox");
  const scheduleLabel = useMemo(() => {
    if (!hasSchedule || !scheduleDate) return "Schedule";
    const today = getTodayDateKey();
    const tomorrow = getOffsetDateKey(-1, today);
    const yesterday = getOffsetDateKey(1, today);
    if (scheduleDate === today) return "Today";
    if (scheduleDate === tomorrow) return "Tomorrow";
    if (scheduleDate === yesterday) return "Yesterday";
    try {
      const [y, m, d] = scheduleDate.split("-").map(Number);
      const month = MONTH_NAMES[(m || 1) - 1] || "";
      return `${month} ${d}`;
    } catch {
      return scheduleDate;
    }
  }, [hasSchedule, scheduleDate]);

  const insets = useSafeInsets();
  const { height: screenHeight } = useWindowDimensions();
  const dynamicBottomPadding = Math.max(insets.bottom, 20);

  return (
    <AnimatedOverlay
      visible={visible}
      onClose={handleClose}
      type="bottom-sheet"
    >
      {(close) => (
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: dynamicBottomPadding,
              maxHeight: screenHeight * 0.85,
            },
          ]}
        >
          {/* Top Bar: Centered Drag Handle (tap to dismiss keyboard) + Quiet Secondary Delete */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={styles.dragHandleWrapper}
              hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
              accessibilityRole="none"
              accessible={false}
            >
              <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
            </Pressable>
            <PressableScale
              onPress={async () => {
                Keyboard.dismiss();
                await commitPendingEdits();
                close();
                onDeleteTodo();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Delete task"
              style={styles.deleteButton}
            >
              <Feather name="trash-2" size={15} color={colors.textMuted} />
            </PressableScale>
          </View>

          {/* Identity: Checkbox + Editable Title + Editable Note */}
          <View style={styles.taskIdentityRow}>
            <PressableScale
              onPress={onToggleComplete}
              haptic
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isCompleted }}
              accessibilityLabel={isCompleted ? "Mark task incomplete" : "Mark task complete"}
              style={[
                styles.checkboxTarget,
                {
                  borderColor: isCompleted
                    ? colors.success
                    : (isDark ? "rgba(255, 255, 255, 0.3)" : Palette.slate300),
                  backgroundColor: isCompleted ? colors.success : "transparent",
                },
              ]}
            >
              {isCompleted && <Feather name="check" size={12} color={Palette.white} />}
            </PressableScale>

            <View style={styles.inputsColumn}>
              <TextInput
                value={localTitle}
                onChangeText={setLocalTitle}
                onBlur={() => saveTitleIfChanged(localTitle)}
                placeholder="Task title"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.titleInput,
                  {
                    color: isCompleted ? colors.textMuted : colors.text,
                    textDecorationLine: isCompleted ? "line-through" : "none",
                  },
                ]}
                returnKeyType="done"
                onSubmitEditing={() => {
                  saveTitleIfChanged(localTitle);
                  Keyboard.dismiss();
                }}
              />

              <TextInput
                value={localDescription}
                onChangeText={setLocalDescription}
                onBlur={() => saveDescriptionIfChanged(localDescription)}
                placeholder="Add a note..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={[
                  styles.noteInput,
                  { color: colors.text },
                ]}
              />
            </View>
          </View>

          {/* Horizontal Property Rail */}
          <View style={styles.railWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.railScroll}
            >
              {/* 1. Priority */}
              <PressableScale
                onPress={() => {
                  Keyboard.dismiss();
                  Haptics.selectionAsync().catch(() => {});
                  setShowPriorityPicker((prev) => !prev);
                  setShowResourcesInline(false);
                }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`Priority: ${priorityLabel}`}
                style={[
                  styles.propertyPill,
                  {
                    backgroundColor: hasPriority
                      ? `${priorityColor}18`
                      : (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"),
                    borderColor: hasPriority
                      ? `${priorityColor}40`
                      : (isDark ? "rgba(255, 255, 255, 0.12)" : colors.border),
                  },
                ]}
              >
                <Feather
                  name="flag"
                  size={13}
                  color={hasPriority ? priorityColor : colors.textMuted}
                />
                <Text
                  style={[
                    styles.propertyPillText,
                    {
                      color: hasPriority ? colors.text : colors.textMuted,
                      fontWeight: hasPriority ? "600" : "500",
                    },
                  ]}
                >
                  {priorityLabel}
                </Text>
              </PressableScale>

              {/* 2. Reminder */}
              <PressableScale
                onPress={async () => {
                  Keyboard.dismiss();
                  await commitPendingEdits();
                  close();
                  onSetAlarm?.();
                }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`Reminder: ${reminderLabel}`}
                style={[
                  styles.propertyPill,
                  {
                    backgroundColor: hasReminder
                      ? `${colors.primary}18`
                      : (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"),
                    borderColor: hasReminder
                      ? `${colors.primary}40`
                      : (isDark ? "rgba(255, 255, 255, 0.12)" : colors.border),
                  },
                ]}
              >
                <Feather
                  name="bell"
                  size={13}
                  color={hasReminder ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.propertyPillText,
                    {
                      color: hasReminder ? colors.text : colors.textMuted,
                      fontWeight: hasReminder ? "600" : "500",
                    },
                  ]}
                >
                  {reminderLabel}
                </Text>
              </PressableScale>

              {/* 3. Schedule */}
              <PressableScale
                onPress={async () => {
                  Keyboard.dismiss();
                  await commitPendingEdits();
                  close();
                  onOpenDatePicker();
                }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`Schedule: ${scheduleLabel}`}
                style={[
                  styles.propertyPill,
                  {
                    backgroundColor: hasSchedule
                      ? `${colors.primary}18`
                      : (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"),
                    borderColor: hasSchedule
                      ? `${colors.primary}40`
                      : (isDark ? "rgba(255, 255, 255, 0.12)" : colors.border),
                  },
                ]}
              >
                <Feather
                  name="calendar"
                  size={13}
                  color={hasSchedule ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.propertyPillText,
                    {
                      color: hasSchedule ? colors.text : colors.textMuted,
                      fontWeight: hasSchedule ? "600" : "500",
                    },
                  ]}
                >
                  {scheduleLabel}
                </Text>
              </PressableScale>

              {/* 4. Resources */}
              <PressableScale
                onPress={() => {
                  Keyboard.dismiss();
                  Haptics.selectionAsync().catch(() => {});
                  if (totalResources === 0) {
                    onOpenLinkSelector();
                  } else {
                    setShowResourcesInline((prev) => !prev);
                    setShowPriorityPicker(false);
                  }
                }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`Resources: ${totalResources}`}
                style={[
                  styles.propertyPill,
                  {
                    backgroundColor: totalResources > 0
                      ? `${colors.primary}18`
                      : (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"),
                    borderColor: totalResources > 0
                      ? `${colors.primary}40`
                      : (isDark ? "rgba(255, 255, 255, 0.12)" : colors.border),
                  },
                ]}
              >
                <Feather
                  name="link-2"
                  size={13}
                  color={totalResources > 0 ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.propertyPillText,
                    {
                      color: totalResources > 0 ? colors.text : colors.textMuted,
                      fontWeight: totalResources > 0 ? "600" : "500",
                    },
                  ]}
                >
                  {totalResources > 0 ? `${totalResources}` : "Resources"}
                </Text>
              </PressableScale>
            </ScrollView>
          </View>

          {/* Inline Priority Selector */}
          {showPriorityPicker && (
            <View style={styles.prioritySelectorRow}>
              {(["none", "low", "medium", "high"] as const).map((prio) => {
                const isSelected = (item.priority || "none") === prio;
                const prioColor = prio === "none" ? colors.textMuted : TaskListPriorityColors[prio].dark;
                const label = prio === "none" ? "None" : prio.charAt(0).toUpperCase() + prio.slice(1);

                return (
                  <PressableScale
                    key={prio}
                    onPress={async () => {
                      Keyboard.dismiss();
                      Haptics.selectionAsync().catch(() => {});
                      setShowPriorityPicker(false);
                      if (prio !== (item.priority || "none")) {
                        await EntityCommandService.updateTask(item.id, item.workspaceId, {
                          priority: prio,
                        });
                      }
                    }}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`Set priority to ${label}`}
                    style={[
                      styles.priorityOptionChip,
                      {
                        backgroundColor: isSelected
                          ? `${prioColor}20`
                          : (isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)"),
                        borderColor: isSelected ? prioColor : colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name="flag"
                      size={12}
                      color={isSelected ? prioColor : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.priorityOptionText,
                        {
                          color: isSelected ? prioColor : colors.text,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          )}

          {/* Inline Attached Resources Strip */}
          {showResourcesInline && totalResources > 0 && (
            <View style={styles.resourcesContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.resourcesScroll}
              >
                {linkedResources.map((res: any) => {
                  const itemPres = getResourcePresentation(res);
                  const visual = itemPres.visual;
                  const stream = streamColors[visual.category] || streamColors.note;

                  return (
                    <PressableScale
                      key={res.id}
                      onPress={() => {
                        Keyboard.dismiss();
                        handleOpenResource(res);
                      }}
                      haptic
                      scaleTo={0.96}
                      accessibilityRole="button"
                      accessibilityLabel={`Open resource ${itemPres.title}`}
                      style={[
                        styles.resourceChip,
                        {
                          backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : Palette.slate100,
                          borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.resourceIconBadge,
                          { backgroundColor: stream.backgroundColor },
                        ]}
                      >
                        <Feather
                          name={
                            visual.category === "link"
                              ? "globe"
                              : visual.category === "pdf"
                              ? "file-text"
                              : "align-left"
                          }
                          size={11}
                          color={stream.accent}
                        />
                      </View>
                      <Text
                        style={[styles.resourceChipTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {itemPres.title}
                      </Text>
                    </PressableScale>
                  );
                })}

                <PressableScale
                  onPress={() => {
                    Keyboard.dismiss();
                    onOpenLinkSelector();
                  }}
                  haptic
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel="Link more resources"
                  style={[
                    styles.linkMoreChip,
                    {
                      borderColor: isDark ? "rgba(255, 255, 255, 0.16)" : colors.border,
                      backgroundColor: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)",
                    },
                  ]}
                >
                  <Feather
                    name="plus"
                    size={12}
                    color={isDark ? colors.primaryLight : colors.primary}
                  />
                  <Text
                    style={[
                      styles.linkMoreText,
                      { color: isDark ? colors.primaryLight : colors.primary },
                    ]}
                  >
                    Link
                  </Text>
                </PressableScale>
              </ScrollView>
            </View>
          )}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Open Full Details (Authoritative Escape Hatch) */}
          <PressableScale
            onPress={async () => {
              Keyboard.dismiss();
              await commitPendingEdits();
              close();
              onEditTodo?.();
            }}
            haptic
            accessibilityRole="button"
            accessibilityLabel="Open full task details"
            style={styles.openDetailsRow}
          >
            <Text style={[styles.openDetailsText, { color: colors.text }]}>
              Open full details
            </Text>
            <Feather name="chevron-right" size={17} color={colors.textMuted} />
          </PressableScale>
        </View>
      )}
    </AnimatedOverlay>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
    gap: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 24,
    position: "relative",
    marginBottom: 4,
  },
  dragHandleWrapper: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
  deleteButton: {
    position: "absolute",
    right: 0,
    top: -2,
    padding: 6,
    opacity: 0.7,
  },
  taskIdentityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingTop: 2,
  },
  checkboxTarget: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  inputsColumn: {
    flex: 1,
    gap: 3,
  },
  titleInput: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    padding: 0,
    margin: 0,
    letterSpacing: -0.2,
  },
  noteInput: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.regular,
    padding: 0,
    margin: 0,
    maxHeight: 64,
    letterSpacing: -0.1,
  },
  railWrapper: {
    marginVertical: 2,
  },
  railScroll: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  propertyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  propertyPillText: {
    fontSize: Typography.sizes.xs,
    letterSpacing: -0.1,
  },
  prioritySelectorRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 2,
  },
  priorityOptionChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  priorityOptionText: {
    fontSize: Typography.sizes.xs,
    letterSpacing: -0.1,
  },
  resourcesContainer: {
    paddingVertical: 2,
  },
  resourcesScroll: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  resourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  resourceIconBadge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceChipTitle: {
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 120,
  },
  linkMoreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  linkMoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  openDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  openDetailsText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.1,
  },
});
