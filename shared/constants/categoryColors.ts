import { Palette } from "./theme";

/**
 * Central semantic color registry.
 *
 * This module is one of the only two places (with `theme.ts`) allowed to hold
 * raw color values. Components must never re-derive an entity/category/status
 * hue with inline ternaries such as `isDark ? "#38BDF8" : "#0284C7"` — they pull
 * the resolved value from here through {@link getCategoryColors}, or through the
 * scheme-aware hooks in `shared/hooks/useCategoryColors`.
 *
 * Every pair carries the exact value that was previously hardcoded at the call
 * site, so migrating onto this map is strictly a refactor, never a redesign.
 *
 * NOTE: this file stays free of React/AsyncStorage imports so that pure data
 * modules (e.g. `task-categories.ts`) can depend on it safely. The hooks live in
 * `shared/hooks/useCategoryColors.ts`.
 */

export type ColorPair = { light: string; dark: string };

/** Resolve a {@link ColorPair} for a scheme. Defaults to dark (the app default). */
export function resolveColor(pair: ColorPair, isDark: boolean = true): string {
  return isDark ? pair.dark : pair.light;
}

/** A pair that renders identically in both schemes. */
const both = (value: string): ColorPair => ({ light: value, dark: value });

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export type PriorityKey = "high" | "medium" | "low" | "none";

/**
 * Canonical priority ramp — cards, chips, priority indicators, now-focus.
 * (The tasks list and the priority options sheet use divergent ramps; see
 * `TaskListPriorityColors` / `PriorityOptionColors` and the migration notes.)
 */
export const PriorityColors: Record<PriorityKey, ColorPair> = {
  high: both(Palette.red500), // #EF4444
  medium: both(Palette.amber500), // #F59E0B
  low: both(Palette.slate500), // #64748B
  none: both(Palette.gray500), // #6B7280
};

/** Tasks-list variant (`TaskItem`): medium/low/none differ from the canonical ramp. */
export const TaskListPriorityColors: Record<PriorityKey, ColorPair> = {
  high: both(Palette.red500), // #EF4444
  medium: both(Palette.orange500), // #F97316
  low: both(Palette.blue500), // #3B82F6
  none: both(Palette.gray600), // #4B5563
};

/** Capture composer priority chips: `low`/`none` differ from the canonical ramp. */
export const CapturePriorityColors: Record<PriorityKey, ColorPair> = {
  high: both(Palette.red500), // #EF4444
  medium: both(Palette.amber500), // #F59E0B
  low: both(Palette.blue500), // #3B82F6
  none: both(Palette.gray400), // #9CA3AF
};

/** Priority option picker variant (`features/details/options.ts`). */
export const PriorityOptionColors: Record<PriorityKey, ColorPair> = {
  high: both(Palette.red500), // #EF4444
  medium: both(Palette.amber500), // #F59E0B
  low: both(Palette.emerald500), // #10B981
  none: both(Palette.gray500), // #6B7280
};

// ---------------------------------------------------------------------------
// Capture entities & categories
// ---------------------------------------------------------------------------

export type CaptureKind = "task" | "habit" | "checklist" | "note" | "link" | "idea" | "file";

/** Entity chips in the capture composer. */
export const CaptureKindColors: Record<CaptureKind, ColorPair> = {
  task: both(Palette.clay500), // #B35E39
  habit: both(Palette.emerald500), // #10B981
  checklist: both(Palette.blue500), // #3B82F6
  note: both("#A855F7"),
  link: both(Palette.amber500), // #F59E0B
  idea: both(Palette.pink500), // #EC4899
  file: both(Palette.pink500), // #EC4899
};

export type CaptureCategory = "work" | "personal" | "health" | "learning" | "creative" | "focus";

/**
 * Category chips used inside the capture composer.
 * NOTE: these intentionally differ from the richer `TaskCategoryColors` used by
 * the tasks surfaces (e.g. work is #3B82F6 here vs #5E81F4 there).
 */
