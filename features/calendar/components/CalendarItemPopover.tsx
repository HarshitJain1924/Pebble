import React, { useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import PressableScale from "@/shared/components/ui/PressableScale";
import { getCalendarItemType, CalendarViewContext } from "@/features/calendar/types";
import { getCalendarEntityPresentation } from "@/features/calendar/constants/calendarEntityTokens";

export interface CalendarPopoverItem {
  id: string;
  title: string;
  type: string;
  startHour?: number;
  startMinute?: number;
  durationMinutes?: number;
  timeLabel?: string;
  priority?: string;
  completed?: boolean;
  streak?: number;
  recurrence?: string;
  items?: Array<{ title: string; completed?: boolean }>;
  itemsCount?: number;
  completedItemsCount?: number;
  workspaceId?: string;
  [key: string]: any;
}

interface CalendarItemPopoverProps {
  visible: boolean;
  item: CalendarPopoverItem | null;
  selectedDate: string;
  viewContext?: CalendarViewContext;
  onClose: () => void;
  onOpenDetails: (item: CalendarPopoverItem) => void;
  onToggleCompleteTask?: (taskId: string, workspaceId?: string) => Promise<void> | void;
  onToggleCompleteHabit?: (habitId: string, workspaceId?: string) => Promise<void> | void;
  colors: any;
  isLight: boolean;
}

function formatPopoverTime(h?: number, m?: number, durationMinutes?: number): string {
  if (h === undefined || m === undefined) {
    return "All Day";
  }

  const formatH = (hour: number) => {
    const dh = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return dh;
  };
  const formatM = (min: number) => (min < 10 ? `0${min}` : `${min}`);
  const ampm = (hour: number) => (hour >= 12 ? "PM" : "AM");

  const startStr = `${formatH(h)}:${formatM(m)} ${ampm(h)}`;

  if (durationMinutes && durationMinutes > 0) {
    const endTotalMinutes = h * 60 + m + durationMinutes;
    const endH = Math.floor(endTotalMinutes / 60) % 24;
    const endM = endTotalMinutes % 60;
    const endStr = `${formatH(endH)}:${formatM(endM)} ${ampm(endH)}`;

    const hrs = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const durStr = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;

    return `${startStr} – ${endStr} · ${durStr}`;
  }

  return startStr;
}

export const CalendarItemPopover: React.FC<CalendarItemPopoverProps> = React.memo(({
  visible,
  item,
  selectedDate,
  viewContext = "day",
  onClose,
  onOpenDetails,
  onToggleCompleteTask,
  onToggleCompleteHabit,
  colors,
  isLight,
}) => {
  if (!item) return null;

  const type = getCalendarItemType(item);
  const config = getCalendarEntityPresentation(type, isLight);
  const isCompleted = !!item.completed;
  const showProgress = viewContext === "week" && type === "checklist";

  // Metadata
  const timeFormatted = formatPopoverTime(item.startHour, item.startMinute, item.durationMinutes);
  const totalItems = item.itemsCount ?? item.items?.length ?? 0;
  const completedItems = item.completedItemsCount ?? item.items?.filter((i: any) => i.completed)?.length ?? 0;
  const isHighPriority = item.priority === "high";

  return (
    <AnimatedOverlay
      visible={visible}
      onClose={onClose}
      type="center-modal"
    >
      {(close) => (
        <View
          style={[
            styles.card,
            {
              backgroundColor: isLight ? "#FFFFFF" : colors.card,
              borderColor: isLight ? "rgba(0,0,0,0.08)" : config.borderColor,
            },
          ]}
        >
          {/* Header Row: Entity Icon Badge + Title + Close Button */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.entityBadge,
                {
                  backgroundColor: config.surface,
                  borderColor: config.borderColor,
                },
              ]}
            >
              <Feather name={config.icon} size={15} color={config.accent} />
            </View>

            <View style={styles.headerTextCol}>
              <Text
                style={[
                  styles.titleText,
                  {
                    color: isCompleted ? colors.textMuted : colors.text,
                    textDecorationLine: isCompleted ? "line-through" : "none",
                  },
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text style={[styles.entityTypeLabel, { color: config.accent }]}>
                {config.label.toUpperCase()}
              </Text>
            </View>

            <Pressable
              onPress={close}
              hitSlop={8}
              style={[
                styles.closeButton,
                {
                  backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.06)",
                },
              ]}
            >
              <Feather name="x" size={15} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Body: Contextual Temporal & State Information */}
          <View style={styles.bodyContainer}>
            {/* Time / Duration Row */}
            <View style={styles.metaRow}>
              <Feather name="clock" size={13} color={colors.textMuted} />
              <Text style={[styles.metaRowText, { color: colors.text }]}>
                {timeFormatted}
              </Text>
            </View>

            {/* Task Priority & Status */}
            {type === "task" && (
              <View style={styles.detailsRow}>
                {isHighPriority && (
                  <View style={styles.priorityPill}>
                    <View style={styles.priorityDot} />
                    <Text style={styles.priorityText}>High Priority</Text>
                  </View>
                )}
                {isCompleted && (
                  <View style={styles.completedStatusPill}>
                    <Feather name="check" size={11} color="#10B981" />
                    <Text style={styles.completedStatusText}>Completed</Text>
                  </View>
                )}
              </View>
            )}

            {/* Habit Recurrence & Streak */}
            {type === "habit" && (
              <View style={styles.detailsRow}>
                <View style={styles.habitMetaPill}>
                  <Feather name="repeat" size={11} color={config.accent} />
                  <Text style={[styles.habitMetaText, { color: config.accent }]}>
                    {item.streak ? `${item.streak} day streak` : "Daily habit"}
                  </Text>
                </View>
                {isCompleted && (
                  <View style={styles.completedStatusPill}>
                    <Feather name="check" size={11} color="#10B981" />
                    <Text style={styles.completedStatusText}>Done today</Text>
                  </View>
                )}
              </View>
            )}

            {/* Checklist Progress & Preview (Week View Only) */}
            {showProgress && (
              <View style={styles.checklistSection}>
                <View style={styles.checklistProgressRow}>
                  <Text style={[styles.checklistProgressLabel, { color: colors.textMuted }]}>
                    Progress
                  </Text>
                  <Text style={[styles.progressCountText, { color: colors.text }]}>
                    {`${completedItems} / ${totalItems} completed`}
                  </Text>
                </View>

                {/* Compact visually meaningful progress bar */}
                <View
                  style={[
                    styles.progressBarTrack,
                    {
                      backgroundColor: isLight
                        ? "rgba(0,0,0,0.06)"
                        : "rgba(255,255,255,0.08)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${
                          totalItems > 0
                            ? Math.min(100, Math.round((completedItems / totalItems) * 100))
                            : 0
                        }%`,
                        backgroundColor:
                          isCompleted || (totalItems > 0 && completedItems === totalItems)
                            ? "#10B981"
                            : config.accent,
                      },
                    ]}
                  />
                </View>

                {item.items && item.items.length > 0 && (
                  <View style={styles.checklistPreviewBox}>
                    {item.items.slice(0, 3).map((it: any, idx: number) => (
                      <View key={idx} style={styles.previewItemRow}>
                        <Feather
                          name={it.completed ? "check-circle" : "circle"}
                          size={12}
                          color={it.completed ? "#10B981" : colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.previewItemText,
                            {
                              color: it.completed ? colors.textMuted : colors.text,
                              textDecorationLine: it.completed
                                ? "line-through"
                                : "none",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {it.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Divider */}
          <View
            style={[
              styles.divider,
              {
                backgroundColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
              },
            ]}
          />

          {/* Actions Hierarchy */}
          <View style={styles.actionsRow}>
            {/* Secondary Action: See Details (for Task & Habit only) */}
            {type !== "checklist" && (
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  close();
                  onOpenDetails(item);
                }}
                scaleTo={0.97}
                contentStyle={[
                  styles.secondaryButton,
                  {
                    borderColor: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)",
                  },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                  See details
                </Text>
              </PressableScale>
            )}

            {/* Primary Action: Complete Toggle for Task/Habit or Open for Checklist */}
            {type === "task" && onToggleCompleteTask && (
              <PressableScale
                onPress={async () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  close();
                  await onToggleCompleteTask(item.id, item.workspaceId);
                }}
                scaleTo={0.97}
                contentStyle={[
                  styles.primaryButton,
                  {
                    backgroundColor: isCompleted
                      ? isLight ? "#F1F5F9" : "rgba(255,255,255,0.1)"
                      : config.accent,
                  },
                ]}
              >
                <Feather
                  name={isCompleted ? "rotate-ccw" : "check"}
                  size={14}
                  color={isCompleted ? colors.text : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: isCompleted ? colors.text : "#FFFFFF" },
                  ]}
                >
                  {isCompleted ? "Mark incomplete" : "Complete"}
                </Text>
              </PressableScale>
            )}

            {type === "habit" && onToggleCompleteHabit && (
              <PressableScale
                onPress={async () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  close();
                  await onToggleCompleteHabit(item.id, item.workspaceId);
                }}
                scaleTo={0.97}
                contentStyle={[
                  styles.primaryButton,
                  {
                    backgroundColor: isCompleted
                      ? isLight ? "#F1F5F9" : "rgba(255,255,255,0.1)"
                      : config.accent,
                  },
                ]}
              >
                <Feather
                  name={isCompleted ? "rotate-ccw" : "check"}
                  size={14}
                  color={isCompleted ? colors.text : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: isCompleted ? colors.text : "#FFFFFF" },
                  ]}
                >
                  {isCompleted ? "Mark incomplete" : "Complete today"}
                </Text>
              </PressableScale>
            )}

            {type === "checklist" && (
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  close();
                  onOpenDetails(item);
                }}
                scaleTo={0.97}
                contentStyle={[
                  styles.primaryButton,
                  {
                    backgroundColor: config.accent,
                  },
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: "#FFFFFF" }]}>
                  Open checklist
                </Text>
                <Feather name="arrow-right" size={14} color="#FFFFFF" />
              </PressableScale>
            )}
          </View>
        </View>
      )}
    </AnimatedOverlay>
  );
});

CalendarItemPopover.displayName = "CalendarItemPopover";

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  entityBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  entityTypeLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  bodyContainer: {
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaRowText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#EF4444",
  },
  priorityText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#EF4444",
  },
  completedStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  completedStatusText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#10B981",
  },
  habitMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  habitMetaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  checklistSection: {
    gap: 7,
    marginTop: 2,
  },
  checklistProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checklistProgressLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  progressCountText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    width: "100%",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  checklistPreviewBox: {
    gap: 4,
    paddingTop: 2,
  },
  previewItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewItemText: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
});
