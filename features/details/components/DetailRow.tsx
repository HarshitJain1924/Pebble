import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export interface DetailRowProps {
  label: string;
  value?: string;
  /** Optional leading visual (icon node) before the label. */
  icon?: React.ReactNode;
  /** Optional trailing accessory (e.g. a toggle or chevron) after the value. */
  accessory?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared label/value metadata row (e.g. Workspace / Personal, Reminder / 30 min
 * before). Supports an optional icon, trailing accessory, and press action.
 * Entity-agnostic.
 */
export const DetailRow: React.FC<DetailRowProps> = ({
  label,
  value,
  icon,
  accessory,
  onPress,
  style,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const content = (
    <>
      {icon != null && <View style={styles.iconSlot}>{icon}</View>}
      <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      {value != null && (
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      {accessory}
      {onPress != null && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
    </>
  );

  const containerStyle = [styles.row, style];

  if (onPress != null) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [containerStyle, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{content}</View>;
};

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconSlot: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
  },
});
