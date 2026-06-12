import React from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";

export interface WeeklyTrendDay {
  dateString: string;
  dayName: string;
  score: number;
}

export interface WeeklyProductivityTrendProps {
  weeklyTrends: WeeklyTrendDay[];
  colors: any;
  colorScheme: string;
}

export function WeeklyProductivityTrend({
  weeklyTrends,
  colors,
  colorScheme,
}: WeeklyProductivityTrendProps) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.text,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Momentum Index
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            Productivity scores over the last 7 days
          </Text>
        </View>
        <Feather name="bar-chart-2" size={16} color={colors.primary} />
      </View>

      {/* Bar Graph Row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          height: 100,
          paddingTop: 10,
          paddingHorizontal: 4,
        }}
      >
        {weeklyTrends.map((day) => {
          const barHeight = Math.max(day.score, 6);
          // Pixel height: parent is 70px tall, so multiply by 0.7
          const barHeightPx = Math.round((barHeight / 100) * 70);
          let barColor = colors.primary;
          if (day.score >= 90) barColor = colors.success;
          else if (day.score >= 60) barColor = colors.primary;
          else if (day.score >= 30) barColor = colors.warning;
          else if (day.score > 0) barColor = "#64748b";
          else barColor = colors.border;

          return (
            <View
              key={day.dateString}
              style={{ alignItems: "center", flex: 1, gap: 8 }}
            >
              <View
                style={{
                  width: 14,
                  height: 70,
                  backgroundColor:
                    colorScheme === "light" ? "#F1F5F9" : "#18181B",
                  borderRadius: 8,
                  justifyContent: "flex-end",
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    height: barHeightPx,
                    backgroundColor: barColor,
                    borderRadius: 8,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: colors.textMuted,
                }}
              >
                {day.dayName}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
