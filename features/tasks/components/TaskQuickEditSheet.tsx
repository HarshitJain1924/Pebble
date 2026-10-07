import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import PressableScale from "@/shared/components/ui/PressableScale";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Palette, Colors } from "@/shared/constants/theme";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { MONTH_NAMES } from "@/features/tasks/utils/task-formatting";
import { getTodayDateKey, getOffsetDateKey } from "@/shared/utils/date-key";
import type { Task, TaskPriority } from "@/shared/types/domain.types";
import { EntityQuickEditSheet } from "@/features/items/components/EntityQuickEditSheet";

export interface TaskQuickEditSheetProps {
  visible: boolean;
  onClose: () => void;
  item: Task;
  colors?: any;
  isDark?: boolean;
  isCompleted: boolean;
  onToggleComplete: () => void;
  onEditTodo?: () => void;
  onSetAlarm?: () => void;
  onOpenDatePicker: () => void;
  onDeleteTodo: () => void;
  linkedResources?: any[];
  totalResources?: number;
  streamColors?: any;
  handleOpenResource?: (res: any) => void;
  onOpenLinkSelector?: () => void;
}

/**
 * TaskQuickEditSheet
 * ──────────────────
 * Compact quick edit bottom sheet for Tasks.
 * Powered by the reusable EntityQuickEditSheet foundation.
 * Owns Task-specific domain data, callbacks, leading checkbox, and property formatting.
 */
export function TaskQuickEditSheet({
  visible,
  onClose,
  item,
  colors: explicitColors,
  isDark: explicitIsDark,
  isCompleted,
  onToggleComplete,
  onEditTodo,
  onSetAlarm,
  onOpenDatePicker,
  onDeleteTodo,
  linkedResources = [],
  totalResources = 0,
  streamColors,
  handleOpenResource,
  onOpenLinkSelector,
}: TaskQuickEditSheetProps) {
  const effectiveIsDark = explicitIsDark !== undefined ? explicitIsDark : true;
  const colors = explicitColors || Colors[effectiveIsDark ? "dark" : "light"];

  // Reminder label
  const hasReminder = Boolean(item.reminder?.enabled && item.reminder?.triggerAt);
  const reminderLabel = useMemo(() => {
    if (!hasReminder || !item.reminder?.triggerAt) return "Reminder";
    const d = new Date(item.reminder.triggerAt);
    return formatReminderTime(d.getHours(), d.getMinutes()) || "Reminder";
  }, [hasReminder, item.reminder?.triggerAt]);

  // Schedule label
  const scheduleDate = item.schedule?.date;
  const hasSchedule = Boolean(scheduleDate && scheduleDate !== "inbox");
  const scheduleLabel = useMemo(() => {
    if (!hasSchedule || !scheduleDate) return "Schedule";
    const today = getTodayDateKey();
    const tomorrow = getOffsetDateKey(-1, today);
    const yesterday = getOffsetDateKey(1, today);
    if (scheduleDate === today) return "Today";
    if (scheduleDate === tomorrow) return "Tomorrow";
    if (scheduleDate === yesterday) return "Yesterday";
    try {
      const [y, m, d] = scheduleDate.split("-").map(Number);
      const month = MONTH_NAMES[(m || 1) - 1] || "";
      return `${month} ${d}`;
    } catch {
      return scheduleDate;
    }
  }, [hasSchedule, scheduleDate]);

  // Leading square task checkbox
  const leadingControl = (
    <PressableScale
      onPress={onToggleComplete}
      haptic
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isCompleted }}
      accessibilityLabel={isCompleted ? "Mark task incomplete" : "Mark task complete"}
      style={[
        styles.checkboxTarget,
        {
          borderColor: isCompleted
            ? colors.success
            : (effectiveIsDark ? "rgba(255, 255, 255, 0.3)" : Palette.slate300),
          backgroundColor: isCompleted ? colors.success : "transparent",
        },
      ]}
    >
      {isCompleted && <Feather name="check" size={13} color={Palette.white} />}
    </PressableScale>
  );

  return (
    <EntityQuickEditSheet
      visible={visible}
      onClose={onClose}
      title={item.title}
      onSaveTitle={async (newTitle) => {
        if (!item.id || !item.workspaceId) return;
        await EntityCommandService.updateTask(item.id, item.workspaceId, { title: newTitle });
      }}
      description={item.description || ""}
      onSaveDescription={async (newDesc) => {
        if (!item.id || !item.workspaceId) return;
        await EntityCommandService.updateTask(item.id, item.workspaceId, { description: newDesc });
      }}
      titlePlaceholder="Task title"
      descriptionPlaceholder="Add a note..."
      isCompleted={isCompleted}
      leadingControl={leadingControl}
      priority={item.priority || "none"}
      onSelectPriority={async (newPriority: TaskPriority) => {
        if (!item.id || !item.workspaceId) return;
        await EntityCommandService.updateTask(item.id, item.workspaceId, { priority: newPriority });
      }}
      showPriority={true}
      reminderLabel={reminderLabel}
      hasReminder={hasReminder}
      onPressReminder={onSetAlarm}
      scheduleLabel={scheduleLabel}
      scheduleIcon="calendar"
      hasSchedule={hasSchedule}
      onPressSchedule={onOpenDatePicker}
      totalResources={totalResources}
      linkedResources={linkedResources}
      onOpenResource={handleOpenResource}
      onAddResource={onOpenLinkSelector}
      onDelete={onDeleteTodo}
      deleteAccessibilityLabel="Delete task"
      onOpenFullDetails={onEditTodo || (() => {})}
      fullDetailsLabel="Open full details"
      fullDetailsAccessibilityLabel="Open full task details"
      colorScheme={effectiveIsDark ? "dark" : "light"}
      testIDPrefix="task"
    />
  );
}

const styles = StyleSheet.create({
  checkboxTarget: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
