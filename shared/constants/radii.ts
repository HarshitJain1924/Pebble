/**
 * Pebble Canonical Border Radius Tokens
 *
 * Represents Pebble's established visual hierarchy tiers:
 * - sm (8): Badges, chips, compact tags, small inner controls
 * - md (12): Standard interactive controls (buttons, text inputs, list tiles)
 * - lg (16): Standard cards, containers, prominent banners
 * - xl (20): Primary elevated cards (AppCard), major surface containers, modal cards
 * - pill (9999): Fully rounded pills, filter chips, search bars
 */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
} as const;

export type RadiusToken = keyof typeof Radius;
export type RadiusValue = typeof Radius[RadiusToken];
