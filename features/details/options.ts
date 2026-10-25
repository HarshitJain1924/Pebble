import { PriorityOptionColors } from "@/shared/constants/categoryColors";
import { TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";

export interface TaskCategoryOption {
  key: string;
  label: string;
  color: string;
  icon: string;
}

export interface TaskPriorityOption {
  key: "low" | "medium" | "high";
  label: string;
  color: string;
}

export const CATEGORY_OPTIONS: TaskCategoryOption[] = TASK_CATEGORY_META.map(
  (cat) => ({
    key: cat.key,
    label: cat.label,
    color: cat.tint,
    icon: cat.icon,
  }),
);

export const PRIORITY_OPTIONS: TaskPriorityOption[] = [
  { key: "low", label: "Low", color: PriorityOptionColors.low.dark },
  { key: "medium", label: "Medium", color: PriorityOptionColors.medium.dark },
  { key: "high", label: "High", color: PriorityOptionColors.high.dark },
];

export function getCategoryMeta(category: string): TaskCategoryOption {
  return (
    CATEGORY_OPTIONS.find((c) => c.key === category) ?? CATEGORY_OPTIONS[0]
  );
}

export function getPriorityMeta(priority: string): TaskPriorityOption {
  return (
    PRIORITY_OPTIONS.find((p) => p.key === priority) ?? PRIORITY_OPTIONS[1]
  );
}
