import React from "react";
import { View, ViewStyle, StyleSheet } from "react-native";

export interface PriorityIndicatorProps {
  priority?: "low" | "medium" | "high";
  style?: ViewStyle;
}

export const PriorityIndicator: React.FC<PriorityIndicatorProps> = ({
  priority,
  style,
}) => {
  if (!priority || priority === "low") {
    return <View style={[styles.spacer, style]} />;
  }

  const color = priority === "high" ? "#EF4444" : "#F59E0B";

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.line,
          {
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  spacer: {
    width: 2,
  },
  container: {
    width: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    width: 2,
    height: 18,
    borderRadius: 1,
  },
});
