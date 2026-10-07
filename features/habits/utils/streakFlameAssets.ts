import type { ImageSourcePropType } from "react-native";
import type { HabitStreakStage } from "./habitStreakStage";

/**
 * Central registry for the five Flaticon animated streak flame assets.
 *
 * Format: animated **GIF**, rendered by `expo-image` (already a dependency, so no
 * new package). Animated GIF/APNG/WebP flatten to a single frame when cached via
 * `ImageRef`, so the GIFs are loaded as ordinary `require()`d local sources.
 *
 * The same file serves both playback modes: `StreakFlameBadge` leaves `autoplay`
 * off (`autoplay={false}` renders the first frame) so habit list rows stay still,
 * and only a surface that passes `animated` plays the loop.
 *
 * Files, Stage 1 → Stage 5, matching `getHabitStreakStage`:
 *   assets/images/streak/flame_stage_1.gif   Stage 1 — base flame
 *   assets/images/streak/flame_stage_2.gif   Stage 2 — taller flame
 *   assets/images/streak/flame_stage_3.gif   Stage 3 — expressive flame
 *   assets/images/streak/flame_stage_4.gif   Stage 4 — flame + particles
 *   assets/images/streak/flame_stage_5.gif   Stage 5 — "Passion" milestone flame
 *
 * NOTE: the supplied GIFs are 640×640 (490 KB–1.5 MB each, ~4.9 MB combined) but
 * render at 20×20pt. Downscaling them to ~64×64 would cut the bundle by roughly
 * two orders of magnitude with no visible change at this size.
 *
 * Registered sources must be referenced from here *only* — never import the
 * assets directly inside a card component, and never substitute emoji, vector
 * glyphs, or a Reanimated recreation for the supplied artwork.
 *
 * Licensing: Flaticon's free tier requires attribution. Preserve the supplied
 * licence metadata when adding the files (see `docs/asset_attribution.md`).
 */
export const STREAK_FLAME_ASSETS: Record<
  HabitStreakStage,
  ImageSourcePropType | null
> = {
  0: null, // inactive — deliberately has no flame artwork
  1: require("@/assets/images/streak/flame_stage_1.gif"),
  2: require("@/assets/images/streak/flame_stage_2.gif"),
  3: require("@/assets/images/streak/flame_stage_3.gif"),
  4: require("@/assets/images/streak/flame_stage_4.gif"),
  5: require("@/assets/images/streak/flame_stage_5.gif"),
};

/** Resolves the flame artwork for a stage, or `null` when it is not registered. */
export function resolveStreakFlameSource(
  stage: HabitStreakStage,
): ImageSourcePropType | null {
  return STREAK_FLAME_ASSETS[stage] ?? null;
}
