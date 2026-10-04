/**
 * Single source of truth for task row dimensions, typography, and spacing.
 */

export const RESOURCE_STACK_COLOR_MODE: "typed" | "neutral" = "typed";

export const ROW_SPEC = {
  row: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 14,
    gap: 12,
  },
  checkbox: {
    visual: 24,
    ring: 1.5,
    effectiveHit: 44,
  },
  badge: {
    size: 36,
    radius: 11,
    icon: 18,
  },
  type: {
    title: 16,
    titleWeight: "600" as const,
    meta: 13,
  },
  // Aligned to the badge's left edge: paddingLeft (16) + checkbox.visual (24) + gap (12)
  dividerInset: 52,
  stack: {
    tile: 20,
    ring: 1.5,
    overlap: 6,
    openGap: 4,
    maxVisible: 3,
    tileRadius: 5.5,
    chipFont: 10,
    icon: 10,
  },
  listRow: {
    minHeight: 44,
    tile: 32,
    title: 14,
    secondary: 12,
  },
} as const;

export type RowSpec = typeof ROW_SPEC;
