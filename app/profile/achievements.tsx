import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  SafeAreaView,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/components/ui/AppText";
import { AppCard } from "@/components/AppCard";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { FloatingGlow } from "@/components/AmbientBackground";
import { getProfile, type UserProfile } from "@/services/settingsService";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "@/services/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Achievement {
  id: string;
  title: string;
  desc: string;
  unlockedDesc: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  unlocked: boolean;
  category: "tasks" | "habits" | "streak" | "focus";
  progressValue: number;
  targetValue: number;
}

export default function AchievementsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedAch, setSelectedAch] = useState<Achievement | null>(null);
  
  // Stats needed to calculate unlocks
  const [stats, setStats] = useState({
    todosCompleted: 0,
    habitsCompleted: 0,
    activeStreak: 0,
    focusSessions: 0,
    focusTime: 0,
  });

  const loadData = useCallback(async () => {
    try {
      // Load user profile
      const userProf = await getProfile();
      setProfile(userProf);

      // Load completed todos (current storage)
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let totalCompletedTodos = 0;
      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];
        totalCompletedTodos = allTodos.filter((t) => t.completed).length;
      }

      // Load completed habits (today's count from storage)
      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      let totalCompletedHabitsToday = 0;
      let activeStreak = 0;
      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const allHabits = (parsed.dailyHabits || []) as any[];
        totalCompletedHabitsToday = allHabits.filter((h) => h.completedToday).length;
        // Use best of current streak OR bestStreak so recovered streaks unlock badges
        activeStreak = allHabits.reduce(
          (max, h) => Math.max(max, h.streak || 0, h.bestStreak || 0),
          0
        );
      }

      // Add lifetime history for past days (same logic as stats.tsx)
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const rawHistory = await AsyncStorage.getItem("todoapp:history:v1");
      let pastTodosCompleted = 0;
      let pastHabitsCompleted = 0;
      if (rawHistory) {
        try {
          const historyList = JSON.parse(rawHistory);
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

      const actualTodosCompleted = pastTodosCompleted + totalCompletedTodos;
      const actualHabitsCompleted = pastHabitsCompleted + totalCompletedHabitsToday;

      // Load real focus sessions from pebble log (lifetime count, not daily)
      const { getPebbleCounts } = require("@/services/pebbleService");
      const pebbleCounts = await getPebbleCounts();
      const focusSessions = pebbleCounts.lifetimeTypes?.focus ?? 0;
      const focusPebbles = pebbleCounts.lifetime ?? 0;
      // focusTime from native focus stats storage
      const rawFocus = await AsyncStorage.getItem("todoapp:focus:stats");
      let focusTime = 0;
      if (rawFocus) {
        try {
          const parsed = JSON.parse(rawFocus);
          focusTime = parsed.totalFocusTime ?? 0;
        } catch {}
      }

      setStats({
        todosCompleted: actualTodosCompleted,
        habitsCompleted: actualHabitsCompleted,
        activeStreak: Math.max(pebbleCounts.streak, pebbleCounts.bestStreak, activeStreak),
        focusSessions,
        focusTime,
      });
    } catch (err) {
      console.warn("Failed loading stats for achievements screen", err);
    } finally {
      setLoading(false);
    }
  }, []);


  // Reload whenever the screen comes into focus (e.g. after streak recovery)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Extended Dribbble-style Achievements List (10 total milestones)
  const achievements: Achievement[] = [
    {
      id: "first_task",
      title: "First Pebble",
      desc: "Complete your first task",
      unlockedDesc: "Completed first task",
      icon: "check-square",
      unlocked: stats.todosCompleted >= 1,
      category: "tasks",
      progressValue: stats.todosCompleted,
      targetValue: 1,
    },
    {
      id: "tasks_10",
      title: "Decathlon Cleared",
      desc: "Complete 10 tasks in total",
      unlockedDesc: "Completed 10 tasks",
      icon: "clipboard",
      unlocked: stats.todosCompleted >= 10,
      category: "tasks",
      progressValue: stats.todosCompleted,
      targetValue: 10,
    },
    {
      id: "tasks_100",
      title: "Centurion Cleared",
      desc: "Complete 100 tasks in total",
      unlockedDesc: "100 tasks cleared successfully",
      icon: "award",
      unlocked: stats.todosCompleted >= 100,
      category: "tasks",
      progressValue: stats.todosCompleted,
      targetValue: 100,
    },
    {
      id: "first_habit",
      title: "Daily Routine",
      desc: "Complete your first habit",
      unlockedDesc: "Completed first habit",
      icon: "activity",
      unlocked: stats.habitsCompleted >= 1,
      category: "habits",
      progressValue: stats.habitsCompleted,
      targetValue: 1,
    },
    {
      id: "habits_25",
      title: "Habit Champion",
      desc: "Complete habits 25 times",
      unlockedDesc: "Logged 25 habit completions",
      icon: "target",
      unlocked: stats.habitsCompleted >= 25,
      category: "habits",
      progressValue: stats.habitsCompleted,
      targetValue: 25,
    },
    {
      id: "streak_3",
      title: "Three-Day Spark",
      desc: "Achieve a 3-day habit streak",
      unlockedDesc: "3-day habit streak reached",
      icon: "zap",
      unlocked: stats.activeStreak >= 3,
      category: "streak",
      progressValue: stats.activeStreak,
      targetValue: 3,
    },
    {
      id: "streak_7",
      title: "Weekly Momentum",
      desc: "Achieve a 7-day habit streak",
      unlockedDesc: "7-day habit streak reached",
      icon: "trending-up",
      unlocked: stats.activeStreak >= 7,
      category: "streak",
      progressValue: stats.activeStreak,
      targetValue: 7,
    },
    {
      id: "streak_30",
      title: "Monthly Resilience",
      desc: "Achieve a 30-day habit streak",
      unlockedDesc: "30-day habit streak reached",
      icon: "calendar",
      unlocked: stats.activeStreak >= 30,
      category: "streak",
      progressValue: stats.activeStreak,
      targetValue: 30,
    },
    {
      id: "focus_1",
      title: "Deep Dive",
      desc: "Complete 1 Focus block session",
      unlockedDesc: "First Focus session logged",
      icon: "coffee",
      unlocked: stats.focusSessions >= 1,
      category: "focus",
      progressValue: stats.focusSessions,
      targetValue: 1,
    },
    {
      id: "focus_master",
      title: "Focus Master",
      desc: "Complete 10 Focus block sessions",
      unlockedDesc: "10 Focus sessions completed",
      icon: "sun",
      unlocked: stats.focusSessions >= 10,
      category: "focus",
      progressValue: stats.focusSessions,
      targetValue: 10,
    },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const progressPct = achievements.length > 0 ? (unlockedCount / achievements.length) * 100 : 0;

  if (loading || !profile) {
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Achievements</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Glow ambient background */}
        <FloatingGlow
          color={colors.primary}
          size={200}
          opacity={0.06}
          pulseSpeed={6000}
          style={{ position: "absolute", right: -50, top: 20 }}
        />

        {/* Level / Summary card */}
        <View style={[styles.summaryCard, { backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)", borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Momentum Gallery</Text>
          <Text style={[styles.summarySubtitle, { color: colors.textMuted }]}>
            Unlocked {unlockedCount} of {achievements.length} badges
          </Text>

          {/* Overall Progress Bar */}
          <View style={styles.overallProgressContainer}>
            <View style={[styles.progressBarBg, { backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)" }]}>
              <View style={[styles.progressBarFill, { width: `${progressPct}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.progressPctText, { color: colors.primary }]}>{Math.round(progressPct)}% Complete</Text>
          </View>
        </View>

        {/* Achievements Grid */}
        <View style={styles.gridContainer}>
          {achievements.map((ach) => (
            <Pressable
              key={ach.id}
              style={({ pressed }) => [
                styles.gridCard,
                {
                  borderColor: colors.border,
                  backgroundColor: ach.unlocked
                    ? colorScheme === "light"
                      ? "rgba(99, 102, 241, 0.04)"
                      : "rgba(99, 102, 241, 0.08)"
                    : colorScheme === "light"
                    ? "rgba(0,0,0,0.01)"
                    : "rgba(255,255,255,0.01)",
                  opacity: pressed ? 0.9 : 1,
                },
                !ach.unlocked && { borderStyle: "dashed" },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setSelectedAch(ach);
              }}
            >
              <View style={[
                styles.badgeIconBox,
                {
                  backgroundColor: ach.unlocked
                    ? `${colors.primary}20`
                    : colorScheme === "light"
                    ? "rgba(0,0,0,0.04)"
                    : "rgba(255,255,255,0.04)",
                }
              ]}>
                <Feather
                  name={ach.unlocked ? ach.icon : "lock"}
                  size={20}
                  color={ach.unlocked ? colors.primary : colors.textMuted}
                />
              </View>

              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {ach.title}
              </Text>
              
              <Text style={[styles.cardStatus, { color: ach.unlocked ? colors.success : colors.textMuted }]}>
                {ach.unlocked ? "Unlocked" : "Locked"}
              </Text>

              {/* Individual micro progress bar */}
              {!ach.unlocked && ach.targetValue > 1 && (
                <View style={styles.microProgressRow}>
                  <View style={[styles.microProgressBarBg, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                    <View style={[
                      styles.microProgressBarFill,
                      {
                        width: `${Math.min(100, (ach.progressValue / ach.targetValue) * 100)}%`,
                        backgroundColor: colors.textMuted,
                      }
                    ]} />
                  </View>
                  <Text style={[styles.microProgressVal, { color: colors.textMuted }]}>
                    {ach.progressValue}/{ach.targetValue}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Details Modal */}
      <Modal
        visible={selectedAch !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAch(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedAch(null)} />
          <AppCard style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedAch && (
              <View style={{ alignItems: "center", gap: 16 }}>
                <View style={[
                  styles.modalIconBox,
                  {
                    backgroundColor: selectedAch.unlocked ? `${colors.primary}18` : "rgba(255,255,255,0.05)",
                  }
                ]}>
                  <Feather
                    name={selectedAch.unlocked ? selectedAch.icon : "lock"}
                    size={36}
                    color={selectedAch.unlocked ? colors.primary : colors.textMuted}
                  />
                </View>

                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedAch.title}</Text>
                  <Text style={[
                    styles.modalBadgeStatus,
                    {
                      color: selectedAch.unlocked ? colors.success : colors.warning,
                      backgroundColor: selectedAch.unlocked ? `${colors.success}10` : `${colors.warning}10`
                    }
                  ]}>
                    {selectedAch.unlocked ? "UNLOCKED ACHIEVEMENT" : "LOCKED ROADMAP"}
                  </Text>
                </View>

                <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
                  {selectedAch.unlocked ? selectedAch.unlockedDesc : selectedAch.desc}
                </Text>

                {/* Progress Detail */}
                {!selectedAch.unlocked && (
                  <View style={[styles.progressBox, { backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)", borderColor: colors.border }]}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" }}>
                      Requirements Progress
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
                      <View style={[styles.modalProgressBarBg, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                        <View style={[
                          styles.modalProgressBarFill,
                          {
                            width: `${Math.min(100, (selectedAch.progressValue / selectedAch.targetValue) * 100)}%`,
                            backgroundColor: colors.primary,
                          }
                        ]} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>
                        {selectedAch.progressValue} / {selectedAch.targetValue}
                      </Text>
                    </View>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [
                    styles.modalCloseButton,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedAch(null);
                  }}
                >
                  <Text style={styles.modalCloseButtonText}>Close</Text>
                </Pressable>
              </View>
            )}
          </AppCard>
        </View>
      </Modal>
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
    gap: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  summarySubtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: -8,
  },
  overallProgressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressPctText: {
    fontSize: 11,
    fontWeight: "800",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridCard: {
    width: (SCREEN_WIDTH - 44) / 2, // 2 Column layout
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  badgeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  cardStatus: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: -4,
  },
  microProgressRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 4,
  },
  microProgressBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  microProgressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  microProgressVal: {
    fontSize: 8,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 24,
  },
  modalIconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  modalBadgeStatus: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "600",
  },
  progressBox: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  modalProgressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  modalProgressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  modalCloseButton: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  modalCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