export const CaptureCategoryColors: Record<CaptureCategory, ColorPair> = {
  work: both(Palette.blue500), // #3B82F6
  personal: both(Palette.emerald500), // #10B981
  health: both(Palette.amber500), // #F59E0B
  learning: both("#A855F7"),
  creative: both(Palette.pink500), // #EC4899
  focus: both(Palette.clay500), // #B35E39
};

// ---------------------------------------------------------------------------
// Task categories (the canonical task taxonomy)
// ---------------------------------------------------------------------------

export type TaskCategoryKey =
  | "work"
  | "personal"
  | "health"
  | "learning"
  | "finance"
  | "creative"
  | "travel"
  | "home"
  | "focus";

/** `color` + soft `tint` used by task category chips, pickers and detail rows. */
export const TaskCategoryColors: Record<
  TaskCategoryKey,
  { color: ColorPair; tint: ColorPair }
> = {
  work: { color: both("#5E81F4"), tint: both("rgba(94, 129, 244, 0.12)") },
  personal: { color: both("#8E8CD8"), tint: both("rgba(142, 140, 216, 0.12)") },
  health: { color: both("#4CAF7D"), tint: both("rgba(76, 175, 125, 0.12)") },
  learning: { color: both("#FFB74D"), tint: both("rgba(255, 183, 77, 0.12)") },
  finance: { color: both("#81C784"), tint: both("rgba(129, 199, 132, 0.12)") },
  creative: { color: both("#E57373"), tint: both("rgba(229, 115, 115, 0.12)") },
  travel: { color: both("#64B5F6"), tint: both("rgba(100, 181, 246, 0.12)") },
  home: { color: both(Palette.brown400), tint: both("rgba(161, 136, 127, 0.12)") },
  focus: { color: both(Palette.clay400), tint: both("rgba(206, 131, 98, 0.12)") },
};

/** Fallback tone when a category is unknown. */
export const UnknownCategoryColor: ColorPair = both(Palette.gray400); // #A1A1AA
export const UnknownCategoryTint: ColorPair = both("rgba(161, 161, 170, 0.12)");

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type ResourceKind = "note" | "link" | "image" | "pdf" | "file" | "idea";

/** Kind chips / icons for the resource vault (mode-independent). */
export const ResourceKindColors: Record<ResourceKind, ColorPair> = {
  note: both(Palette.violet500), // #8B5CF6
  link: both(Palette.blue500), // #3B82F6
  image: both(Palette.emerald500), // #10B981
  pdf: both(Palette.red500), // #EF4444
  file: both(Palette.cyan500), // #06B6D4
  idea: both(Palette.yellow500), // #EAB308
};

/** Mode-switched resource tiles used by the workspace stream. */
export const StreamResourceColors: Record<
  ResourceKind,
  { accent: ColorPair; surface: ColorPair; border: ColorPair; darkSurface: string; darkBorder: string }
> = {
  image: {
    accent: { light: Palette.sky600, dark: Palette.sky400 }, // #0284C7 / #38BDF8
    surface: both(Palette.sky100), // #E0F2FE
    border: both(Palette.sky200), // #BAE6FD
    darkSurface: "rgba(14, 165, 233, 0.12)",
    darkBorder: "rgba(14, 165, 233, 0.25)",
  },
  pdf: {
    accent: { light: Palette.red600, dark: Palette.red400 }, // #DC2626 / #F87171
    surface: both(Palette.red100), // #FEE2E2
    border: both(Palette.red200), // #FECACA
    darkSurface: "rgba(239, 68, 68, 0.12)",
    darkBorder: "rgba(239, 68, 68, 0.25)",
  },
  link: {
    accent: { light: Palette.blue600, dark: Palette.blue400 }, // #2563EB / #60A5FA
    surface: both(Palette.blue100), // #DBEAFE
    border: both(Palette.blue200), // #BFDBFE
    darkSurface: "rgba(59, 130, 246, 0.12)",
    darkBorder: "rgba(59, 130, 246, 0.25)",
  },
  note: {
    accent: { light: Palette.violet600, dark: Palette.violet400 }, // #7C3AED / #A78BFA
    surface: both(Palette.violet100), // #EDE9FE
    border: both(Palette.violet200), // #DDD6FE
    darkSurface: "rgba(139, 92, 246, 0.12)",
    darkBorder: "rgba(139, 92, 246, 0.25)",
  },
  file: {
    accent: { light: Palette.violet600, dark: Palette.violet400 },
    surface: both(Palette.violet100),
    border: both(Palette.violet200),
    darkSurface: "rgba(139, 92, 246, 0.12)",
    darkBorder: "rgba(139, 92, 246, 0.25)",
  },
  idea: {
    accent: { light: Palette.orange700, dark: Palette.orange400 }, // #C2410C / #FB923C
    surface: both(Palette.orange100), // #FFEDD5
    border: both(Palette.orange100),
    darkSurface: "rgba(249, 115, 22, 0.14)",
    darkBorder: "rgba(249, 115, 22, 0.25)",
  },
};

