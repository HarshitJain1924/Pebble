import React from "react";
import { View, ViewStyle, StyleSheet } from "react-native";
import { useCategoryColor } from "@/shared/hooks/useCategoryColors";

export interface PriorityIndicatorProps {
  priority?: "low" | "medium" | "high";
  style?: ViewStyle;
}

export const PriorityIndicator: React.FC<PriorityIndicatorProps> = ({
  priority,
  style,
}) => {
  const color = useCategoryColor("priority", priority ?? "low");

  if (!priority || priority === "low") {
    return <View style={[styles.spacer, style]} />;
  }

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
