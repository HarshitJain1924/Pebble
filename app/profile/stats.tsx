import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  SafeAreaView,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/components/ui/AppText";
import { AppCard } from "@/components/AppCard";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { FloatingGlow } from "@/components/AmbientBackground";
import { getProfile } from "@/services/settingsService";
import { getHistoryForMonth } from "@/services/productivityHistory";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "@/services/storage";

// Import existing modular components
import { ProductivityDashboard } from "@/components/profile/ProductivityDashboard";
import { WeeklyProductivityTrend } from "@/components/profile/WeeklyProductivityTrend";
import { FocusRhythmPeaks } from "@/components/profile/FocusRhythmPeaks";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type CategoryStat = {
  name: string;
  count: number;
  pct: number;
  color: string;
};

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
    mostProductiveWorkspace: "Default",
    peakProductiveDayString: "None yet",
    strongestHabitName: "None yet",
    strongestHabitStreak: 0,
  });
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [weeklyTrends, setWeeklyTrends] = useState<any[]>([]);
  const [cognitiveFlowStats, setCognitiveFlowStats] = useState<any>({
    morning: 0,
    afternoon: 0,
    evening: 0,
    morningPct: 0,
    afternoonPct: 0,
    eveningPct: 0,
    peakZone: "Balanced Flow",
    icon: "activity" as any,
  });

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      
      // Load Completed Todos
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let totalCompletedTodos = 0;
      let totalTasks = 0;
      const categoryCounts: Record<string, number> = {};
      const workspaceCounts: Record<string, number> = {};
      let mostProductiveWorkspace = "Default";

      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];
        totalTasks = allTodos.length;
        totalCompletedTodos = allTodos.filter((t) => t.completed).length;

        allTodos.forEach((todo) => {
          if (todo.completed) {
            if (todo.category) {
              const cat = todo.category.toLowerCase();
              categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
            }
            const folderId = todo.folderId || "default";
            workspaceCounts[folderId] = (workspaceCounts[folderId] ?? 0) + 1;
          }
        });

        let maxCount = 0;
        let bestFolderId = "default";
        Object.entries(workspaceCounts).forEach(([fId, cnt]) => {
          if (cnt > maxCount) {
            maxCount = cnt;
            bestFolderId = fId;
          }
        });

        if (parsed.lists) {
          const listObj = parsed.lists.find((l: any) => l.id === bestFolderId);
          if (listObj) {
            mostProductiveWorkspace = listObj.name;
          }
        }
      }

      // Load Habits
      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      let totalCompletedHabits = 0;
      let streak = 0;
      let bestStreak = 0;
      let strongestHabitName = "None yet";
      let strongestHabitStreak = 0;

      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const allHabits = (parsed.dailyHabits || []) as any[];
        totalCompletedHabits = allHabits.filter((h) => h.completedToday).length;
        streak = allHabits.reduce((max, h) => Math.max(max, h.streak || 0), 0);
        bestStreak = allHabits.reduce((max, h) => Math.max(max, h.bestStreak || 0), 0);

        let maxHabitStreak = 0;
        allHabits.forEach((h) => {
          const hStreak = Math.max(h.streak || 0, h.bestStreak || 0);
          if (hStreak > maxHabitStreak) {
            maxHabitStreak = hStreak;
            strongestHabitName = h.title;
            strongestHabitStreak = hStreak;
          }
        });
      }

      // Query Lifetime History
      const rawHistory = await AsyncStorage.getItem("todoapp:history:v1");
      let historyList: any[] = [];
      let pastTodosCompleted = 0;
      let pastHabitsCompleted = 0;
      const todayKey = getDateKey();
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
          }
        } catch (e) {
          // ignore
        }
      }

      // Calculate Peak Productive Day based on historical data
      let peakProductiveDayString = "None yet";
      if (historyList.length > 0) {
        const sortedHistory = [...historyList].sort((a, b) => b.score - a.score);
        const peakEntry = sortedHistory[0];
        if (peakEntry && peakEntry.score > 0) {
          const [py, pm, pd] = peakEntry.date.split("-").map(Number);
          const pDate = new Date(py, pm - 1, pd);
          const dayName = WEEKDAY_NAMES[pDate.getDay()];
          peakProductiveDayString = `${dayName}, ${py}-${pm}-${pd} (${peakEntry.score}%)`;
        }
      }

      // Load Average Productivity Score (last 3 months / 90 days)
      const parseDateKey = (val: string) => {
        const [y, m, d] = val.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const last3MonthsHistory = historyList.filter((h: any) => parseDateKey(h.date) >= ninetyDaysAgo);
      const scores = last3MonthsHistory.map((h: any) => h.score);
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;

      // Query Focus stats
      const rawFocus = await AsyncStorage.getItem("todoapp:focus:stats");
      let focusSessions = 0;
      let focusTime = 0;
      if (rawFocus) {
        try {
          const parsed = JSON.parse(rawFocus);
          focusSessions = parsed.completedToday ?? 0;
          focusTime = parsed.totalFocusTime ?? 0;
        } catch {}
      }

      const actualTodosCompleted = pastTodosCompleted + totalCompletedTodos;
      const actualHabitsCompleted = pastHabitsCompleted + totalCompletedHabits;

      const completionRate = totalTasks > 0
        ? Math.round((totalCompletedTodos / totalTasks) * 100)
        : actualTodosCompleted > 0
          ? 100
          : 0;

      const { getPebbleCounts } = require("@/services/pebbleService");
      const pebbleCounts = await getPebbleCounts();

      setStats({
        todosCompleted: actualTodosCompleted,
        habitsCompleted: actualHabitsCompleted,
        activeStreak: Math.max(pebbleCounts.streak, streak),
        bestStreak: Math.max(pebbleCounts.bestStreak, bestStreak),
        avgScore: avgScore,
        focusSessions,
        focusTime,
        completionRate,
        mostProductiveWorkspace,
        peakProductiveDayString,
        strongestHabitName,
        strongestHabitStreak,
      });

      // Weekly Momentum Trends (using full historyList to support month boundaries)
      const trends = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = getDateKey(d);
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

      // Cognitive Flow Peaks
      const { getCognitiveFlowStats } = require("@/services/cognitiveFlowService");
      const flowStats = await getCognitiveFlowStats();
      setCognitiveFlowStats({
        morning: 0, // Mock fields not directly shown in ProgressSection
        afternoon: 0,
        evening: 0,
        ...flowStats,
      });

      // Category breakdowns
      const catColors: Record<string, string> = {
        work: "#6366F1",
        personal: "#10B981",
        health: "#F59E0B",
        learning: "#3B82F6",
        creative: "#A855F7",
        focus: "#06B6D4",
      };

      const totalCategoryTasks = Object.values(categoryCounts).reduce((a, b) => a + b, 0) || 1;
      const breakdowns = Object.entries(categoryCounts).map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        pct: count / totalCategoryTasks,
        color: catColors[name] ?? "#6B7280",
      }));
      setCategoryStats(breakdowns.sort((a, b) => b.count - a.count));

    } catch (err) {
      console.warn("Failed loading stats for stats screen", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable

          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.back();
          }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Analytics & Trends</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Glow ambient background */}
        <FloatingGlow
          color={colors.primary}
          size={220}
          opacity={0.05}
          pulseSpeed={7000}
          style={{ position: "absolute", left: -50, top: 40 }}
        />

        {/* Productivity Dashboard */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            PRODUCTIVITY METRICS
          </Text>
          <ProductivityDashboard stats={stats} colors={colors} />
        </View>

        {/* Insights Summary */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            SANCTUARY INSIGHTS
          </Text>
          <View style={styles.insightsList}>
            <AppCard style={styles.insightRow}>
              <View style={[styles.iconBox, { backgroundColor: "rgba(99, 102, 241, 0.08)" }]}>
                <Feather name="folder" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: colors.textMuted }]}>
                  Most Active Workspace
                </Text>
                <Text style={[styles.insightValue, { color: colors.text }]}>
                  {stats.mostProductiveWorkspace}
                </Text>
              </View>
            </AppCard>

            <AppCard style={styles.insightRow}>
              <View style={[styles.iconBox, { backgroundColor: "rgba(16, 185, 129, 0.08)" }]}>
                <Feather name="calendar" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: colors.textMuted }]}>
                  Peak Focus Day
                </Text>
                <Text style={[styles.insightValue, { color: colors.text }]}>
                  {stats.peakProductiveDayString}
                </Text>
              </View>
            </AppCard>

            <AppCard style={styles.insightRow}>
              <View style={[styles.iconBox, { backgroundColor: "rgba(245, 158, 11, 0.08)" }]}>
                <Feather name="trending-up" size={16} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: colors.textMuted }]}>
                  Strongest Habit
                </Text>
                <Text style={[styles.insightValue, { color: colors.text }]}>
                  {stats.strongestHabitName}{" "}
                  {stats.strongestHabitStreak > 0 ? `(Streak: ${stats.strongestHabitStreak})` : ""}
                </Text>
              </View>
            </AppCard>
          </View>
        </View>

        {/* Weekly Productivity Trend Card */}
        {weeklyTrends.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              WEEKLY FOCUS HISTORY
            </Text>
            <WeeklyProductivityTrend
              weeklyTrends={weeklyTrends}
              colors={colors}
              colorScheme={colorScheme}
            />
          </View>
        )}

        {/* Cognitive Focus Rhythm & Peaks Analysis */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            DAILY FOCUS RHYTHM
          </Text>
          <FocusRhythmPeaks
            cognitiveFlowStats={cognitiveFlowStats}
            colors={colors}
            colorScheme={colorScheme}
          />
        </View>

        {/* Category breakdown */}
        {categoryStats.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              TASKS BY CATEGORY
            </Text>
            <AppCard style={styles.categoryCard}>
              {categoryStats.map((cat, idx) => (
                <View key={cat.name} style={[styles.catRow, idx !== 0 && { marginTop: 12 }]}>
                  <View style={styles.catInfoRow}>
                    <Text style={[styles.catNameText, { color: colors.text }]}>
                      {cat.name}
                    </Text>
                    <Text style={[styles.catCountText, { color: colors.textMuted }]}>
                      {cat.count} tasks
                    </Text>
                  </View>
                  <View style={[styles.catProgressBg, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
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
            </AppCard>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  insightsList: {
    gap: 10,
  },
  insightRow: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightValue: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  categoryCard: {
    padding: 16,
    borderRadius: 24,
  },
  catRow: {
    gap: 6,
  },
  catInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catNameText: {
    fontSize: 12,
    fontWeight: "800",
  },
  catCountText: {
    fontSize: 11,
    fontWeight: "600",
  },
  catProgressBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  catProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
