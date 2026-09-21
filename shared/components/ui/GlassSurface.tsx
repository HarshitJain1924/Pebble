import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { useColorScheme } from "@/shared/hooks/useColorScheme";

/**
 * GlassSurface — the single place Pebble decides whether a surface can afford a
 * live blur.
 *
 * `expo-blur`'s Android support is explicitly experimental and "may cause
 * performance and graphical issues"; it is off unless `experimentalBlurMethod`
 * is set. So:
 *
 *  - iOS / capable Android → real blur (Android gets the documented
 *    `blurReductionFactor` so its blur reads lighter and costs less).
 *  - Web / low-memory Android → a ~85%-opaque solid, i.e. the translucent
 *    surface without the blur pass.
 *
 * Callers keep their own border radius/border/overflow; this component only
 * owns the backdrop, the legibility scrim and the fallback.
 */

export const ANDROID_LOW_MEMORY_THRESHOLD_BYTES = 3_000_000_000;

/** Android's BlurView blurs nothing unless this is set (default is "none"). */
const ANDROID_BLUR_METHOD = "dimezisBlurView" as const;

/** Divides the blur intensity on Android (expo-blur's default is 4). */
const ANDROID_BLUR_REDUCTION_FACTOR = 5;

/**
 * Pure decision for whether a live blur is affordable.
 *
 * `totalMemoryBytes` is only available on Android; when the signal is missing
 * we keep the blur rather than silently degrading everyone to the solid path.
 */
export function canRenderBlur(
  platformOS: string,
  totalMemoryBytes?: number,
): boolean {
  if (platformOS === "web") return false;

  if (platformOS === "android") {
    if (
      typeof totalMemoryBytes === "number" &&
      totalMemoryBytes > 0 &&
      totalMemoryBytes < ANDROID_LOW_MEMORY_THRESHOLD_BYTES
    ) {
      return false;
    }
  }

  return true;
}

/** `canRenderBlur` resolved against the current device. */
export function shouldUseBlur(): boolean {
  const totalMemory = (
    Platform.constants as { TotalMemory?: number } | undefined
  )?.TotalMemory;

  return canRenderBlur(Platform.OS, totalMemory);
}

export interface GlassSurfaceProps extends Omit<ViewProps, "children"> {
  children?: ReactNode;
  /** Blur strength (1–100) on devices that render a live blur. */
  intensity?: number;
  /** Blur tint. Defaults to the active color scheme. */
  tint?: "light" | "dark";
  /** Translucent wash over the blur so foreground content stays legible. */
  scrimColor?: ColorValue;
  /** ~85%-opaque solid used when the blur is skipped. */
  solidColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

const DARK_SOLID = "rgba(24, 24, 27, 0.85)";
const LIGHT_SOLID = "rgba(255, 255, 255, 0.85)";
const DARK_SCRIM = "rgba(24, 24, 27, 0.35)";
const LIGHT_SCRIM = "rgba(255, 255, 255, 0.45)";

export function GlassSurface({
  children,
  intensity = 70,
  tint,
  scrimColor,
  solidColor,
  style,
  ...rest
}: GlassSurfaceProps) {
  const scheme = useColorScheme() ?? "dark";
  const isDark = scheme !== "light";
  const blurAllowed = shouldUseBlur();

  if (!blurAllowed) {
    return (
      <View
        {...rest}
        style={[
          style,
          { backgroundColor: solidColor ?? (isDark ? DARK_SOLID : LIGHT_SOLID) },
        ]}
      >
        {children}
      </View>
    );
  }

  const isAndroid = Platform.OS === "android";

  return (
    <BlurView
      {...rest}
      intensity={intensity}
      tint={tint ?? (isDark ? "dark" : "light")}
      experimentalBlurMethod={isAndroid ? ANDROID_BLUR_METHOD : undefined}
      blurReductionFactor={isAndroid ? ANDROID_BLUR_REDUCTION_FACTOR : undefined}
      style={[style, styles.clip]}
    >
      {/* Legibility wash — the blur alone is rarely enough for small text. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: scrimColor ?? (isDark ? DARK_SCRIM : LIGHT_SCRIM) },
        ]}
      />
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  // BlurView ignores an explicit borderRadius on Android, so the radius is
  // enforced by clipping the blurred layer instead.
  clip: {
    overflow: "hidden",
  },
});

export default GlassSurface;
