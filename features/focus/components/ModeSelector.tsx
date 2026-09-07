import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

interface ModeSelectorProps {
  mode: "pomodoro" | "stopwatch";
  setMode: (mode: "pomodoro" | "stopwatch") => void;
  colors: any;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, setMode, colors }) => {
  const colorScheme = useColorScheme() ?? "dark";
  const isDark = colorScheme !== "light";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
          borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
        },
      ]}
    >
      <Pressable
        onPress={() => setMode("pomodoro")}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          styles.modePill,
          {
            backgroundColor: mode === "pomodoro" ? colors.primary : "transparent",
            shadowColor: mode === "pomodoro" ? colors.primary : "transparent",
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
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
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          styles.modePill,
          {
            backgroundColor: mode === "stopwatch" ? colors.primary : "transparent",
            shadowColor: mode === "stopwatch" ? colors.primary : "transparent",
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
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
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    gap: 3,
    marginBottom: -4,
    zIndex: 2,
  },
  modePill: {
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modeText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
