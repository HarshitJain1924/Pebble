import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { Spacing } from "@/shared/constants/spacing";

export interface DomainFilterRowProps {
  countLabel: string;
  activeFilterCount: number;
  onOpenFilter: () => void;
  colors: any;
  isDark?: boolean;
  filterLabel?: string;
  testID?: string;
}

/**
 * DomainFilterRow
 *
 * Quiet, scannable control row placed above domain content (Tasks, Habits, Checklists, Resources).
 * Left: Entity item count.
 * Right: Tactile Filter button with active filter counter badge.
 */
export function DomainFilterRow({
  countLabel,
  activeFilterCount,
  onOpenFilter,
  colors,
  isDark = true,
  filterLabel = "Filter",
  testID = "domain-filter-row",
}: DomainFilterRowProps) {
  const hasActiveFilters = activeFilterCount > 0;
  const activeColor = isDark ? colors.primaryLight : colors.primary;

  return (
    <View style={styles.container} testID={testID}>
      <Text style={[styles.countText, { color: colors.textMuted }]} numberOfLines={1}>
        {countLabel}
      </Text>

      <PressableScale
        onPress={onOpenFilter}
        haptic
        scaleTo={0.94}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={`${filterLabel}, ${hasActiveFilters ? `${activeFilterCount} active filters` : "no active filters"}`}
        style={[
          styles.filterButton,
          {
            backgroundColor: hasActiveFilters
              ? isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.05)"
              : isDark
              ? "rgba(255, 255, 255, 0.04)"
              : "rgba(0, 0, 0, 0.03)",
            borderColor: hasActiveFilters
              ? activeColor
              : isDark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(0, 0, 0, 0.06)",
          },
        ]}
      >
        <Feather
          name="filter"
          size={13}
          color={hasActiveFilters ? activeColor : colors.textMuted}
        />
        <Text
          style={[
            styles.filterLabel,
            { color: hasActiveFilters ? activeColor : colors.textMuted },
          ]}
        >
          {filterLabel}
        </Text>
        {hasActiveFilters && (
          <Text style={[styles.activeBadgeText, { color: activeColor }]}>
            {`· ${activeFilterCount}`}
          </Text>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minHeight: 36,
  },
  countText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    minHeight: 28,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
});
