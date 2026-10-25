import { Feather } from "@expo/vector-icons";
import { CalendarEntityColors, type CalendarEntityKind } from "@/shared/constants/categoryColors";
import { Palette } from "@/shared/constants/theme";
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
      accent: CalendarEntityColors.task.dark, // Warm Amber
      accentSecondary: Palette.amber400,
      surface: "rgba(245, 158, 11, 0.12)",
      surfaceSubtle: "rgba(245, 158, 11, 0.08)",
      borderColor: "rgba(245, 158, 11, 0.25)",
      icon: "check-square",
      label: "Task",
    },
    habit: {
      accent: CalendarEntityColors.habit.dark, // Emerald Green
      accentSecondary: Palette.emerald400,
      surface: "rgba(16, 185, 129, 0.12)",
      surfaceSubtle: "rgba(16, 185, 129, 0.08)",
      borderColor: "rgba(16, 185, 129, 0.25)",
      icon: "rotate-cw",
      label: "Habit",
    },
    checklist: {
      accent: CalendarEntityColors.checklist.dark, // Deep Blue
      accentSecondary: Palette.blue400,
      surface: "rgba(59, 130, 246, 0.12)",
      surfaceSubtle: "rgba(59, 130, 246, 0.08)",
      borderColor: "rgba(59, 130, 246, 0.25)",
      icon: "list",
      label: "Checklist",
    },
  },
  light: {
    task: {
      accent: CalendarEntityColors.task.light, // Crisp Amber
      accentSecondary: Palette.amber700,
      surface: Palette.amber50,
      surfaceSubtle: Palette.amber100,
      borderColor: "rgba(217, 119, 6, 0.2)",
      icon: "check-square",
      label: "Task",
    },
    habit: {
      accent: CalendarEntityColors.habit.light, // Crisp Emerald
      accentSecondary: Palette.emerald700,
      surface: Palette.green50,
      surfaceSubtle: Palette.green100,
      borderColor: "rgba(5, 150, 105, 0.2)",
      icon: "rotate-cw",
      label: "Habit",
    },
    checklist: {
      accent: CalendarEntityColors.checklist.light, // Crisp Blue
      accentSecondary: Palette.blue700,
      surface: Palette.blue50,
      surfaceSubtle: Palette.blue100,
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
  const themeKey: "light" | "dark" = isLight ? "light" : "dark";
  const entityType: CalendarEntityKind =
    type === "habit" ? "habit" : type === "checklist" ? "checklist" : "task";
  return CALENDAR_ENTITY_TOKENS[themeKey][entityType];
}
