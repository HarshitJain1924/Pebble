import React from "react";
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export interface FilterOption<T extends string = string> {
  key: T;
  label: string;
  accentColor?: string;
}

export interface FilterSectionConfig<T extends string = string> {
  id: string;
  label: string;
  options: FilterOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
}

export interface PebbleFilterModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  activeFilterCount: number;
  onResetFilters: () => void;
  sections: FilterSectionConfig<any>[];
  colors?: any;
  isDark?: boolean;
  testID?: string;
}

/**
 * PebbleFilterModal
 *
 * Pebble-standard modal sheet for domain filtering (Tasks, Habits, Checklists, Resources).
 * Consistent layout:
 * - Backdrop with tap-outside dismiss
 * - Header: filter icon, title, active badge, reset CTA, close button
 * - Sections: uppercase section title + responsive chip rows with tactile feedback
 * - Footer: full-width "Done" button with primary accent
 */
export function PebbleFilterModal({
  visible,
  onClose,
  title,
  activeFilterCount,
  onResetFilters,
  sections,
  colors: propColors,
  isDark: propIsDark,
  testID = "pebble-filter-modal",
}: PebbleFilterModalProps) {
  const colorScheme = useColorScheme();
  const isDark = propIsDark !== undefined ? propIsDark : colorScheme !== "light";
  const colors = propColors || Colors[colorScheme ?? "dark"];

  const renderChip = (
    label: string,
    isSelected: boolean,
    onPress: () => void,
    accentColor?: string,
  ) => {
    return (
      <PressableScale
        key={label}
        onPress={onPress}
        haptic
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel={`Filter option ${label}, ${isSelected ? "selected" : "not selected"}`}
        style={[
          styles.chip,
          {
            backgroundColor: isSelected
              ? isDark
                ? "rgba(255, 255, 255, 0.12)"
                : "rgba(0, 0, 0, 0.08)"
              : isDark
              ? "rgba(255, 255, 255, 0.04)"
              : "rgba(0, 0, 0, 0.03)",
            borderColor: isSelected
              ? accentColor || (isDark ? colors.primaryLight : colors.primary)
              : isDark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(0, 0, 0, 0.06)",
          },
        ]}
      >
        {accentColor && isSelected && (
          <View
            style={[
              styles.chipDot,
              { backgroundColor: accentColor },
            ]}
          />
        )}
        <Text
          style={[
            styles.chipText,
            {
              color: isSelected ? colors.text : colors.textMuted,
              fontWeight: isSelected ? "700" : "500",
            },
          ]}
        >
          {label}
        </Text>
      </PressableScale>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Dismiss filter menu"
        />

        <View
          style={[
            styles.sheetCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="filter" size={17} color={colors.text} />
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {title}
              </Text>
              {activeFilterCount > 0 && (
                <View
                  style={[
                    styles.activeCountBadge,
                    {
                      backgroundColor: isDark
                        ? "rgba(99, 102, 241, 0.2)"
                        : "#EEF2FF",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: isDark ? Palette.indigo400 : Palette.indigo600,
                    }}
                  >
                    {activeFilterCount} active
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {activeFilterCount > 0 && (
                <PressableScale
                  onPress={onResetFilters}
                  haptic
                  scaleTo={0.92}
                  style={styles.resetButton}
                  accessibilityLabel="Reset all filters"
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.primary,
                    }}
                  >
                    Reset
                  </Text>
                </PressableScale>
              )}

              <PressableScale
                onPress={onClose}
                hitSlop={8}
                haptic
                scaleTo={0.9}
                accessibilityLabel="Close filter"
                style={styles.closeButton}
              >
                <Feather name="x" size={18} color={colors.textMuted} />
              </PressableScale>
            </View>
          </View>

          {/* Sections list */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  {section.label}
                </Text>
                <View style={styles.chipRow}>
                  {section.options.map((opt) =>
                    renderChip(
                      opt.label,
                      section.selectedValue === opt.key,
                      () => section.onSelect(opt.key),
                      opt.accentColor,
                    ),
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Done CTA */}
          <PressableScale
            onPress={onClose}
            haptic
            scaleTo={0.97}
            style={[
              styles.doneButton,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheetCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  activeCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  resetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 12,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 34,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
  },
  doneButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
