import React, { useState, useEffect, useMemo } from "react";
import { View, ScrollView, Pressable, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import PressableScale from "@/shared/components/ui/PressableScale";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { getCalendarEntityPresentation } from "@/features/calendar/constants/calendarEntityTokens";

export interface CalendarPlanningTarget {
  hour?: number;
  minute?: number;
  isAllDay?: boolean;
  gap?: {
    startMinutes: number;
    durationMinutes: number;
  };
}

interface SelectedPlanningEntity {
  id: string;
  type: "task" | "checklist" | "habit";
  title: string;
  item: any;
}

interface CalendarPlanningSheetProps {
  visible: boolean;
  target: CalendarPlanningTarget | null;
  pendingTasks: any[];
  pendingChecklists: any[];
  plannerHabits?: any[];
  onClose: () => void;
  onPlanTask: (
    taskId: string,
    target: { hour?: number; minute?: number; durationMinutes?: number; isAllDay?: boolean },
  ) => Promise<any>;
  onPlanChecklist: (
    checklistId: string,
    target: { hour?: number; minute?: number; durationMinutes?: number; isAllDay?: boolean },
  ) => Promise<any>;
  onPlanHabit?: (
    habitId: string,
    target: { hour?: number; minute?: number; isAllDay?: boolean },
  ) => Promise<any>;
  colors: any;
  isLight: boolean;
}

function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return formatReminderTime(h, m) || `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDurationLabel(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

export const CalendarPlanningSheet: React.FC<CalendarPlanningSheetProps> = ({
  visible,
  target,
  pendingTasks,
  pendingChecklists,
  plannerHabits = [],
  onClose,
  onPlanTask,
  onPlanChecklist,
  onPlanHabit,
  colors,
  isLight,
}) => {
  const taskConfig = getCalendarEntityPresentation("task", isLight);
  const checklistConfig = getCalendarEntityPresentation("checklist", isLight);
  const habitConfig = getCalendarEntityPresentation("habit", isLight);

  const [selectedEntity, setSelectedEntity] = useState<SelectedPlanningEntity | null>(null);
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  const [selectedDuration, setSelectedDuration] = useState<number>(60);

  // Initialize time defaults when target opens or changes
  useEffect(() => {
    if (target) {
      if (target.gap) {
        const startH = Math.floor(target.gap.startMinutes / 60);
        const startM = target.gap.startMinutes % 60;
        setSelectedHour(startH);
        setSelectedMinute(startM);
      } else if (target.hour !== undefined) {
        setSelectedHour(target.hour);
        setSelectedMinute(target.minute ?? 0);
      }
      setSelectedEntity(null);
    }
  }, [target, visible]);

  const hasUnplacedItems =
    pendingTasks.length > 0 || pendingChecklists.length > 0 || plannerHabits.length > 0;

  // Selected item selection handler
  const handleSelectItem = (id: string, type: "task" | "checklist" | "habit", title: string, item: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    let defaultDuration = 60;
    if (type === "checklist") {
      defaultDuration = item.schedule?.durationMinutes || 45;
    } else if (type === "task") {
      defaultDuration = item.schedule?.durationMinutes || 60;
    } else if (type === "habit") {
      defaultDuration = 20;
    }

    setSelectedEntity({ id, type, title, item });
    setSelectedDuration(defaultDuration);
  };

  // Time Stepper (-15m / +15m)
  const handleAdjustStart = (deltaMinutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const currentTotal = selectedHour * 60 + selectedMinute;
    let nextTotal = currentTotal + deltaMinutes;

    if (target?.gap) {
      const gapStart = target.gap.startMinutes;
      const gapEnd = target.gap.startMinutes + target.gap.durationMinutes;
      nextTotal = Math.max(gapStart, Math.min(gapEnd - 15, nextTotal));
    } else {
      nextTotal = Math.max(0, Math.min(1440 - 15, nextTotal));
    }

    setSelectedHour(Math.floor(nextTotal / 60));
    setSelectedMinute(nextTotal % 60);
  };

  // Fit & Remaining Time Calculation
  const startTotalMinutes = selectedHour * 60 + selectedMinute;
  const endTotalMinutes = startTotalMinutes + selectedDuration;

  const { fitsInGap, remainingMinutesAfter } = useMemo(() => {
    if (!target?.gap) {
      return { fitsInGap: true, remainingMinutesAfter: 0 };
    }
    const gapStart = target.gap.startMinutes;
    const gapEnd = target.gap.startMinutes + target.gap.durationMinutes;

    const fits = startTotalMinutes >= gapStart && endTotalMinutes <= gapEnd;
    const remaining = fits ? gapEnd - endTotalMinutes : 0;
    return { fitsInGap: fits, remainingMinutesAfter: remaining };
  }, [target?.gap, startTotalMinutes, endTotalMinutes]);

  // Duration Presets
  const durationPresets = useMemo(() => {
    const defaultList = [15, 30, 45, 60, 90, 120];
    if (selectedEntity?.item?.schedule?.durationMinutes) {
      const orig = selectedEntity.item.schedule.durationMinutes;
      if (!defaultList.includes(orig)) {
        defaultList.push(orig);
        defaultList.sort((a, b) => a - b);
      }
    }
    return defaultList;
  }, [selectedEntity]);

  return (
    <AnimatedOverlay visible={visible} onClose={onClose} type="bottom-sheet">
      {(close) => {
        if (!target) return null;

        const gapLabel = target.gap
          ? `${formatMinutesToTime(target.gap.startMinutes)} – ${formatMinutesToTime(
              target.gap.startMinutes + target.gap.durationMinutes,
            )} · ${formatDurationLabel(target.gap.durationMinutes)} available`
          : null;

        const targetTimeLabel = target.isAllDay
          ? "All Day"
          : gapLabel ||
            (target.hour !== undefined && target.minute !== undefined
              ? formatReminderTime(target.hour, target.minute) ||
                `${String(target.hour).padStart(2, "0")}:${String(target.minute).padStart(2, "0")}`
              : "Timeline");

        return (
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Sheet Header */}
            <View
              style={[
                styles.headerRow,
                {
                  borderBottomColor: isLight
                    ? "rgba(0,0,0,0.06)"
                    : "rgba(255,255,255,0.08)",
                },
              ]}
            >
              <View style={styles.headerTitleCol}>
                <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                  {target.isAllDay
                    ? "Plan for All Day"
                    : target.gap
                    ? "Plan in Free Time"
                    : `Place at ${targetTimeLabel}`}
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  {target.gap
                    ? gapLabel
                    : target.isAllDay
                    ? "Select an item to schedule for today"
                    : "Select an unplaced item to schedule"}
                </Text>
              </View>
              <Pressable
                onPress={close}
                hitSlop={8}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: isLight
                      ? "#F1F5F9"
                      : "rgba(255,255,255,0.06)",
                  },
                ]}
              >
                <Feather name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* STEP 1: ITEM SELECTION */}
            {!selectedEntity ? (
              !hasUnplacedItems ? (
                <View style={styles.emptyContainer}>
                  <Feather name="check-circle" size={28} color={colors.success} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    No Unplaced Items
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                    All tasks and checklists for this workspace are already scheduled.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.scrollList}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}
                >
                  {/* Tasks Section */}
                  {pendingTasks.length > 0 && (
                    <View style={styles.sectionGroup}>
                      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                        Tasks ({pendingTasks.length})
                      </Text>
                      {pendingTasks.map((task) => {
                        const taskDuration = task.schedule?.durationMinutes || 60;
                        return (
                          <PressableScale
                            key={task.id}
                            onPress={() => handleSelectItem(task.id, "task", task.title, task)}
                            scaleTo={0.98}
                            contentStyle={[
                              styles.itemRow,
                              {
                                borderBottomColor: isLight
                                  ? "rgba(0,0,0,0.05)"
                                  : "rgba(255,255,255,0.06)",
                              },
                            ]}
                          >
                            <View style={styles.itemLeft}>
                              <Feather name={taskConfig.icon} size={15} color={taskConfig.accent} />
                              <View style={styles.itemTextCol}>
                                <Text
                                  style={[styles.itemTitle, { color: colors.text }]}
                                  numberOfLines={1}
                                >
                                  {task.title}
                                </Text>
                                <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                                  {taskDuration} min
                                </Text>
                              </View>
                            </View>
                            <View
                              style={[
                                styles.selectButton,
                                { backgroundColor: `${taskConfig.accent}15` },
                              ]}
                            >
                              <Text
                                style={[styles.selectButtonText, { color: taskConfig.accent }]}
                              >
                                Select
                              </Text>
                              <Feather name="arrow-right" size={12} color={taskConfig.accent} />
                            </View>
                          </PressableScale>
                        );
                      })}
                    </View>
                  )}

                  {/* Checklists Section */}
                  {pendingChecklists.length > 0 && (
                    <View style={styles.sectionGroup}>
                      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                        Checklists ({pendingChecklists.length})
                      </Text>
                      {pendingChecklists.map((checklist) => {
                        const itemsSummary =
                          checklist.items && checklist.items.length > 0
                            ? checklist.items
                                .slice(0, 3)
                                .map((it: any) => it.title)
                                .join(" · ")
                            : "Empty checklist";
                        const duration = checklist.schedule?.durationMinutes || 45;

                        return (
                          <PressableScale
                            key={checklist.id}
                            onPress={() =>
                              handleSelectItem(
                                checklist.id,
                                "checklist",
                                checklist.title,
                                checklist,
                              )
                            }
                            scaleTo={0.98}
                            contentStyle={[
                              styles.itemRow,
                              {
                                borderBottomColor: isLight
                                  ? "rgba(0,0,0,0.05)"
                                  : "rgba(255,255,255,0.06)",
                              },
                            ]}
                          >
                            <View style={styles.itemLeft}>
                              <Feather
                                name={checklistConfig.icon}
                                size={15}
                                color={checklistConfig.accent}
                              />
                              <View style={styles.itemTextCol}>
                                <Text
                                  style={[styles.itemTitle, { color: colors.text }]}
                                  numberOfLines={1}
                                >
                                  {checklist.title}
                                </Text>
                                <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                                  {itemsSummary} · {duration}m
                                </Text>
                              </View>
                            </View>
                            <View
                              style={[
                                styles.selectButton,
                                { backgroundColor: `${checklistConfig.accent}15` },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.selectButtonText,
                                  { color: checklistConfig.accent },
                                ]}
                              >
                                Select
                              </Text>
                              <Feather
                                name="arrow-right"
                                size={12}
                                color={checklistConfig.accent}
                              />
                            </View>
                          </PressableScale>
                        );
                      })}
                    </View>
                  )}

                  {/* Habits Section */}
                  {plannerHabits.length > 0 && (
                    <View style={styles.sectionGroup}>
                      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                        Habits ({plannerHabits.length})
                      </Text>
                      {plannerHabits.map((habit) => (
                        <PressableScale
                          key={habit.id}
                          onPress={() =>
                            handleSelectItem(habit.id, "habit", habit.title, habit)
                          }
                          scaleTo={0.98}
                          contentStyle={[
                            styles.itemRow,
                            {
                              borderBottomColor: isLight
                                ? "rgba(0,0,0,0.05)"
                                : "rgba(255,255,255,0.06)",
                            },
                          ]}
                        >
                          <View style={styles.itemLeft}>
                            <Feather
                              name={habitConfig.icon}
                              size={15}
                              color={habitConfig.accent}
                            />
                            <View style={styles.itemTextCol}>
                              <Text
                                style={[styles.itemTitle, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {habit.title}
                              </Text>
                              <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                                Habit reminder
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.selectButton,
                              { backgroundColor: `${habitConfig.accent}15` },
                            ]}
                          >
                            <Text
                              style={[
                                styles.selectButtonText,
                                { color: habitConfig.accent },
                              ]}
                            >
                              Select
                            </Text>
                            <Feather
                              name="arrow-right"
                              size={12}
                              color={habitConfig.accent}
                            />
                          </View>
                        </PressableScale>
                      ))}
                    </View>
                  )}
                </ScrollView>
              )
            ) : (
              /* STEP 2: CONFIGURE TIME & DURATION */
              <View style={styles.step2Container}>
                {/* Selected Item Banner with Back Button */}
                <View
                  style={[
                    styles.selectedItemBanner,
                    {
                      backgroundColor: isLight
                        ? "#F8FAFC"
                        : "rgba(255,255,255,0.04)",
                      borderColor: isLight
                        ? "rgba(0,0,0,0.08)"
                        : "rgba(255,255,255,0.08)",
                    },
                  ]}
                >
                  <View style={styles.selectedBannerLeft}>
                    <Feather
                      name={
                        selectedEntity.type === "checklist"
                          ? checklistConfig.icon
                          : selectedEntity.type === "habit"
                          ? habitConfig.icon
                          : taskConfig.icon
                      }
                      size={16}
                      color={
                        selectedEntity.type === "checklist"
                          ? checklistConfig.accent
                          : selectedEntity.type === "habit"
                          ? habitConfig.accent
                          : taskConfig.accent
                      }
                    />
                    <View style={styles.selectedBannerTextCol}>
                      <Text
                        style={[styles.selectedBannerTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {selectedEntity.title}
                      </Text>
                      <Text
                        style={[
                          styles.selectedBannerType,
                          {
                            color:
                              selectedEntity.type === "checklist"
                                ? checklistConfig.accent
                                : selectedEntity.type === "habit"
                                ? habitConfig.accent
                                : taskConfig.accent,
                          },
                        ]}
                      >
                        {selectedEntity.type.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <PressableScale
                    onPress={() => setSelectedEntity(null)}
                    scaleTo={0.95}
                    contentStyle={[
                      styles.changeButton,
                      { borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.changeButtonText, { color: colors.textMuted }]}>
                      Change
                    </Text>
                  </PressableScale>
                </View>

                {/* Timed Scheduling Controls (if not All-Day) */}
                {!target.isAllDay && (
                  <View style={styles.timeControlsBox}>
                    {/* Start Time Stepper */}
                    <View style={styles.controlRow}>
                      <Text style={[styles.controlLabel, { color: colors.textMuted }]}>
                        START TIME
                      </Text>
                      <View style={styles.stepperContainer}>
                        <PressableScale
                          onPress={() => handleAdjustStart(-15)}
                          scaleTo={0.92}
                          contentStyle={[
                            styles.stepButton,
                            { borderColor: colors.border },
                          ]}
                        >
                          <Feather name="minus" size={13} color={colors.text} />
                        </PressableScale>

                        <View
                          style={[
                            styles.timeDisplayPill,
                            {
                              backgroundColor: isLight
                                ? "#FFFFFF"
                                : "rgba(255,255,255,0.06)",
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Feather name="clock" size={12} color={colors.textMuted} />
                          <Text style={[styles.timeDisplayText, { color: colors.text }]}>
                            {formatMinutesToTime(startTotalMinutes)}
                          </Text>
                        </View>

                        <PressableScale
                          onPress={() => handleAdjustStart(15)}
                          scaleTo={0.92}
                          contentStyle={[
                            styles.stepButton,
                            { borderColor: colors.border },
                          ]}
                        >
                          <Feather name="plus" size={13} color={colors.text} />
                        </PressableScale>
                      </View>
                    </View>

                    {/* Duration Chips (for Tasks and Checklists) */}
                    {selectedEntity.type !== "habit" && (
                      <View style={styles.controlRow}>
                        <Text style={[styles.controlLabel, { color: colors.textMuted }]}>
                          DURATION
                        </Text>
                        <View style={styles.chipsRow}>
                          {durationPresets.map((mins) => {
                            const isSelected = selectedDuration === mins;
                            return (
                              <PressableScale
                                key={mins}
                                onPress={() => {
                                  Haptics.impactAsync(
                                    Haptics.ImpactFeedbackStyle.Light,
                                  ).catch(() => {});
                                  setSelectedDuration(mins);
                                }}
                                scaleTo={0.95}
                                contentStyle={[
                                  styles.durationChip,
                                  {
                                    backgroundColor: isSelected
                                      ? taskConfig.accent
                                      : isLight
                                      ? "#FFFFFF"
                                      : "rgba(255,255,255,0.06)",
                                    borderColor: isSelected
                                      ? taskConfig.accent
                                      : colors.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.durationChipText,
                                    {
                                      color: isSelected ? "#FFFFFF" : colors.text,
                                      fontWeight: isSelected ? "700" : "600",
                                    },
                                  ]}
                                >
                                  {formatDurationLabel(mins)}
                                </Text>
                              </PressableScale>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Validation Notice or Remaining Free Time Hint */}
                    {target.gap && (
                      <View style={styles.validationNoticeRow}>
                        {!fitsInGap ? (
                          <View style={styles.errorBanner}>
                            <Feather name="alert-circle" size={13} color="#EF4444" />
                            <Text style={styles.errorBannerText}>
                              Doesn't fit in this free time (
                              {formatMinutesToTime(
                                target.gap.startMinutes +
                                  target.gap.durationMinutes,
                              )}{" "}
                              limit)
                            </Text>
                          </View>
                        ) : remainingMinutesAfter > 0 ? (
                          <View style={styles.remainingBanner}>
                            <Feather name="info" size={12} color={colors.primary} />
                            <Text
                              style={[styles.remainingBannerText, { color: colors.textMuted }]}
                            >
                              Leaves {formatDurationLabel(remainingMinutesAfter)} free
                              time after this
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.remainingBanner}>
                            <Feather name="check" size={12} color="#10B981" />
                            <Text
                              style={[styles.remainingBannerText, { color: "#10B981" }]}
                            >
                              Fills the entire free time slot
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Final Schedule Button */}
                <PressableScale
                  onPress={async () => {
                    if (!fitsInGap) return;
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    ).catch(() => {});

                    if (selectedEntity.type === "task") {
                      await onPlanTask(selectedEntity.id, {
                        hour: selectedHour,
                        minute: selectedMinute,
                        durationMinutes: selectedDuration,
                        isAllDay: target.isAllDay,
                      });
                    } else if (selectedEntity.type === "checklist") {
                      await onPlanChecklist(selectedEntity.id, {
                        hour: selectedHour,
                        minute: selectedMinute,
                        durationMinutes: selectedDuration,
                        isAllDay: target.isAllDay,
                      });
                    } else if (selectedEntity.type === "habit" && onPlanHabit) {
                      await onPlanHabit(selectedEntity.id, {
                        hour: selectedHour,
                        minute: selectedMinute,
                        isAllDay: target.isAllDay,
                      });
                    }
                    close();
                  }}
                  scaleTo={0.97}
                  contentStyle={[
                    styles.schedulePrimaryButton,
                    {
                      backgroundColor: !fitsInGap
                        ? colors.textMuted
                        : taskConfig.accent,
                      opacity: !fitsInGap ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={styles.schedulePrimaryButtonText}>
                    {target.isAllDay
                      ? "Schedule for All Day"
                      : `Schedule · ${formatMinutesToTime(startTotalMinutes)} – ${formatMinutesToTime(endTotalMinutes)}`}
                  </Text>
                  <Feather name="check" size={15} color="#FFFFFF" />
                </PressableScale>
              </View>
            )}

            {/* Cancel Button */}
            <PressableScale
              onPress={close}
              scaleTo={0.97}
              contentStyle={styles.cancelButton}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textMuted }]}>
                Cancel
              </Text>
            </PressableScale>
          </View>
        );
      }}
    </AnimatedOverlay>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    gap: 12,
    maxHeight: 560,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleCol: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12.5,
    fontWeight: "500",
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  scrollList: {
    maxHeight: 320,
  },
  scrollContent: {
    gap: 16,
  },
  sectionGroup: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemTextCol: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  selectButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  step2Container: {
    gap: 14,
    paddingVertical: 4,
  },
  selectedItemBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  selectedBannerTextCol: {
    flex: 1,
    gap: 1,
  },
  selectedBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  selectedBannerType: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  changeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  changeButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  timeControlsBox: {
    gap: 12,
  },
  controlRow: {
    gap: 6,
  },
  controlLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timeDisplayPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
  },
  timeDisplayText: {
    fontSize: 14,
    fontWeight: "700",
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  durationChipText: {
    fontSize: 12,
  },
  validationNoticeRow: {
    paddingTop: 2,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  errorBannerText: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "600",
    flex: 1,
  },
  remainingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  remainingBannerText: {
    fontSize: 12,
    fontWeight: "500",
  },
  schedulePrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  schedulePrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
