import React from "react";
import { View, ViewStyle, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getCategoryMeta } from "@/services/taskCategories";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type ChipSize = "xs" | "sm" | "md" | "lg";

export interface CategoryChipProps {
  category?: string;
  size?: ChipSize;
  style?: ViewStyle;
}

const SIZE_MAP = {
  xs: { box: 20, icon: 10, radius: 5 },
  sm: { box: 24, icon: 12, radius: 6 },
  md: { box: 28, icon: 14, radius: 7 },
  lg: { box: 32, icon: 16, radius: 8 },
};

export const CategoryChip: React.FC<CategoryChipProps> = ({
  category,
  size = "sm",
  style,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = Colors[colorScheme ?? "dark"];

  const meta = getCategoryMeta(category);
  const dims = SIZE_MAP[size];

  const tint = meta?.tint ?? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)");
  const color = meta?.color ?? colors.textMuted;
  const iconName = meta?.icon ?? "folder";

  return (
    <View
      style={[
        styles.container,
        {
          width: dims.box,
          height: dims.box,
          borderRadius: dims.radius,
          backgroundColor: tint,
        },
        style,
      ]}
    >
      <Feather
        name={iconName as any}
        size={dims.icon}
        color={color}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
