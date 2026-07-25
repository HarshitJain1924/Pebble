import React from "react";
import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { type Workspace } from "@/shared/types/domain.types";

export interface ContinueWorkspaceCardProps {
  continueWorkspace: Workspace | null;
  onPressWorkspace: (workspaceId: string) => void;
  colors: {
    card: string;
    primary: string;
    text: string;
    textMuted: string;
  };
}

export const ContinueWorkspaceCard: React.FC<ContinueWorkspaceCardProps> = ({
  continueWorkspace,
  onPressWorkspace,
  colors,
}) => {
  if (!continueWorkspace) return null;

  const accentColor = continueWorkspace.color || colors.primary;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(100)}>
      <PressableScale
        onPress={() => onPressWorkspace(continueWorkspace.id)}
        haptic
        contentStyle={{ overflow: "hidden" }}
        style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: `${accentColor}40`,
          marginHorizontal: 4,
          marginTop: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        {/* Color accent strip */}
        <View
          style={{
            height: 4,
            backgroundColor: accentColor,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 14,
          }}
        >
          {/* Folder icon */}
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: `${accentColor}20`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 24 }}>
              {continueWorkspace.emoji || "📁"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              Continue Working In
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "800",
                marginTop: 1,
              }}
            >
              {continueWorkspace.name}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Text
              style={{
                color: accentColor,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              Open
            </Text>
            <Feather name="chevron-right" size={16} color={accentColor} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
};
