import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { AppTextInput as TextInput, AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/AppCard";
import { SwipeableCard } from "@/components/SwipeableCard";
import { HabitStreakCard } from "@/components/dashboard/HabitStreakCard";
import { HabitsEmptyGraphic } from "@/components/AppGraphics";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/reminders";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "@/constants/taskStyles";
import { type Habit } from "../types";

const formatReminder = (hour?: number, minute?: number) => {
  if (hour === undefined || minute === undefined) {
    return null;
  }

  return new Date(2020, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface HabitSectionProps {
  displayedHabits: Habit[];
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits: (nextHabits: Habit[]) => Promise<void>;
  toggleHabit: (id: string) => void;
  deleteHabit: (id: string) => void;
  unfinishedHabitCount: number;
}

export function HabitSection({
  displayedHabits,
  habits,
  setHabits,
  persistHabits,
  toggleHabit,
  deleteHabit,
  unfinishedHabitCount,
}: HabitSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // Internal states for reminders and expansions
  const [expandedHabitIds, setExpandedHabitIds] = useState<Record<string, boolean>>({});
  const [reminderMenuHabitId, setReminderMenuHabitId] = useState<string | null>(null);
  const [reminderCustomVisible, setReminderCustomVisible] = useState(false);
  const [reminderCustomHour, setReminderCustomHour] = useState<number>(7);
  const [reminderCustomMinute, setReminderCustomMinute] = useState<number>(0);
  const [reminderCustomDays, setReminderCustomDays] = useState<number[]>([]);

  // Update custom fields when reminder menu changes
  useEffect(() => {
    if (!reminderMenuHabitId) {
      setReminderCustomVisible(false);
      return;
    }
    const target = habits.find((h) => h.id === reminderMenuHabitId);
    setReminderCustomHour(target?.reminderHour ?? 7);
    setReminderCustomMinute(target?.reminderMinute ?? 0);
    setReminderCustomDays(target?.reminderDays ?? []);
    setReminderCustomVisible(false);
  }, [reminderMenuHabitId, habits]);

  const setReminderWithDays = async (
    habitId: string,
    hour: number,
    minute: number,
    days?: number[],
  ) => {
    const target = habits.find((habit) => habit.id === habitId);
    if (!target) return;

    try {
      await cancelReminderIds(target.notificationIds ?? []);
      const scheduled = await scheduleReminderBatch({
        kind: "habit",
        itemId: habitId,
        title: target.title,
        dailyTime: { hour, minute },
        dailyDays: days,
        escalationMinutes: [120, 240],
        channelId: Platform.OS === "android" ? "daily-habits" : undefined,
        context: {
          title: target.title,
          remainingCount: unfinishedHabitCount,
          totalCount: habits.length,
          streak: target.streak,
          bestStreak: target.bestStreak,
        },
      });

      setHabits((current) => {
        const updated = current.map((habit) =>
          habit.id === habitId
            ? {
                ...habit,
                reminderHour: hour,
                reminderMinute: minute,
                reminderDays: days,
                notificationIds: scheduled.ids,
                escalationMinutes: scheduled.escalationMinutes,
              }
            : habit,
        );
        void persistHabits(updated);
        return updated;
      });
    } catch {
      Alert.alert(
        "Could not schedule",
        "Reminder scheduling failed on this device.",
      );
    }

    setReminderMenuHabitId(null);
    setReminderCustomVisible(false);
  };

  const clearReminder = async (habitId: string) => {
    const target = habits.find((habit) => habit.id === habitId);
    await cancelReminderIds(target?.notificationIds ?? []);

    setHabits((current) => {
      const updated = current.map((habit) =>
        habit.id === habitId
          ? {
              ...habit,
              reminderHour: undefined,
              reminderMinute: undefined,
              notificationIds: [],
              escalationMinutes: undefined,
            }
          : habit,
      );
      void persistHabits(updated);
      return updated;
    });

    setReminderMenuHabitId(null);
  };

  return (
    <View style={styles.listContent}>
      {displayedHabits.length > 0 ? (
        displayedHabits.map((item) => {
          const baseTime = formatReminder(
            item.reminderHour,
            item.reminderMinute,
          );
          const DAY_LABELS = [
            "Sun",
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
          ];
          const formatDays = (days?: number[]) => {
            if (!days || days.length === 0) return null;
            const sorted = [...days].sort((a, b) => a - b);
            return sorted.map((d) => DAY_LABELS[d] ?? d).join(", ");
          };
          const daysText = formatDays(item.reminderDays ?? []);
          const reminderText = baseTime
            ? daysText
              ? `${daysText} • ${baseTime}`
              : baseTime
            : daysText;
          const reminderMenuVisible = reminderMenuHabitId === item.id;

          const isExpanded = !!expandedHabitIds[item.id];
          return (
            <View key={item.id} style={styles.habitWrap}>
              <SwipeableCard
                onSwipeRight={() => toggleHabit(item.id)}
                onSwipeLeft={() => deleteHabit(item.id)}
              >
                <HabitStreakCard
                  title={item.title}
                  streak={item.streak}
                  bestStreak={item.bestStreak}
                  completedToday={item.completedToday}
                  priority={item.priority}
                  onPressToggle={() => toggleHabit(item.id)}
                  onCardPress={() =>
                    setExpandedHabitIds((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                />
              </SwipeableCard>

              {isExpanded && (
                <View
                  style={[
                    styles.expandSection,
                    {
                      borderTopColor: "rgba(255,255,255,0.05)",
                    },
                  ]}
                >
                  {/* Inline Title Rename */}
                  <View style={styles.editTaskRow}>
                    <Text style={[styles.editLabel, { color: colors.textMuted }]}>
                      Rename
                    </Text>
                    <TextInput
                      value={item.title}
                      onChangeText={(newTitle) => {
                        setHabits((curr) => {
                          const next = curr.map((h) =>
                            h.id === item.id ? { ...h, title: newTitle } : h,
                          );
                          void persistHabits(next);
                          return next;
                        });
                      }}
                      placeholder="Habit name"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.editTitleInput,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>

                  {/* Priority Selection Selector */}
                  <View style={styles.editTaskRow}>
                    <Text style={[styles.editLabel, { color: colors.textMuted }]}>
                      Priority
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {[
                        {
                          key: "high",
                          label: "🔴 High",
                          color: colors.error,
                          softColor:
                            colorScheme === "light"
                              ? "rgba(220, 38, 38, 0.08)"
                              : "rgba(239, 68, 68, 0.12)",
                        },
                        {
                          key: "medium",
                          label: "🟡 Medium",
                          color: colors.warning,
                          softColor:
                            colorScheme === "light"
                              ? "rgba(217, 119, 6, 0.08)"
                              : "rgba(245, 158, 11, 0.12)",
                        },
                        {
                          key: "low",
                          label: "🟢 Low",
                          color: colors.success,
                          softColor:
                            colorScheme === "light"
                              ? "rgba(5, 150, 105, 0.08)"
                              : "rgba(16, 185, 129, 0.12)",
                        },
                      ].map((p) => {
                        const isSelected = item.priority === p.key;
                        return (
                          <Pressable
                            key={p.key}
                            onPress={() => {
                              setHabits((curr) => {
                                const next = curr.map((h) =>
                                  h.id === item.id
                                    ? { ...h, priority: p.key as any }
                                    : h,
                                );
                                void persistHabits(next);
                                return next;
                              });
                            }}
                            style={[
                              styles.migratePill,
                              {
                                backgroundColor: isSelected
                                  ? p.softColor
                                  : colors.cardLight,
                                borderColor: isSelected ? p.color : colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: isSelected ? p.color : colors.text,
                                fontSize: 11,
                                fontWeight: "700",
                              }}
                            >
                              {p.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.dividerSmall} />

                  {/* Habit Actions Row */}
                  <View style={styles.expandedActionsRow}>
                    <Pressable
                      onPress={() =>
                        setReminderMenuHabitId(
                          reminderMenuHabitId === item.id ? null : item.id,
                        )
                      }
                      style={[
                        styles.expandedActionBtn,
                        {
                          backgroundColor:
                            item.reminderHour !== undefined
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(255, 255, 255, 0.04)",
                        },
                      ]}
                    >
                      <Feather
                        name="bell"
                        size={13}
                        color={
                          item.reminderHour !== undefined
                            ? colors.warning
                            : colors.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.expandedActionBtnText,
                          {
                            color:
                              item.reminderHour !== undefined
                                ? colors.warning
                                : colors.textMuted,
                          },
                        ]}
                      >
                        {item.reminderHour !== undefined
                          ? formatReminder(
                              item.reminderHour,
                              item.reminderMinute,
                            ) || "Reminder Set"
                          : "Set Reminder"}
                      </Text>
                    </Pressable>
                    {item.reminderHour !== undefined && (
                      <Pressable
                        onPress={() => clearReminder(item.id)}
                        style={[
                          styles.expandedActionBtn,
                          {
                            backgroundColor: "rgba(239, 68, 68, 0.08)",
                          },
                        ]}
                      >
                        <Feather name="bell-off" size={13} color="#EF4444" />
                        <Text
                          style={[
                            styles.expandedActionBtnText,
                            { color: "#EF4444" },
                          ]}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => deleteHabit(item.id)}
                      style={[
                        styles.expandedActionBtn,
                        {
                          backgroundColor: "rgba(239, 68, 68, 0.08)",
                          marginLeft: "auto",
                        },
                      ]}
                    >
                      <Feather name="trash-2" size={13} color="#EF4444" />
                      <Text
                        style={[
                          styles.expandedActionBtnText,
                          { color: "#EF4444" },
                        ]}
                      >
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Habit alarm modal */}
              {reminderMenuVisible && (
                <AppCard style={styles.alarmModal}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.alarmOptions}
                  >
                    {[
                      { label: "7:00", hour: 7, minute: 0 },
                      { label: "12:00", hour: 12, minute: 0 },
                      { label: "18:00", hour: 18, minute: 0 },
                      { label: "21:00", hour: 21, minute: 0 },
                    ].map((option) => (
                      <Pressable
                        key={option.label}
                        onPress={() =>
                          setReminderWithDays(
                            item.id,
                            option.hour,
                            option.minute,
                          )
                        }
                        style={[
                          styles.alarmBtn,
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
                      onPress={() => setReminderCustomVisible((s) => !s)}
                      style={[
                        styles.alarmBtn,
                        {
                          backgroundColor: `${colors.primary}22`,
                        },
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
                    <Pressable
                      onPress={() => clearReminder(item.id)}
                      style={styles.clearBtn}
                    >
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

                  {reminderCustomVisible && (
                    <TimeSelectorDial
                      initialHour={reminderCustomHour}
                      initialMinute={reminderCustomMinute}
                      initialDays={reminderCustomDays}
                      colors={colors}
                      onSave={(hour, minute, days) =>
                        setReminderWithDays(
                          item.id,
                          hour,
                          minute,
                          days?.length ? days : undefined,
                        )
                      }
                    />
                  )}
                </AppCard>
              )}
            </View>
          );
        })
      ) : (
        <View
          style={[
            styles.emptyState,
            { borderColor: colors.border, gap: 16 },
          ]}
        >
          <HabitsEmptyGraphic />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Consistency starts with one pebble.
          </Text>
        </View>
      )}
    </View>
  );
}
