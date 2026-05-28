export const TASK_CATEGORY_KEYS = [
  "work",
  "personal",
  "health",
  "learning",
  "creative",
  "focus",
] as const;

export type TaskCategory = (typeof TASK_CATEGORY_KEYS)[number];

export type TaskCategoryMeta = {
  key: TaskCategory;
  label: string;
  tint: string;
  softTint: string;
};

export const TASK_CATEGORY_META: TaskCategoryMeta[] = [
  {
    key: "work",
    label: "Work",
    tint: "#6366F1",
    softTint: "rgba(99, 102, 241, 0.12)",
  },
  {
    key: "personal",
    label: "Personal",
    tint: "#10B981",
    softTint: "rgba(16, 185, 129, 0.10)",
  },
  {
    key: "health",
    label: "Health",
    tint: "#F59E0B",
    softTint: "rgba(245, 158, 11, 0.10)",
  },
  {
    key: "learning",
    label: "Learning",
    tint: "#3B82F6",
    softTint: "rgba(59, 130, 246, 0.10)",
  },
  {
    key: "creative",
    label: "Creative",
    tint: "#A855F7",
    softTint: "rgba(168, 85, 247, 0.10)",
  },
  {
    key: "focus",
    label: "Focus",
    tint: "#06B6D4",
    softTint: "rgba(6, 182, 212, 0.10)",
  },
];

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

export function getTaskCategoryMeta(category: TaskCategory) {
  return (
    TASK_CATEGORY_META.find((item) => item.key === category) ??
    TASK_CATEGORY_META[0]
  );
}
