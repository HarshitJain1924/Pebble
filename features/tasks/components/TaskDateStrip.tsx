import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  getTodayDateKey,
  getOffsetDateKey,
  parseDateKey,
} from "@/shared/utils/date-key";

const FULL_WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAYS_PAST = 60;
const DAYS_FUTURE = 60;
const VISIBLE_COUNT = 5;

// Exact coral/terracotta accent color from the user's design screenshot
const DEFAULT_INDICATOR_COLOR = "#E07A5F";

export interface TaskDateStripProps {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  indicatorColor?: string;
  testID?: string;
}

interface DateItem {
  key: string;
  dayNumber: number;
  dayName: string;
  isToday: boolean;
}

export function TaskDateStrip({
  selectedDate,
  onSelectDate,
  indicatorColor = DEFAULT_INDICATOR_COLOR,
  testID = "task-date-strip",
}: TaskDateStripProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = Colors[colorScheme ?? "dark"];
  const { width: windowWidth } = useWindowDimensions();

  // Exactly 5 items visible edge-to-edge
  const itemWidth = Math.floor(windowWidth / VISIBLE_COUNT);

  const flatListRef = useRef<FlatList<DateItem>>(null);
  const isUserScrollingRef = useRef(false);

  const todayKey = useMemo(() => getTodayDateKey(), []);

  // Generate date list spanning ±60 days
  const dateItems = useMemo<DateItem[]>(() => {
    const items: DateItem[] = [];
    for (let i = -DAYS_PAST; i <= DAYS_FUTURE; i++) {
      const key = getOffsetDateKey(-i, todayKey);
      const parsed = parseDateKey(key);
      const isToday = key === todayKey;
      items.push({
        key,
        dayNumber: parsed.getDate(),
        dayName: isToday ? "Today" : FULL_WEEKDAY_NAMES[parsed.getDay()],
        isToday,
      });
    }
    return items;
  }, [todayKey]);

  // Find index of selected date
  const selectedIndex = useMemo(() => {
    const idx = dateItems.findIndex((item) => item.key === selectedDate);
    return idx >= 0 ? idx : DAYS_PAST; // fallback to today
  }, [dateItems, selectedDate]);

  // Center selected date in the 5-item window (viewPosition 0.5 centers it)
  const centerOnIndex = useCallback(
    (index: number, animated = true) => {
      if (flatListRef.current && index >= 0 && index < dateItems.length) {
        flatListRef.current.scrollToIndex({
          index,
          viewPosition: 0.5,
          animated,
        });
      }
    },
    [dateItems.length],
  );

  // Auto-scroll when selectedDate changes (unless user is currently dragging)
  useEffect(() => {
    if (!isUserScrollingRef.current) {
      centerOnIndex(selectedIndex, true);
    }
  }, [selectedIndex, centerOnIndex]);

  const handleSelectDate = useCallback(
    (key: string, index: number) => {
      if (key !== selectedDate) {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync().catch(() => {});
        }
        onSelectDate(key);
        centerOnIndex(index, true);
      }
    },
    [selectedDate, onSelectDate, centerOnIndex],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: itemWidth,
      offset: itemWidth * index,
      index,
    }),
    [itemWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: DateItem; index: number }) => {
      const isSelected = item.key === selectedDate;

      return (
        <PressableScale
          onPress={() => handleSelectDate(item.key, index)}
          haptic={false}
          scaleTo={0.96}
          style={[styles.itemContainer, { width: itemWidth }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.dayNumber} ${item.dayName}${isSelected ? ", selected" : ""}`}
        >
          <View style={styles.textStack}>
            {/* Day Number */}
            <Text
              style={[
                styles.dayNumber,
                isSelected
                  ? [
                      styles.dayNumberSelected,
                      { color: isDark ? "#FFFFFF" : colors.text },
                    ]
                  : [
                      styles.dayNumberUnselected,
                      {
                        color: isDark
                          ? "rgba(255, 255, 255, 0.45)"
                          : colors.textMuted,
                      },
                    ],
              ]}
            >
              {item.dayNumber}
            </Text>

            {/* Day Name / Today */}
            <Text
              numberOfLines={1}
              style={[
                styles.dayName,
                isSelected
                  ? [
                      styles.dayNameSelected,
                      { color: isDark ? "#FFFFFF" : colors.text },
                    ]
                  : [
                      styles.dayNameUnselected,
                      {
                        color: isDark
                          ? "rgba(255, 255, 255, 0.35)"
                          : colors.textMuted,
                      },
                    ],
              ]}
            >
              {item.dayName}
            </Text>
          </View>

          {/* Underline Indicator */}
          <View
            style={[
              styles.indicator,
              {
                backgroundColor: isSelected ? indicatorColor : "transparent",
              },
            ]}
          />
        </PressableScale>
      );
    },
    [selectedDate, handleSelectDate, itemWidth, isDark, colors, indicatorColor],
  );

  // Initial scroll offset so center item is selectedDate
  const initialScrollIndex = Math.max(0, selectedIndex - 2);

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          borderBottomColor: isDark
            ? "rgba(255, 255, 255, 0.12)"
            : colors.border,
        },
      ]}
    >
      <FlatList
        ref={flatListRef}
        data={dateItems}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialScrollIndex}
        onScrollBeginDrag={() => {
          isUserScrollingRef.current = true;
        }}
        onScrollEndDrag={() => {
          isUserScrollingRef.current = false;
        }}
        onMomentumScrollEnd={() => {
          isUserScrollingRef.current = false;
        }}
        snapToInterval={itemWidth}
        snapToAlignment="center"
        decelerationRate="fast"
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              viewPosition: 0.5,
              animated: false,
            });
          }, 50);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
  },
  itemContainer: {
    height: 62,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  textStack: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 17,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  dayNumberSelected: {
    fontWeight: "700",
  },
  dayNumberUnselected: {
    fontWeight: "500",
  },
  dayName: {
    fontSize: 12,
    letterSpacing: -0.1,
    marginTop: 2,
    textAlign: "center",
  },
  dayNameSelected: {
    fontWeight: "600",
  },
  dayNameUnselected: {
    fontWeight: "400",
  },
  indicator: {
    width: 38,
    height: 3,
    borderRadius: 1.5,
  },
});
