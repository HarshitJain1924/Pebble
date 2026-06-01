import React from "react";
import { StyleSheet,  View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppCard } from "../AppCard";
import { ProgressRing } from "../ProgressRing";

type HabitStreakCardProps = {
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  priority?: "low" | "medium" | "high";
  onPressToggle: () => void;
  onCardPress?: () => void;
};

export const HabitStreakCard: React.FC<HabitStreakCardProps> = ({
  title,
  streak,
  bestStreak,
  completedToday,
  onPressToggle,
  onCardPress,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const isDark = colorScheme === "dark";

  // Amber/warm theme styling
  const amberColor = "#F59E0B";
  const cardBg = completedToday
    ? (isLight ? "#FEF9E8" : "rgba(245, 158, 11, 0.07)")
    : (isLight ? "#FFFFFF" : "rgba(24, 24, 28, 0.95)");
  const cardBorder = completedToday
    ? "rgba(245, 158, 11, 0.45)"
    : (isLight ? "rgba(0,0,0,0.06)" : "rgba(255, 255, 255, 0.055)");

  return (
    <AppCard
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderWidth: 1.5,
        }
      ]}
      onPress={onCardPress}
    >
      {/* Left aligned Progress Check Ring */}
      <Pressable onPress={onPressToggle} style={styles.checkButton}>
        <ProgressRing
          progress={completedToday ? 1 : 0}
          size={24}
          strokeWidth={3}
          showText={false}
          color={amberColor}
        />
        {/* Overlay a tick when completed */}
        {completedToday && (
          <View style={styles.checkTick}>
            <Feather name="check" size={10} color="#FFFFFF" />
          </View>
        )}
      </Pressable>

      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              textDecorationLine: completedToday ? "line-through" : "none",
              opacity: completedToday ? 0.7 : 1,
            }
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
            <Text style={[styles.badgeText, { color: "#D97706" }]}>
              🔥 {streak}D STREAK
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: isLight ? "#F3F4F6" : "rgba(255, 255, 255, 0.08)" }]}>
            <Text style={[styles.badgeText, { color: colors.textMuted }]}>
              ⭐ BEST {bestStreak}D
            </Text>
          </View>
        </View>
      </View>

      {/* Right aligned zesty activity lightning bolt badge */}
      <View
        style={[
          styles.lightningBadge,
          {
            backgroundColor: completedToday ? "#F59E0B" : (isLight ? "#FEF3C7" : "rgba(245, 158, 11, 0.15)"),
          }
        ]}
      >
        <Feather name="zap" size={14} color={completedToday ? "#FFFFFF" : "#F59E0B"} />
      </View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginVertical: 4,
    borderRadius: 18,
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  checkButton: {
    position: "relative",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  checkTick: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  lightningBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
