import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { ThemeColors } from "@/shared/constants/theme";
import React from "react";
import { ColorSchemeName, View } from "react-native";

export interface MainStreakRecoveryInfo {
  eligible: boolean;
  [key: string]: any;
}

export interface StreakBannerProps {
  streak: number;
  recoveryInfo: MainStreakRecoveryInfo | null;
  onRecover: () => void;
  colors: ThemeColors;
  colorScheme: ColorSchemeName;
}

export const StreakBanner: React.FC<StreakBannerProps> = ({
  streak,
  recoveryInfo,
  onRecover,
  colors,
  colorScheme,
}) => {
  if (!recoveryInfo?.eligible) {
    return null;
  }

  let streakMotivation = "Start your goals today to build consistency!";
  if (streak > 0) {
    if (streak < 3) {
      streakMotivation = "Flame sparked! Keep it burning.";
    } else if (streak < 7) {
      streakMotivation = "You're building solid momentum!";
    } else if (streak < 14) {
      streakMotivation = "Don't break this beautiful chain.";
    } else {
      streakMotivation = "You're mastering your routines!";
    }
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.card,
        borderColor:
          streak > 0
            ? colorScheme === "light"
              ? "#D97706"
              : "#B45309"
            : colors.border,
        borderWidth: 1.5,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginHorizontal: 4,
        marginTop: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          flex: 1,
        }}
      >
        <Text style={{ fontSize: 16 }}>🔥</Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: colors.text,
          }}
        >
          {streak} Day Streak
        </Text>
        <Text
          style={{ fontSize: 12, color: colors.textMuted, flex: 1 }}
          numberOfLines={1}
        >
          • {streakMotivation}
        </Text>
      </View>

      <PressableScale
        onPress={onRecover}
        haptic
        style={{
          backgroundColor:
            colorScheme === "light" ? "#FEF3C7" : "rgba(245, 158, 11, 0.15)",
          borderColor: "#F59E0B",
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#F59E0B",
          }}
        >
          💎 Spend 1 Gem to Restore
        </Text>
      </PressableScale>
    </View>
  );
};
