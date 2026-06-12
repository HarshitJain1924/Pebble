import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";

interface ModeSelectorProps {
  mode: "pomodoro" | "stopwatch";
  setMode: (mode: "pomodoro" | "stopwatch") => void;
  colors: any;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, setMode, colors }) => {
  return (
    <View style={styles.container}>
      <Pressable onPress={() => setMode("pomodoro")} style={styles.pressable}>
        <View
          style={[
            styles.modePill,
            {
              backgroundColor: mode === "pomodoro" ? colors.primary : colors.card,
              borderColor: mode === "pomodoro" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={{
              color: mode === "pomodoro" ? "#fff" : colors.text,
              fontWeight: "700",
            }}
          >
            Pomodoro
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={() => setMode("stopwatch")} style={styles.pressable}>
        <View
          style={[
            styles.modePill,
            {
              backgroundColor: mode === "stopwatch" ? colors.primary : colors.card,
              borderColor: mode === "stopwatch" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={{
              color: mode === "stopwatch" ? "#fff" : colors.text,
              fontWeight: "700",
            }}
          >
            Stopwatch
          </Text>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  pressable: {
    flex: 1,
  },
  modePill: {
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
});
