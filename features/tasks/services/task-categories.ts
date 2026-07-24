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

const TASK_CATEGORY_META_RECORD: Record<TaskCategory, TaskCategoryMeta> = {
  work: {
    label: "Work",
    icon: "briefcase",
    color: "#5E81F4",
    tint: "rgba(94, 129, 244, 0.12)",
  },
  personal: {
    label: "Personal",
    icon: "user",
    color: "#8E8CD8",
    tint: "rgba(142, 140, 216, 0.12)",
  },
  health: {
    label: "Health",
    icon: "activity",
    color: "#4CAF7D",
    tint: "rgba(76, 175, 125, 0.12)",
  },
  learning: {
    label: "Learning",
    icon: "book-open",
    color: "#FFB74D",
    tint: "rgba(255, 183, 77, 0.12)",
  },
  finance: {
    label: "Finance",
    icon: "wallet",
    color: "#81C784",
    tint: "rgba(129, 199, 132, 0.12)",
  },
  creative: {
    label: "Creative",
    icon: "feather",
    color: "#E57373",
    tint: "rgba(229, 115, 115, 0.12)",
  },
  travel: {
    label: "Travel",
    icon: "map-pin",
    color: "#64B5F6",
    tint: "rgba(100, 181, 246, 0.12)",
  },
  home: {
    label: "Home",
    icon: "home",
    color: "#A1887F",
    tint: "rgba(161, 136, 127, 0.12)",
  },
  focus: {
    label: "Focus",
    icon: "target",
    color: "#818CF8",
    tint: "rgba(129, 140, 248, 0.12)",
  },
};

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
  return getCategoryMeta(category)?.color ?? "#A1A1AA";
}

export function getCategoryIcon(category?: string): string {
  return getCategoryMeta(category)?.icon ?? "folder";
}

export function getCategoryTint(category?: string): string {
  return getCategoryMeta(category)?.tint ?? "rgba(161, 161, 170, 0.12)";
}

// For backwards caller support:
export function getTaskCategoryMeta(category: TaskCategory) {
  return {
    key: category,
    ...TASK_CATEGORY_META_RECORD[category],
    tint: TASK_CATEGORY_META_RECORD[category].color,
    softTint: TASK_CATEGORY_META_RECORD[category].tint,
  };
}
