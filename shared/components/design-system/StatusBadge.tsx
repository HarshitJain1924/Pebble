import React from "react";
import { StyleSheet, TextStyle } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export type StatusType =
  | "completed"
  | "overdue"
  | "today"
  | "recurring"
  | "active";

export interface StatusBadgeProps {
  status: StatusType;
  text: string;
  style?: TextStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  text,
  style,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // Overdue status gets red alert color, others get neutral muted text
  const color = status === "overdue" ? colors.error : colors.textMuted;

  return (
    <Text
      style={[
        styles.text,
        {
          color,
        },
        style,
      ]}
      numberOfLines={1}
    >
      {text.toUpperCase()}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
