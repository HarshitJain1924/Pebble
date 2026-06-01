import React from "react";
import { StyleSheet,  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppCard } from "../AppCard";

type TimelineTaskCardProps = {
  time: string;
  title: string;
  category?: string;
  priority?: "low" | "medium" | "high";
  completed: boolean;
  type: "task" | "habit" | "focus";
  streak?: number;
  onPressCard?: () => void;
};

export const TimelineTaskCard: React.FC<TimelineTaskCardProps> = ({
  time,
  title,
  category,
  priority,
  completed,
  type,
  streak,
  onPressCard,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // Pastel themes based on type
  let cardBg = "rgba(100, 116, 139, 0.08)";
  let textColor = colors.text;
  let accentColor = colors.primary;

  if (type === "habit") {
    cardBg = "rgba(245, 158, 11, 0.08)";
    textColor = colorScheme === "light" ? "#7c2d12" : "#fcd34d";
    accentColor = colors.warning;
  } else if (type === "focus") {
    cardBg = "rgba(6, 182, 212, 0.08)";
    textColor = colorScheme === "light" ? "#164e63" : "#67e8f9";
    accentColor = colors.secondary;
  } else {
    // task
    cardBg = "rgba(99, 102, 241, 0.08)";
    textColor = colorScheme === "light" ? "#1e3a8a" : "#c7d2fe";
    accentColor = colors.primary;
  }

  return (
    <View style={styles.container}>
      <View style={styles.timeWrap}>
        <Text style={[styles.timeText, { color: colors.textMuted }]}>{time}</Text>
      </View>
      <View style={styles.indicatorWrap}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      <AppCard
        style={[styles.card, { backgroundColor: cardBg, borderColor: "transparent" }]}
        onPress={onPressCard}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <Feather
              name={type === "habit" ? "zap" : type === "focus" ? "target" : "clock"}
              size={11}
              color={textColor}
            />
            <Text style={[styles.badgeText, { color: textColor }]}>
              {type === "habit"
                ? `HABIT • 🔥 ${streak || 0}D`
                : type === "focus"
                  ? "FOCUS SESSION"
                  : "TASK"}
            </Text>
          </View>
          {category && (
            <View style={[styles.categoryBadge, { backgroundColor: `${accentColor}15` }]}>
              <Text style={[styles.categoryText, { color: accentColor }]}>
                {category.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.titleText,
            {
              color: textColor,
              textDecorationLine: completed ? "line-through" : "none",
            },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </AppCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    minHeight: 84,
  },
  timeWrap: {
    width: 60,
    paddingTop: 12,
    alignItems: "flex-end",
    paddingRight: 10,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  indicatorWrap: {
    width: 24,
    alignItems: "center",
    position: "relative",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 15,
    zIndex: 2,
  },
  line: {
    position: "absolute",
    width: 2,
    top: 15,
    bottom: 0,
    zIndex: 1,
  },
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    marginLeft: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 8,
    fontWeight: "800",
  },
  titleText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
});
