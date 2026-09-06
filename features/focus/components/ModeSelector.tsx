import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";

interface ModeSelectorProps {
  mode: "pomodoro" | "stopwatch";
  setMode: (mode: "pomodoro" | "stopwatch") => void;
  colors: any;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, setMode, colors }) => {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.cardLight || "rgba(255, 255, 255, 0.04)",
          borderColor: colors.border || "rgba(255, 255, 255, 0.08)",
        },
      ]}
    >
      <Pressable
        onPress={() => setMode("pomodoro")}
        hitSlop={4}
        style={[
          styles.modePill,
          {
            backgroundColor: mode === "pomodoro" ? colors.primary : "transparent",
          },
        ]}
      >
        <Text
          style={[
            styles.modeText,
            {
              color: mode === "pomodoro" ? "#ffffff" : colors.textMuted,
              fontWeight: mode === "pomodoro" ? "700" : "600",
            },
          ]}
        >
          Pomodoro
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setMode("stopwatch")}
        hitSlop={4}
        style={[
          styles.modePill,
          {
            backgroundColor: mode === "stopwatch" ? colors.primary : "transparent",
          },
        ]}
      >
        <Text
          style={[
            styles.modeText,
            {
              color: mode === "stopwatch" ? "#ffffff" : colors.textMuted,
              fontWeight: mode === "stopwatch" ? "700" : "600",
            },
          ]}
        >
          Stopwatch
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignSelf: "center",
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    gap: 2,
  },
  modePill: {
    paddingVertical: 5,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modeText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
