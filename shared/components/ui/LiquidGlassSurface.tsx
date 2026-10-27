import Constants, { ExecutionEnvironment } from "expo-constants";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Platform,
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
  /** Native specular edge light. Owned by the shader; on by default. */
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
  /** Android only: suspend backdrop capture (e.g. during screen transition). */
  paused?: boolean;
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
 * Report which tier actually rendered, once per device, in development.
 *
 * Capability probing is derived from `Platform`, so it can only ever tell you
 * what the device *could* do. The pipeline report is the only honest answer:
 * `glass` on iOS 26+, `refraction` on Android 13+ (the AGSL shader), `blur` on
 * API 31–32 and iOS 15–25, `tint` below that, `none` when the JS fallback
 * rendered.
 */
type PipelineEvent = {
  nativeEvent?: { tier?: string; osVersion?: number };
};

type GlassErrorEvent = {
  nativeEvent?: { code?: string; message?: string };
};

let hasReportedPipeline = false;

function reportPipelineReady(event: PipelineEvent | undefined) {
  if (!__DEV__ || hasReportedPipeline || !event?.nativeEvent) return;
  hasReportedPipeline = true;
  const { tier, osVersion } = event.nativeEvent;
  const apiLevel =
    Platform.OS === "android" ? Platform.Version : osVersion ?? 0;
  console.info(
    `[glass-diagnostics] platform="${Platform.OS}" apiLevel=${apiLevel} tier="${tier ?? "unknown"}" fallbackActive=false`
  );
}

function reportFallbackActive() {
  if (!__DEV__ || hasReportedPipeline) return;
  hasReportedPipeline = true;
  const apiLevel = Platform.OS === "android" ? Platform.Version : 0;
  console.info(
    `[glass-diagnostics] platform="${Platform.OS}" apiLevel=${apiLevel} tier="none" fallbackActive=true (using expo-blur)`
  );
}

function handleNativeError(event: GlassErrorEvent) {
  if (!__DEV__ || !event?.nativeEvent) return;
  const { code, message } = event.nativeEvent;
  console.warn(
    `[glass-diagnostics] Native shader error [${code ?? "ERROR"}]: ${message ?? "unknown"}`
  );
}

/**
 * Premium Liquid Glass surface.
 *
 * Two render paths, one look:
 *
 * - **Native** (`react-native-liquid-glassmorphism`) — real-time AGSL
 *   refractive-lens optics on Android 13+, `UIGlassEffect` on iOS 26+.
 *   The shader owns the material: edge refraction, Fresnel edge catch, diagonal
 *   face sheen, and specular highlights. The native path renders NO redundant
 *   SVG gradient overlays, letting the physical shader own all reflections.
 * - **Blur fallback** (`expo-blur`) — a real backdrop blur plus the same milk
 *   tint, with a single restrained top highlight for structure.
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  tintColor,
  intensity = 55,
  blurRadius = 14,
  interactive = true,
  rim,
  specular,
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
  paused = false,
}) => {
  // In light mode: preserve crisp white rim edge.
  // In dark mode: rim defaults to false to avoid harsh 0.80 white perimeter borders,
  // while specular=true activates native Fresnel rim reflections, diagonal sheen,
  // and directional specular highlight organically.
  const effectiveRim = rim ?? (isLight ? true : false);
  const effectiveSpecular = specular ?? true;
  const milk =
    tintColor ??
    (isLight ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.03)");
  const scrim = dim ?? 0;
  const lift = brightness ?? (isLight ? 1.0 : 1.04);
  const floor = legibilityFloor ?? 0;
  const lensThickness = thickness ?? (isLight ? 0.3 : 0.50);
  const lensEdge = edgeReflectionStrength ?? (isLight ? 0.12 : 0.18);
  const lensMag = isLight ? 1.0 : 1.02;

  // Strictly NO shadow in dark mode: tiles sit completely flush and weightless.
  const shadowStyle: ViewStyle | null =
    !shadow || !isLight
      ? null
      : {
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: shadowOpacity ?? 0.06,
          shadowRadius: 8,
        };

  if (!canRenderNativeGlass) {
    reportFallbackActive();

    // Blur fallback: light mode retains its crisp top gloss hairline;
    // dark mode draws NO border outline per design specifications.
    const hairline: ViewStyle = isLight
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderTopColor: "rgba(255, 255, 255, 0.7)",
          borderLeftColor: "rgba(15, 23, 42, 0.04)",
          borderRightColor: "rgba(15, 23, 42, 0.04)",
          borderBottomColor: "rgba(15, 23, 42, 0.05)",
        }
      : {
          borderWidth: 0,
        };

    return (
      <View
        style={[
          { borderRadius },
          hairline,
          shadowStyle,
          style,
        ]}
      >
        <View
          style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}
          pointerEvents="none"
        >
          <BlurView
            intensity={isLight ? intensity : 20}
            tint={isLight ? "light" : "default"}
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
          {/* Restrained single top edge highlight for visual clarity on fallback */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: isLight
                ? "rgba(255, 255, 255, 0.7)"
                : "rgba(255, 255, 255, 0.08)",
            }}
          />
        </View>
        {children}
      </View>
    );
  }

  // Native Path: LiquidGlassView owns all refraction, Fresnel, sheen, and specular optics.
  // No artificial SVG gradient overlays layered on top.
  return (
    <LiquidGlassView
      variant={variant}
      tintColor={milk}
      intensity={isLight ? intensity : 25}
      blurRadius={isLight ? blurRadius : 10}
      interactive={interactive}
      rim={effectiveRim}
      specular={effectiveSpecular}
      borderRadius={borderRadius}
      thickness={lensThickness}
      edgeReflectionStrength={lensEdge}
      dim={scrim}
      brightness={lift}
      legibilityFloor={floor}
      refraction={refraction}
      magnification={lensMag}
      ior={1.48}
      paused={paused}
      onPipelineReady={reportPipelineReady}
      onError={handleNativeError}
      style={[{ borderRadius }, shadowStyle, style]}
    >
      {children}
    </LiquidGlassView>
  );
};
