import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  SafeAreaView,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { Radius } from "@/shared/constants/radii";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { FloatingGlow } from "@/shared/components/layout/AmbientBackground";
import { addStateListener } from "@/services/events/state-events";
import { getPebbleCounts } from "@/features/profile/services/pebble.service";
import {
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
} from "@/repositories";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { deduplicateEntities } from "@/shared/utils/deduplication";
import { TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";
import { CategoryChip } from "@/shared/components/design-system";
import {
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import {
  dateKeyFromDate,
  getTodayDateKey,
  parseDateKey,
} from "@/shared/utils/date-key";
import { getMilestoneInfo } from "@/shared/utils/pebble-milestones";

import { ProductivityDashboard } from "@/features/profile/components/ProductivityDashboard";
import { WeeklyProductivityTrend } from "@/features/profile/components/WeeklyProductivityTrend";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CategoryStat = {
  name: string;
  count: number;
  pct: number;
  color: string;
};

const PEBBLE_SOURCE_ROWS = [
  { key: "task", label: "Tasks", color: "#8B5CF6" },
  { key: "habit", label: "Habits", color: "#F97316" },
  { key: "checklist", label: "Checklists", color: "#06B6D4" },
  { key: "focus", label: "Focus", color: "#10B981" },
] as const;

export default function StatsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todosCompleted: 0,
    habitsCompleted: 0,
    activeStreak: 0,
    bestStreak: 0,
    avgScore: 0,
    focusSessions: 0,
    focusTime: 0,
    completionRate: 0,
    mostProductiveWorkspace: "Inbox",
    peakProductiveDayString: null as string | null,
    strongestHabitName: null as string | null,
    strongestHabitStreak: 0,
  });
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [weeklyTrends, setWeeklyTrends] = useState<any[]>([]);
  const [pebbleSources, setPebbleSources] = useState({
    task: 0,
    habit: 0,
    checklist: 0,
    focus: 0,
  });
  const [lifetimePebbles, setLifetimePebbles] = useState(0);
  const [hasActivity, setHasActivity] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const now = new Date();

      const folderList = await WorkspaceRepository.getWorkspaces();
      const folderIds = Array.from(
        new Set([
          INBOX_WORKSPACE_ID,
          MY_PEBBLES_WORKSPACE_ID,
          ...folderList.map((f) => f.id),
        ]),
      );
      const folderNameMap: Record<string, string> = {
        [INBOX_WORKSPACE_ID]: "Inbox",
        [MY_PEBBLES_WORKSPACE_ID]: "My Pebbles",
      };
      folderList.forEach((f) => {
        folderNameMap[f.id] = f.name;
      });

      let totalCompletedTodos = 0;
      let totalTasks = 0;
      const categoryCounts: Record<string, number> = {};
      const workspaceCounts: Record<string, number> = {};

      const allTasksRaw: any[] = [];
      const allHabitsRaw: any[] = [];

      for (const fId of folderIds) {
        const [tasksMap, habitsMap] = await Promise.all([
          TaskRepository.getTasks(fId),
          HabitRepository.getHabits(fId),
        ]);
        allTasksRaw.push(...Object.values(tasksMap));
        allHabitsRaw.push(...Object.values(habitsMap));
      }

      const tasks = deduplicateEntities(allTasksRaw);
      const habits = deduplicateEntities(allHabitsRaw);

      totalTasks = tasks.length;
      tasks.forEach((todo) => {
        if (isTaskCompleted(todo)) {
          totalCompletedTodos += 1;
          if (todo.categoryId) {
            const cat = todo.categoryId.toLowerCase();
            categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
          }
          const fId = todo.workspaceId || INBOX_WORKSPACE_ID;
          workspaceCounts[fId] = (workspaceCounts[fId] ?? 0) + 1;
        }
      });

      let maxCount = 0;
      let bestFolderId = INBOX_WORKSPACE_ID;
      Object.entries(workspaceCounts).forEach(([fId, cnt]) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          bestFolderId = fId;
        }
      });
      const mostProductiveWorkspace = folderNameMap[bestFolderId] ?? "Inbox";

      const todayStr = getTodayDateKey();
      let totalCompletedHabits = 0;
      let streak = 0;
      let bestStreak = 0;
      let strongestHabitName: string | null = null;
      let strongestHabitStreak = 0;

      habits.forEach((h) => {
        if (isHabitCompletedToday(h, todayStr)) totalCompletedHabits += 1;
        streak = Math.max(streak, h.streak || 0);
        bestStreak = Math.max(bestStreak, h.bestStreak || 0);
        const hStreak = Math.max(h.streak || 0, h.bestStreak || 0);
        if (hStreak > strongestHabitStreak) {
          strongestHabitStreak = hStreak;
          strongestHabitName = h.title;
        }
      });

      const rawHistory = await AsyncStorage.getItem("pebble:history");
      let historyList: any[] = [];
      let pastTodosCompleted = 0;
      let pastHabitsCompleted = 0;
      const todayKey = getTodayDateKey();
      if (rawHistory) {
        try {
          historyList = JSON.parse(rawHistory);
          if (Array.isArray(historyList)) {
            historyList.forEach((entry: any) => {
              if (entry.date !== todayKey) {
                pastTodosCompleted += entry.completedTodos || 0;
                pastHabitsCompleted += entry.completedHabits || 0;
              }
            });
          } else {
            historyList = [];
          }
        } catch {
          historyList = [];
        }
      }

      let peakProductiveDayString: string | null = null;
      if (historyList.length > 0) {
        const sortedHistory = [...historyList].sort(
          (a, b) => b.score - a.score,
        );
        const peakEntry = sortedHistory[0];
        if (peakEntry && peakEntry.score > 0) {
          const [py, pm, pd] = peakEntry.date.split("-").map(Number);
          const pDate = new Date(py, pm - 1, pd);
          const dayName = WEEKDAY_NAMES[pDate.getDay()];
          peakProductiveDayString = `${dayName} · ${peakEntry.score}%`;
        }
      }

      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const last3MonthsHistory = historyList.filter(
        (h: any) => parseDateKey(h.date) >= ninetyDaysAgo,
      );
      const scores = last3MonthsHistory.map((h: any) => h.score);
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;

      // Session count is lifetime and comes from the canonical pebble log;
      // `completedToday` is a daily-reset counter and must not be used here.
      const rawFocus = await AsyncStorage.getItem("todoapp:focus:stats");
      let focusTime = 0;
      if (rawFocus) {
        try {
          const parsed = JSON.parse(rawFocus);
          focusTime = parsed.totalFocusTime ?? 0;
        } catch {
          // ignore malformed focus stats
        }
      }

      const actualTodosCompleted = pastTodosCompleted + totalCompletedTodos;
      const actualHabitsCompleted = pastHabitsCompleted + totalCompletedHabits;

      const completionRate =
        totalTasks > 0
          ? Math.round((totalCompletedTodos / totalTasks) * 100)
          : actualTodosCompleted > 0
            ? 100
            : 0;

      const pebbleCounts = await getPebbleCounts();
      const lifetimeTypes = pebbleCounts.lifetimeTypes ?? {
        task: 0,
        habit: 0,
        focus: 0,
        checklist: 0,
      };

      setStats({
        todosCompleted: actualTodosCompleted,
        habitsCompleted: actualHabitsCompleted,
        activeStreak: Math.max(pebbleCounts.streak, streak),
        bestStreak: Math.max(pebbleCounts.bestStreak, bestStreak),
        avgScore,
        focusSessions: lifetimeTypes.focus ?? 0,
        focusTime,
        completionRate,
        mostProductiveWorkspace,
        peakProductiveDayString,
        strongestHabitName,
        strongestHabitStreak,
      });

      setPebbleSources({
        task: lifetimeTypes.task ?? 0,
        habit: lifetimeTypes.habit ?? 0,
        checklist: lifetimeTypes.checklist ?? 0,
        focus: lifetimeTypes.focus ?? 0,
      });
      setLifetimePebbles(pebbleCounts.lifetime);

      const trends = [];
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = dateKeyFromDate(d);
        const entry = historyList.find((h: any) => h.date === key);
        const score = entry ? entry.score : 0;
        trends.push({
          dayName: WEEKDAY_NAMES[d.getDay()][0],
          dateNum: d.getDate(),
          score,
          dateString: key,
        });
      }
      setWeeklyTrends(trends);

      const catColors: Record<string, string> = {};
      TASK_CATEGORY_META.forEach((cat) => {
        catColors[cat.key] = cat.tint;
      });

      const totalCategoryTasks =
        Object.values(categoryCounts).reduce((a, b) => a + b, 0) || 1;
      const breakdowns = Object.entries(categoryCounts).map(
        ([name, count]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          count,
          pct: count / totalCategoryTasks,
          color: catColors[name] ?? "#6B7280",
        }),
      );
      setCategoryStats(breakdowns.sort((a, b) => b.count - a.count));

      setHasActivity(
        pebbleCounts.lifetime > 0 ||
          totalTasks > 0 ||
          historyList.length > 0 ||
          habits.length > 0,
      );
    } catch (err) {
      console.warn("Failed loading stats for stats screen", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep focus/lifetime stats coherent when pebbles change elsewhere.
  useEffect(() => {
    return addStateListener("pebbles_changed", () => {
      loadData();
    });
  }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: colors.background, justifyContent: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const milestone = getMilestoneInfo(lifetimePebbles);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            router.back();
          }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Stats</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FloatingGlow
          color={colors.primary}
          size={220}
          opacity={0.05}
          pulseSpeed={7000}
          style={{ position: "absolute", left: -50, top: 40 }}
        />

        {!hasActivity ? (
          <View style={styles.centeredState}>
            <Feather name="bar-chart-2" size={24} color={colors.textMuted} />
            <Text style={[styles.stateTitle, { color: colors.text }]}>
              Not enough data yet.
            </Text>
            <Text style={[styles.stateBody, { color: colors.textMuted }]}>
              Check back after a few days.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                THIS WEEK
              </Text>
              <WeeklyProductivityTrend
                weeklyTrends={weeklyTrends}
                colors={colors}
                colorScheme={colorScheme}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                AT A GLANCE
              </Text>
              <ProductivityDashboard stats={stats} colors={colors} />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                PATTERNS
              </Text>
              <View style={styles.insightsList}>
                <View
                  style={[styles.insightRow, { borderColor: colors.border }]}
                >
                  <Feather name="folder" size={16} color={colors.primary} />
                  <Text style={[styles.insightText, { color: colors.text }]}>
                    Most of your work happens in{" "}
                    <Text style={styles.insightEmphasis}>
                      {stats.mostProductiveWorkspace}
                    </Text>
                    .
                  </Text>
                </View>

                {stats.peakProductiveDayString ? (
                  <View
                    style={[styles.insightRow, { borderColor: colors.border }]}
                  >
                    <Feather name="calendar" size={16} color={colors.success} />
                    <Text style={[styles.insightText, { color: colors.text }]}>
                      Your strongest day scored{" "}
                      <Text style={styles.insightEmphasis}>
                        {stats.peakProductiveDayString}
                      </Text>
                      .
                    </Text>
                  </View>
                ) : null}

                {stats.strongestHabitName ? (
                  <View
                    style={[styles.insightRow, { borderColor: colors.border }]}
                  >
                    <Feather name="trending-up" size={16} color={colors.warning} />
                    <Text style={[styles.insightText, { color: colors.text }]}>
                      <Text style={styles.insightEmphasis}>
                        {stats.strongestHabitName}
                      </Text>{" "}
                      is your strongest habit
                      {stats.strongestHabitStreak > 0
                        ? ` at ${stats.strongestHabitStreak} days`
                        : ""}
                      .
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                WHERE YOUR WORK GOES
              </Text>

              <View
                style={[
                  styles.sourcesBlock,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={[styles.blockTitle, { color: colors.text }]}>
                  {lifetimePebbles} Pebbles earned
                </Text>
                <Text style={[styles.blockCaption, { color: colors.textMuted }]}>
                  Stage {milestone.stage} · {milestone.name}
                </Text>

                <View style={styles.sourcesList}>
                  {PEBBLE_SOURCE_ROWS.map((source) => (
                    <View key={source.key} style={styles.sourceRow}>
                      <View
                        style={[
                          styles.sourceDot,
                          { backgroundColor: source.color },
                        ]}
                      />
                      <Text
                        style={[styles.sourceLabel, { color: colors.textMuted }]}
                      >
                        {source.label}
                      </Text>
                      <Text
                        style={[styles.sourceValue, { color: colors.text }]}
                      >
                        {pebbleSources[source.key]}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {categoryStats.length > 0 && (
                <View style={styles.categoriesBlock}>
                  {categoryStats.map((cat, idx) => (
                    <View
                      key={cat.name}
                      style={[styles.catRow, idx !== 0 && { marginTop: 14 }]}
                    >
                      <View style={styles.catInfoRow}>
                        <View style={styles.catLabelRow}>
                          <CategoryChip
                            category={cat.name.toLowerCase()}
                            size="xs"
                          />
                          <Text
                            style={[styles.catNameText, { color: colors.text }]}
                          >
                            {cat.name}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.catCountText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {cat.count} tasks
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.catProgressBg,
                          { backgroundColor: colors.border },
                        ]}
                      >
                        <View
                          style={[
                            styles.catProgressFill,
                            {
                              width: `${cat.pct * 100}%`,
                              backgroundColor: cat.color,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 28,
  },
  centeredState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 80,
  },
  stateTitle: { fontSize: 17, fontWeight: "700" },
  stateBody: { fontSize: 13 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  insightsList: { gap: 12 },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  insightText: { flex: 1, fontSize: 13, lineHeight: 19 },
  insightEmphasis: { fontWeight: "700" },
  sourcesBlock: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 4,
  },
  blockTitle: { fontSize: 17, fontWeight: "800" },
  blockCaption: { fontSize: 12 },
  sourcesList: { marginTop: 10, gap: 10 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  sourceLabel: { flex: 1, fontSize: 13 },
  sourceValue: { fontSize: 14, fontWeight: "700" },
  categoriesBlock: { marginTop: 4 },
  catRow: { gap: 8 },
  catInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catNameText: { fontSize: 13, fontWeight: "600" },
  catCountText: { fontSize: 12 },
  catProgressBg: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  catProgressFill: { height: "100%", borderRadius: Radius.pill },
});
