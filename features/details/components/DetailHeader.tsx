import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional leading type/entity visual (e.g. a category chip or icon node). */
  icon?: React.ReactNode;
  onBack?: () => void;
  onMore?: () => void;
  moreAccessibilityLabel?: string;
  /**
   * Optional custom action rendered in place of the overflow (more) action.
   * Takes precedence over onMore when both are provided. Entity-agnostic —
   * the caller supplies the node (e.g. an edit/save button).
   */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared detail header: back action, optional entity icon, title (long-title
 * safe), optional subtitle, and optional overflow (more) action. Entity-agnostic —
 * all content is supplied via props.
 */
export const DetailHeader: React.FC<DetailHeaderProps> = ({
  title,
  subtitle,
  icon,
  onBack,
  onMore,
  moreAccessibilityLabel = "More options",
  action,
  style,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={[styles.container, style]}>
      {onBack != null && (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
      )}

      {icon != null && <View style={styles.iconSlot}>{icon}</View>}

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle != null && (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {action != null ? (
        <View style={styles.actionSlot}>{action}</View>
      ) : onMore != null ? (
        <Pressable
          onPress={onMore}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={moreAccessibilityLabel}
          hitSlop={8}
        >
          <Feather name="more-horizontal" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  actionSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
});
