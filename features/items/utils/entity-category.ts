import {
  resolveColor,
  TaskCategoryColors,
  TaskCategoryKey,
} from "@/shared/constants/categoryColors";
import {
  resolveItemCategorySymbol,
  WorkspaceItemType,
} from "@/features/today/utils/item-presentation";

export interface EntityCategoryPresentation {
  color: string;
  icon?: string;
  iconFamily?: "feather" | "ionicons";
}

const CATEGORY_KEYWORDS = [
  "meditat",
  "mindful",
  "zen",
  "yoga",
  "breath",
  "wellness",
  "review",
  "doc",
  "ticket",
  "pr",
  "shop",
  "grocer",
  "buy",
  "market",
  "store",
  "gym",
  "workout",
  "fitness",
  "exercise",
  "run",
  "jog",
  "sport",
  "read",
  "book",
  "study",
  "learn",
  "meet",
  "team",
  "sync",
  "standup",
  "call",
  "finance",
  "bill",
  "budget",
  "pay",
  "tax",
  "home",
  "clean",
  "house",
  "chore",
  "personal",
  "work",
  "client",
  "deck",
  "code",
] as const;

export function hasCategoryKeywordMatch(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return CATEGORY_KEYWORDS.some((kw) => t.includes(kw));
}

/**
 * Resolves ambient category atmosphere (color, watermark icon, iconFamily)
 * across Task, Habit, and Checklist.
 *
 * If explicit categoryId exists: resolves via TaskCategoryColors or resolveItemCategorySymbol.
 * If title matches a canonical category keyword: resolves via keyword heuristics.
 * Otherwise: returns null (neutral surface).
 */
export function resolveEntityCategoryPresentation(
  input: {
    categoryId?: string | null;
    title?: string;
    type?: WorkspaceItemType;
    priority?: string;
  },
  isDark: boolean,
): EntityCategoryPresentation | null {
  const { categoryId, title, type = "task", priority } = input;

  if (categoryId) {
    const cat = categoryId.toLowerCase();
    const color =
      cat in TaskCategoryColors
        ? resolveColor(TaskCategoryColors[cat as TaskCategoryKey].color, isDark)
        : resolveItemCategorySymbol(
            { type, title, categoryId, priority },
            isDark,
          ).color;

    const symbol = resolveItemCategorySymbol(
      { type, title, categoryId, priority },
      isDark,
    );

    return {
      color,
      icon: symbol.icon,
      iconFamily: symbol.iconFamily,
    };
  }

  if (title && hasCategoryKeywordMatch(title)) {
    const symbol = resolveItemCategorySymbol(
      { type, title, priority },
      isDark,
    );
    return {
      color: symbol.color,
      icon: symbol.icon,
      iconFamily: symbol.iconFamily,
    };
  }

  return null;
}
