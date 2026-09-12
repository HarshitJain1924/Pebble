import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { type ThemeColors } from "@/shared/constants/theme";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";
import { type NowFocusResult } from "@/features/today/utils/getNowFocus";
import { getHabitCurrentStreak } from "@/shared/utils/domain-selectors";

export const PRIORITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#64748B",
};

export interface NowFocusCardProps {
  focus: NowFocusResult;
  /** Direct completion of an active/recommended Task or Habit. */
  onComplete?: (focus: NowFocusResult) => void;
  /** Direct completion of a single checklist item by id. */
  onCompleteChecklistItem?: (focus: NowFocusResult, itemId: string) => void;
  /** Enter execution/focus mode for the focus item. */
  onStartFocus?: (focus: NowFocusResult) => void;
  /** Open the item's management surface (details page). */
  onPressCard?: (focus: NowFocusResult) => void;
  /** Inspect-only action for UP NEXT items. Never starts focus. */
  onViewFocus?: (focus: NowFocusResult) => void;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  style?: StyleProp<ViewStyle>;
}

function resolveDurationChipText(focus: NowFocusResult): string | null {
  if (focus.state === "active") {
    if (focus.remainingMinutes !== undefined) {
      return `${focus.remainingMinutes} min left`;
    }
    if (focus.durationMinutes !== undefined) {
      return `${focus.durationMinutes} min`;
    }
    return null;
  }
  if (focus.state === "recommended") {
    if (focus.durationMinutes !== undefined) {
      return `~${focus.durationMinutes} min`;
    }
    return "~25 min";
  }
  if (focus.state === "upcoming") {
    if (focus.nextScheduledTime) {
      return focus.nextScheduledTime;
    }
    if (focus.timeLabel) {
      const match = focus.timeLabel.match(/Starts at (.+)/i);
      return match ? match[1] : focus.timeLabel;
    }
    return null;
  }
  return null;
}

/**
 * NowFocusCard
 *
 * Pebble's "what should I do right now?" execution surface on Today.
 *
 * Visual hierarchy:
 * 1. Status / priority stripe on the left
 * 2. Header row: Eyebrow badge (NOW / NOW · RECOMMENDED / UP NEXT) + compact duration pill
 * 3. Title & context subtitle (pressable gateway to item details)
 * 4. Distinct execution surfaces:
 *    - Checklist: progress summary + progress bar + "NEXT ITEM" capsule row (checkbox + title + chevron)
 *    - Task/Habit: direct "Complete" + "Focus on this" action buttons
 *    - UP NEXT: inspect-only "View details" action
 *
 * Purely presentational: no business or scheduling logic lives inside this component.
 */
