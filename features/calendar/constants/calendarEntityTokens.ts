import { Feather } from "@expo/vector-icons";
import { CalendarEntityType } from "../types";

export interface EntityPresentationConfig {
  accent: string;
  accentSecondary: string;
  surface: string;
  surfaceSubtle: string;
  borderColor: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
}

export const CALENDAR_ENTITY_TOKENS: Record<
  "light" | "dark",
  Record<CalendarEntityType, EntityPresentationConfig>
> = {
  dark: {
    task: {
      accent: "#F59E0B", // Warm Amber
      accentSecondary: "#FBBF24",
      surface: "rgba(245, 158, 11, 0.12)",
      surfaceSubtle: "rgba(245, 158, 11, 0.08)",
      borderColor: "rgba(245, 158, 11, 0.25)",
      icon: "check-square",
      label: "Task",
    },
    habit: {
      accent: "#10B981", // Emerald Green
      accentSecondary: "#34D399",
      surface: "rgba(16, 185, 129, 0.12)",
      surfaceSubtle: "rgba(16, 185, 129, 0.08)",
      borderColor: "rgba(16, 185, 129, 0.25)",
      icon: "rotate-cw",
      label: "Habit",
    },
    checklist: {
      accent: "#3B82F6", // Deep Blue
      accentSecondary: "#60A5FA",
      surface: "rgba(59, 130, 246, 0.12)",
      surfaceSubtle: "rgba(59, 130, 246, 0.08)",
      borderColor: "rgba(59, 130, 246, 0.25)",
      icon: "list",
      label: "Checklist",
    },
  },
  light: {
    task: {
      accent: "#D97706", // Crisp Amber
      accentSecondary: "#B45309",
      surface: "#FFFBEB",
      surfaceSubtle: "#FEF3C7",
      borderColor: "rgba(217, 119, 6, 0.2)",
      icon: "check-square",
      label: "Task",
    },
    habit: {
      accent: "#059669", // Crisp Emerald
      accentSecondary: "#047857",
      surface: "#F0FDF4",
      surfaceSubtle: "#DCFCE7",
      borderColor: "rgba(5, 150, 105, 0.2)",
      icon: "rotate-cw",
      label: "Habit",
    },
    checklist: {
      accent: "#2563EB", // Crisp Blue
      accentSecondary: "#1D4ED8",
      surface: "#EFF6FF",
      surfaceSubtle: "#DBEAFE",
      borderColor: "rgba(37, 99, 235, 0.2)",
      icon: "list",
      label: "Checklist",
    },
  },
};

export function getCalendarEntityPresentation(
  type: string,
  isLight: boolean = false,
): EntityPresentationConfig {
  const themeKey = isLight ? "light" : "dark";
  const entityType: CalendarEntityType =
    type === "habit" ? "habit" : type === "checklist" ? "checklist" : "task";
  return CALENDAR_ENTITY_TOKENS[themeKey][entityType];
}
