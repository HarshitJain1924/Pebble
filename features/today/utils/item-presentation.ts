import { Palette } from "@/shared/constants/theme";
import {
  getTaskCategoryMeta,
  isTaskCategory,
} from "@/features/tasks/services/task-categories";

/**
 * Item/category presentation for the Today workspace stream.
 *
 * `resolveItemCategorySymbol` resolves the squircle icon badge (icon, family,
 * accent color and soft background tint) for stream items. Moved verbatim out
 * of `WorkspaceSectionedStream.tsx`; the category system itself is intentionally
 * left untouched by this refactor.
 */

export type WorkspaceItemType = "task" | "habit" | "checklist" | "resource";

export interface ItemMetaPart {
  text: string;
  icon?: string;
  color?: string;
}

export interface ItemCategorySymbol {
  icon: string;
  iconFamily?: "feather" | "ionicons";
  color: string;
  tint: string;
  label?: string;
}

/**
 * Resolves category visual presentation (icon, color, soft background tint)
 * giving items visual depth across tasks, habits, and checklists.
 */
export function resolveItemCategorySymbol(
  item: {
    type: WorkspaceItemType;
    title?: string;
    categoryId?: string;
    original?: any;
    priority?: string;
  },
  isDark: boolean,
): ItemCategorySymbol {
  const original = item.original || {};
  const title = (item.title || original.title || "").toLowerCase();
  const rawCategory = (
    item.categoryId ||
    original.categoryId ||
    original.category ||
    ""
  ).toLowerCase();

  // 1. Keyword-based matching for rich aesthetic differentiation
  if (
    title.includes("meditat") ||
    title.includes("mindful") ||
    title.includes("zen") ||
    title.includes("yoga") ||
    title.includes("breath") ||
    rawCategory.includes("mindful") ||
    rawCategory.includes("wellness")
  ) {
    const color = Palette.amber500;
    return {
      icon: "flower-outline",
      iconFamily: "ionicons",
      color,
      tint: isDark ? "rgba(245, 158, 11, 0.22)" : "rgba(245, 158, 11, 0.14)",
      label: "Mindfulness",
    };
  }

  if (
    title.includes("review") ||
    title.includes("doc") ||
    title.includes("ticket") ||
    title.includes("pr")
  ) {
    const color = Palette.pink500;
    return {
      icon: "document-text-outline",
      iconFamily: "ionicons",
      color,
      tint: isDark ? "rgba(244, 63, 94, 0.22)" : "rgba(244, 63, 94, 0.14)",
      label: "Review",
    };
  }

  if (
    title.includes("shop") ||
    title.includes("grocer") ||
    title.includes("buy") ||
    title.includes("market") ||
    title.includes("store") ||
    rawCategory.includes("shop")
  ) {
    const color = Palette.pink500;
    return {
      icon: "cart-outline",
      iconFamily: "ionicons",
      color,
      tint: isDark ? "rgba(244, 63, 94, 0.22)" : "rgba(244, 63, 94, 0.14)",
      label: "Shopping",
    };
  }

  if (
    title.includes("gym") ||
    title.includes("workout") ||
    title.includes("fitness") ||
    title.includes("exercise") ||
    title.includes("run") ||
    title.includes("jog") ||
    title.includes("sport") ||
    rawCategory.includes("fitness")
  ) {
    const color = Palette.emerald500;
    return {
      icon: "barbell-outline",
      iconFamily: "ionicons",
      color,
      tint: isDark ? "rgba(16, 185, 129, 0.22)" : "rgba(16, 185, 129, 0.14)",
      label: "Fitness",
    };
  }

  if (
    title.includes("read") ||
    title.includes("book") ||
    title.includes("study") ||
    title.includes("learn") ||
    rawCategory.includes("learn")
  ) {
    const color = Palette.blue500;
    return {
      icon: "book-outline",
      iconFamily: "ionicons",
      color,
      tint: isDark ? "rgba(59, 130, 246, 0.22)" : "rgba(59, 130, 246, 0.14)",
      label: "Reading",
    };
  }

  if (
    title.includes("meet") ||
    title.includes("team") ||
    title.includes("sync") ||
    title.includes("standup") ||
    title.includes("call")
  ) {
    const color = Palette.violet500;
    return {
      icon: "people-outline",
      iconFamily: "ionicons",
      color,
      tint: isDark ? "rgba(139, 92, 246, 0.22)" : "rgba(139, 92, 246, 0.14)",
      label: "Meeting",
    };
  }

  if (
    title.includes("finance") ||
    title.includes("bill") ||
    title.includes("budget") ||
    title.includes("pay") ||
    title.includes("tax") ||
    rawCategory.includes("finance")
  ) {
    const color = Palette.teal500;
    return {
      icon: "wallet",
      iconFamily: "feather",
      color,
      tint: isDark ? "rgba(6, 182, 212, 0.22)" : "rgba(6, 182, 212, 0.14)",
      label: "Finance",
    };
  }

  if (
    title.includes("home") ||
    title.includes("clean") ||
    title.includes("house") ||
    title.includes("chore") ||
    rawCategory.includes("home") ||
    rawCategory.includes("personal")
  ) {
    const color = Palette.violet500;
    return {
      icon: "home",
      iconFamily: "feather",
      color,
      tint: isDark ? "rgba(139, 92, 246, 0.22)" : "rgba(139, 92, 246, 0.14)",
      label: "Personal",
    };
  }

  if (
    title.includes("work") ||
    title.includes("client") ||
    title.includes("deck") ||
    title.includes("code") ||
    rawCategory.includes("work")
  ) {
    const color = Palette.indigo500;
    return {
      icon: "briefcase",
      iconFamily: "feather",
      color,
      tint: isDark ? "rgba(99, 102, 241, 0.22)" : "rgba(99, 102, 241, 0.14)",
      label: "Work",
    };
  }

  // 2. Explicit task category
  if (rawCategory && isTaskCategory(rawCategory)) {
    const meta = getTaskCategoryMeta(rawCategory);
    return {
      icon: meta.icon,
      iconFamily: "feather",
      color: meta.color,
      tint: isDark ? `${meta.color}28` : `${meta.color}16`,
      label: meta.label,
    };
  }

  // 3. Fallbacks by domain type
  if (item.type === "habit") {
    return {
      icon: "activity",
      iconFamily: "feather",
      color: Palette.emerald500,
      tint: isDark ? "rgba(16, 185, 129, 0.22)" : "rgba(16, 185, 129, 0.14)",
      label: "Habit",
    };
  }

  if (item.type === "checklist") {
    return {
      icon: "check-square",
      iconFamily: "feather",
      color: Palette.indigo500,
      tint: isDark ? "rgba(99, 102, 241, 0.22)" : "rgba(99, 102, 241, 0.14)",
      label: "Checklist",
    };
  }

  if (item.type === "resource") {
    return {
      icon: "file-text",
      iconFamily: "feather",
      color: Palette.sky500,
      tint: isDark ? "rgba(14, 165, 233, 0.22)" : "rgba(14, 165, 233, 0.14)",
      label: "Resource",
    };
  }

  // Default task category: work
  const defaultMeta = getTaskCategoryMeta("work");
  return {
    icon: defaultMeta.icon,
    iconFamily: "feather",
    color: defaultMeta.color,
    tint: isDark ? `${defaultMeta.color}28` : `${defaultMeta.color}16`,
    label: defaultMeta.label,
  };
}
