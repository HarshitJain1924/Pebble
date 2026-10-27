import Constants, { ExecutionEnvironment } from "expo-constants";
import { BlurView } from "expo-blur";
import React from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from "react-native-liquid-glassmorphism";

export interface LiquidGlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  intensity?: number;
  blurRadius?: number;
  interactive?: boolean;
  rim?: boolean;
  specular?: boolean;
  borderRadius?: number;
  thickness?: number;
  edgeReflectionStrength?: number;
  dim?: number;
  brightness?: number;
  legibilityFloor?: number;
  variant?: "clear" | "regular";
  refraction?: boolean;
  /** Light-theme optics, rim and shadow. Defaults to the dark palette. */
  isLight?: boolean;
  /**
   * Soft drop shadow under the pane. Off by default.
   *
   * A cast shadow is what makes a pane read as a raised tile instead of a sheet
   * of glass. Android `elevation` is never used: drawn behind a *translucent*
   * surface it is visible **through** it, which reads as a dark inner shadow.
   */
  shadow?: boolean;
  /** iOS-only cast shadow, only meaningful with `shadow`. */
  shadowOpacity?: number;
}

/**
 * `isLiquidGlassSupported()` only inspects `Platform.OS`, so it reports `true`
 * on every Android device — including Expo Go, whose binary does not contain
 * the module. Rendering the native view there mounts a host component that was
 * never registered, so the surface disappears instead of degrading. Treat Expo
 * Go as unsupported and let the blur fallback carry the look.
 */
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const canRenderNativeGlass = isLiquidGlassSupported() && !isExpoGo;

/**
 * Premium Liquid Glass surface.
 *
 * Two render paths, one look:
 *
 * - **Native** (`react-native-liquid-glassmorphism`) — real-time AGSL
 *   refractive-lens optics on Android 13+, `UIGlassEffect` on iOS 26+. Its own
 *   specular rim supplies the edge light.
 * - **Blur fallback** (`expo-blur`) — the same milk tint and the same rim, so
 *   Expo Go, web and older devices get glass rather than a flat translucent box.
 *
 * The optical look is owned here, not by callers, and it is deliberately *flat*.
 * The pane is a sheet of translucent glass lying on the background, not a tile
 * hovering above it: the backdrop is blurred and tinted, there is no cast
 * shadow, the rim is a single faint hairline (a touch brighter along the top
 * for the gloss), and the lens is shallow so the surface does not thicken into
 * a slab that looks like it pops off the screen.
 *
 * Theme awareness matters more than any single value here. A dark-mode glass
 * recipe is mostly a *darkening* one — a dim veil plus the shader's legibility
 * floor, which paints a dark wash inside the pane to keep white text readable.
 * Applied to a light background those read as a black card with an inner
 * shadow, so light mode drops both to zero and lifts the tint instead.
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  tintColor,
  intensity = 55,
  blurRadius = 22,
  interactive = true,
  rim = false,
  specular = true,
  borderRadius = 16,
  thickness,
  edgeReflectionStrength,
  dim,
  brightness,
  legibilityFloor,
  variant = "clear",
  refraction = true,
  isLight = false,
  shadow = false,
  shadowOpacity,
}) => {
  // Per-theme optical defaults; an explicitly passed prop always wins.
  const milk = tintColor ?? (isLight ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.07)");
  const scrim = dim ?? 0;
  const lift = brightness ?? (isLight ? 1 : 1.08);
  const floor = legibilityFloor ?? (isLight ? 0 : 0.06);
  const lensThickness = thickness ?? (isLight ? 0.3 : 0.35);
  const lensEdge = edgeReflectionStrength ?? (isLight ? 0.12 : 0.15);

  // A hairline, not a bevel: the top edge carries the gloss, the rest is barely
  // there. Nothing here should read as a raised lip.
  const rimStyle: ViewStyle = isLight
    ? {
        borderTopColor: "rgba(255, 255, 255, 0.7)",
        borderLeftColor: "rgba(15, 23, 42, 0.04)",
        borderRightColor: "rgba(15, 23, 42, 0.04)",
        borderBottomColor: "rgba(15, 23, 42, 0.05)",
      }
    : {
        borderTopColor: "rgba(255, 255, 255, 0.14)",
        borderLeftColor: "rgba(255, 255, 255, 0.07)",
        borderRightColor: "rgba(255, 255, 255, 0.07)",
        borderBottomColor: "rgba(255, 255, 255, 0.03)",
      };

  // No `elevation`: see `shadow` above.
  const shadowStyle: ViewStyle | null = !shadow
    ? null
    : {
        shadowColor: isLight ? "#0F172A" : "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: shadowOpacity ?? (isLight ? 0.06 : 0.18),
        shadowRadius: 10,
      };

  if (!canRenderNativeGlass) {
    return (
      <View
        style={[
          { borderRadius, borderWidth: StyleSheet.hairlineWidth },
          rimStyle,
          shadowStyle,
          style,
        ]}
      >
        <View
          style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}
          pointerEvents="none"
        >
          <BlurView
            intensity={intensity}
            tint={isLight ? "light" : "dark"}
            blurMethod="dimezisBlurViewSdk31Plus"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: milk }]} />
          {scrim > 0 && (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: `rgba(0, 0, 0, ${scrim})` },
              ]}
            />
          )}
        </View>
        {children}
      </View>
    );
  }

  return (
    <LiquidGlassView
      variant={variant}
      tintColor={milk}
      intensity={intensity}
      blurRadius={blurRadius}
      interactive={interactive}
      rim={rim}
      specular={specular}
      borderRadius={borderRadius}
      thickness={lensThickness}
      edgeReflectionStrength={lensEdge}
      dim={scrim}
      brightness={lift}
      legibilityFloor={floor}
      refraction={refraction}
      style={[
        { borderRadius, borderWidth: StyleSheet.hairlineWidth },
        rimStyle,
        shadowStyle,
        style,
      ]}
    >
      {children}
    </LiquidGlassView>
  );
};
