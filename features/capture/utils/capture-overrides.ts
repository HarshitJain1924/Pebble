import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";

/**
 * One user decision about a capture field.
 *
 * The *presence* of an entry means "the user touched this field".
 * `{ value: undefined }` means "explicitly cleared" — the parser must not
 * restore the value for the rest of the capture session.
 *
 * A missing entry means "never overridden" — parser-derived values apply.
 */
export type CaptureOverride<T> = { value: T | undefined };

/**
 * All metadata the user can edit in the capture summary card.
 *
 * `type` is intentionally not a `CaptureOverride`: the editor always has a
 * selected type, so it can never be "cleared".
 */
export interface CaptureOverrides {
  type?: ParsedProductivityItem["type"];
  priority?: CaptureOverride<ParsedProductivityItem["priority"]>;
  date?: CaptureOverride<string>;
  time?: CaptureOverride<string>;
  category?: CaptureOverride<ParsedProductivityItem["category"]>;
  recurrence?: CaptureOverride<ParsedProductivityItem["recurrence"]>;
  reminderOffsetMinutes?: CaptureOverride<number>;
}

/**
 * Entry-context defaults (the screen the capture sheet was opened from).
 * These apply only when the user has not touched the field.
 */
export interface CaptureDefaults {
  type?: ParsedProductivityItem["type"];
  date?: string;
}

/**
 * Apply the user's recorded decisions to a fresh parse.
 *
 * This is the single source of truth for "what will be saved": the idle-parse
 * path, the type-change reparse, attachment removal and the save-time catch-up
 * all go through here, so a cleared value can never be resurrected by a later
 * parse in the same capture session.
 *
 * Returns a new object; the parse result is never mutated.
 */
export function applyCaptureOverrides(
  parsed: ParsedProductivityItem,
  overrides: CaptureOverrides,
  defaults: CaptureDefaults = {},
): ParsedProductivityItem {
  const result: ParsedProductivityItem = { ...parsed };

  // Type: always carries a value. Entry defaults only replace the parser's
  // weakest signal, exactly as before.
  if (overrides.type) {
    result.type = overrides.type;
  } else if (
    defaults.type &&
    result.type === "task" &&
    result.detectionSignal === "default_task"
  ) {
    result.type = defaults.type;
  }

  if (overrides.date) {
    result.date = overrides.date.value;
  } else if (
    defaults.date &&
    (result.type === "task" || result.type === "checklist") &&
    !result.date
  ) {
    result.date = defaults.date;
  }

  if (overrides.priority) {
    result.priority = overrides.priority.value;
    result.priorityDetected = overrides.priority.value !== undefined;
  }

  if (overrides.time) {
    result.time = overrides.time.value;
  }

  if (overrides.reminderOffsetMinutes) {
    result.reminderOffsetMinutes = overrides.reminderOffsetMinutes.value;
  }

  if (overrides.category) {
    result.category = overrides.category.value;
  }

  if (overrides.recurrence) {
    result.recurrence = overrides.recurrence.value;
  }

  return result;
}
