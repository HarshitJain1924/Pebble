import { type Checklist } from "@/shared/types/domain.types";
import { type EntityMetaPart } from "@/features/items";
import {
  formatTaskScheduleDate,
  formatTimeString,
  formatTimeRange,
} from "@/features/tasks/utils/task-formatting";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { getTodayDateKey } from "@/shared/utils/date-key";

export interface ChecklistMetadataOptions {
  referenceDate?: string;
  isCompleted?: boolean;
  completedCount?: number;
  totalCount?: number;
  linkedCount?: number;
  resourceIconName?: any;
  onToggleExpand?: () => void;
  onOpenLinkSelector?: () => void;
  colors?: {
    textMuted?: string;
    error?: string;
    primary?: string;
  };
}

/**
 * Derives compact, secondary metadata parts for a Checklist row or card.
 *
 * Information hierarchy:
 * 1. Progress: "X of Y completed" (interactive)
 * 2. Remaining: "Completed" or "N left" (interactive)
 * 3. Overdue flag: if past scheduled date and incomplete
 * 4. Recurrence or Scheduled Date: "Weekly" (repeat icon) or "Tomorrow" (calendar icon)
 * 5. Scheduled Time: "10:30 AM" or "10:30–11:15 AM"
 * 6. Reminder: "8:45 AM" or "Oct 24 at 9:00 AM" (bell icon)
 * 7. Linked Resources count
 */
export function getChecklistMetadataParts(
  checklist: Checklist,
  options: ChecklistMetadataOptions = {},
): EntityMetaPart[] {
  const parts: EntityMetaPart[] = [];
  const textMuted = options.colors?.textMuted;
  const primaryColor = options.colors?.primary;
  const errorColor = options.colors?.error;
  const referenceDate = options.referenceDate || getTodayDateKey();

  const totalCount =
    options.totalCount ?? (checklist.items ? checklist.items.length : 0);
  const completedCount =
    options.completedCount ??
    (checklist.items ? checklist.items.filter((i) => i.completed).length : 0);
  const isAllCompleted =
    options.isCompleted ??
    (totalCount > 0 && completedCount === totalCount);

  // 1. Progress
  parts.push({
    key: "progress",
    text: `${completedCount} of ${totalCount} completed`,
    color: textMuted,
    onPress: options.onToggleExpand,
    accessibilityRole: "button",
    accessibilityLabel: `${completedCount} of ${totalCount} completed`,
  });

  // 2. Remaining / Completion status
  parts.push({
    key: "remaining",
    text: isAllCompleted ? "Completed" : `${totalCount - completedCount} left`,
    color: isAllCompleted ? primaryColor : textMuted,
    isBold: isAllCompleted,
    onPress: options.onToggleExpand,
    accessibilityRole: "button",
  });

  // 3. Overdue indicator (one-off checklists scheduled before reference date)
  const scheduleDate = checklist.schedule?.date;
  const hasRecurrence = Boolean(checklist.recurrence);
  const isOverdue =
    !isAllCompleted &&
    !hasRecurrence &&
    Boolean(scheduleDate && scheduleDate !== "inbox" && scheduleDate < referenceDate);

  if (isOverdue) {
    parts.push({
      key: "overdue",
      text: "Overdue",
      color: errorColor,
      isBold: true,
    });
  }

  // 4. Temporal Anchor: Recurrence or Scheduled Date
  let hasTemporalAnchor = false;
  if (hasRecurrence && checklist.recurrence) {
    const rawLabel = getRecurrenceLabel(checklist.recurrence);
    if (rawLabel) {
      const cleanLabel = rawLabel.replace(/[↻]/g, "").trim();
      parts.push({
        key: "recurrence",
        text: cleanLabel,
        color: textMuted,
        icon: "repeat",
      });
      hasTemporalAnchor = true;
    }
  } else if (scheduleDate && scheduleDate !== "inbox") {
    const dateInfo = formatTaskScheduleDate(scheduleDate, referenceDate);
    if (dateInfo) {
      parts.push({
        key: "date",
        text: dateInfo.label,
        color: textMuted,
        icon: "calendar",
      });
      hasTemporalAnchor = true;
    }
  }

  // 5. Scheduled Time / Time Range
  if (checklist.schedule?.startTime) {
    const timeRange = formatTimeRange(
      checklist.schedule.startTime,
      checklist.schedule.endTime,
      checklist.schedule.durationMinutes,
    );
    if (timeRange) {
      parts.push({
        key: "time",
        text: timeRange,
        color: textMuted,
        icon: hasTemporalAnchor ? undefined : "clock",
      });
    }
  }

  // 6. Reminder: only when enabled and checklist is not completed
  if (checklist.reminder?.enabled && checklist.reminder?.triggerAt && !isAllCompleted) {
    const triggerDate = new Date(checklist.reminder.triggerAt);
    const remTime = formatReminderTime(triggerDate.getHours(), triggerDate.getMinutes());
    if (remTime) {
      const scheduleStartTime = formatTimeString(checklist.schedule?.startTime);
      const reminderDateKey = dateKeyFromDate(triggerDate);
      const isDiffDate =
        Boolean(scheduleDate && scheduleDate !== "inbox" && reminderDateKey !== scheduleDate);

      if (isDiffDate) {
        const formattedRemDate =
          formatTaskScheduleDate(reminderDateKey, referenceDate)?.label || reminderDateKey;
        parts.push({
          key: "reminder",
          text: `${formattedRemDate} at ${remTime}`,
          icon: "bell",
          color: textMuted,
        });
      } else if (!scheduleStartTime || remTime !== scheduleStartTime) {
        parts.push({
          key: "reminder",
          text: remTime,
          icon: "bell",
          color: textMuted,
        });
      }
    }
  }

  // 7. Linked Resources Indicator
  const linkedCount = options.linkedCount ?? (checklist.resourceIds?.length || 0);
  if (linkedCount > 0) {
    parts.push({
      key: "resources",
      text: String(linkedCount),
      icon: options.resourceIconName,
      onPress: options.onOpenLinkSelector,
      accessibilityRole: "button",
      accessibilityLabel: `${linkedCount} resources linked to ${checklist.title}`,
      testID: "checklist-resource-indicator",
    });
  }

  return parts;
}
