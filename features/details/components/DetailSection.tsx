import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export interface DetailSectionProps {
  /** Optional section label rendered as an uppercase caption above the card. */
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared grouping container for related detail information. Renders a flat
 * Level-1 surface card (never nested inside another card) with an optional
 * caption label. Entity-agnostic.
 */
export const DetailSection: React.FC<DetailSectionProps> = ({ title, children, style }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={style}>
      {title != null && (
        <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>
      )}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
});
