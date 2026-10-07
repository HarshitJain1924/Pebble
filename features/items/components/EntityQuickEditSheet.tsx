import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
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
import { TaskListPriorityColors } from "@/shared/constants/categoryColors";
import { Colors } from "@/shared/constants/theme";
import { Typography } from "@/shared/constants/typography";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type { TaskPriority } from "@/shared/types/domain.types";
import { resolveResourceIconName } from "@/features/today/utils/resource-presentation";

export interface EntityQuickEditSheetProps {
  visible: boolean;
  onClose: () => void;

  // Title & Note
  title: string;
  onSaveTitle?: (newTitle: string) => Promise<void> | void;
  description?: string;
  onSaveDescription?: (newDescription: string) => Promise<void> | void;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  isCompleted?: boolean;

  // Leading Control (e.g. Checkbox, ProgressRing)
  leadingControl?: React.ReactNode;

  // Priority
  priority?: TaskPriority | "none" | null;
  onSelectPriority?: (newPriority: TaskPriority) => Promise<void> | void;
  showPriority?: boolean;

  // Reminder
  reminderLabel?: string;
  hasReminder?: boolean;
  onPressReminder?: () => void;

  // Schedule / Recurrence
  scheduleLabel?: string;
  scheduleIcon?: "calendar" | "repeat";
  hasSchedule?: boolean;
  onPressSchedule?: () => void;

  // Resources
  totalResources?: number;
  linkedResources?: any[];
  onOpenResource?: (res: any) => void;
  onAddResource?: () => void;

  // Delete
  onDelete?: () => void;
  deleteAccessibilityLabel?: string;

  // Open full details
  onOpenFullDetails?: () => void;
  fullDetailsLabel?: string;

  // Custom children/content
  children?: React.ReactNode;

  // Color scheme override
  colorScheme?: "light" | "dark" | null;

  // Test ID prefix
  testIDPrefix?: string;
}

function useSafeInsets() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

/**
 * EntityQuickEditSheet
 * ────────────────────
 * Calm, reusable bottom sheet for quick editing Pebble entities (Task, Habit, etc.).
 * Provides inline title/note editing, priority selection chips, property rail,
 * resource inspection, and smooth full-details gateway.
 */
