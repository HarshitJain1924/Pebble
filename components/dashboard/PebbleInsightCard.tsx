import React, { useEffect, useState } from "react";
import { StyleSheet,  View, ActivityIndicator } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HISTORY_STORAGE_KEY, DAILY_STORAGE_KEY } from "@/services/storage";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { GlassCard } from "../ui/GlassCard";
import { FloatingGlow } from "../AmbientBackground";

type DailyHistory = {
  date: string;
  completedHabits: number;
  totalHabits: number;
  completedTodos: number;
  totalTodos: number;
  score: number;
  completedHabitTitles: string[];
  completedTodoTitles: string[];
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const PebbleInsightCard: React.FC = () => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const [insight, setInsight] = useState<string>("Analyzing your focus patterns...");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const calculateInsights = async () => {
      try {
        const historyRaw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
        const habitsRaw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        
        let history: DailyHistory[] = [];
        if (historyRaw) {
          history = JSON.parse(historyRaw) as DailyHistory[];
        }

        let habits: any[] = [];
        if (habitsRaw) {
          const parsed = JSON.parse(habitsRaw);
          habits = parsed.dailyHabits || [];
        }

        // 1. If no history exists, fallback to setup greeting
        if (history.length === 0) {
          if (habits.length > 0) {
            setInsight("Setup reminders to trigger exact alarms for your habits and keep streaks active.");
          } else {
            setInsight("Pebble learns your focus rhythm as you check off tasks. Start by adding your first goal.");
          }
          setLoading(false);
          return;
        }

        const insightsList: string[] = [];

        // Insight A: Streaks
        const maxStreak = habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);
        if (maxStreak > 2) {
          insightsList.push(`🔥 Your highest habit streak is currently ${maxStreak} days. The momentum is building!`);
        }

        // Insight B: Weekday analysis (need at least 2 entries for interesting averages)
        if (history.length >= 2) {
          const scoresByDay: Record<number, number[]> = {};
          history.forEach((entry) => {
            const dateParts = entry.date.split("-").map(Number);
            const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            const day = dateObj.getDay();
            if (!scoresByDay[day]) {
              scoresByDay[day] = [];
            }
            scoresByDay[day].push(entry.score);
          });

          let bestDay = -1;
          let bestAvg = -1;

          Object.entries(scoresByDay).forEach(([dayStr, scores]) => {
            const dayNum = Number(dayStr);
            const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
            if (avg > bestAvg) {
              bestAvg = avg;
              bestDay = dayNum;
            }
          });

          if (bestDay !== -1 && bestAvg >= 50) {
            insightsList.push(`🎯 Your attention focus is strongest on ${WEEKDAY_NAMES[bestDay]}s, averaging ${Math.round(bestAvg)}% completion.`);
          }
        }

        // Insight C: Total intentions completed
        let totalCompleted = 0;
        history.forEach((entry) => {
          totalCompleted += (entry.completedTodos + entry.completedHabits);
        });
        if (totalCompleted > 5) {
          insightsList.push(`⚡ You've completed ${totalCompleted} total intentions. Each small action builds focus clarity.`);
        }

        // Insight D: Perfect days
        const perfectDays = history.filter((entry) => entry.score === 100).length;
        if (perfectDays > 0) {
          insightsList.push(`🏆 You achieved a perfect 100% completion score on ${perfectDays} day${perfectDays > 1 ? "s" : ""} in history.`);
        }

        // Randomly select one calculated insight to show, or fallback
        if (insightsList.length > 0) {
          const randomIndex = Math.floor(Math.random() * insightsList.length);
          setInsight(insightsList[randomIndex]);
        } else {
          setInsight("Consistent small habits block distractions. Schedule daily focus sessions to level up.");
        }
      } catch (err) {
        console.log("Error generating Pebble insights", err);
        setInsight("Rhythm analysis paused. Keep ticking off today's goals.");
      } finally {
        setLoading(false);
      }
    };

    void calculateInsights();
  }, []);

  return (
    <GlassCard
      style={[
        styles.heroCard,
        {
          backgroundColor: "rgba(99, 102, 241, 0.06)",
          borderColor: "rgba(99, 102, 241, 0.12)",
        },
      ]}
    >
      <View style={styles.heroGlowWrap}>
        <FloatingGlow
          color={colors.primary}
          size={100}
          opacity={0.12}
          pulseSpeed={8000}
          style={{ position: "absolute", left: -20, top: -20 }}
        />
      </View>
      <View style={styles.heroContent}>
        <View style={styles.heroIconRow}>
          <View
            style={[
              styles.pebbleChip,
              { backgroundColor: "rgba(99, 102, 241, 0.15)" },
            ]}
          >
            <Feather
              name="cpu"
              size={11}
              color={colors.primaryLight}
            />
            <Text
              style={[
                styles.pebbleChipText,
                { color: colors.primaryLight },
              ]}
            >
              PEBBLE MOMENTUM
            </Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 8 }} />
        ) : (
          <Text style={[styles.heroText, { color: colors.text }]}>
            {insight}
          </Text>
        )}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    minHeight: 100,
    justifyContent: "center",
  },
  heroGlowWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  heroContent: {
    zIndex: 1,
    gap: 8,
  },
  heroIconRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pebbleChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  pebbleChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
