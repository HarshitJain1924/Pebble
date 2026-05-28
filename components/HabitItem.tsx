import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";

export type Habit = {
  id: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  lastCompletedDate?: string;
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  notificationIds?: string[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
};

interface HabitItemProps {
  item: Habit;
  colors: any;
  colorScheme: "light" | "dark" | null;
  onToggleHabit: () => void;
  onDeleteHabit: () => void;
  reminderMenuVisible: boolean;
  onToggleReminderMenu: () => void;
  onSetReminder: (hour: number, minute: number, days?: number[]) => void;
  onClearReminder: () => void;
  highlightedHabitId?: string | null;
}

const QUICK_REMINDER_OPTIONS = [
  { label: "7:00", hour: 7, minute: 0 },
  { label: "12:00", hour: 12, minute: 0 },
  { label: "18:00", hour: 18, minute: 0 },
  { label: "21:00", hour: 21, minute: 0 },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HabitItem({
  item,
  colors,
  colorScheme,
  onToggleHabit,
  onDeleteHabit,
  reminderMenuVisible,
  onToggleReminderMenu,
  onSetReminder,
  onClearReminder,
  highlightedHabitId,
}: HabitItemProps) {
  const [customPickerVisible, setCustomPickerVisible] = useState(false);

  const formatDays = (days?: number[]) => {
    if (!days || days.length === 0) return null;
    const sorted = [...days].sort((a, b) => a - b);
    return sorted.map((d) => DAY_LABELS[d] ?? d).join(", ");
  };

  const formatReminder = (hour?: number, minute?: number) => {
    if (hour === undefined || minute === undefined) {
      return null;
    }
    return new Date(2020, 0, 1, hour, minute).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const baseTime = formatReminder(item.reminderHour, item.reminderMinute);
  const daysText = formatDays(item.reminderDays ?? []);
  const reminderText = baseTime
    ? daysText
      ? `${daysText} • ${baseTime}`
      : baseTime
    : daysText;

  const renderWeeklyGrid = (completed: boolean) => {
    return (
      <View style={styles.weeklyGrid}>
        {["M", "T", "W", "T", "F", "S", "S"].map((day, idx) => {
          const isDone = completed || idx < 3;
          return (
            <View
              key={idx}
              style={[
                styles.gridDot,
                {
                  backgroundColor: isDone ? colors.success : "transparent",
                  borderColor: isDone ? colors.success : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.gridText,
                  { color: isDone ? "#fff" : colors.textMuted },
                ]}
              >
                {day}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.habitWrap}>
      <SwipeableCard
        onSwipeRight={onToggleHabit}
        onSwipeLeft={onDeleteHabit}
      >
        <AppCard
          style={[
            styles.habitCard,
            {
              borderLeftWidth: 4,
              borderLeftColor:
                item.priority === "high"
                  ? colors.error
                  : item.priority === "low"
                  ? colors.success
                  : colors.warning,
            },
            highlightedHabitId === item.id && {
              borderColor: colors.primary,
            },
            item.completedToday && {
              borderColor: "rgba(16, 185, 129, 0.18)",
              borderWidth: 1,
              backgroundColor: "rgba(16, 185, 129, 0.03)",
            },
          ]}
        >
          <View style={styles.habitLeft}>
            <AnimatedCheckbox
              checked={item.completedToday}
              onToggle={onToggleHabit}
            />
            <View style={styles.habitTexts}>
              <Text
                style={[
                  styles.habitTitleText,
                  {
                    color: item.completedToday
                      ? colors.textMuted
                      : colors.text,
                    textDecorationLine: item.completedToday
                      ? "line-through"
                      : "none",
                  },
                ]}
              >
                {item.title}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor:
                        item.priority === "high"
                          ? `${colors.error}12`
                          : item.priority === "low"
                          ? `${colors.success}12`
                          : `${colors.warning}12`,
                      borderColor:
                        item.priority === "high"
                          ? colors.error
                          : item.priority === "low"
                          ? colors.success
                          : colors.warning,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagBadgeText,
                      {
                        color:
                          item.priority === "high"
                            ? colors.error
                            : item.priority === "low"
                            ? colors.success
                            : colors.warning,
                      },
                    ]}
                  >
                    {item.priority ? item.priority.toUpperCase() : "MEDIUM"}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Feather name="zap" size={12} color={colors.warning} />
                  <Text
                    style={[
                      styles.metaText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Streak {item.streak} (best {item.bestStreak})
                  </Text>
                </View>
              </View>
              {reminderText && (
                <View style={styles.metaRow}>
                  <Feather name="bell" size={12} color={colors.primary} />
                  <Text
                    style={[
                      styles.metaText,
                      { color: colors.primary },
                    ]}
                  >
                    {reminderText}
                  </Text>
                </View>
              )}
              {/* Render customized weekly grid dots */}
              {renderWeeklyGrid(item.completedToday)}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onToggleReminderMenu} hitSlop={8}>
              <Feather
                name="bell"
                size={18}
                color={
                  item.reminderHour !== undefined
                    ? colors.primary
                    : colors.textMuted
                }
              />
            </Pressable>
            <Pressable onPress={onDeleteHabit} hitSlop={8}>
              <Feather name="trash-2" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </AppCard>
      </SwipeableCard>

      {/* Alarm dropdown overlay */}
      {reminderMenuVisible && (
        <AppCard style={styles.alarmDropdown}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickOptions}
          >
            {QUICK_REMINDER_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => onSetReminder(option.hour, option.minute)}
                style={[
                  styles.quickBtn,
                  { backgroundColor: colors.cardLight },
                ]}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "600",
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.dropdownBottom}>
            <Pressable
              onPress={() => setCustomPickerVisible((s) => !s)}
              style={[
                styles.customToggleBtn,
                { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontWeight: "700",
                }}
              >
                Custom
              </Text>
            </Pressable>
            <Pressable onPress={onClearReminder} style={styles.clearBtn}>
              <Text
                style={{
                  color: colors.error,
                  fontWeight: "600",
                }}
              >
                Clear alarm
              </Text>
            </Pressable>
          </View>

          {customPickerVisible && (
            <TimeSelectorDial
              colors={colors}
              initialHour={item.reminderHour ?? 7}
              initialMinute={item.reminderMinute ?? 0}
              initialDays={item.reminderDays ?? []}
              onSave={(h, m, d) => {
                onSetReminder(h, m, d);
                setCustomPickerVisible(false);
              }}
              saveLabel="Apply Schedule"
            />
          )}
        </AppCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  habitWrap: { gap: 8 },
  habitCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  habitLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  habitTexts: { flex: 1, gap: 4 },
  habitTitleText: { fontSize: Typography.sizes.md, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: Typography.sizes.xs, fontWeight: "500" },
  weeklyGrid: { flexDirection: "row", gap: 6, marginTop: 4 },
  gridDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridText: { fontSize: 8, fontWeight: "800" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 10,
  },
  alarmDropdown: {
    padding: Spacing.md,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  quickOptions: { gap: 8, paddingVertical: 4 },
  quickBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  dropdownBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  customToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  clearBtn: { padding: 8 },
  tagBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