/** Streak chip accent (habit streaks). */
export const StreakColors = {
  accent: { light: Palette.orange700, dark: Palette.orange400 }, // #C2410C / #FB923C
  surface: { light: Palette.orange100, dark: "rgba(249, 115, 22, 0.14)" },
};

/** Fully resolved resource-tile styling for the workspace stream. */
export type StreamResourceStyle = {
  accent: string;
  backgroundColor: string;
  borderColor: string;
};

export function getStreamResourceStyle(
  kind: ResourceKind,
  isDark: boolean,
): StreamResourceStyle {
  const tokens = StreamResourceColors[kind] ?? StreamResourceColors.note;
  return isDark
    ? {
        accent: tokens.accent.dark,
        backgroundColor: tokens.darkSurface,
        borderColor: tokens.darkBorder,
      }
    : {
        accent: tokens.accent.light,
        backgroundColor: tokens.surface.light,
        borderColor: tokens.border.light,
      };
}



/** Now-focus card state accents (`active` uses the scheme primary token). */
export const FocusStateColors = {
  recommended: both(Palette.emerald500), // #10B981
  upcoming: both(Palette.violet500), // #8B5CF6
};

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type CalendarEntityKind = "task" | "habit" | "checklist";

/** Accent hues for calendar entity types, scheme-switched. */
export const CalendarEntityColors: Record<CalendarEntityKind, ColorPair> = {
  task: { light: Palette.amber600, dark: Palette.amber500 }, // #D97706 / #F59E0B
  habit: { light: Palette.emerald600, dark: Palette.emerald500 }, // #059669 / #10B981
  checklist: { light: Palette.blue600, dark: Palette.blue500 }, // #2563EB / #3B82F6
};

/** Compact calendar filter chips. */
export const CalendarFilterColors: Record<CalendarEntityKind, ColorPair> = {
  task: both(Palette.indigoVivid), // #6C63FF
  habit: both(Palette.emerald500), // #10B981
  checklist: both(Palette.blue500), // #3B82F6
};

/**
 * Day-cell presence dots on the month grid.
 * NOTE: the checklist dot is amber here while the filter chip above is blue —
 * the two surfaces have always disagreed; values preserved as found.
 */
export const CalendarDotColors: Record<CalendarEntityKind, ColorPair> = {
  task: both(Palette.indigoVivid), // #6C63FF
  habit: both(Palette.emerald500), // #10B981
  checklist: both(Palette.amber500), // #F59E0B
};

// ---------------------------------------------------------------------------
// Pebbles, stats & navigation accents
// ---------------------------------------------------------------------------

export type PebbleType = "task" | "habit" | "checklist" | "focus";

/** Pebble jar / progress card type colors. */
export const PebbleTypeColors: Record<PebbleType, ColorPair> = {
  task: both(Palette.clay400), // #CE8362
  habit: both(Palette.amber500), // #F59E0B
  checklist: both(Palette.blue500), // #3B82F6
  focus: both(Palette.emerald500), // #10B981
};

/** Productivity stats breakdown colors (`app/profile/stats.tsx`). */
export const StatCategoryColors: Record<PebbleType, ColorPair> = {
  task: both(Palette.violet500), // #8B5CF6
  habit: both(Palette.orange500), // #F97316
  checklist: both(Palette.cyan500), // #06B6D4
  focus: both(Palette.emerald500), // #10B981
};

