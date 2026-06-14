import { FloatingGlow } from "@/components/AmbientBackground";
import { AppCard } from "@/components/AppCard";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getHistoryForMonth } from "@/services/productivityHistory";
import {
  getLevelInfo,
  getProfile,
  saveProfile,
  type UserProfile,
} from "@/services/settingsService";
import { getPebbleCounts } from "@/services/pebbleService";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "@/services/storage";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  Modal,
} from "react-native";
import Animated, {
  FadeInDown,
} from "react-native-reanimated";
import { RankTiersModal } from "@/components/profile/RankTiersModal";
import { RenderAvatar, AVATAR_OPTIONS, EMOJI_OPTIONS } from "@/components/profile/RenderAvatar";
import { BlurView } from "expo-blur";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const isWeb = Platform.OS === "web";
const enteringAnim = (delay = 0, duration = 450) => {
  if (isWeb) return undefined;
  return FadeInDown.delay(delay).duration(duration);
};

const triggerMediumHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState({
    todosCompleted: 0,
    habitsCompleted: 0,
    activeStreak: 0,
    bestStreak: 0,
    avgScore: 0,
    focusSessions: 0,
    focusTime: 0,
    completionRate: 0,
  });
  const [pebblesToday, setPebblesToday] = useState<number>(0);
  const [showRankSheet, setShowRankSheet] = useState<boolean>(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState<boolean>(false);
  const [lifetimePebbles, setLifetimePebbles] = useState<number>(0);
  const [monthlyPebbles, setMonthlyPebbles] = useState<number>(0);
  const [lifetimeTypes, setLifetimeTypes] = useState<{ task: number; habit: number; focus: number }>({
    task: 0,
    habit: 0,
    focus: 0,
  });
  const [pebbleBalance, setPebbleBalance] = useState<number>(0);
  const [gemsBalance, setGemsBalance] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);

  const loadProfileData = useCallback(async () => {
    try {
      // 1. Get Settings Profile
      const userProf = await getProfile();
      setProfile(userProf);

      // 2. Query Completed Todos
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let totalCompletedTodos = 0;
      let totalTasks = 0;

      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];
        totalTasks = allTodos.length;
        totalCompletedTodos = allTodos.filter((t) => t.completed).length;
      }

      // 3. Query Habit completed stats and streaks
      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      let totalCompletedHabits = 0;
      let streak = 0;
      let bestStreak = 0;

      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const allHabits = (parsed.dailyHabits || []) as any[];
        totalCompletedHabits = allHabits.filter((h) => h.completedToday).length;
        streak = allHabits.reduce((max, h) => Math.max(max, h.streak || 0), 0);
        bestStreak = allHabits.reduce(
          (max, h) => Math.max(max, h.bestStreak || 0),
          0,
        );
      }

      // 4. Calculate Average Productivity Score (last 3 months)
      const now = new Date();
      const history = await getHistoryForMonth(
        now.getFullYear(),
        now.getMonth(),
      );
      const scores = history.map((h) => h.score);
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;

      // 5. Query Focus stats
      const rawFocus = await AsyncStorage.getItem("todoapp:focus:stats");
      let focusSessions = 0;
      let focusTime = 0;
      if (rawFocus) {
        const parsed = JSON.parse(rawFocus);
        focusSessions = parsed.completedToday ?? 0;
        focusTime = parsed.totalFocusTime ?? 0;
      }

      // 5.5. Query Full Lifetime History
      const rawHistory = await AsyncStorage.getItem("todoapp:history:v1");
      let pastTodosCompleted = 0;
      let pastHabitsCompleted = 0;
      const todayKey = getDateKey();
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
      const actualHabitsCompleted = pastHabitsCompleted + totalCompletedHabits;

      const completionRate =
        totalTasks > 0
          ? Math.round((totalCompletedTodos / totalTasks) * 100)
          : actualTodosCompleted > 0
            ? 100
            : 0;

      const pebbleStats = await getPebbleCounts();
      setLifetimePebbles(pebbleStats.lifetime);
      setMonthlyPebbles(pebbleStats.monthly);
      setLifetimeTypes(pebbleStats.lifetimeTypes || { task: 0, habit: 0, focus: 0 });

      setStats({
        todosCompleted: actualTodosCompleted,
        habitsCompleted: actualHabitsCompleted,
        activeStreak: Math.max(pebbleStats.streak || 0, streak),
        bestStreak: Math.max(pebbleStats.bestStreak || 0, bestStreak),
        avgScore: avgScore,
        focusSessions,
        focusTime,
        completionRate,
      });

      // Calculate pebbles earned today
      let todayPebblesCount = 0;
      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];
        todayPebblesCount += allTodos.filter((t) => t.completed && t.completedAt && t.completedAt.startsWith(todayKey)).length;
      }
      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const allHabits = (parsed.dailyHabits || []) as any[];
        // Habits completed today count as 1 pebble each
        todayPebblesCount += allHabits.filter((h) => h.completedToday).length;
      }
      setPebblesToday(todayPebblesCount);

      const { getGemsBalance } = require("@/services/pebbleService");
      const balance = await getGemsBalance();
      setGemsBalance(balance);

    } catch (err) {
      console.warn("Failed loading profile data in simplified profile", err);
    } finally {
      setLoading(false);
    }
  }, []);


  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData]),
  );

  useEffect(() => {
    const unsubscribeProfile = addStateListener("profile_changed", () => {
      loadProfileData();
    });
    const unsubscribePebbles = addStateListener("pebbles_changed", () => {
      loadProfileData();
    });
    return () => {
      unsubscribeProfile();
      unsubscribePebbles();
    };
  }, [loadProfileData]);

  const handleSelectAvatar = async (newAvatar: string) => {
    if (!profile) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const updatedProfile: UserProfile = {
        ...profile,
        avatar: newAvatar,
      };
      await saveProfile(updatedProfile);
      setProfile(updatedProfile);
      emitStateChange("profile_changed");
      setShowAvatarPicker(false);
    } catch (err) {
      console.warn("Failed to save avatar", err);
    }
  };



  if (loading || !profile) {
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

  const levelInfo = getLevelInfo(profile.xp);

  // Pebble progression and Crow stage/speech bubble calculations
  const totalPebbles = lifetimePebbles;

  let crowStage: "beginner" | "advanced" | "power" = "beginner";
  if (totalPebbles >= 101) {
    crowStage = "power";
  } else if (totalPebbles >= 26) {
    crowStage = "advanced";
  }

  const milestoneInfo = (() => {
    if (totalPebbles <= 10) {
      return {
        stage: 1,
        name: "First Steps",
        range: "0-10",
        desc: "Gathering the first stones of momentum.",
      };
    }
    if (totalPebbles <= 25) {
      return {
        stage: 2,
        name: "Sprout",
        range: "11-25",
        desc: "A small base of habit stones.",
      };
    }
    if (totalPebbles <= 50) {
      return {
        stage: 3,
        name: "Zen Stream",
        range: "26-50",
        desc: "Flowing stream of productivity.",
      };
    }
    if (totalPebbles <= 100) {
      return {
        stage: 4,
        name: "Sanctuary Base",
        range: "51-100",
        desc: "Solid foundation for daily rhythm.",
      };
    }
    if (totalPebbles <= 250) {
      return {
        stage: 5,
        name: "Pebble Hoarder",
        range: "101-250",
        desc: "A significant heap of accomplishments.",
      };
    }
    if (totalPebbles <= 500) {
      return {
        stage: 6,
        name: "Zen Mountain",
        range: "251-500",
        desc: "An impressive, towering mount of zen.",
      };
    }
    return {
      stage: 7,
      name: "Ocean of Focus",
      range: "500+",
      desc: "Infinite zen achieved. Master level.",
    };
  })();

  // Tiny dynamic status line content
  let dynamicStatus = "Ready for today's focus";
  if (pebblesToday > 0) {
    dynamicStatus = `+${pebblesToday} pebble${pebblesToday === 1 ? "" : "s"} today`;
  } else if (stats.activeStreak > 0) {
    dynamicStatus = `${stats.activeStreak} day streak active`;
  } else if (stats.avgScore > 70) {
    dynamicStatus = "Strong momentum this week";
  }

  // Circular achievements teaser triggers
  const teaserAchievements = [
    { icon: "check-square" as const, unlocked: stats.todosCompleted >= 1, title: "First Pebble" },
    { icon: "activity" as const, unlocked: stats.habitsCompleted >= 1, title: "Daily Routine" },
    { icon: "trending-up" as const, unlocked: stats.activeStreak >= 7, title: "Weekly Momentum" },
    { icon: "calendar" as const, unlocked: stats.activeStreak >= 30, title: "Monthly Resilience" },
    { icon: "award" as const, unlocked: stats.todosCompleted >= 100, title: "Centurion" },
    { icon: "zap" as const, unlocked: stats.focusSessions >= 10, title: "Focus Master" },
  ];
  
  const unlockedTeasers = teaserAchievements.filter((a) => a.unlocked).slice(0, 3);
  const unlockedCount = teaserAchievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>

        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.back();
          }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Sanctuary Profile
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.settingsButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.push("/settings");
          }}
        >
          <Feather name="settings" size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Hero with centerpiece Crow Nest */}
        <Animated.View entering={enteringAnim(0, 450)}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(0, 0, 0, 0.02)"
                    : "rgba(255, 255, 255, 0.02)",
                borderColor: colors.border,
              },
            ]}
          >
            <FloatingGlow
              color={colors.primary}
              size={120}
              opacity={0.12}
              pulseSpeed={8000}
              style={{ position: "absolute", right: -30, top: -30 }}
            />

            {/* Avatar & Username Row */}
            <View style={styles.profileHeaderRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.avatarContainer,
                  {
                    borderColor: colors.primary,
                    backgroundColor:
                      colorScheme === "light"
                        ? "rgba(0,0,0,0.03)"
                        : "rgba(255,255,255,0.03)",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowAvatarPicker(true);
                }}
              >
                <RenderAvatar avatar={profile.avatar} size={64} />
                <View
                  style={{
                    position: "absolute",
                    bottom: -4,
                    right: -4,
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: colors.card,
                  }}
                >
                  <Feather name="edit-2" size={10} color="#FFFFFF" />
                </View>
              </Pressable>
              <View style={styles.profileInfo}>
                <Text style={[styles.nameText, { color: colors.text }]}>
                  {profile.name}
                </Text>
                <Text style={[styles.emailText, { color: colors.textMuted }]}>
                  {profile.email}
                </Text>

                {/* Level badge */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowRankSheet(true);
                  }}
                  style={({ pressed }) => [
                    styles.rankBadge,
                    { backgroundColor: `${colors.primary}18`, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Feather
                    name="shield"
                    size={10}
                    color={colors.primaryLight}
                  />
                  <Text
                    style={[styles.rankText, { color: colors.primaryLight }]}
                  >
                    {levelInfo.rank}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Pebble progression centerpiece (Redesigned Premium Layout) */}
            <View
              style={[
                styles.jarCard,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    colorScheme === "light"
                      ? "rgba(99, 102, 241, 0.02)"
                      : "rgba(99, 102, 241, 0.04)",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderWidth: 1.5,
                  borderRadius: 16,
                  gap: 14,
                },
              ]}
            >
              {/* Header Row */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 18 }}>🫙</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Pebble Sanctuary
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: `${colors.primary}18`,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: `${colors.primary}33`,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "800", color: colors.primary }}>
                    STAGE {milestoneInfo.stage}: {milestoneInfo.name.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Statistics Split Columns (Grid Style to prevent overlap) */}
              <View style={{ flexDirection: "row", width: "100%", justifyContent: "space-between", gap: 8 }}>
                {/* Monthly Progress */}
                <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)", padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontWeight: "900", color: colors.text }}>
                    {monthlyPebbles}/100
                  </Text>
                  <Text style={{ fontSize: 8, fontWeight: "600", color: colors.textMuted, marginTop: 2 }}>
                    Monthly Target
                  </Text>
                </View>

                {/* Gems Balance */}
                <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)", padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontWeight: "900", color: "#F59E0B" }}>
                    💎 {gemsBalance}
                  </Text>
                  <Text style={{ fontSize: 8, fontWeight: "600", color: colors.textMuted, marginTop: 2 }}>
                    Gems Balance
                  </Text>
                </View>

                {/* Lifetime Total */}
                <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)", padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontWeight: "900", color: colors.text }}>
                    {totalPebbles}
                  </Text>
                  <Text style={{ fontSize: 8, fontWeight: "600", color: colors.textMuted, marginTop: 2 }}>
                    Lifetime
                  </Text>
                </View>
              </View>

              {/* Pebble Sources Breakdown */}
              <View style={{ width: "100%", gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 8, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Pebble Sources
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {/* Tasks — purple */}
                  <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(139,92,246,0.06)" : "rgba(139,92,246,0.12)", padding: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", alignItems: "center", gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="check-square" size={11} color="#8B5CF6" />
                      <Text style={{ fontSize: 13, fontWeight: "900", color: "#8B5CF6" }}>
                        {lifetimeTypes.task}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                      Tasks
                    </Text>
                  </View>
                  {/* Habits — orange */}
                  <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(249,115,22,0.06)" : "rgba(249,115,22,0.12)", padding: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(249,115,22,0.25)", alignItems: "center", gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="repeat" size={11} color="#F97316" />
                      <Text style={{ fontSize: 13, fontWeight: "900", color: "#F97316" }}>
                        {lifetimeTypes.habit}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                      Habits
                    </Text>
                  </View>
                  {/* Focus — green */}
                  <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.12)", padding: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", alignItems: "center", gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="zap" size={11} color="#10B981" />
                      <Text style={{ fontSize: 13, fontWeight: "900", color: "#10B981" }}>
                        {lifetimeTypes.focus}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                      Focus
                    </Text>
                  </View>
                </View>
              </View>

              {/* Milestone Progress Bar */}

              {milestoneInfo.stage < 7 && (
                <View style={{ width: "100%", gap: 6 }}>
                  <View
                    style={{
                      height: 5,
                      width: "100%",
                      borderRadius: 3,
                      backgroundColor:
                        colorScheme === "light"
                          ? "rgba(0,0,0,0.06)"
                          : "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      const current = totalPebbles;
                      const ranges = [0, 10, 25, 50, 100, 250, 500];
                      const minVal = ranges[milestoneInfo.stage - 1];
                      const maxVal = ranges[milestoneInfo.stage];
                      const totalInStage = maxVal - minVal;
                      const progressInStage = Math.max(0, current - minVal);
                      const pct = (progressInStage / totalInStage) * 100;

                      return (
                        <View
                          style={{
                            height: "100%",
                            width: `${Math.max(5, Math.min(100, pct))}%`,
                            backgroundColor: colors.primary,
                          }}
                        />
                      );
                    })()}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    {(() => {
                      const nextMilestone = [10, 25, 50, 100, 250, 500][
                        milestoneInfo.stage - 1
                      ];
                      const remaining = nextMilestone - totalPebbles;
                      return (
                        <Text style={{ fontSize: 9, fontWeight: "600", color: colors.textMuted }}>
                          {remaining} pebble{remaining === 1 ? "" : "s"} to Stage {milestoneInfo.stage + 1}
                        </Text>
                      );
                    })()}

                    {(() => {
                      const nextUnlock = [
                        { count: 10, label: "Sprout Jar Nest" },
                        { count: 26, label: "Curious Mascot grows" },
                        { count: 100, label: "Zen Energy floats" },
                        { count: 101, label: "Crowned Mascot & sparkles" },
                        { count: 500, label: "Golden Jar & sparks" },
                      ].find((u) => totalPebbles < u.count);

                      if (!nextUnlock) return null;

                      return (
                        <Text style={{ fontSize: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: colors.warning }}>
                          ⚡ Next: {nextUnlock.label}
                        </Text>
                      );
                    })()}
                  </View>
                </View>
              )}
            </View>

            {/* XP progress bar */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowRankSheet(true);
              }}
              style={({ pressed }) => [
                styles.xpProgressContainer,
                { opacity: pressed ? 0.9 : 1 }
              ]}
            >
              <View style={styles.xpLabelRow}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <View
                    style={[
                      styles.miniLevelBadge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.miniLevelText}>
                      Lvl {levelInfo.level}
                    </Text>
                  </View>
                  <Text style={[styles.levelLabel, { color: colors.text }]}>
                    {levelInfo.rank}
                  </Text>
                </View>
                <Text style={[styles.xpLabel, { color: colors.textMuted }]}>
                  {levelInfo.xpInCurrentLevel} / {levelInfo.xpNeededForNext} XP
                </Text>
              </View>

              {/* Segmented XP Progress Bar */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 3,
                  height: 6,
                  width: "100%",
                  marginTop: 2,
                }}
              >
                {Array.from({ length: 10 }).map((_, i) => {
                  const isActive = levelInfo.progressPct * 10 > i;
                  return (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        height: "100%",
                        borderRadius: 3,
                        backgroundColor: isActive
                          ? colors.primary
                          : colorScheme === "light"
                            ? "rgba(0,0,0,0.08)"
                            : "rgba(255,255,255,0.08)",
                      }}
                    />
                  );
                })}
              </View>

              <Text style={styles.xpSubText}>
                {levelInfo.xpNeededForNext - levelInfo.xpInCurrentLevel} XP to
                Level {levelInfo.level + 1}
              </Text>
            </Pressable>

            {/* Streaks & Stats Row */}
            <View style={[styles.divider, { marginVertical: 8 }]} />
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatVal, { color: colors.text }]}>
                  {stats.activeStreak}
                </Text>
                <Text
                  style={[styles.heroStatLabel, { color: colors.textMuted }]}
                >
                  Current Streak
                </Text>
              </View>
              <View
                style={[
                  styles.verticalDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatVal, { color: colors.text }]}>
                  {stats.bestStreak}
                </Text>
                <Text
                  style={[styles.heroStatLabel, { color: colors.textMuted }]}
                >
                  Best Streak
                </Text>
              </View>
              <View
                style={[
                  styles.verticalDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatVal, { color: colors.text }]}>
                  {stats.avgScore}%
                </Text>
                <Text
                  style={[styles.heroStatLabel, { color: colors.textMuted }]}
                >
                  Focus Score
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Circular Achievements Teaser Row (Dribbble-style badge tray) */}
        {unlockedTeasers.length > 0 && (
          <Animated.View entering={enteringAnim(80, 450)} style={styles.teaserSection}>
            <View style={styles.teaserHeader}>
              <Text style={[styles.teaserLabel, { color: colors.textMuted }]}>
                RECENT BADGES
              </Text>
              <Pressable
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push("/profile/achievements");
                }}
              >
                <Text style={[styles.teaserLink, { color: colors.primary }]}>
                  View Gallery ({unlockedCount}/10)
                </Text>
              </Pressable>
            </View>
            <View style={styles.badgeTray}>
              {unlockedTeasers.map((ach, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.badgeTrayItem,
                    {
                      borderColor: colors.border,
                      backgroundColor: colorScheme === "light"
                        ? "rgba(99, 102, 241, 0.04)"
                        : "rgba(99, 102, 241, 0.08)",
                    },
                  ]}
                >
                  <Feather name={ach.icon} size={15} color={colors.primary} />
                  <Text style={[styles.badgeTrayText, { color: colors.text }]} numberOfLines={1}>
                    {ach.title}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Dribbble-Style Glassmorphic Clean Navigation List */}
        <Animated.View entering={enteringAnim(150, 450)} style={styles.navSection}>
          <Text style={[styles.teaserLabel, { color: colors.textMuted, marginBottom: 2 }]}>
            HUB NAVIGATION
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.navCard,
              {
                borderColor: colors.border,
                backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/profile/stats");
            }}
          >
            <View style={[styles.navIconBox, { backgroundColor: "rgba(99, 102, 241, 0.08)" }]}>
              <Feather name="bar-chart-2" size={18} color={colors.primary} />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={[styles.navCardTitle, { color: colors.text }]}>Analytics & Focus Trends</Text>
              <Text style={[styles.navCardSubtitle, { color: colors.textMuted }]}>
                Weekly momentum, rhythm peaks and category breakdowns
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.navCard,
              {
                borderColor: colors.border,
                backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/profile/achievements");
            }}
          >
            <View style={[styles.navIconBox, { backgroundColor: "rgba(245, 158, 11, 0.08)" }]}>
              <Feather name="award" size={18} color={colors.warning} />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={[styles.navCardTitle, { color: colors.text }]}>Badges & Achievements</Text>
              <Text style={[styles.navCardSubtitle, { color: colors.textMuted }]}>
                Unlocked milestones, progress tracks, and collectible items
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.navCard,
              {
                borderColor: colors.border,
                backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/notifications");
            }}
          >
            <View style={[styles.navIconBox, { backgroundColor: "rgba(16, 185, 129, 0.08)" }]}>
              <Feather name="bell" size={18} color={colors.success} />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={[styles.navCardTitle, { color: colors.text }]}>Alerts & Reminder Center</Text>
              <Text style={[styles.navCardSubtitle, { color: colors.textMuted }]}>
                Upcoming alarms schedule and active task alert configuration
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Rank Tiers Modal */}
      <RankTiersModal
        visible={showRankSheet}
        onClose={() => setShowRankSheet(false)}
        levelInfo={levelInfo}
        colors={colors}
        colorScheme={colorScheme}
      />

      {/* Avatar Selection Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showAvatarPicker}
        onRequestClose={() => setShowAvatarPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={25} style={StyleSheet.absoluteFill} tint="dark" />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAvatarPicker(false)} />
          
          <Animated.View
            entering={enteringAnim(0, 300)}
            style={[
              styles.avatarPickerCard,
              { backgroundColor: colors.card, borderColor: colors.border }
            ]}
          >
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitleText, { color: colors.text }]}>Choose Companion Avatar</Text>
              <Pressable
                onPress={() => setShowAvatarPicker(false)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              {/* 2.5D Mascot Poses section */}
              <View style={{ gap: 10 }}>
                <Text style={[styles.categoryTitle, { color: colors.primary }]}>2.5D MASCOT CROW PERSONAS</Text>
                <View style={styles.avatarPickerGrid}>
                  {AVATAR_OPTIONS.map((opt) => {
                    const isSelected = profile.avatar === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => handleSelectAvatar(opt.id)}
                        style={[
                          styles.avatarPickerItem,
                          {
                            backgroundColor: isSelected ? `${colors.primary}15` : "rgba(255,255,255,0.02)",
                            borderColor: isSelected ? colors.primary : colors.border,
                          }
                        ]}
                      >
                        <RenderAvatar avatar={opt.id} size={48} />
                        <Text style={[styles.avatarLabelText, { color: colors.text }]} numberOfLines={1}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.avatarDescText, { color: colors.textMuted }]} numberOfLines={1}>
                          {opt.desc}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Standard Emojis section */}
              <View style={{ gap: 10, marginTop: 4 }}>
                <Text style={[styles.categoryTitle, { color: colors.textMuted }]}>CLASSIC EMOJIS</Text>
                <View style={styles.emojiPickerGrid}>
                  {EMOJI_OPTIONS.map((emoji) => {
                    const isSelected = profile.avatar === emoji;
                    return (
                      <Pressable
                        key={emoji}
                        onPress={() => handleSelectAvatar(emoji)}
                        style={[
                          styles.emojiPickerItem,
                          {
                            backgroundColor: isSelected ? `${colors.primary}15` : "rgba(255,255,255,0.02)",
                            borderColor: isSelected ? colors.primary : colors.border,
                          }
                        ]}
                      >
                        <Text style={{ fontSize: 24 }}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    gap: 20,
    paddingBottom: 80,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
    gap: 16,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  avatarText: {
    fontSize: 32,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  nameText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  emailText: {
    fontSize: 12,
  },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  rankText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  miniLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  miniLevelText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  xpSubText: {
    fontSize: 9,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 2,
  },
  jarCard: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 24,
    position: "relative",
  },
  jarHeaderLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textAlign: "center",
    marginBottom: 2,
  },
  pebbleCountText: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  xpProgressContainer: {
    gap: 6,
  },
  xpLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  levelLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  xpLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 4,
  },
  heroStatItem: {
    alignItems: "center",
    gap: 2,
  },
  heroStatVal: {
    fontSize: 16,
    fontWeight: "800",
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  teaserSection: {
    gap: 8,
  },
  teaserHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teaserLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  teaserLink: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeTray: {
    flexDirection: "row",
    gap: 10,
  },
  badgeTrayItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  badgeTrayText: {
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 70,
  },
  navSection: {
    gap: 10,
  },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
  },
  navIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navTextContainer: {
    flex: 1,
    gap: 2,
  },
  navCardTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  navCardSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  avatarPickerCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    maxHeight: "85%",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    paddingBottom: 12,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  categoryTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  avatarPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  avatarPickerItem: {
    flex: 1,
    minWidth: 150,
    height: 110,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabelText: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },
  avatarDescText: {
    fontSize: 8,
    fontWeight: "600",
    textAlign: "center",
  },
  emojiPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  emojiPickerItem: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
