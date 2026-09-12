import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { type ThemeColors } from "@/shared/constants/theme";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";
import {
  type NowFocusResult,
} from "@/features/today/utils/getNowFocus";

export const PRIORITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#64748B",
};
import { getHabitCurrentStreak } from "@/shared/utils/domain-selectors";

export interface NowFocusCardProps {
  focus: NowFocusResult;
  /**
   * Direct completion of an active/recommended Task or Habit.
   * The caller owns the canonical completion flow — this component never mutates.
   */
  onComplete?: (focus: NowFocusResult) => void;
  /**
   * Direct completion of a single checklist item by id.
   * The caller owns the canonical checklist item flow — this component never mutates.
   */
  onCompleteChecklistItem?: (focus: NowFocusResult, itemId: string) => void;
  /** Enter execution/focus mode (Zen) for the focus item. */
  onStartFocus?: (focus: NowFocusResult) => void;
  /** Open the item's management surface (details page). */
  onPressCard?: (focus: NowFocusResult) => void;
  /** Inspect-only action for UP NEXT items. Never starts focus. */
  onViewFocus?: (focus: NowFocusResult) => void;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  style?: StyleProp<ViewStyle>;
}

/**
 * NowFocusCard
 *
 * Renders Pebble's single primary focus for Today:
 * - ACTIVE: Currently active scheduled window ("NOW" + live accent)
 * - RECOMMENDED: Free time recommendation fitting duration ("NOW" + sparkle)
 * - UPCOMING: Next scheduled activity ("UP NEXT") — inspect only, never execution
 * - EMPTY: Calm status when nothing requires immediate focus
 *
 * Execution semantics (smallest clean change on top of the existing surface):
 * - ACTIVE / RECOMMENDED: direct "Complete" (Task/Habit) or an inline
 *   next-item checkbox (Checklist), plus "Focus on this". Details live on the
 *   card/title press.
 * - UPCOMING: "View details" only. Never completes, never starts focus.
 *
 * Purely presentational: every mutation is emitted as a semantic callback
 * (onComplete / onCompleteChecklistItem / onStartFocus / onViewFocus) and
 * executed by the caller through Pebble's canonical command paths.
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
              backgroundColor: isDark ? "rgba(30, 41, 59, 0.45)" : "#F8FAFC",
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
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: colors.text },
                ]}
              >
                Nothing needs your attention right now.
              </Text>
              <Text
                style={[
                  styles.emptySubtitle,
                  { color: colors.textMuted },
                ]}
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

  // Execution states own direct progress; UPCOMING is inspect-only.
  const isExecutionState = state === "active" || state === "recommended";
  const isChecklistExecution = isExecutionState && type === "checklist";
  const nextChecklistItem = isChecklistExecution
    ? checklistState?.nextItem ?? null
    : null;
  const showDirectComplete = isExecutionState && type !== "checklist";

  // UP NEXT never starts focus — it only inspects the item.
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
    // Execution states: card/title is the management (details) affordance.
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

  // Resolve item-specific metadata
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

  // For checklist execution the progress is rendered on its own line beneath the
  // subtitle (hierarchy stays on the current item), so keep it out of the subtitle.
  const progressInSubtitle = type !== "checklist";

  // Eyebrow and accent resolution
  let eyebrowText = "NOW";
  let eyebrowIcon: "circle" | "sparkles" | "clock" = "circle";
  let isLiveActive = false;

  if (state === "active") {
    eyebrowText = "NOW";
    eyebrowIcon = "circle";
    isLiveActive = true;
  } else if (state === "recommended") {
    eyebrowText = "NOW · RECOMMENDED";
    eyebrowIcon = "sparkles";
  } else if (state === "upcoming") {
    eyebrowText = "UP NEXT";
    eyebrowIcon = "clock";
  }

  // Combine subtitle fragments
  const subtitleParts: string[] = [];
  if (state === "upcoming") {
    if (timeLabel) subtitleParts.push(timeLabel);
    subtitleParts.push(typeLabel);
  } else if (state === "recommended") {
    if (contextLabel) {
      subtitleParts.push(contextLabel);
    } else if (timeLabel) {
      subtitleParts.push(timeLabel);
    }
    if (contextDetail && progressInSubtitle) subtitleParts.push(contextDetail);
  } else {
    // Active state
    if (timeLabel) subtitleParts.push(timeLabel);
    if (focus.remainingMinutes !== undefined && type !== "checklist") {
      subtitleParts.push(`${focus.remainingMinutes} min remaining`);
    }
    subtitleParts.push(typeLabel);
    if (contextDetail && progressInSubtitle) subtitleParts.push(contextDetail);
  }
  const subtitleDisplay = subtitleParts.join(" · ");

  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      style={[styles.container, style]}
      testID={`now-focus-card-${state}`}
    >
      {/*
       * IMPORTANT: the card surface is a plain View and every interactive control
       * (details pressable, View details, checklist checkbox, Complete, Focus) is a
       * SIBLING of the others. PressableScale renders its children inside a
       * pointerEvents="none" wrapper, so a control nested inside the details
       * pressable would fall through to the card's navigation handler.
       */}
      <View
        style={[
          styles.cardSurface,
          {
            backgroundColor: isDark ? "rgba(30, 41, 59, 0.7)" : "#FFFFFF",
            borderColor: isDark
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.08)",
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
          <View style={styles.contentRow}>
            {/* Details affordance: eyebrow + title + subtitle. */}
            <PressableScale
              onPress={handleCardPress}
              haptic
              scaleTo={0.99}
              style={styles.detailsArea}
              contentStyle={styles.detailsAreaContent}
              accessibilityRole="button"
              accessibilityLabel={`${eyebrowText}: ${item.title}`}
            >
              {/* Eyebrow Header */}
              <View style={styles.eyebrowRow}>
                {isLiveActive ? (
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
                          : colors.primary || "#6366F1"
                      }
                    />
                    <Text
                      style={[
                        styles.eyebrowText,
                        {
                          color:
                            state === "recommended"
                              ? "#10B981"
                              : colors.primary || "#6366F1",
                        },
                      ]}
                    >
                      {eyebrowText}
                    </Text>
                  </View>
                )}
              </View>

              {/* Title + supporting context */}
              <View style={styles.textColumn}>
                <Text
                  style={[
                    styles.titleText,
                    { color: colors.text },
                  ]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {subtitleDisplay ? (
                  <Text
                    style={[
                      styles.subtitleText,
                      { color: colors.textMuted },
                    ]}
                    numberOfLines={2}
                  >
                    {subtitleDisplay}
                  </Text>
                ) : null}
              </View>
            </PressableScale>

            {/* UP NEXT only: inspect action. Never completes, never starts focus. */}
            {state === "upcoming" ? (
              <PressableScale
                onPress={handleViewPress}
                haptic
                scaleTo={0.95}
                contentStyle={styles.actionButtonContent}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.12)"
                      : "rgba(0, 0, 0, 0.06)",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`View ${item.title}`}
                testID="now-focus-action-button"
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: colors.text },
                  ]}
                >
                  View details
                </Text>
                <Feather name="chevron-right" size={13} color={colors.text} />
              </PressableScale>
            ) : null}
          </View>

          {/* Checklist execution: occurrence-aware progress */}
          {isChecklistExecution && contextDetail ? (
            <Text
              style={[styles.checklistProgressText, { color: colors.textMuted }]}
              testID="now-focus-checklist-progress"
            >
              {contextDetail}
            </Text>
          ) : null}

          {/* Checklist execution: the single next actionable item */}
          {isChecklistExecution && nextChecklistItem ? (
            <PressableScale
              onPress={() => handleChecklistItemPress(nextChecklistItem.id)}
              haptic
              scaleTo={0.98}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`Complete checklist item ${nextChecklistItem.title}`}
              testID="now-focus-checklist-item"
              style={styles.checklistItemRow}
            >
              <View
                testID="now-focus-checklist-item-checkbox"
                style={[
                  styles.checklistItemCheckbox,
                  {
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.3)"
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
            </PressableScale>
          ) : null}

          {/* Execution actions for Task & Habit: direct completion + focus */}
          {isExecutionState && type !== "checklist" ? (
            <View style={styles.actionRow}>
              <PressableScale
                onPress={handleCompletePress}
                haptic
                scaleTo={0.95}
                contentStyle={styles.actionButtonContent}
                style={[styles.actionPill, styles.completePill]}
                accessibilityRole="button"
                accessibilityLabel={`Complete ${item.title}`}
                testID="now-focus-complete-button"
              >
                <Feather name="check" size={14} color="#FFFFFF" />
                <Text style={[styles.actionButtonText, { color: "#FFFFFF" }]}>
                  Complete
                </Text>
              </PressableScale>

              <PressableScale
                onPress={handleFocusPress}
                haptic
                scaleTo={0.95}
                contentStyle={styles.actionButtonContent}
                style={[
                  styles.actionPill,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(0, 0, 0, 0.05)",
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
                />
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: colors.text },
                  ]}
                  numberOfLines={1}
                >
                  Focus on this
                </Text>
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
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: "row",
    alignItems: "stretch",
  },
  leftStripe: {
    width: 4,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  cardInner: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 8,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  detailsArea: {
    flex: 1,
    minWidth: 0,
  },
  detailsAreaContent: {
    gap: 8,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveIndicatorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDotOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
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
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  textColumn: {
    minWidth: 0,
    gap: 3,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  actionPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  completePill: {
    backgroundColor: "#10B981",
  },
  actionButton: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
  },
  actionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  checklistProgressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  checklistItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  checklistItemCheckbox: {
    width: 22,
    height: 22,
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
  emptyContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flex: 1,
  },
  emptyIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
