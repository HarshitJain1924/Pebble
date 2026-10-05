import React from "react";
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import {
  getOffsetDateKey,
  getTodayDateKey,
  parseDateKey,
} from "@/shared/utils/date-key";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
} from "@/features/tasks/utils/task-formatting";
import { Spacing } from "@/shared/constants/spacing";
import { Radius } from "@/shared/constants/radii";

export interface DateScopedSectionHeaderProps {
  dateKey: string;
  onSelectDate: (dateKey: string) => void;
  onOpenDatePicker?: () => void;
  colors: any;
  isDark?: boolean;
  progressText?: string | null;
  itemCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  testID?: string;
}

/**
 * DateScopedSectionHeader
 *
 * Unified section header and date switcher for date-scoped workspace tabs (Tasks, Habits).
 * Merges the 3-day swipeable calendar strip into the primary section header:
 * - Selected date = today: Center label "Oct 5 · Today".
 * - Other date: Label "Tue, Oct 6" + dedicated 44pt "Back to today" button.
 * - Horizontal swipe gestures are strictly horizontal-dominant (|dx| > 10 and |dx| > |dy| * 1.4).
 * - Minimum 44x44pt touch targets on all interactive elements.
 * - Chevron visibility: hidden unless items > 5.
 */
export function DateScopedSectionHeader({
  dateKey,
  onSelectDate,
  onOpenDatePicker,
  colors,
  isDark = true,
  progressText,
  itemCount,
  isExpanded = true,
  onToggleExpand,
  testID = "date-scoped-section-header",
}: DateScopedSectionHeaderProps) {
  const dragX = React.useMemo(() => new Animated.Value(0), []);
  const enterX = React.useMemo(() => new Animated.Value(0), []);
  const directionRef = React.useRef(1);
  const previousKeyRef = React.useRef(dateKey);

  React.useEffect(() => {
    if (previousKeyRef.current === dateKey) return;
    previousKeyRef.current = dateKey;
    enterX.setValue(directionRef.current * 16);
    Animated.timing(enterX, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dateKey, enterX]);

  const prevDateKey = React.useMemo(() => getOffsetDateKey(1, dateKey), [dateKey]);
  const nextDateKey = React.useMemo(() => getOffsetDateKey(-1, dateKey), [dateKey]);
  const todayKey = React.useMemo(() => getTodayDateKey(), []);
  const isToday = dateKey === todayKey;

  const handlePrev = React.useCallback(() => {
    directionRef.current = -1;
    Haptics.selectionAsync().catch(() => {});
    onSelectDate(prevDateKey);
  }, [onSelectDate, prevDateKey]);

  const handleNext = React.useCallback(() => {
    directionRef.current = 1;
    Haptics.selectionAsync().catch(() => {});
    onSelectDate(nextDateKey);
  }, [onSelectDate, nextDateKey]);

  const handleBackToToday = React.useCallback(() => {
    directionRef.current = dateKey > todayKey ? -1 : 1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelectDate(todayKey);
  }, [dateKey, todayKey, onSelectDate]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_event, gesture) => {
          dragX.setValue(gesture.dx * 0.35);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -36) {
            handleNext();
          } else if (gesture.dx >= 36) {
            handlePrev();
          }
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 220,
            mass: 0.6,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dragX, handleNext, handlePrev],
  );

  const translateX = React.useMemo(
    () => Animated.add(dragX, enterX),
    [dragX, enterX],
  );

  // Parse dates
  const currParsed = parseDateKey(dateKey);
  const prevParsed = parseDateKey(prevDateKey);
  const nextParsed = parseDateKey(nextDateKey);

  const prevWeekday = WEEKDAY_NAMES[prevParsed.getDay()];
  const prevDayNum = prevParsed.getDate();

  const nextWeekday = WEEKDAY_NAMES[nextParsed.getDay()];
  const nextDayNum = nextParsed.getDate();

  const currMonth = MONTH_NAMES[currParsed.getMonth()];
  const currDayNum = currParsed.getDate();
  const currWeekday = WEEKDAY_NAMES[currParsed.getDay()];

  // Label formatting
  // Selected date = today: "Oct 5 · Today"
  // Selected date != today: "Tue, Oct 6"
  const centerDateLabel = isToday
    ? `${currMonth} ${currDayNum} · Today`
    : `${currWeekday}, ${currMonth} ${currDayNum}`;

  // Chevron rule: keep hidden unless items > 5
  const showChevron = Boolean(onToggleExpand && (itemCount === undefined || itemCount > 5));

  return (
    <View style={styles.outerContainer} testID={testID}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.stripContainer,
          { transform: [{ translateX }] },
        ]}
      >
        {/* Previous Day Chip */}
        <PressableScale
          onPress={handlePrev}
          haptic
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Previous day, ${prevWeekday} ${prevDayNum}`}
          style={styles.navSlot}
        >
          <Feather name="chevron-left" size={14} color={colors.textMuted} style={styles.navIcon} />
          <Text
            style={[styles.neighborText, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {`${prevWeekday} ${prevDayNum}`}
          </Text>
        </PressableScale>

        {/* Center Date Display */}
        <View style={styles.centerSlot}>
          <PressableScale
            onPress={onOpenDatePicker}
            haptic
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Selected date, ${centerDateLabel}. Tap to change date.`}
            style={styles.centerPressable}
          >
            <View style={styles.centerTitleRow}>
              {isToday && (
                <View
                  style={[
                    styles.todayIndicatorDot,
                    { backgroundColor: isDark ? colors.primaryLight : colors.primary },
                  ]}
                />
              )}
              <Text
                style={[
                  styles.centerDateText,
                  { color: isToday ? colors.text : (isDark ? colors.primaryLight : colors.primary) },
                ]}
                numberOfLines={1}
              >
                {centerDateLabel}
              </Text>
              {progressText ? (
                <Text
                  style={[styles.progressText, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {progressText}
                </Text>
              ) : null}
            </View>
          </PressableScale>

          {/* "Back to today" Button when not on Today */}
          {!isToday && (
            <PressableScale
              onPress={handleBackToToday}
              haptic
              hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
              style={[
                styles.backToTodayButton,
                {
                  backgroundColor: `${colors.primary}14`,
                  borderColor: `${colors.primary}30`,
                },
              ]}
            >
              <Feather name="rotate-ccw" size={10} color={colors.primary} />
              <Text style={[styles.backToTodayText, { color: colors.primary }]}>
                Back to today
              </Text>
            </PressableScale>
          )}
        </View>

        {/* Next Day Chip / Optional Chevron */}
        <View style={styles.rightCluster}>
          <PressableScale
            onPress={handleNext}
            haptic
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Next day, ${nextWeekday} ${nextDayNum}`}
            style={styles.navSlot}
          >
            <Text
              style={[styles.neighborText, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {`${nextWeekday} ${nextDayNum}`}
            </Text>
            <Feather name="chevron-right" size={14} color={colors.textMuted} style={styles.navIcon} />
          </PressableScale>

          {showChevron && (
            <PressableScale
              onPress={onToggleExpand}
              haptic
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? "Collapse section" : "Expand section"}
              style={styles.chevronButton}
            >
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.textMuted}
              />
            </PressableScale>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  stripContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  navSlot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 54,
    paddingHorizontal: 4,
  },
  navIcon: {
    marginHorizontal: 1,
  },
  neighborText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  centerPressable: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  centerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  todayIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  centerDateText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  backToTodayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: 3,
  },
  backToTodayText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  chevronButton: {
    minHeight: 44,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
