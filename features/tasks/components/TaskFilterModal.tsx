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

export type TaskStatusFilter = "all" | "active" | "completed";
export type TaskPriorityFilter = "all" | "high" | "medium" | "low";
export type TaskScheduleFilter = "all" | "scheduled" | "unscheduled";
export type TaskReminderFilter = "all" | "has_reminder" | "no_reminder";

interface TaskFilterModalProps {
  visible: boolean;
  onClose: () => void;
  statusFilter: TaskStatusFilter;
  onSelectStatus: (status: TaskStatusFilter) => void;
  priorityFilter: TaskPriorityFilter;
  onSelectPriority: (priority: TaskPriorityFilter) => void;
  scheduleFilter: TaskScheduleFilter;
  onSelectSchedule: (schedule: TaskScheduleFilter) => void;
  reminderFilter: TaskReminderFilter;
  onSelectReminder: (reminder: TaskReminderFilter) => void;
  activeFilterCount: number;
  onResetFilters: () => void;
}

export const TaskFilterModal: React.FC<TaskFilterModalProps> = ({
  visible,
  onClose,
  statusFilter,
  onSelectStatus,
  priorityFilter,
  onSelectPriority,
  scheduleFilter,
  onSelectSchedule,
  reminderFilter,
  onSelectReminder,
  activeFilterCount,
  onResetFilters,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const colors = Colors[colorScheme ?? "dark"];

  const renderChip = (
    label: string,
    isSelected: boolean,
    onPress: () => void,
    accentColor?: string
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
                Filter Tasks
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Status Filter */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                STATUS
              </Text>
              <View style={styles.chipRow}>
                {renderChip("All", statusFilter === "all", () => onSelectStatus("all"))}
                {renderChip("Active", statusFilter === "active", () => onSelectStatus("active"))}
                {renderChip("Completed", statusFilter === "completed", () => onSelectStatus("completed"))}
              </View>
            </View>

            {/* Priority Filter */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                PRIORITY
              </Text>
              <View style={styles.chipRow}>
                {renderChip("All", priorityFilter === "all", () => onSelectPriority("all"))}
                {renderChip(
                  "High",
                  priorityFilter === "high",
                  () => onSelectPriority("high"),
                  Palette.red500
                )}
                {renderChip(
                  "Medium",
                  priorityFilter === "medium",
                  () => onSelectPriority("medium"),
                  Palette.amber500
                )}
                {renderChip(
                  "Low",
                  priorityFilter === "low",
                  () => onSelectPriority("low"),
                  Palette.blue500
                )}
              </View>
            </View>

            {/* Schedule Filter */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                SCHEDULE
              </Text>
              <View style={styles.chipRow}>
                {renderChip("All", scheduleFilter === "all", () => onSelectSchedule("all"))}
                {renderChip("Scheduled", scheduleFilter === "scheduled", () => onSelectSchedule("scheduled"))}
                {renderChip("Unscheduled", scheduleFilter === "unscheduled", () => onSelectSchedule("unscheduled"))}
              </View>
            </View>

            {/* Reminder Filter */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                REMINDER
              </Text>
              <View style={styles.chipRow}>
                {renderChip("All", reminderFilter === "all", () => onSelectReminder("all"))}
                {renderChip("Has reminder", reminderFilter === "has_reminder", () => onSelectReminder("has_reminder"))}
                {renderChip("No reminder", reminderFilter === "no_reminder", () => onSelectReminder("no_reminder"))}
              </View>
            </View>
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
};

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
