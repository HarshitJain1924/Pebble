import { getCategoryMeta } from "@/features/tasks/services/task-categories";

/**
 * Default Checklist Color: Warm Terracotta Orange from the design specification.
 */
export const DEFAULT_CHECKLIST_COLOR = "#E07A5F";

/**
 * Returns the solid card / accent color for a checklist.
 * If a category is attached, it resolves to the category's solid color (e.g. Work = Blue, Health = Green, etc.).
 * Defaults to Terracotta (#E07A5F) when uncategorized or unrecognized.
 */
export function getChecklistColor(categoryId?: string | null): string {
  if (!categoryId) return DEFAULT_CHECKLIST_COLOR;
  if (categoryId.startsWith("#")) return categoryId;
  const meta = getCategoryMeta(categoryId.toLowerCase().trim());
  return meta?.color || DEFAULT_CHECKLIST_COLOR;
}
