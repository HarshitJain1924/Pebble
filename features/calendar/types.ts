export type CalendarViewMode = "month" | "week" | "timeline";

export type CalendarViewContext = "day" | "week" | "month";

export type CalendarEntityType = "task" | "habit" | "checklist";

export type DragLifecycleState = "idle" | "dragging" | "dropping";

export interface CalendarTimelineItem {
  id: string;
  title: string;
  type: CalendarEntityType;
  workspaceId: string;
  date?: string;
  startHour?: number;
  startMinute?: number;
  durationMinutes: number;
  isAllDay?: boolean;
  completed?: boolean;
  priority?: "none" | "low" | "medium" | "high";
  recurrence?: any;
  schedule?: any;
  reminder?: any;
  streak?: number;
  frequency?: any;
  completionHistory?: any[];
  items?: any[];
  itemsCount?: number;
  completedItemsCount?: number;
  categoryId?: string;
  tags?: string[];
  colIdx?: number;
  totalCols?: number;
  top?: number;
  height?: number;
  timeLabel?: string;
  [key: string]: any;
}

export function getCalendarItemType(item: any): CalendarEntityType {
  if (item?.type === "habit") return "habit";
  if (item?.type === "checklist") return "checklist";
  if (item?.type === "task") return "task";

  if (Array.isArray(item?.items)) return "checklist";
  if (
    item?.completionHistory !== undefined ||
    item?.streak !== undefined ||
    item?.frequency !== undefined
  ) {
    return "habit";
  }
  if (item?.status !== undefined) return "task";

  return "task";
}
