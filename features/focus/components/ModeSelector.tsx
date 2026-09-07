import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

interface ModeSelectorProps {
  mode?: "pomodoro" | "stopwatch";
  setMode?: (mode: "pomodoro" | "stopwatch") => void;
  pomodoroMode?: "work" | "break";
  setPomodoroMode?: (mode: "work" | "break") => void;
  onSelectFocus?: () => void;
  onSelectPomodoro?: () => void;
  onSelectBreak?: () => void;
  colors: any;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode = "pomodoro",
  setMode,
  pomodoroMode = "work",
  setPomodoroMode,
  onSelectFocus,
  onSelectPomodoro,
  onSelectBreak,
  colors,
}) => {
  const colorScheme = useColorScheme() ?? "dark";
  const isDark = colorScheme !== "light";

  const isBreak = pomodoroMode === "break";

  const handleFocusPress = () => {
    if (onSelectFocus) {
      onSelectFocus();
    } else if (onSelectPomodoro) {
      onSelectPomodoro();
    } else {
      setMode?.("pomodoro");
      setPomodoroMode?.("work");
    }
  };

  const handleBreakPress = () => {
    if (onSelectBreak) {
      onSelectBreak();
    } else {
      setMode?.("pomodoro");
      setPomodoroMode?.("break");
    }
  };

  const breakActiveBg = colors.success || "#10B981";

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
        onPress={handleFocusPress}
        hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
        style={({ pressed }) => [
          styles.modePill,
          {
            backgroundColor: !isBreak ? colors.primary : "transparent",
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
      >
        <Text
          style={[
            styles.modeText,
            {
              color: !isBreak ? "#ffffff" : colors.textMuted,
              fontWeight: !isBreak ? "700" : "600",
            },
          ]}
        >
          Focus
        </Text>
      </Pressable>

      <Pressable
        onPress={handleBreakPress}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
        style={({ pressed }) => [
          styles.modePill,
          {
            backgroundColor: isBreak ? breakActiveBg : "transparent",
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
      >
        <Text
          style={[
            styles.modeText,
            {
              color: isBreak ? "#ffffff" : colors.textMuted,
              fontWeight: isBreak ? "700" : "600",
            },
          ]}
        >
          Break
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
    gap: 4,
    marginBottom: -4,
    zIndex: 2,
  },
  modePill: {
    paddingVertical: 7,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
