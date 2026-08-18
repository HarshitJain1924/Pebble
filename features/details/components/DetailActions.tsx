import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export type DetailActionTone = "primary" | "secondary" | "danger";

export interface DetailAction {
  key: string;
  label: string;
  onPress: () => void;
  tone?: DetailActionTone;
  icon?: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export interface DetailActionsProps {
  actions: DetailAction[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared action presentation area (footer buttons). Renders a row of actions
 * with primary / secondary / danger tones. Entity-agnostic — callers supply the
 * actions. All interactive targets honor the 44px minimum touch target.
 */
export const DetailActions: React.FC<DetailActionsProps> = ({ actions, style }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={[styles.container, style]}>
      {actions.map((action) => {
        const tone = action.tone ?? "secondary";
        const isPrimary = tone === "primary";
        const isDanger = tone === "danger";
        const labelColor = isPrimary || isDanger ? "#FFFFFF" : colors.text;

        return (
          <Pressable
            key={action.key}
            onPress={() => {
              if (!action.disabled) action.onPress();
            }}
            disabled={action.disabled}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: isPrimary
                  ? colors.primary
                  : isDanger
                    ? colors.error
                    : "transparent",
                borderColor: isPrimary || isDanger ? "transparent" : colors.border,
              },
              pressed && !action.disabled && { opacity: 0.75 },
              action.disabled && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            accessibilityState={{ disabled: !!action.disabled }}
          >
            {action.icon != null && <View style={styles.iconSlot}>{action.icon}</View>}
            <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.45,
  },
});
