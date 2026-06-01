import React from "react";
import { View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/AppCard";
import { ProgressBar } from "@/components/ProgressBar";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "@/constants/taskStyles";

interface ProgressSectionProps {
  statsExpanded: boolean;
  setStatsExpanded: (val: boolean) => void;
  habitCompletionPct: number;
  unfinishedHabitCount: number;
  showCelebrate: boolean;
  completedHabitCount: number;
  totalHabitsCount: number;
  longestStreak: number;
}

export function ProgressSection({
  statsExpanded,
  setStatsExpanded,
  habitCompletionPct,
  unfinishedHabitCount,
  showCelebrate,
  completedHabitCount,
  totalHabitsCount,
  longestStreak,
}: ProgressSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <AppCard style={{ padding: 12 }}>
      <Pressable
        onPress={() => setStatsExpanded(!statsExpanded)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Feather
            name="bar-chart-2"
            size={16}
            color={colors.primary}
          />
          <Text
            style={{
              fontWeight: "700",
              color: colors.text,
              fontSize: 14,
            }}
          >
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
            <Text
              style={{
                color: colors.primary,
                fontSize: 10,
                fontWeight: "700",
              }}
            >
              {Math.round(habitCompletionPct * 100)}% Done
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
          {/* Habits Banners */}
          {unfinishedHabitCount > 0 && (
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
              <Text
                style={[
                  styles.warningText,
                  { color: colors.warning },
                ]}
              >
                {unfinishedHabitCount} habit{unfinishedHabitCount !== 1 ? "s" : ""} left today
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
              <Feather
                name="award"
                size={18}
                color={colors.success}
              />
              <Text
                style={[
                  styles.successText,
                  { color: colors.success },
                ]}
              >
                Perfect run! All habits completed today.
              </Text>
            </View>
          )}

          {/* Summary / Streaks */}
          <View style={[styles.summaryRow, { gap: 8 }]}>
            <View
              style={[
                styles.summaryHalf,
                {
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 10,
                  backgroundColor: colors.cardLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  { color: colors.textMuted, fontSize: 11 },
                ]}
              >
                Completed Today
              </Text>
              <Text
                style={[
                  styles.summaryVal,
                  {
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "700",
                  },
                ]}
              >
                {completedHabitCount}/{totalHabitsCount}
              </Text>
            </View>
            <View
              style={[
                styles.summaryHalf,
                {
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 10,
                  backgroundColor: colors.cardLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  { color: colors.textMuted, fontSize: 11 },
                ]}
              >
                Longest Streak
              </Text>
              <Text
                style={[
                  styles.summaryVal,
                  {
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "700",
                  },
                ]}
              >
                {longestStreak} Days
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <ProgressBar progress={habitCompletionPct} />
        </View>
      )}
    </AppCard>
  );
}