/** Legend swatches in the circadian header (task / habit / checklist). */
export const CircadianLegendColors: Record<CalendarEntityKind, ColorPair> = {
  task: both(Palette.violet500), // #8B5CF6
  habit: both(Palette.amber500), // #F59E0B
  checklist: both(Palette.blue500), // #3B82F6
};

/** Workspace accent swatch picker. */
export const WorkspaceSwatchColors: string[] = [
  Palette.clay500, // #B35E39
  Palette.emerald500, // #10B981
  Palette.amber500, // #F59E0B
  Palette.blue500, // #3B82F6
  Palette.pink500, // #EC4899
  Palette.violet500, // #8B5CF6
  Palette.red500, // #EF4444
  Palette.teal500, // #14B8A6
];

/** Fallback workspace accent when a workspace has no explicit color. */
export const DefaultWorkspaceColor: ColorPair = both(Palette.clay500); // #B35E39

// ---------------------------------------------------------------------------
// Ambient wash
// ---------------------------------------------------------------------------

export type AmbientHue = "indigo" | "purple" | "cyan";

export const AmbientColors: Record<AmbientHue, ColorPair> = {
  indigo: { light: Palette.indigoPastel, dark: Palette.indigo400 }, // #B0BAFF / #818CF8
  purple: { light: Palette.violetPastel, dark: Palette.violet500 }, // #E2C4FF / #8B5CF6
  cyan: { light: Palette.cyanPastel, dark: Palette.cyan500 }, // #AFF5F9 / #06B6D4
};

// ---------------------------------------------------------------------------
// Pebble jar illustration (stage / rarity palettes)
// ---------------------------------------------------------------------------

/**
 * Pebble jar art values. Genuine one-off illustration tints: they exist only to
 * paint the jar SVG and have no semantic equivalent in the theme.
 */
const NEST_DEEP = Palette.inkDeep; // #1E1B4B

export const PebbleStageVisuals = {
  /** Jar outline color. */
  jarStroke: { light: Palette.indigo900, dark: Palette.indigo300 }, // #312E81 / #A5B4FC
  /** Jar glass backdrop gradient (top → bottom stop). */
  jarGlassBack: {
    light: { top: Palette.indigo400, bottom: Palette.mist100 }, // #818CF8 → #EEF2F6
    dark: { top: Palette.indigo900, bottom: NEST_DEEP }, // #312E81 → #1E1B4B
  },
  /** Liquid body gradient stops (top / mid / bottom). */
  liquid: {
    master: [Palette.amber500, Palette.amber600, Palette.amber700] as const, // #F59E0B / #D97706 / #B45309
    ocean: [Palette.sky500, Palette.sky600, Palette.sky700] as const, // #0EA5E9 / #0284C7 / #0369A1
  },
  /** Submerged depth tint stops (top / mid / bottom). */
  submergedTint: {
    master: [Palette.amber300, Palette.amber500, Palette.amber600] as const, // #FDE68A / #F59E0B / #D97706
    ocean: [Palette.sky400, Palette.sky600, Palette.sky800] as const, // #38BDF8 / #0284C7 / #075985
  },
  /** Water meniscus highlight stops at 25% / 75%. */
  surfaceHighlight: {
    master: [Palette.yellow100, Palette.yellow100] as const, // #FEF08A
    ocean: [Palette.sky200, Palette.sky400] as const, // #BAE6FD / #38BDF8
  },
  /** Falling-pebble radial glow (leading stop; the trail uses theme primary). */
  pebbleGlowMaster: Palette.amberSoft, // #FFE082
  pebbleGlowMasterEdge: Palette.amber600, // #D97706
  /** Meniscus stroke above the waterline. */
  meniscus: { master: Palette.amber400, ocean: Palette.sky400 }, // #FBBF24 / #38BDF8
  /** Water surface highlight sweep shared by all stages. */
  highlight: Palette.white, // #FFFFFF
  /** Static (regular) pebble radial gradient stops: rim → mid → core. */
  staticPebble: {
    light: [Palette.indigo200, Palette.indigo500, Palette.indigo900] as const, // #C7D2FE / #6366F1 / #312E81
    dark: [Palette.indigo400, Palette.indigo600, NEST_DEEP] as const, // #818CF8 / #4F46E5 / #1E1B4B
  },
  /** Shiny pebble radial gradient stops: rim → mid → core. */
  shinyPebble: {
    light: [Palette.mist100, Palette.indigo400, Palette.violet900] as const, // #EEF2F6 / #818CF8 / #4C1D95
    dark: ["#C084FC", Palette.violet600, Palette.violet950] as const, // #C084FC / #7C3AED / #2E1065
  },
  /** Legendary pebble radial gradient stops. */
  legendary: [Palette.amber200, Palette.pink500, Palette.violet900] as const, // #FDE047 / #EC4899 / #4C1D95
  /** Per-type pebble overlay tint (defaults to the task hue). */
  overlay: {
    task: Palette.clay500, // #B35E39
    habit: Palette.amber500, // #F59E0B
    checklist: Palette.blue500, // #3B82F6
    focus: Palette.emerald500, // #10B981
  },
} as const;

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

