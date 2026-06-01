import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet,  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";

import { ProgressRing } from "./ProgressRing";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";

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
  { label: "7:00 AM", hour: 7, minute: 0, icon: "sunrise" },
  { label: "12:00 PM", hour: 12, minute: 0, icon: "sun" },
  { label: "6:00 PM", hour: 18, minute: 0, icon: "sunset" },
  { label: "9:00 PM", hour: 21, minute: 0, icon: "moon" },
];

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const AMBER = "#F59E0B";
const AMBER_DIM = "#D97706";
const AMBER_SOFT = "rgba(245,158,11,0.14)";

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
  const isDark = colorScheme === "dark";

  const formatReminder = (hour?: number, minute?: number) => {
    if (hour === undefined || minute === undefined) return null;
    return new Date(2020, 0, 1, hour, minute).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDays = (days?: number[]) => {
    if (!days || days.length === 0) return null;
    const sorted = [...days].sort((a, b) => a - b);
    if (sorted.length === 7) return "Every day";
    if (sorted.length === 5 && !sorted.includes(0) && !sorted.includes(6)) return "Weekdays";
    if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return "Weekends";
    return sorted.map((d) => DAY_FULL[d] ?? d).join(", ");
  };

  const reminderTime = formatReminder(item.reminderHour, item.reminderMinute);
  const reminderDays = formatDays(item.reminderDays);

  // Priority accent color
  const priorityAccent =
    item.priority === "high"
      ? colors.error
      : item.priority === "low"
      ? colors.success
      : AMBER;

  const isHighlighted = highlightedHabitId === item.id;

  // Card background states
  const cardBg = item.completedToday
    ? isDark
      ? "rgba(245, 158, 11, 0.07)"
      : "#FEF9E8"
    : isDark
    ? "rgba(24, 24, 28, 0.95)"
    : "#FFFFFF";

  const cardBorderColor = isHighlighted
    ? colors.primary
    : item.completedToday
    ? "rgba(245, 158, 11, 0.45)"
    : isDark
    ? "rgba(255,255,255,0.055)"
    : "rgba(0,0,0,0.06)";

  // Week grid — actual days of week to show completion
  const today = new Date().getDay(); // 0=Sun
  const renderWeekGrid = () => {
    return (
      <View style={styles.weekGrid}>
        {DAY_LABELS.map((label, idx) => {
          // Highlight completed days + today if completed
          const isToday = idx === today;
          const isDone =
            item.completedToday && isToday
              ? true
              : idx < today && item.streak > today - idx;

          return (
            <View key={idx} style={styles.weekDayCol}>
              <Text
                style={[
                  styles.weekDayLabel,
                  { color: isToday ? AMBER : colors.textMuted },
                ]}
              >
                {label}
              </Text>
              <View
                style={[
                  styles.weekDot,
                  {
                    backgroundColor: isDone
                      ? AMBER
                      : isToday
                      ? "rgba(245,158,11,0.12)"
                      : isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.04)",
                    borderColor: isDone
                      ? AMBER_DIM
                      : isToday
                      ? AMBER
                      : "transparent",
                    borderWidth: isToday ? 1.2 : 0,
                  },
                ]}
              >
                {isDone && (
                  <Feather name="check" size={8} color="#fff" />
                )}
              </View>
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
        <Pressable
          onPress={onToggleReminderMenu}
          style={[
            styles.habitCard,
            {
              backgroundColor: cardBg,
              borderColor: cardBorderColor,
            },
          ]}
        >
          {/* Amber left accent bar */}
          <View
            style={[
              styles.leftBar,
              {
                backgroundColor: item.completedToday
                  ? AMBER
                  : isDark
                  ? "rgba(245,158,11,0.2)"
                  : "rgba(245,158,11,0.15)",
              },
            ]}
          />

          {/* Completion ring */}
          <Pressable onPress={onToggleHabit} style={styles.ringBtn} hitSlop={8}>
            <ProgressRing
              progress={item.completedToday ? 1 : 0}
              size={40}
              strokeWidth={3}
              showText={false}
              color={AMBER}
            />
            <View
              style={[
                styles.ringInner,
                {
                  backgroundColor: item.completedToday
                    ? AMBER
                    : isDark
                    ? "rgba(245,158,11,0.08)"
                    : "rgba(245,158,11,0.1)",
                },
              ]}
            >
              {item.completedToday ? (
                <Feather name="check" size={14} color="#fff" />
              ) : (
                <Text style={styles.ringEmoji}>🔥</Text>
              )}
            </View>
          </Pressable>

          {/* Main content */}
          <View style={styles.habitContent}>
            <View style={styles.habitTitleRow}>
              <Text
                style={[
                  styles.habitTitle,
                  {
                    color: item.completedToday ? colors.textMuted : colors.text,
                    textDecorationLine: item.completedToday
                      ? "line-through"
                      : "none",
                  },
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <View
                style={[
                  styles.priorityDot,
                  { backgroundColor: priorityAccent },
                ]}
              />
            </View>

            {/* Streak + meta */}
            <View style={styles.metaLine}>
              <View style={styles.streakChip}>
                <Text style={styles.streakIcon}>🔥</Text>
                <Text style={[styles.streakText, { color: AMBER }]}>
                  {item.streak}
                </Text>
                <Text style={[styles.streakSub, { color: colors.textMuted }]}>
                  / best {item.bestStreak}
                </Text>
              </View>
              {reminderTime && (
                <View style={styles.metaBadge}>
                  <Feather name="bell" size={10} color={colors.primary} />
                  <Text style={[styles.metaBadgeText, { color: colors.primary }]}>
                    {reminderDays ? `${reminderDays} • ${reminderTime}` : reminderTime}
                  </Text>
                </View>
              )}
            </View>

            {/* Week grid dots */}
            {renderWeekGrid()}
          </View>
        </Pressable>
      </SwipeableCard>

      {/* Reminder dropdown */}
      {reminderMenuVisible && (
        <View
          style={[
            styles.reminderSheet,
            {
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          <Text
            style={[styles.reminderSheetTitle, { color: colors.text }]}
          >
            Set Reminder
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {QUICK_REMINDER_OPTIONS.map((opt) => {
              const isActive =
                item.reminderHour === opt.hour &&
                item.reminderMinute === opt.minute;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => onSetReminder(opt.hour, opt.minute)}
                  style={[
                    styles.quickPill,
                    {
                      backgroundColor: isActive
                        ? AMBER_SOFT
                        : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      borderColor: isActive ? AMBER : "transparent",
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text style={styles.quickPillIcon}>{opt.icon === "sunrise" ? "🌅" : opt.icon === "sun" ? "☀️" : opt.icon === "sunset" ? "🌇" : "🌙"}</Text>
                  <Text
                    style={[
                      styles.quickPillText,
                      { color: isActive ? AMBER : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.reminderActions}>
            <Pressable
              onPress={() => setCustomPickerVisible((s) => !s)}
              style={[
                styles.reminderActionBtn,
                {
                  backgroundColor: AMBER_SOFT,
                  borderColor: AMBER,
                  borderWidth: 1,
                },
              ]}
            >
              <Feather name="clock" size={14} color={AMBER} />
              <Text style={[styles.reminderActionText, { color: AMBER }]}>
                Custom time
              </Text>
            </Pressable>
            <Pressable
              onPress={onClearReminder}
              style={[
                styles.reminderActionBtn,
                {
                  backgroundColor: isDark
                    ? "rgba(239,68,68,0.08)"
                    : "rgba(239,68,68,0.06)",
                  borderColor: "rgba(239,68,68,0.3)",
                  borderWidth: 1,
                },
              ]}
            >
              <Feather name="x" size={14} color={colors.error} />
              <Text style={[styles.reminderActionText, { color: colors.error }]}>
                Clear
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
              saveLabel="Apply"
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  habitWrap: {
    gap: 6,
    marginBottom: 2,
  },
  habitCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: "hidden",
    paddingRight: 18,
    paddingVertical: 12,
    gap: 0,
  },
  leftBar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 4,
    marginRight: 12,
    marginLeft: 0,
  },
  ringBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginRight: 12,
  },
  ringInner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ringEmoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  habitContent: {
    flex: 1,
    gap: 6,
  },
  habitTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  habitTitle: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    letterSpacing: -0.2,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  streakIcon: {
    fontSize: 12,
    lineHeight: 16,
  },
  streakText: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  streakSub: {
    fontSize: 11,
    fontWeight: "500",
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(99,102,241,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  weekGrid: {
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  weekDayCol: {
    alignItems: "center",
    gap: 3,
  },
  weekDayLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  weekDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
  },
  actionBtn: {
    padding: 4,
  },
  // Reminder sheet
  reminderSheet: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    marginTop: -2,
  },
  reminderSheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  quickRow: {
    gap: 8,
    paddingVertical: 2,
  },
  quickPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  quickPillIcon: {
    fontSize: 15,
    lineHeight: 18,
  },
  quickPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  reminderActions: {
    flexDirection: "row",
    gap: 10,
  },
  reminderActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  reminderActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
