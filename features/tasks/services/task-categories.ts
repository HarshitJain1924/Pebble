import {
  DefaultWorkspaceColor,
  TaskCategoryColors,
  UnknownCategoryColor,
  UnknownCategoryTint,
} from "@/shared/constants/categoryColors";

export const TASK_CATEGORY_KEYS = [
  "work",
  "personal",
  "health",
  "learning",
  "finance",
  "creative",
  "travel",
  "home",
  "focus",
] as const;

export type TaskCategory = (typeof TASK_CATEGORY_KEYS)[number];

export type TaskCategoryMeta = {
  label: string;
  icon: string;
  color: string;
  tint: string;
};

/**
 * Category presentation = icon/label (local) + color (single source of truth).
 * Color values live in `shared/constants/categoryColors.ts`; the keys here are
 * statically checked against that map so the two can never drift apart.
 */
const TASK_CATEGORY_PRESENTATION: Record<TaskCategory, { label: string; icon: string }> = {
  work: { label: "Work", icon: "briefcase" },
  personal: { label: "Personal", icon: "user" },
  health: { label: "Health", icon: "activity" },
  learning: { label: "Learning", icon: "book-open" },
  finance: { label: "Finance", icon: "wallet" },
  creative: { label: "Creative", icon: "feather" },
  travel: { label: "Travel", icon: "map-pin" },
  home: { label: "Home", icon: "home" },
  focus: { label: "Focus", icon: "target" },
};

const TASK_CATEGORY_META_RECORD: Record<TaskCategory, TaskCategoryMeta> = TASK_CATEGORY_KEYS.reduce(
  (acc, key) => {
    acc[key] = {
      ...TASK_CATEGORY_PRESENTATION[key],
      color: TaskCategoryColors[key].color.dark,
      tint: TaskCategoryColors[key].tint.dark,
    };
    return acc;
  },
  {} as Record<TaskCategory, TaskCategoryMeta>,
);

export const TASK_CATEGORY_META_ARRAY = TASK_CATEGORY_KEYS.map((key) => {
  const meta = TASK_CATEGORY_META_RECORD[key];
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    color: meta.color,
    tint: meta.color, // caller support
    softTint: meta.tint, // caller support
  };
});

// Build the hybrid array+object to maintain perfect caller support
const hybridMeta = Object.assign(TASK_CATEGORY_META_ARRAY, TASK_CATEGORY_META_RECORD);

export const TASK_CATEGORY_META = hybridMeta as typeof TASK_CATEGORY_META_ARRAY & typeof TASK_CATEGORY_META_RECORD;

export const DEFAULT_TASK_CATEGORY: TaskCategory = "work";

export function isTaskCategory(value: string): value is TaskCategory {
  return (TASK_CATEGORY_KEYS as readonly string[]).includes(value);
}

export function normalizeTaskCategory(value?: string | null): TaskCategory {
  if (value && isTaskCategory(value)) {
    return value;
  }
  return DEFAULT_TASK_CATEGORY;
}

export function getCategoryMeta(category?: string): TaskCategoryMeta | null {
  if (category && isTaskCategory(category)) {
    return TASK_CATEGORY_META_RECORD[category];
  }
  return null;
}

export function getCategoryColor(category?: string): string {
  return getCategoryMeta(category)?.color ?? UnknownCategoryColor.dark;
}

export function getCategoryIcon(category?: string): string {
  return getCategoryMeta(category)?.icon ?? "folder";
}

export function getCategoryTint(category?: string): string {
  return getCategoryMeta(category)?.tint ?? UnknownCategoryTint.dark;
}

/** Default accent for a workspace with no explicit color. */
export const DEFAULT_WORKSPACE_ACCENT = DefaultWorkspaceColor.dark;

// For backwards caller support:
export function getTaskCategoryMeta(category: TaskCategory) {
  return {
    key: category,
    ...TASK_CATEGORY_META_RECORD[category],
    tint: TASK_CATEGORY_META_RECORD[category].color,
    softTint: TASK_CATEGORY_META_RECORD[category].tint,
  };
}
