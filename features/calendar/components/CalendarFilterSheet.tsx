import React from "react";
import { View, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import PressableScale from "@/shared/components/ui/PressableScale";

interface CalendarFilterSheetProps {
  visible: boolean;
  activeFilters: string[];
  setActiveFilters: (filters: string[]) => void;
  showCompleted: boolean;
  setShowCompleted: (show: boolean) => void;
  onClose: () => void;
  colors: any;
  isLight: boolean;
}

export const CalendarFilterSheet: React.FC<CalendarFilterSheetProps> = ({
  visible,
  activeFilters,
  setActiveFilters,
  showCompleted,
  setShowCompleted,
  onClose,
  colors,
  isLight,
}) => {
  const filterOptions = [
    { key: "task", label: "Tasks", color: "#6C63FF" },
    { key: "habit", label: "Habits", color: "#10B981" },
    { key: "checklist", label: "Checklists", color: "#3B82F6" },
  ];

  return (
    <AnimatedOverlay
      visible={visible}
      onClose={onClose}
      type="bottom-sheet"
    >
      {() => (
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.headerRow,
              { borderBottomColor: colors.border + "40" },
            ]}
          >
            <Text
              style={[styles.headerTitle, { color: colors.text }]}
            >
              Filter Timeline
            </Text>
          </View>

          {/* Filter Options */}
          <View style={styles.filterChipsRow}>
            {filterOptions.map((opt) => {
              const isActive = activeFilters.includes(opt.key);
              return (
                <PressableScale
                  key={opt.key}
                  onPress={() => {
                    if (isActive) {
                      setActiveFilters(
                        activeFilters.filter((f) => f !== opt.key),
                      );
                    } else {
                      setActiveFilters([...activeFilters, opt.key]);
                    }
                  }}
                  scaleTo={0.95}
                  contentStyle={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive
                        ? `${opt.color}18`
                        : isLight
                          ? "#F1F5F9"
                          : "rgba(255,255,255,0.02)",
                      borderColor: isActive ? opt.color : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: isActive ? opt.color : colors.textMuted,
                      },
                    ]}
                  >
                    {isActive ? "✓ " : ""} {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* Completed Tasks Toggle */}
          <View
            style={[styles.separator, { backgroundColor: colors.border }]}
          />
          <PressableScale
            onPress={() => setShowCompleted(!showCompleted)}
            scaleTo={0.98}
            contentStyle={[
              styles.completedToggle,
              {
                backgroundColor: showCompleted
                  ? `${colors.primary}1a`
                  : "transparent",
                borderColor: showCompleted ? colors.primary : colors.border,
              },
            ]}
          >
            <View style={styles.completedLeft}>
              <Feather
                name="eye"
                size={14}
                color={showCompleted ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.completedText, { color: colors.text }]}
              >
                Show Completed Items
              </Text>
            </View>
            {showCompleted ? (
              <Feather name="check" size={14} color={colors.primary} />
            ) : null}
          </PressableScale>
        </View>
      )}
    </AnimatedOverlay>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1.5,
  },
  headerRow: {
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  separator: {
    height: 1,
    marginVertical: 8,
  },
  completedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  completedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  completedText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
