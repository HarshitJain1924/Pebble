import React, { useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import { Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type { Habit, TaskPriority } from "@/shared/types/domain.types";
import { EntityQuickEditSheet } from "@/features/items/components/EntityQuickEditSheet";

export interface HabitQuickEditSheetProps {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  completedToday: boolean;
  onToggleComplete: () => void;
  onDeleteHabit?: () => void;
  onOpenFullDetails?: () => void;
  onSetReminder?: () => void;
  linkedResources?: any[];
  totalResources?: number;
  onOpenResource?: (res: any) => void;
  onAddResource?: () => void;
  colorScheme?: "light" | "dark" | null;
}

/**
 * HabitQuickEditSheet
 * ───────────────────
 * Compact, tactile quick-edit bottom sheet for Habits.
 * Powered by the reusable EntityQuickEditSheet foundation.
 * Allows instant editing of title, note/description, priority, reminder, and linked resources.
 */
export const HabitQuickEditSheet: React.FC<HabitQuickEditSheetProps> = ({
  visible,
  onClose,
  habit,
  completedToday,
  onToggleComplete,
  onDeleteHabit,
  onOpenFullDetails,
  onSetReminder,
  linkedResources = [],
  totalResources = 0,
  onOpenResource,
  onAddResource,
  colorScheme: explicitScheme,
}) => {
  const systemScheme = useColorScheme();
  const effectiveScheme = explicitScheme ?? systemScheme;
  const isDark = effectiveScheme !== "light";

  // Recurrence summary label
  const recurrenceLabel = useMemo(() => {
    if (!habit?.recurrence) return "Daily";
    return getRecurrenceLabel(habit.recurrence) || "Daily";
  }, [habit?.recurrence]);

  // Reminder summary label
  const hasReminder = Boolean(habit?.reminder?.enabled && habit?.reminder?.triggerAt);
  const reminderLabel = useMemo(() => {
    if (!hasReminder || !habit?.reminder?.triggerAt) return "Reminder";
    const d = new Date(habit.reminder.triggerAt);
    return formatReminderTime(d.getHours(), d.getMinutes()) || "Reminder";
  }, [hasReminder, habit?.reminder?.triggerAt]);

  const leadingControl = (
    <Pressable
      onPress={onToggleComplete}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completedToday }}
      accessibilityLabel={completedToday ? "Mark habit incomplete" : "Mark habit complete"}
      hitSlop={8}
      style={styles.checkButton}
    >
      <ProgressRing
        progress={completedToday ? 1 : 0}
        size={24}
        strokeWidth={3.5}
        showText={false}
        color={Palette.amber500}
        trackColor={
          isDark ? "rgba(245, 158, 11, 0.28)" : "rgba(245, 158, 11, 0.18)"
        }
      />
      {completedToday && (
        <View style={styles.checkIconWrapper}>
          <Feather name="check" size={13} color={Palette.amber500} />
        </View>
      )}
    </Pressable>
  );

  return (
    <EntityQuickEditSheet
      visible={visible}
      onClose={onClose}
      title={habit?.title || ""}
      onSaveTitle={async (newTitle) => {
        if (!habit?.id || !habit?.workspaceId) return;
        await EntityCommandService.updateHabit(habit.id, habit.workspaceId, {
          title: newTitle,
        });
      }}
      description={habit?.description || ""}
      onSaveDescription={async (newDesc) => {
        if (!habit?.id || !habit?.workspaceId) return;
        await EntityCommandService.updateHabit(habit.id, habit.workspaceId, {
          description: newDesc,
        });
      }}
      titlePlaceholder="Habit title"
      descriptionPlaceholder="Add motivation or notes..."
      isCompleted={completedToday}
      leadingControl={leadingControl}
      priority={habit?.priority || "none"}
      onSelectPriority={async (newPriority: TaskPriority) => {
        if (!habit?.id || !habit?.workspaceId) return;
        await EntityCommandService.updateHabit(habit.id, habit.workspaceId, {
          priority: newPriority,
        });
      }}
      showPriority={true}
      reminderLabel={reminderLabel}
      hasReminder={hasReminder}
      onPressReminder={onSetReminder}
      scheduleLabel={recurrenceLabel}
      scheduleIcon="repeat"
      hasSchedule={true}
      onPressSchedule={onOpenFullDetails}
      totalResources={totalResources}
      linkedResources={linkedResources}
      onOpenResource={onOpenResource}
      onAddResource={onAddResource}
      onDelete={onDeleteHabit}
      deleteAccessibilityLabel="Delete habit"
      onOpenFullDetails={onOpenFullDetails}
      fullDetailsLabel="Open full habit details"
      colorScheme={effectiveScheme}
      testIDPrefix="habit"
    />
  );
};

const styles = StyleSheet.create({
  checkButton: {
    position: "relative",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  checkIconWrapper: {
    position: "absolute",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