export type CategoryColorGroup =
  | "priority"
  | "taskListPriority"
  | "capturePriority"
  | "priorityOption"
  | "captureKind"
  | "captureCategory"
  | "resourceKind"
  | "calendarEntity"
  | "calendarFilter"
  | "calendarDot"
  | "pebbleType"
  | "statCategory"
  | "circadianLegend"
  | "focusState"
  | "ambient";

const GROUP_PAIRS: Record<Exclude<CategoryColorGroup, "ambient">, Record<string, ColorPair>> = {
  priority: PriorityColors,
  taskListPriority: TaskListPriorityColors,
  capturePriority: CapturePriorityColors,
  priorityOption: PriorityOptionColors,
  captureKind: CaptureKindColors,
  captureCategory: CaptureCategoryColors,
  resourceKind: ResourceKindColors,
  calendarEntity: CalendarEntityColors,
  calendarFilter: CalendarFilterColors,
  calendarDot: CalendarDotColors,
  pebbleType: PebbleTypeColors,
  statCategory: StatCategoryColors,
  circadianLegend: CircadianLegendColors,
  focusState: FocusStateColors,
};

/** Resolve a semantic color for a group + key outside of React. */
export function getCategoryColor(
  group: Exclude<CategoryColorGroup, "ambient">,
  key: string,
  isDark: boolean = true,
  fallback?: string,
): string {
  const pair = GROUP_PAIRS[group]?.[key];
  if (!pair) return fallback ?? key;
  return resolveColor(pair, isDark);
}

/**
 * Resolve every semantic group for the current color scheme at once.
 * Use this instead of `isDark ? "#x" : "#y"` ternaries in components.
 */
export function getCategoryColors(isDark: boolean) {
  const resolve = (map: Record<string, ColorPair>) =>
    Object.fromEntries(
      Object.entries(map).map(([key, pair]) => [key, resolveColor(pair, isDark)]),
    ) as Record<string, string>;

  return {
    isDark,
    priority: resolve(PriorityColors),
    taskListPriority: resolve(TaskListPriorityColors),
    capturePriority: resolve(CapturePriorityColors),
    priorityOption: resolve(PriorityOptionColors),
    captureKind: resolve(CaptureKindColors),
    captureCategory: resolve(CaptureCategoryColors),
    resourceKind: resolve(ResourceKindColors),
    calendarEntity: resolve(CalendarEntityColors),
    calendarFilter: resolve(CalendarFilterColors),
    calendarDot: resolve(CalendarDotColors),
    pebbleType: resolve(PebbleTypeColors),
    statCategory: resolve(StatCategoryColors),
    circadianLegend: resolve(CircadianLegendColors),
    focusState: resolve(FocusStateColors),
    ambient: resolve(AmbientColors),
  };
}

export type CategoryColors = ReturnType<typeof getCategoryColors>;
