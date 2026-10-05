import React from "react";
import { Palette } from "@/shared/constants/theme";
import {
  PebbleFilterModal,
  FilterSectionConfig,
} from "@/features/workspaces/components/PebbleFilterModal";

export type HabitStatusFilter = "all" | "active" | "completed";
export type HabitPriorityFilter = "all" | "high" | "medium" | "low";
export type HabitFrequencyFilter = "all" | "daily" | "weekly";
export type HabitReminderFilter = "all" | "has_reminder" | "no_reminder";

export interface HabitFilterModalProps {
  visible: boolean;
  onClose: () => void;
  statusFilter: HabitStatusFilter;
  onSelectStatus: (status: HabitStatusFilter) => void;
  priorityFilter: HabitPriorityFilter;
  onSelectPriority: (priority: HabitPriorityFilter) => void;
  frequencyFilter: HabitFrequencyFilter;
  onSelectFrequency: (freq: HabitFrequencyFilter) => void;
  reminderFilter: HabitReminderFilter;
  onSelectReminder: (reminder: HabitReminderFilter) => void;
  activeFilterCount: number;
  onResetFilters: () => void;
  colors?: any;
  isDark?: boolean;
}

export function HabitFilterModal({
  visible,
  onClose,
  statusFilter,
  onSelectStatus,
  priorityFilter,
  onSelectPriority,
  frequencyFilter,
  onSelectFrequency,
  reminderFilter,
  onSelectReminder,
  activeFilterCount,
  onResetFilters,
  colors,
  isDark,
}: HabitFilterModalProps) {
  const sections: FilterSectionConfig<any>[] = [
    {
      id: "status",
      label: "STATUS",
      options: [
        { key: "all", label: "All" },
        { key: "active", label: "Active" },
        { key: "completed", label: "Completed" },
      ],
      selectedValue: statusFilter,
      onSelect: onSelectStatus,
    },
    {
      id: "priority",
      label: "PRIORITY",
      options: [
        { key: "all", label: "All" },
        { key: "high", label: "High", accentColor: Palette.red500 },
        { key: "medium", label: "Medium", accentColor: Palette.amber500 },
        { key: "low", label: "Low", accentColor: Palette.blue500 },
      ],
      selectedValue: priorityFilter,
      onSelect: onSelectPriority,
    },
    {
      id: "frequency",
      label: "FREQUENCY",
      options: [
        { key: "all", label: "All" },
        { key: "daily", label: "Daily" },
        { key: "weekly", label: "Weekly" },
      ],
      selectedValue: frequencyFilter,
      onSelect: onSelectFrequency,
    },
    {
      id: "reminder",
      label: "REMINDER",
      options: [
        { key: "all", label: "All" },
        { key: "has_reminder", label: "Has reminder" },
        { key: "no_reminder", label: "No reminder" },
      ],
      selectedValue: reminderFilter,
      onSelect: onSelectReminder,
    },
  ];

  return (
    <PebbleFilterModal
      visible={visible}
      onClose={onClose}
      title="Filter Habits"
      activeFilterCount={activeFilterCount}
      onResetFilters={onResetFilters}
      sections={sections}
      colors={colors}
      isDark={isDark}
      testID="habit-filter-modal"
    />
  );
}
