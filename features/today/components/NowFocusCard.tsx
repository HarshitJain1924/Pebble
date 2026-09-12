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
import {
  getChecklistStats,
  getHabitCurrentStreak,
} from "@/shared/utils/domain-selectors";

export interface NowFocusCardProps {
  focus: NowFocusResult;
  onStartFocus?: (focus: NowFocusResult) => void;
  onPressCard?: (focus: NowFocusResult) => void;
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
 * - UPCOMING: Next scheduled activity ("UP NEXT")
 * - EMPTY: Calm status when nothing requires immediate focus
 *
 * Implements Level 1 surface with left priority stripe, type-specific
 * metadata (Task/Habit/Checklist), and a non-destructive primary CTA.
 */
export const NowFocusCard: React.FC<NowFocusCardProps> = ({
  focus,
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
  const { state, type, item, timeLabel, contextLabel } = focus;

  // Action handlers with strict state-appropriate semantics:
  // - UPCOMING: Must VIEW/inspect item (never starts Zen mode or mutates)
  // - ACTIVE / RECOMMENDED: Triggers start / focus mode
  const handleActionPress = () => {
    if (state === "upcoming") {
      if (onViewFocus) {
        onViewFocus(focus);
      } else if (onPressCard) {
        onPressCard(focus);
      }
    } else {
      if (onStartFocus) {
        onStartFocus(focus);
      } else if (onPressCard) {
        onPressCard(focus);
      }
    }
  };

  const handleCardPress = () => {
    if (state === "upcoming") {
      if (onViewFocus) {
        onViewFocus(focus);
      } else if (onPressCard) {
        onPressCard(focus);
      }
    } else {
      if (onPressCard) {
        onPressCard(focus);
      } else if (onStartFocus) {
        onStartFocus(focus);
      }
    }
  };

  // Resolve item-specific metadata
  let priorityColor: string | undefined = undefined;
  let typeLabel = "Task";
  let contextDetail = "";
  let actionLabel = "Start";
  let actionIcon: "play" | "arrow-right" | "check" = "play";

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
    const checklist = item as Checklist;
    typeLabel = "Checklist";
    actionLabel = "Continue";
    actionIcon = "arrow-right";
    const stats = getChecklistStats(checklist);
    contextDetail = `${stats.completedCount} / ${stats.total} completed`;
  }

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
    actionLabel = "View";
    actionIcon = "arrow-right";
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
    if (contextDetail) subtitleParts.push(contextDetail);
  } else {
    // Active state
    if (timeLabel) subtitleParts.push(timeLabel);
    subtitleParts.push(typeLabel);
    if (contextDetail) subtitleParts.push(contextDetail);
  }
  const subtitleDisplay = subtitleParts.join(" · ");

  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      style={[styles.container, style]}
      testID={`now-focus-card-${state}`}
    >
      <PressableScale
        onPress={handleCardPress}
        haptic
        scaleTo={0.98}
        contentStyle={[
          styles.cardSurface,
          {
            backgroundColor: isDark ? "rgba(30, 41, 59, 0.7)" : "#FFFFFF",
            borderColor: isDark
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.08)",
          },
        ]}
        style={styles.cardPressableWrap}
        accessibilityRole="button"
        accessibilityLabel={`${eyebrowText}: ${item.title}`}
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

          {/* Body Content & Primary CTA */}
          <View style={styles.contentRow}>
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
                  numberOfLines={1}
                >
                  {subtitleDisplay}
                </Text>
              ) : null}
            </View>

            {/* Primary Action Button (44x44 minimum hit target) */}
            <PressableScale
              onPress={handleActionPress}
              haptic
              scaleTo={0.95}
              contentStyle={styles.actionButtonContent}
              style={[
                styles.actionButton,
                {
                  backgroundColor:
                    state === "upcoming"
                      ? isDark
                        ? "rgba(255, 255, 255, 0.12)"
                        : "rgba(0, 0, 0, 0.06)"
                      : colors.primary || "#6366F1",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} ${item.title}`}
              testID="now-focus-action-button"
            >
              <Text
                style={[
                  styles.actionButtonText,
                  {
                    color:
                      state === "upcoming"
                        ? colors.text
                        : "#FFFFFF",
                  },
                ]}
              >
                {actionLabel}
              </Text>
              <Feather
                name={actionIcon === "play" ? "play" : "chevron-right"}
                size={13}
                color={
                  state === "upcoming"
                    ? colors.text
                    : "#FFFFFF"
                }
              />
            </PressableScale>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  cardPressableWrap: {
    width: "100%",
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
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  textColumn: {
    flex: 1,
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
  actionButton: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
    minWidth: 84,
    paddingHorizontal: 16,
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
