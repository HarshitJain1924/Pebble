import { useMemo } from "react";
import {
  StreakColors,
  StreamResourceColors,
  getCategoryColor,
  getCategoryColors,
  getStreamResourceStyle,
  resolveColor,
  type CategoryColors,
  type CategoryColorGroup,
  type ResourceKind,
  type StreamResourceStyle,
} from "@/shared/constants/categoryColors";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

/**
 * Scheme-aware access to `shared/constants/categoryColors.ts`.
 *
 * These hooks live apart from the token registry so that the registry stays
 * free of React/AsyncStorage imports and can be consumed by pure data modules.
 * Prefer them over `isDark ? "#x" : "#y"` ternaries anywhere in the UI.
 */

/** Every semantic color group resolved for the current color scheme. */
export function useCategoryColors(): CategoryColors {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  return useMemo(() => getCategoryColors(isDark), [isDark]);
}

/** Single value lookup: `useCategoryColor("pebbleType", "habit")`. */
export function useCategoryColor(
  group: Exclude<CategoryColorGroup, "ambient">,
  key: string,
  fallback?: string,
): string {
  const { isDark } = useCategoryColors();
  return getCategoryColor(group, key, isDark, fallback);
}

/** Fully resolved resource-tile styling for the workspace stream. */
export function useStreamResourceColors(): Record<ResourceKind, StreamResourceStyle> {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  return useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(StreamResourceColors) as ResourceKind[]).map((kind) => [
          kind,
          getStreamResourceStyle(kind, isDark),
        ]),
      ) as Record<ResourceKind, StreamResourceStyle>,
    [isDark],
  );
}

/** Streak chip accent + surface for the current scheme. */
export function useStreakColors(): { accent: string; surface: string } {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  return useMemo(
    () => ({
      accent: resolveColor(StreakColors.accent, isDark),
      surface: resolveColor(StreakColors.surface, isDark),
    }),
    [isDark],
  );
}