export const NowFocusCard: React.FC<NowFocusCardProps> = ({
  focus,
  onComplete,
  onCompleteChecklistItem,
  onStartFocus,
  onPressCard,
  onViewFocus,
  colors,
  colorScheme,
  style,
}) => {
  const isDark = colorScheme !== "light";

  // ─────────────────────────────────────────────────────────────
  // 1. EMPTY STATE
  // ─────────────────────────────────────────────────────────────
  if (focus.state === "empty" || !focus.item) {
    return (
      <Animated.View
        entering={FadeInDown.duration(350)}
        style={[styles.container, style]}
        testID="now-focus-card-empty"
      >
        <View
          style={[
            styles.cardSurface,
            {
              backgroundColor: isDark ? "rgba(24, 24, 27, 0.7)" : "#F8FAFC",
              borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
            },
          ]}
        >
          <View style={styles.emptyContent}>
            <View
              style={[
                styles.emptyIconBadge,
                {
                  backgroundColor: isDark
                    ? "rgba(99, 102, 241, 0.12)"
                    : "rgba(99, 102, 241, 0.08)",
                },
              ]}
            >
              <Feather
                name="feather"
                size={18}
                color={colors.primary || "#6366F1"}
                style={styles.emptyIcon}
              />
            </View>
            <View style={styles.emptyTextColumn}>
              <Text
                style={[styles.emptyTitle, { color: colors.text }]}
                numberOfLines={2}
              >
                Nothing needs your attention right now.
              </Text>
              <Text
                style={[styles.emptySubtitle, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                Enjoy the calm or take a small breather.
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ACTIVE, RECOMMENDED, or UPCOMING STATE
  // ─────────────────────────────────────────────────────────────
  const { state, type, item, timeLabel, contextLabel, checklistState } = focus;

  const isExecutionState = state === "active" || state === "recommended";
  const isChecklistExecution = isExecutionState && type === "checklist";
  const nextChecklistItem = isChecklistExecution
    ? checklistState?.nextItem ?? null
    : null;

  // Navigation / Action handlers
  const handleViewPress = () => {
    if (onViewFocus) {
      onViewFocus(focus);
    } else if (onPressCard) {
      onPressCard(focus);
    }
  };

  const handleCardPress = () => {
    if (state === "upcoming") {
      handleViewPress();
      return;
    }
    if (onPressCard) {
      onPressCard(focus);
    }
  };

  const handleCompletePress = () => {
    onComplete?.(focus);
  };

  const handleFocusPress = () => {
    onStartFocus?.(focus);
  };

  const handleChecklistItemPress = (itemId: string) => {
    onCompleteChecklistItem?.(focus, itemId);
  };

  // Resolve metadata: priority, type, context
  let priorityColor: string | undefined = undefined;
  let typeLabel = "Task";
  let contextDetail = "";

  if (type === "task") {
    const task = item as Task;
    typeLabel = "Task";
    if (task.priority && task.priority !== "none") {
      priorityColor = PRIORITY_COLORS[task.priority];
    }
    if (task.priority === "high") {
      contextDetail = "High priority";
    } else if (task.priority === "medium") {
      contextDetail = "Medium priority";
    }
  } else if (type === "habit") {
    const habit = item as Habit;
    typeLabel = "Habit";
    const streak = getHabitCurrentStreak(habit);
    if (streak > 0) {
      contextDetail = `${streak} day streak 🔥`;
    }
  } else if (type === "checklist") {
    typeLabel = "Checklist";
    const total = checklistState?.total ?? 0;
    if (total > 0) {
      contextDetail = `${checklistState?.completedCount ?? 0} of ${total} complete`;
    }
  }

  // Eyebrow configuration
  let eyebrowText = "NOW";
  let eyebrowIcon: "circle" | "compass" | "clock" = "circle";

  if (state === "active") {
    eyebrowText = "NOW";
    eyebrowIcon = "circle";
  } else if (state === "recommended") {
    eyebrowText = "NOW · RECOMMENDED";
    eyebrowIcon = "compass";
  } else if (state === "upcoming") {
    eyebrowText = "UP NEXT";
    eyebrowIcon = "clock";
  }

  // Duration / Timing pill text
  const durationChipText = resolveDurationChipText(focus);

  // Compose subtitle based on state and product guidelines
  const subtitleParts: string[] = [];
  if (state === "upcoming") {
    if (timeLabel) subtitleParts.push(timeLabel);
    subtitleParts.push(typeLabel);
  } else if (state === "recommended") {
    if (contextLabel) {
      subtitleParts.push(contextLabel);
    } else {
      subtitleParts.push("Open schedule · Good time to start");
    }
  } else {
    // Active state
    if (timeLabel) subtitleParts.push(timeLabel);
    if (type === "checklist") {
      subtitleParts.push(typeLabel);
    } else {
      if (contextDetail) subtitleParts.push(contextDetail);
      subtitleParts.push(typeLabel);
    }
  }
  const subtitleDisplay = subtitleParts.join(" · ");

  // Progress metrics for checklist
  const completedCount = checklistState?.completedCount ?? 0;
  const totalCount = checklistState?.total ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      style={[styles.container, style]}
      testID={`now-focus-card-${state}`}
    >
      <View
        style={[
          styles.cardSurface,
          {
            backgroundColor: isDark ? "rgba(24, 24, 27, 0.88)" : "#FFFFFF",
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
          },
        ]}
      >
        {/* Left priority / status accent stripe */}
        <View
          style={[
            styles.leftStripe,
            {
              backgroundColor:
                priorityColor ||
                (state === "active"
                  ? colors.primary || "#6366F1"
                  : state === "recommended"
                    ? "#10B981"
                    : state === "upcoming"
                      ? "#8B5CF6"
                      : "transparent"),
            },
          ]}
        />

        <View style={styles.cardInner}>
          {/* ─────────────────────────────────────────────────────────────
              1. Top Eyebrow Header Row: Eyebrow on left, duration chip on right
              ───────────────────────────────────────────────────────────── */}
          <View style={styles.headerRow}>
            {/* Eyebrow badge */}
            <View style={styles.eyebrowContainer}>
              {state === "active" ? (
                <View style={styles.liveIndicatorWrap}>
                  <View
                    style={[
                      styles.liveDotOuter,
                      {
                        backgroundColor: isDark
                          ? "rgba(99, 102, 241, 0.25)"
                          : "rgba(99, 102, 241, 0.15)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.liveDotInner,
                        { backgroundColor: colors.primary || "#6366F1" },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.eyebrowText,
                      { color: colors.primary || "#6366F1" },
                    ]}
                    numberOfLines={1}
                  >
                    {eyebrowText}
                  </Text>
                </View>
              ) : (
                <View style={styles.eyebrowBadgeWrap}>
                  <Feather
                    name={eyebrowIcon === "clock" ? "clock" : "compass"}
                    size={12}
                    color={
                      state === "recommended"
                        ? "#10B981"
                        : "#8B5CF6"
                    }
                    style={styles.eyebrowIcon}
                  />
                  <Text
                    style={[
                      styles.eyebrowText,
                      {
                        color:
                          state === "recommended"
                            ? "#10B981"
                            : "#8B5CF6",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {eyebrowText}
                  </Text>
                </View>
              )}
            </View>

            {/* Compact Duration / Timing Chip */}
            {durationChipText ? (
              <View
                style={[
                  styles.durationChip,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.04)",
                  },
                ]}
              >
                <Feather
                  name="clock"
                  size={11}
                  color={colors.textMuted}
                  style={styles.durationChipIcon}
                />
                <Text
                  style={[styles.durationChipText, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {durationChipText}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ─────────────────────────────────────────────────────────────
              2. Title & Context Subtitle (Details pressable gateway)
              ───────────────────────────────────────────────────────────── */}
          <PressableScale
            onPress={handleCardPress}
            haptic
            scaleTo={0.99}
            style={styles.detailsArea}
            contentStyle={styles.detailsAreaContent}
            accessibilityRole="button"
            accessibilityLabel={`${eyebrowText}: ${item.title}`}
          >
            <Text
              style={[styles.titleText, { color: colors.text }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {subtitleDisplay ? (
              <Text
                style={[styles.subtitleText, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {subtitleDisplay}
              </Text>
            ) : null}
          </PressableScale>

          {/* ─────────────────────────────────────────────────────────────
              3. Checklist Execution Surface
              ───────────────────────────────────────────────────────────── */}
          {isChecklistExecution ? (
            <View style={styles.checklistSection}>
              {/* Progress summary & percentage */}
              <View style={styles.checklistProgressRow}>
                <Text
                  style={[styles.checklistProgressText, { color: colors.textMuted }]}
                  numberOfLines={1}
                  testID="now-focus-checklist-progress"
                >
                  {`${completedCount} of ${totalCount} complete`}
                </Text>
                <Text
                  style={[styles.checklistProgressPercent, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {`${progressPercent}%`}
                </Text>
              </View>

              {/* Subtle Progress Bar */}
              <View
                style={[
                  styles.checklistProgressBarTrack,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.06)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.checklistProgressBarFill,
                    {
                      width: `${progressPercent}%`,
                      backgroundColor:
                        state === "recommended"
                          ? "#10B981"
                          : colors.primary || "#6366F1",
                    },
                  ]}
                />
              </View>

              {/* Single next actionable item row */}
              {nextChecklistItem ? (
                <View style={styles.checklistNextItemContainer}>
                  <Text
                    style={[styles.checklistNextItemLabel, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    NEXT ITEM
                  </Text>
                  <PressableScale
                    onPress={() => handleChecklistItemPress(nextChecklistItem.id)}
                    haptic
                    scaleTo={0.98}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: false }}
                    accessibilityLabel={`Complete checklist item ${nextChecklistItem.title}`}
                    testID="now-focus-checklist-item"
                    style={[
                      styles.checklistItemRow,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(0, 0, 0, 0.025)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.08)"
                          : "rgba(0, 0, 0, 0.06)",
                      },
                    ]}
                    contentStyle={styles.checklistItemRowContent}
                  >
                    <View
                      testID="now-focus-checklist-item-checkbox"
                      style={[
                        styles.checklistItemCheckbox,
                        {
                          borderColor: isDark
                            ? "rgba(255, 255, 255, 0.35)"
                            : "rgba(0, 0, 0, 0.25)",
                        },
                      ]}
                    />
                    <Text
                      style={[styles.checklistItemTitle, { color: colors.text }]}
                      numberOfLines={1}
                      testID="now-focus-checklist-item-title"
                    >
                      {nextChecklistItem.title}
                    </Text>
                    <Feather
                      name="chevron-right"
                      size={15}
                      color={isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.25)"}
                      style={styles.chevronIcon}
                    />
                  </PressableScale>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ─────────────────────────────────────────────────────────────
              4. Task & Habit Execution Surface (Complete + Focus on this)
              ───────────────────────────────────────────────────────────── */}
          {isExecutionState && type !== "checklist" ? (
            <View style={styles.actionRow}>
              <PressableScale
                onPress={handleCompletePress}
                haptic
                scaleTo={0.96}
                contentStyle={styles.actionButtonContent}
                style={[
                  styles.actionPill,
                  styles.completePill,
                  { backgroundColor: colors.primary || "#6366F1" },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Complete ${item.title}`}
                testID="now-focus-complete-button"
              >
                <Feather
                  name="check"
                  size={14}
                  color="#FFFFFF"
                  style={styles.actionButtonIcon}
                />
                <Text
                  style={[styles.actionButtonText, { color: "#FFFFFF" }]}
                  numberOfLines={1}
                >
                  Complete
                </Text>
              </PressableScale>

              <PressableScale
                onPress={handleFocusPress}
                haptic
                scaleTo={0.96}
                contentStyle={styles.actionButtonContent}
                style={[
                  styles.actionPill,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.05)",
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(0, 0, 0, 0.08)",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Focus on ${item.title}`}
                testID="now-focus-action-button"
              >
                <Feather
                  name="play"
                  size={12}
                  color={colors.text}
                  style={styles.actionButtonIcon}
                />
                <Text
                  style={[styles.actionButtonText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Focus on this
                </Text>
              </PressableScale>
            </View>
          ) : null}

          {/* ─────────────────────────────────────────────────────────────
              5. UP NEXT Surface (Inspect-only View details button)
              ───────────────────────────────────────────────────────────── */}
          {state === "upcoming" ? (
            <View style={styles.upcomingActionRow}>
              <PressableScale
                onPress={handleViewPress}
                haptic
                scaleTo={0.96}
                contentStyle={styles.upcomingPillContent}
                style={[
                  styles.upcomingPill,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.05)",
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(0, 0, 0, 0.08)",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`View ${item.title}`}
                testID="now-focus-action-button"
              >
                <Text
                  style={[styles.actionButtonText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  View details
                </Text>
                <Feather
                  name="chevron-right"
                  size={14}
                  color={colors.text}
                  style={styles.actionButtonIcon}
                />
              </PressableScale>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  cardSurface: {
    width: "100%",
    minWidth: 0,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    flexDirection: "row",
    alignItems: "stretch",
  },
  leftStripe: {
    width: 4,
    flexShrink: 0,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  cardInner: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minWidth: 0,
    gap: 8,
  },
  eyebrowContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  liveIndicatorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    maxWidth: "100%",
  },
  liveDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  liveDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eyebrowBadgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    maxWidth: "100%",
  },
  eyebrowIcon: {
    flexShrink: 0,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  durationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    flexShrink: 0,
  },
  durationChipIcon: {
    flexShrink: 0,
  },
  durationChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  detailsArea: {
    width: "100%",
    minWidth: 0,
  },
  detailsAreaContent: {
    width: "100%",
    minWidth: 0,
    gap: 3,
  },
  titleText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  checklistSection: {
    width: "100%",
    minWidth: 0,
    gap: 6,
    marginTop: 2,
  },
  checklistProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minWidth: 0,
    gap: 8,
  },
  checklistProgressText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    minWidth: 0,
  },
  checklistProgressPercent: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 0,
  },
  checklistProgressBarTrack: {
    height: 5,
    borderRadius: 3,
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
  },
  checklistProgressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  checklistNextItemContainer: {
    width: "100%",
    minWidth: 0,
    gap: 6,
    marginTop: 4,
  },
  checklistNextItemLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  checklistItemRow: {
    width: "100%",
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: "center",
  },
  checklistItemRowContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    gap: 10,
  },
  checklistItemCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    flexShrink: 0,
  },
  checklistItemTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
  },
  chevronIcon: {
    flexShrink: 0,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minWidth: 0,
    marginTop: 2,
  },
  actionPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  completePill: {
    borderWidth: 0,
  },
  upcomingActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "100%",
    minWidth: 0,
    marginTop: 2,
  },
  upcomingPill: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingPillContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  actionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  actionButtonIcon: {
    flexShrink: 0,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  emptyContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  emptyIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emptyIcon: {
    flexShrink: 0,
  },
  emptyTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
  },
});
