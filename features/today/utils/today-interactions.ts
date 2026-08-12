/**
 * Today screen row interaction model.
 *
 * Centralizes the tap decisions for Today workspace rows so the interaction
 * model stays consistent and regression-testable:
 *
 * - Task rows:      content tap opens Task Details; checkbox completes/uncompletes.
 * - Habit rows:     content tap opens Habit Details; checkbox completes/uncompletes.
 * - Checklist rows: content tap expands/collapses items inline (no details navigation).
 *
 * Completed tasks stay visible in their workspace with their completed styling,
 * but their checkbox is locked ("remain uncheckable") on the Today screen.
 */

export type TodayRowKind = "task" | "habit" | "checklist";

/** Route type accepted by expo-router's typed `router.push` for the details screen. */
export type ItemDetailsRoute = `/task-details?id=${string}&type=${"task" | "habit"}`;

export type TodayContentAction =
  | { action: "open-details"; route: ItemDetailsRoute }
  | { action: "toggle-expand" };

export type TodayCheckboxAction = "toggle-completion" | "toggle-expand" | "locked";

/** Builds the Task/Habit Details route for a Today row's content tap. */
export function buildItemDetailsRoute(
  itemId: string,
  kind: "task" | "habit",
): ItemDetailsRoute {
  return `/task-details?id=${itemId}&type=${kind}`;
}

/**
 * Decides what tapping a row's content should do.
 * Tasks and habits open their Details page; checklists stay inline and
 * expand/collapse their items (never a details-page navigation).
 */
export function getRowContentAction(
  kind: TodayRowKind,
  itemId: string,
): TodayContentAction {
  if (kind === "checklist") {
    return { action: "toggle-expand" };
  }
  return { action: "open-details", route: buildItemDetailsRoute(itemId, kind) };
}

/**
 * Decides what tapping a row's checkbox should do.
 * - task/habit checkboxes toggle completion only (never navigation)
 * - checklist checkboxes toggle expansion (mirrors the inline row behavior)
 * - a completed task's checkbox is locked: the task stays visible but cannot
 *   be unchecked from the Today screen ("remain uncheckable")
 */
export function getCheckboxAction(
  kind: TodayRowKind,
  completed: boolean,
): TodayCheckboxAction {
  if (kind === "checklist") return "toggle-expand";
  if (kind === "task" && completed) return "locked";
  return "toggle-completion";
}
