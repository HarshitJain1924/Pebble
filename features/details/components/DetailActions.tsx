import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors, Palette } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { LiquidGlassSurface } from "@/shared/components/ui/LiquidGlassSurface";

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
  glass?: boolean;
}

/**
 * Shared action presentation area (footer buttons). Renders a row of actions
 * with primary / secondary / danger tones. Entity-agnostic — callers supply the
 * actions. All interactive targets honor the 44px minimum touch target.
 */
export const DetailActions: React.FC<DetailActionsProps> = ({ actions, style, glass }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={[styles.container, style]}>
      {actions.map((action) => {
        const tone = action.tone ?? "secondary";
        const isPrimary = tone === "primary";
        const isDanger = tone === "danger";
        const labelColor = isPrimary || isDanger ? Palette.white : colors.text;

        if (glass && !isPrimary && !isDanger) {
          return (
            <Pressable
              key={action.key}
              onPress={() => {
                if (!action.disabled) action.onPress();
              }}
              disabled={action.disabled}
              style={({ pressed }) => [
                { flex: 1 },
                pressed && !action.disabled && { opacity: 0.8 },
                action.disabled && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel ?? action.label}
              accessibilityState={{ disabled: !!action.disabled }}
            >
              <LiquidGlassSurface
                borderRadius={14}
                style={[
                  styles.button,
                  {
                    backgroundColor: "transparent",
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "rgba(255, 255, 255, 0.16)",
                  },
                ]}
                tintColor={
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.03)"
                    : "rgba(255, 255, 255, 0.08)"
                }
                intensity={50}
              >
                {action.icon != null && <View style={styles.iconSlot}>{action.icon}</View>}
                <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
                  {action.label}
                </Text>
              </LiquidGlassSurface>
            </Pressable>
          );
        }

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
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.4,
  },
});
