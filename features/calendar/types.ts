export type CalendarViewMode = "month" | "week" | "timeline";

export type CalendarEntityType = "task" | "habit" | "checklist";

export function getCalendarItemType(item: any): CalendarEntityType {
  if (item?.type === "habit") return "habit";
  if (item?.type === "checklist") return "checklist";
  return "task";
}
