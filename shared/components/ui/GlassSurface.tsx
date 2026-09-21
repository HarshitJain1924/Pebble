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
 * **iOS only, on purpose.** `expo-blur`'s Android blur is opt-in via
 * `experimentalBlurMethod` ("blur" is not the default — `"none"` is) and it
 * works by capturing the underlying view hierarchy into a bitmap. On any device
 * whose tree contains a hardware bitmap — e.g. an image- or asset-backed
 * ImageView, which this app has in its header/avatar/jar art — that capture
 * crashes the whole app with:
 *
 *   java.lang.IllegalArgumentException: Software rendering doesn't support
 *   hardware bitmaps
 *     at android.graphics.BaseCanvas.throwIfHwBitmapInSwMode
 *     at android.graphics.Canvas.drawBitmap
 *     at android.widget.ImageView.onDraw
 *
 * Because the crash is in native `draw()` there is no JS-side try/catch that
 * can contain it. iOS blurs with a native `UIVisualEffectView` instead, so it
 * has no equivalent failure mode.
 *
 * Android and web therefore render the translucent solid — a ~85%-opaque
 * tinted surface that still reads as floating glass, without the bitmap
 * capture. If Android blur is ever revisited it must be verified on a real
 * device against a screen that renders images before being switched on.
 */
export function canRenderBlur(platformOS: string): boolean {
  return platformOS !== "android" && platformOS !== "web";
}

const DARK_SOLID = "rgba(24, 24, 27, 0.85)";
const LIGHT_SOLID = "rgba(255, 255, 255, 0.85)";
const DARK_SCRIM = "rgba(24, 24, 27, 0.35)";
const LIGHT_SCRIM = "rgba(255, 255, 255, 0.45)";

export interface GlassSurfaceProps extends Omit<ViewProps, "children"> {
  children?: ReactNode;
  /** Blur strength (1–100) on devices that render a live blur. */
  intensity?: number;
  /** Blur tint. Defaults to the active color scheme. */
  tint?: "light" | "dark";
  /** Translucent wash over the blur so foreground content stays legible. */
  scrimColor?: ColorValue;
  /** ~85%-opaque solid used where the blur is skipped (Android, web). */
  solidColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

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

  if (!canRenderBlur(Platform.OS)) {
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

  return (
    <BlurView
      {...rest}
      intensity={intensity}
      tint={tint ?? (isDark ? "dark" : "light")}
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
  // BlurView ignores an explicit borderRadius on Android, and iOS benefits from
  // clipping the blurred layer to the surface's rounded corners.
  clip: {
    overflow: "hidden",
  },
});

export default GlassSurface;
