import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View, Alert, TouchableOpacity, Platform } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { useRouter } from "expo-router";

import { ProgressRing } from "./ProgressRing";
import { SwipeableCard } from "@/components/SwipeableCard";

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
  previousStreak?: number;
  streakBrokenDate?: string;
};

interface HabitItemProps {
  item: Habit;
  colors: any;
  colorScheme: "light" | "dark" | null;
  onToggleHabit: () => void;
  onDeleteHabit: () => void;
  highlightedHabitId?: string | null;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onRecoverStreak?: (method: "pebbles" | "focus") => void;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const AMBER = "#F59E0B";
const AMBER_DIM = "#D97706";

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDateKey = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const dayDiff = (fromDateKey: string, toDateKey: string) => {
  const from = parseDateKey(fromDateKey).getTime();
  const to = parseDateKey(toDateKey).getTime();
  return Math.floor((to - from) / DAY_MS);
};
const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export function HabitItem({
  item,
  colors,
  colorScheme,
  onToggleHabit,
  onDeleteHabit,
  highlightedHabitId,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  onRecoverStreak,
}: HabitItemProps) {
  const router = useRouter();
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
          const isToday = idx === today;
          // Highlight completed days + today if completed
          const isDone = isToday
            ? item.completedToday
            : idx < today && (item.completedToday ? (today - idx < item.streak) : (today - idx <= item.streak));

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
        disabled={isSelectionMode}
      >
        <Pressable
          onPress={isSelectionMode ? onSelect : () => router.push(`/task-details?id=${item.id}&type=habit`)}
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

          {/* Selection indicator or Completion ring */}
          {isSelectionMode ? (
            <Pressable onPress={onSelect} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: 12 }} hitSlop={8}>
              <Feather
                name={isSelected ? "check-circle" : "circle"}
                size={18}
                color={isSelected ? colors.primary : colors.textMuted}
              />
            </Pressable>
          ) : (
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
          )}

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

            {/* Recovery Grace Period UI */}
            {(() => {
              const todayKey = getDateKey();
              const isEligibleForRecovery =
                !!item.previousStreak &&
                item.previousStreak > 0 &&
                !!item.streakBrokenDate &&
                dayDiff(item.streakBrokenDate, todayKey) <= 1;

              if (!isEligibleForRecovery || !onRecoverStreak) return null;

              return (
                <View
                  style={{
                    marginTop: 10,
                    padding: 10,
                    backgroundColor: isDark ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.05)",
                    borderColor: isDark ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.15)",
                    borderWidth: 1.2,
                    borderRadius: 12,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.error }}>
                      💔 Streak of {item.previousStreak} Broken!
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted, flex: 1, textAlign: "right" }}>
                      Expires in 48h
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          "Recover Streak",
                          `Spend 1 Gem to restore your ${item.previousStreak}-day streak?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Spend 1 Gem",
                              onPress: () => onRecoverStreak("pebbles"),
                            },
                          ]
                        );
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FEF3C7",
                        borderColor: AMBER,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingVertical: 6,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: AMBER }}>
                        💎 Spend 1 Gem
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onRecoverStreak("focus")}
                      style={{
                        flex: 1,
                        backgroundColor: isDark ? "rgba(99, 102, 241, 0.15)" : "#EEF2FF",
                        borderColor: colors.primary,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingVertical: 6,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                        ⚡ Focus 10 Mins
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}
          </View>
        </Pressable>
      </SwipeableCard>
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
});
