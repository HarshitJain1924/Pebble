import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    AppState,
    AppStateStatus,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AppCard } from "@/components/AppCard";
import { HabitsEmptyGraphic } from "@/components/AppGraphics";
import { HabitItem } from "@/components/HabitItem";
import { ProgressBar } from "@/components/ProgressBar";
import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
import { Spacing } from "@/constants/spacing";
import { Colors } from "@/constants/theme";
import { Typography } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { recordDailyHistorySnapshot } from "@/services/productivityHistory";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/reminders";
import { DAILY_STORAGE_KEY } from "@/services/storage";
import { normalizeHabitsForToday } from "@/services/habitService";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";
import { addStateListener } from "@/services/stateEvents";

export type Habit = {
  id: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  lastCompletedDate?: string;
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[]; // 0 = Sunday .. 6 = Saturday
  notificationIds?: string[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
  recurrenceExceptions?: string[];
  archived?: boolean;
  createdDate?: string;
  startDate?: string;
  previousStreak?: number;
  streakBrokenDate?: string;
};

type DailyPayload = {
  dailyHabits: Habit[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const STARTER_HABITS = [
  "Daily Focus Session",
  "Read 10 Pages",
  "Drink 3L Water",
  "Reflect on Progress",
  "Sleep by 11 PM",
  "Stretch or Walk",
];



const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
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

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};



export default function DailyScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const params = useLocalSearchParams<{
    focusItemId?: string;
    focusItemType?: string;
  }>();
  const focusHabitId =
    typeof params.focusItemId === "string" && params.focusItemType === "habit"
      ? params.focusItemId
      : null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [title, setTitle] = useState("");
  const [selectedHabitPriority, setSelectedHabitPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedHabitPriorityFilter, setSelectedHabitPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [highlightedHabitId, setHighlightedHabitId] = useState<string | null>(
    null,
  );
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const celebrateDateRef = useRef<string | null>(null);
  const habitListRef = useRef<FlatList<Habit>>(null);

  const getPriorityWeight = (priority?: string) => {
    if (priority === "high") return 0;
    if (priority === "low") return 2;
    return 1;
  };

  const displayedHabits = useMemo(() => {
    const today = getDateKey();
    const todayDate = new Date();
    const dayOfWeek = todayDate.getDay(); // Sunday is 0, Monday is 1, etc.

    // Step 1: Filter by recurrence, reminderDays, and archived status
    const todayHabits = habits.filter((h) => {
      if (h.archived) return false;
      if (h.recurrence) {
        return isRecurringOccurrenceForDate(h, today);
      }
      return (
        !h.reminderDays ||
        h.reminderDays.length === 0 ||
        h.reminderDays.includes(dayOfWeek)
      );
    });
    // Step 2: Filter by priority if a filter is active
    const filtered =
      selectedHabitPriorityFilter === "all"
        ? todayHabits
        : todayHabits.filter((h) => h.priority === selectedHabitPriorityFilter);
    // Step 3: Sort — high > medium > low
    return [...filtered].sort(
      (a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority),
    );
  }, [habits, selectedHabitPriorityFilter]);

  const completedCount = useMemo(
    () => displayedHabits.filter((h) => h.completedToday).length,
    [displayedHabits],
  );
  const unfinishedCount = displayedHabits.length - completedCount;
  const completionPct =
    displayedHabits.length === 0 ? 0 : completedCount / displayedHabits.length;
  const completionPctLabel = Math.round(completionPct * 100);
  const longestStreak = useMemo(
    () => habits.reduce((max, h) => Math.max(max, h.bestStreak), 0),
    [habits],
  );

  const persistHabits = useCallback(async (nextHabits: Habit[]) => {
    try {
      const payload: DailyPayload = { dailyHabits: nextHabits };
      await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(payload));
      void recordDailyHistorySnapshot();
    } catch {
      // Ignore
    }
  }, []);

  const cancelNotifications = useCallback(async (ids?: string[]) => {
    await cancelReminderIds(ids);
  }, []);

  const initializeNotifications = useCallback(async () => {
    let Notifications;
    try {
      Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
    } catch {
      // ignore
    }

    if (Platform.OS === "android" && Notifications) {
      try {
        await Notifications.setNotificationChannelAsync("daily-habits", {
          name: "Daily Habits",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      } catch {
        // ignore
      }
    }
  }, []);

  const loadHabits = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      if (!raw) {
        const starter = STARTER_HABITS.map((habitTitle) => ({
          id: `${habitTitle.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: habitTitle,
          streak: 0,
          bestStreak: 0,
          completedToday: false,
        }));
        setHabits(starter);
        await persistHabits(starter);
        return;
      }

      const parsed = JSON.parse(raw) as DailyPayload;
      const normalized = normalizeHabitsForToday(parsed.dailyHabits ?? []);
      setHabits(normalized);
      await persistHabits(normalized);
    } catch {
      setHabits([]);
    }
  }, [persistHabits]);

  useEffect(() => {
    initializeNotifications();
  }, [initializeNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadHabits();
    }, [loadHabits])
  );

  useEffect(() => {
    const unsubscribe = addStateListener("habits_changed", (emitterId) => {
      if (emitterId !== "daily_screen") {
        void loadHabits();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [loadHabits]);

  useEffect(() => {
    if (!focusHabitId) {
      return;
    }

    setHighlightedHabitId(focusHabitId);
    const index = habits.findIndex((habit) => habit.id === focusHabitId);
    if (index >= 0) {
      habitListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.2,
      });
    }

    const timer = setTimeout(() => setHighlightedHabitId(null), 2200);
    return () => clearTimeout(timer);
  }, [focusHabitId, habits]);

  useEffect(() => {
    const today = getDateKey();
    if (
      habits.length > 0 &&
      completedCount === habits.length &&
      celebrateDateRef.current !== today
    ) {
      celebrateDateRef.current = today;
      setShowCelebrate(true);
      const timer = setTimeout(() => setShowCelebrate(false), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [completedCount, habits.length]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state !== "active") {
          return;
        }

        setHabits((current) => {
          const normalized = normalizeHabitsForToday(current);
          if (JSON.stringify(normalized) !== JSON.stringify(current)) {
            persistHabits(normalized);
            return normalized;
          }
          return current;
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }, [persistHabits]);

  const addHabit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }

    const next: Habit = {
      id: `habit-${Date.now()}`,
      title: trimmed,
      streak: 0,
      bestStreak: 0,
      completedToday: false,
      priority: selectedHabitPriority,
    };

    setHabits((current) => {
      const updated = [next, ...current];
      persistHabits(updated);
      return updated;
    });
    setTitle("");
    setSelectedHabitPriority("medium");
  };

  const deleteHabit = async (id: string) => {
    const target = habits.find((habit) => habit.id === id);
    await cancelNotifications(target?.notificationIds ?? []);

    setHabits((current) => {
      const updated = current.filter((habit) => habit.id !== id);
      persistHabits(updated);
      return updated;
    });
  };

  const toggleHabit = async (id: string) => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
    const habit = habits.find((h) => h.id === id);
    if (!habit) return;

    let updatedHabit;
    const isCompleting = !habit.completedToday;
    let xpAwardedDate: string | undefined;
    try {
      const { handleHabitXpChange } = require("@/services/settingsService");
      const res = await handleHabitXpChange(habit, isCompleting, today);
      xpAwardedDate = res.xpAwardedDate;
    } catch {}

    if (isCompleting) {
      let nextStreak = 1;
      if (habit.lastCompletedDate === today) {
        nextStreak = habit.streak || 1;
      } else if (habit.lastCompletedDate === yesterday) {
        nextStreak = habit.streak + 1;
      }

      updatedHabit = {
        ...habit,
        completedToday: true,
        lastCompletedDate: today,
        streak: nextStreak,
        bestStreak: Math.max(habit.bestStreak, nextStreak),
        xpAwardedDate,
      };

      try {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch {}
    } else {
      const rolledBackStreak = Math.max(0, habit.streak - 1);
      updatedHabit = {
        ...habit,
        completedToday: false,
        streak: rolledBackStreak,
        lastCompletedDate: rolledBackStreak > 0 ? yesterday : undefined,
        xpAwardedDate,
      };
    }

    const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    try {
      const { earnPebble, undoLastPebble } = require("@/services/pebbleService");
      if (isCompleting) {
        await earnPebble("habit");
      } else {
        await undoLastPebble("habit");
      }
    } catch {}

    try {
      const { emitStateChange } = require("@/services/stateEvents");
      emitStateChange("habits_changed", "daily_screen");
    } catch {}
    void recordDailyHistorySnapshot();
  };


  // HabitItem handles streak grids, day labels, and reminders internally

  return (
    <ScreenSwipeWrapper prevRoute="/tasks" nextRoute="/calendar">
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: "transparent" }]}
      >
        <Animated.View
          entering={FadeInDown.duration(450).springify()}
          style={{ flex: 1 }}
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.container}>
              {/* Habits list */}
              <FlatList
                ref={habitListRef}
                ListHeaderComponent={
                  <View style={{ gap: 16, marginBottom: 16 }}>
                    {/* Header */}
                    <View style={styles.header}>
                      <Text style={[styles.kicker, { color: colors.primary }]}>
                        {getGreeting().toUpperCase()}
                      </Text>
                      <Text style={[styles.title, { color: colors.text }]}>
                        Daily Habits
                      </Text>
                    </View>

                    {/* Collapsible Stats Section */}
                    <AppCard style={{ padding: 12 }}>
                      <Pressable
                        onPress={() => setStatsExpanded(!statsExpanded)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Feather name="bar-chart-2" size={16} color={colors.primary} />
                          <Text style={{ fontWeight: "700", color: colors.text, fontSize: 14 }}>
                            Daily Progress
                          </Text>
                          <View
                            style={{
                              backgroundColor: `${colors.primary}15`,
                              borderRadius: 12,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                            }}
                          >
                            <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>
                              {completionPctLabel}% Done
                            </Text>
                          </View>
                        </View>
                        <Feather
                          name={statsExpanded ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>

                      {statsExpanded && (
                        <View style={{ marginTop: 12, gap: 12 }}>
                          {/* Banners */}
                          {unfinishedCount > 0 && (
                            <View
                              style={[
                                styles.warningBanner,
                                {
                                  backgroundColor: `${colors.warning}15`,
                                  borderColor: `${colors.warning}33`,
                                  marginTop: 0,
                                },
                              ]}
                            >
                              <Feather
                                name="alert-triangle"
                                size={16}
                                color={colors.warning}
                              />
                              <Text style={[styles.warningText, { color: colors.warning }]}>
                                {unfinishedCount} habits left today
                              </Text>
                            </View>
                          )}

                          {showCelebrate && (
                            <View
                              style={[
                                styles.successBanner,
                                {
                                  backgroundColor: `${colors.success}15`,
                                  borderColor: `${colors.success}33`,
                                  marginTop: 0,
                                },
                              ]}
                            >
                              <Feather name="award" size={18} color={colors.success} />
                              <Text style={[styles.successText, { color: colors.success }]}>
                                Perfect run! All habits completed today.
                              </Text>
                            </View>
                          )}

                          {/* Summary / Streaks */}
                          <View style={[styles.summaryRow, { gap: 8 }]}>
                            <View style={[styles.summaryHalf, { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardLight }]}>
                              <Text style={[styles.summaryLabel, { color: colors.textMuted, fontSize: 11 }]}>
                                Completed
                              </Text>
                              <Text style={[styles.summaryVal, { color: colors.text, fontSize: 16, fontWeight: "700" }]}>
                                {completedCount}/{habits.length}
                              </Text>
                            </View>
                            <View style={[styles.summaryHalf, { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardLight }]}>
                              <Text style={[styles.summaryLabel, { color: colors.textMuted, fontSize: 11 }]}>
                                Longest Streak
                              </Text>
                              <Text style={[styles.summaryVal, { color: colors.text, fontSize: 16, fontWeight: "700" }]}>
                                {longestStreak} Days
                              </Text>
                            </View>
                          </View>

                          {/* Progress bar */}
                          <ProgressBar progress={completionPct} />
                        </View>
                      )}
                    </AppCard>

                    {/* Add Habit input */}
                    <AppCard style={styles.addCard}>
                      <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="Add a new habit"
                        placeholderTextColor={colors.textMuted}
                        onSubmitEditing={addHabit}
                        onFocus={() => setIsAddingHabit(true)}
                        onBlur={() => {
                          if (title.trim() === "") setIsAddingHabit(false);
                        }}
                        style={[styles.addInput, { color: colors.text }]}
                      />
                      <Pressable
                        onPress={addHabit}
                        style={[
                          styles.addButton,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Feather name="plus" size={18} color="#ffffff" />
                      </Pressable>
                    </AppCard>

                    {/* Priority Selector */}
                    {(isAddingHabit || title.trim().length > 0) && (
                      <View style={styles.prioritySelectorRow}>
                        <Text
                          style={[
                            styles.prioritySelectorLabel,
                            { color: colors.textMuted },
                          ]}
                        >
                          Priority
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {[
                            { key: "high", label: "🔴 High", color: colors.error, softColor: colorScheme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.12)" },
                            { key: "medium", label: "🟡 Medium", color: colors.warning, softColor: colorScheme === "light" ? "rgba(217, 119, 6, 0.08)" : "rgba(245, 158, 11, 0.12)" },
                            { key: "low", label: "🟢 Low", color: colors.success, softColor: colorScheme === "light" ? "rgba(5, 150, 105, 0.08)" : "rgba(16, 185, 129, 0.12)" },
                          ].map((p) => {
                            const isSelected = selectedHabitPriority === p.key;
                            return (
                              <Pressable
                                key={p.key}
                                onPress={() => setSelectedHabitPriority(p.key as any)}
                                style={({ pressed }) => [
                                  styles.priorityChoicePill,
                                  {
                                    backgroundColor: isSelected ? p.softColor : colors.cardLight,
                                    borderColor: isSelected ? p.color : colors.border,
                                    opacity: pressed ? 0.9 : 1,
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    color: isSelected ? p.color : colors.text,
                                    fontWeight: "700",
                                    fontSize: 12,
                                  }}
                                >
                                  {p.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Priority Filter Row */}
                    <View style={[styles.prioritySelectorRow, { marginBottom: 8, marginTop: 4 }]}>
                      <Text
                        style={[
                          styles.prioritySelectorLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Filter Priority
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {[
                          { key: "all", label: "All" },
                          { key: "high", label: "🔴 High" },
                          { key: "medium", label: "🟡 Medium" },
                          { key: "low", label: "🟢 Low" },
                        ].map((p) => {
                          const isSelected = selectedHabitPriorityFilter === p.key;
                          return (
                            <Pressable
                              key={p.key}
                              onPress={() => setSelectedHabitPriorityFilter(p.key as any)}
                              style={({ pressed }) => [
                                styles.priorityChoicePill,
                                {
                                  backgroundColor: isSelected
                                    ? colorScheme === "light" ? "#E2E8F0" : "#27272A"
                                    : colors.cardLight,
                                  borderColor: isSelected ? colors.primary : colors.border,
                                  opacity: pressed ? 0.9 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: isSelected ? colors.text : colors.textMuted,
                                  fontWeight: isSelected ? "700" : "500",
                                  fontSize: 12,
                                }}
                              >
                                {p.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                }
                data={displayedHabits}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View
                    style={[styles.emptyState, { borderColor: colors.border }]}
                  >
                    <HabitsEmptyGraphic />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>
                      Every goal starts with one pebble.
                    </Text>
                    <Text
                      style={[
                        styles.emptySubtitle,
                        { color: colors.textMuted },
                      ]}
                    >
                      Add one above and start your streaks.
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <HabitItem
                    item={item}
                    colors={colors}
                    colorScheme={colorScheme}
                    onToggleHabit={() => toggleHabit(item.id)}
                    onDeleteHabit={() => deleteHabit(item.id)}
                    highlightedHabitId={highlightedHabitId}
                  />
                )}
              />
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </SafeAreaView>
    </ScreenSwipeWrapper>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  header: { gap: 4 },
  kicker: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: Typography.sizes.display,
    fontWeight: "700",
    lineHeight: 38,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  warningText: { fontSize: Typography.sizes.sm, fontWeight: "600" },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  successText: { fontSize: Typography.sizes.sm, fontWeight: "600" },
  summaryRow: { flexDirection: "row", gap: 12 },
  summaryHalf: { flex: 1, gap: 4, padding: Spacing.md },
  summaryLabel: { fontSize: Typography.sizes.xs, fontWeight: "600" },
  summaryVal: { fontSize: 22, fontWeight: "800" },
  progressSection: { padding: Spacing.lg, gap: Spacing.sm },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: { fontSize: Typography.sizes.md, fontWeight: "700" },
  progressPercent: { fontSize: Typography.sizes.md, fontWeight: "800" },
  addCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    paddingLeft: 14,
  },
  addInput: { flex: 1, fontSize: Typography.sizes.md, paddingVertical: 10 },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { gap: 10, paddingBottom: 120 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 24,
    padding: 32,
    gap: 12,
    marginTop: 20,
  },
  emptyTitle: { fontSize: Typography.sizes.lg, fontWeight: "700" },
  emptySubtitle: { fontSize: Typography.sizes.sm, textAlign: "center" },
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
  customPicker: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 12,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeField: {
    width: 56,
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    textAlign: "center",
  },
  daysRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  setBtn: { paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  prioritySelectorRow: {
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  prioritySelectorLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  priorityChoicePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
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
  timeSelectWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  timeCol: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    minWidth: 70,
  },
  chevronBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 28,
    fontWeight: "700",
    marginVertical: 2,
    fontVariant: ["tabular-nums"],
  },
  presetOffsetsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 8,
  },
  offsetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  offsetBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