export const EntityQuickEditSheet: React.FC<EntityQuickEditSheetProps> = ({
  visible,
  onClose,
  title,
  onSaveTitle,
  description = "",
  onSaveDescription,
  titlePlaceholder = "Title",
  descriptionPlaceholder = "Add a note...",
  isCompleted = false,
  leadingControl,
  priority = "none",
  onSelectPriority,
  showPriority = true,
  reminderLabel = "Reminder",
  hasReminder = false,
  onPressReminder,
  scheduleLabel = "Schedule",
  scheduleIcon = "calendar",
  hasSchedule = false,
  onPressSchedule,
  totalResources = 0,
  linkedResources = [],
  onOpenResource,
  onAddResource,
  onDelete,
  deleteAccessibilityLabel = "Delete",
  onOpenFullDetails,
  fullDetailsLabel = "Open full details",
  children,
  colorScheme: explicitScheme,
  testIDPrefix = "entity",
}) => {
  const systemScheme = useColorScheme();
  const effectiveScheme = explicitScheme ?? systemScheme;
  const isLight = effectiveScheme === "light";
  const isDark = !isLight;
  const colors = Colors[effectiveScheme ?? "dark"];

  // Local draft states
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);

  // Disclosures within the sheet
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  // Sync drafts on prop changes or opening
  useEffect(() => {
    setLocalTitle(title);
    setLocalDescription(description || "");
  }, [title, description, visible]);

  const commitTitleIfChanged = useCallback(async () => {
    const trimmed = localTitle.trim();
    if (trimmed && trimmed !== title && onSaveTitle) {
      try {
        await onSaveTitle(trimmed);
      } catch (e) {
        console.warn("[EntityQuickEditSheet] Failed to save title:", e);
      }
    }
  }, [localTitle, title, onSaveTitle]);

  const commitDescriptionIfChanged = useCallback(async () => {
    const trimmed = localDescription.trim();
    const current = (description || "").trim();
    if (trimmed !== current && onSaveDescription) {
      try {
        await onSaveDescription(trimmed);
      } catch (e) {
        console.warn("[EntityQuickEditSheet] Failed to save description:", e);
      }
    }
  }, [localDescription, description, onSaveDescription]);

  const commitPendingEdits = useCallback(async () => {
    await Promise.all([commitTitleIfChanged(), commitDescriptionIfChanged()]);
  }, [commitTitleIfChanged, commitDescriptionIfChanged]);

  const handleClose = useCallback(async () => {
    await commitPendingEdits();
    setShowPriorityPicker(false);
    onClose();
  }, [commitPendingEdits, onClose]);

  // Priority computation
  const currentPriority = priority || "none";
  const hasActivePriority = currentPriority !== "none";
  const priorityDisplayName = useMemo(() => {
    if (!hasActivePriority) return "Priority";
    return currentPriority.charAt(0).toUpperCase() + currentPriority.slice(1);
  }, [hasActivePriority, currentPriority]);

  const priorityColor = useMemo(() => {
    if (currentPriority === "high") return TaskListPriorityColors.high.dark;
    if (currentPriority === "medium") return TaskListPriorityColors.medium.dark;
    if (currentPriority === "low") return TaskListPriorityColors.low.dark;
    return colors.textMuted;
  }, [currentPriority, colors.textMuted]);

  const insets = useSafeInsets();
  const { height: screenHeight } = useWindowDimensions();
  const dynamicBottomPadding = Math.max(insets.bottom, 20);

  return (
    <AnimatedOverlay visible={visible} onClose={handleClose} type="bottom-sheet">
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
          testID={`${testIDPrefix}-quick-edit-sheet`}
        >
          {/* Top Bar: Centered Drag Handle + Quiet Delete */}
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

            {onDelete && (
              <PressableScale
                onPress={async () => {
                  Keyboard.dismiss();
                  await commitPendingEdits();
                  close();
                  onDelete();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={deleteAccessibilityLabel}
                style={styles.deleteButton}
                testID={`${testIDPrefix}-delete-button`}
              >
                <Feather name="trash-2" size={15} color={colors.textMuted} />
              </PressableScale>
            )}
          </View>

          {/* Compact Attachment Strip Near Top of Sheet */}
          {linkedResources.length > 0 ? (
            <View style={styles.attachmentStripContainer} testID={`${testIDPrefix}-attachment-strip`}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.attachmentStripScroll}
              >
                {linkedResources.map((res: any) => {
                  const iconName = resolveResourceIconName(res);
                  return (
                    <PressableScale
                      key={res.id}
                      onPress={() => onOpenResource?.(res)}
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={`Open resource: ${res.title || "Untitled"}`}
                      style={[
                        styles.attachmentChip,
                        {
                          backgroundColor: isDark
                            ? "rgba(255, 255, 255, 0.05)"
                            : "rgba(0, 0, 0, 0.03)",
                          borderColor: isDark
                            ? "rgba(255, 255, 255, 0.10)"
                            : colors.border,
                        },
                      ]}
                      testID={`${testIDPrefix}-attachment-chip-${res.id}`}
                    >
                      <Feather name={iconName as any} size={11} color={colors.primary} />
                      <Text
                        style={[styles.attachmentChipText, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {res.title || "Resource"}
                      </Text>
                    </PressableScale>
                  );
                })}
                {onAddResource && (
                  <PressableScale
                    onPress={onAddResource}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel="Link another resource"
                    style={[
                      styles.attachmentAddButton,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(0, 0, 0, 0.02)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.08)"
                          : colors.border,
                      },
                    ]}
                    testID={`${testIDPrefix}-add-attachment-button`}
                  >
                    <Feather name="plus" size={12} color={colors.textMuted} />
                  </PressableScale>
                )}
              </ScrollView>
            </View>
          ) : onAddResource ? (
            <View style={styles.emptyAttachmentContainer} testID={`${testIDPrefix}-attachment-strip`}>
              <PressableScale
                onPress={onAddResource}
                haptic
                accessibilityRole="button"
                accessibilityLabel="Add resource"
                style={styles.emptyAddResourceAffordance}
                testID={`${testIDPrefix}-add-resource-empty`}
              >
                <Feather name="plus" size={11} color={colors.textMuted} />
                <Text style={[styles.emptyAddResourceText, { color: colors.textMuted }]}>
                  Add resource
                </Text>
              </PressableScale>
            </View>
          ) : null}

          {/* Identity: Leading control + Title TextInput + Description TextInput */}
          <View style={styles.identityRow}>
            {leadingControl && <View style={styles.leadingTarget}>{leadingControl}</View>}

            <View style={styles.inputsColumn}>
              <TextInput
                value={localTitle}
                onChangeText={setLocalTitle}
                onBlur={commitTitleIfChanged}
                placeholder={titlePlaceholder}
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
                  commitTitleIfChanged();
                  Keyboard.dismiss();
                }}
                testID={`${testIDPrefix}-title-input`}
              />

              <TextInput
                value={localDescription}
                onChangeText={setLocalDescription}
                onBlur={commitDescriptionIfChanged}
                placeholder={descriptionPlaceholder}
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.noteInput, { color: colors.text }]}
                testID={`${testIDPrefix}-description-input`}
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
              {/* 1. Priority Pill */}
              {showPriority && (
                <PressableScale
                  onPress={() => {
                    Keyboard.dismiss();
                    Haptics.selectionAsync().catch(() => {});
                    setShowPriorityPicker((prev) => !prev);
                  }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Priority: ${priorityDisplayName}`}
                  style={[
                    styles.propertyPill,
                    {
                      backgroundColor: hasActivePriority
                        ? `${priorityColor}18`
                        : isDark
                          ? "rgba(255, 255, 255, 0.05)"
                          : "rgba(0, 0, 0, 0.03)",
                      borderColor: hasActivePriority
                        ? `${priorityColor}40`
                        : isDark
                          ? "rgba(255, 255, 255, 0.12)"
                          : colors.border,
                    },
                  ]}
                  testID={`${testIDPrefix}-priority-pill`}
                >
                  <Feather
                    name="flag"
                    size={13}
                    color={hasActivePriority ? priorityColor : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.propertyPillText,
                      {
                        color: hasActivePriority ? colors.text : colors.textMuted,
                        fontWeight: hasActivePriority ? "600" : "500",
                      },
                    ]}
                  >
                    {priorityDisplayName}
                  </Text>
                </PressableScale>
              )}

              {/* 2. Reminder Pill */}
              {onPressReminder && (
                <PressableScale
                  onPress={async () => {
                    Keyboard.dismiss();
                    await commitPendingEdits();
                    close();
                    onPressReminder();
                  }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder: ${reminderLabel}`}
                  style={[
                    styles.propertyPill,
                    {
                      backgroundColor: hasReminder
                        ? `${colors.primary}18`
                        : isDark
                          ? "rgba(255, 255, 255, 0.05)"
                          : "rgba(0, 0, 0, 0.03)",
                      borderColor: hasReminder
                        ? `${colors.primary}40`
                        : isDark
                          ? "rgba(255, 255, 255, 0.12)"
                          : colors.border,
                    },
                  ]}
                  testID={`${testIDPrefix}-reminder-pill`}
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
              )}

              {/* 3. Schedule / Recurrence Pill */}
              {onPressSchedule && (
                <PressableScale
                  onPress={async () => {
                    Keyboard.dismiss();
                    await commitPendingEdits();
                    close();
                    onPressSchedule();
                  }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Schedule: ${scheduleLabel}`}
                  style={[
                    styles.propertyPill,
                    {
                      backgroundColor: hasSchedule
                        ? `${colors.primary}18`
                        : isDark
                          ? "rgba(255, 255, 255, 0.05)"
                          : "rgba(0, 0, 0, 0.03)",
                      borderColor: hasSchedule
                        ? `${colors.primary}40`
                        : isDark
                          ? "rgba(255, 255, 255, 0.12)"
                          : colors.border,
                    },
                  ]}
                  testID={`${testIDPrefix}-schedule-pill`}
                >
                  <Feather
                    name={scheduleIcon}
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
              )}

              {/* 4. Resources Pill */}
              {(totalResources > 0 || onAddResource) && (
                <PressableScale
                  onPress={() => {
                    Keyboard.dismiss();
                    Haptics.selectionAsync().catch(() => {});
                    if (onAddResource) {
                      onAddResource();
                    }
                  }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Resources: ${totalResources}`}
                  style={[
                    styles.propertyPill,
                    {
                      backgroundColor:
                        totalResources > 0
                          ? `${colors.primary}18`
                          : isDark
                            ? "rgba(255, 255, 255, 0.05)"
                            : "rgba(0, 0, 0, 0.03)",
                      borderColor:
                        totalResources > 0
                          ? `${colors.primary}40`
                          : isDark
                            ? "rgba(255, 255, 255, 0.12)"
                            : colors.border,
                    },
                  ]}
                  testID={`${testIDPrefix}-resources-pill`}
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
              )}
            </ScrollView>
          </View>

          {/* Inline Priority Selector */}
          {showPriorityPicker && (
            <View style={styles.prioritySelectorRow} testID={`${testIDPrefix}-priority-picker`}>
              {(["none", "low", "medium", "high"] as const).map((prio) => {
                const isSelected = (priority || "none") === prio;
                const prioColor =
                  prio === "none" ? colors.textMuted : TaskListPriorityColors[prio].dark;
                const label =
                  prio === "none" ? "None" : prio.charAt(0).toUpperCase() + prio.slice(1);

                return (
                  <PressableScale
                    key={prio}
                    onPress={async () => {
                      Keyboard.dismiss();
                      Haptics.selectionAsync().catch(() => {});
                      setShowPriorityPicker(false);
                      if (prio !== (priority || "none") && onSelectPriority) {
                        await onSelectPriority(prio as TaskPriority);
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
                          : isDark
                            ? "rgba(255, 255, 255, 0.04)"
                            : "rgba(0, 0, 0, 0.03)",
                        borderColor: isSelected ? prioColor : colors.border,
                      },
                    ]}
                    testID={`${testIDPrefix}-priority-option-${prio}`}
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



          {/* Optional Children/Modals */}
          {children}

          {/* Bottom Action: Open full details */}
          {onOpenFullDetails && (
            <PressableScale
              onPress={async () => {
                Keyboard.dismiss();
                await commitPendingEdits();
                close();
                onOpenFullDetails();
              }}
              haptic
              accessibilityRole="button"
              accessibilityLabel={fullDetailsLabel}
              style={[styles.fullDetailsRow, { borderTopColor: colors.border }]}
              testID={`${testIDPrefix}-full-details-button`}
            >
              <Text style={[styles.fullDetailsText, { color: colors.textMuted }]}>
                {fullDetailsLabel}
              </Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </PressableScale>
          )}
        </View>
      )}
    </AnimatedOverlay>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    height: 28,
  },
  dragHandleWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  leadingTarget: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  inputsColumn: {
    flex: 1,
    gap: 6,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: Typography.weights.semibold,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  noteInput: {
    fontSize: 14,
    fontWeight: Typography.weights.regular,
    paddingVertical: 2,
    paddingHorizontal: 0,
    minHeight: 22,
  },
  railWrapper: {
    marginBottom: 16,
  },
  railScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  propertyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  propertyPillText: {
    fontSize: 12,
    fontWeight: Typography.weights.medium,
  },
  prioritySelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  priorityOptionChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityOptionText: {
    fontSize: 12,
    fontWeight: Typography.weights.medium,
  },
  attachmentStripContainer: {
    marginBottom: 10,
    marginTop: -2,
  },
  attachmentStripScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 160,
  },
  attachmentChipText: {
    fontSize: 11,
    fontWeight: Typography.weights.medium,
  },
  attachmentAddButton: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyAttachmentContainer: {
    marginBottom: 8,
    marginTop: -4,
    flexDirection: "row",
    alignItems: "center",
  },
  emptyAddResourceAffordance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  emptyAddResourceText: {
    fontSize: 11,
    fontWeight: Typography.weights.medium,
  },

  fullDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  fullDetailsText: {
    fontSize: 14,
    fontWeight: Typography.weights.medium,
  },
});
