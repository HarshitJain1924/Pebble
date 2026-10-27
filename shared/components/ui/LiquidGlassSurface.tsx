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
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

let nextGlassSheenId = 0;

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
 * rendered. Without it, tuning the optics is guesswork.
 */
type PipelineEvent = {
  nativeEvent?: { tier?: string; osVersion?: number };
};

/** The tier cannot change for the life of the process, so report it once. */
let reportedTier: string | null = null;

function reportTier(event: PipelineEvent | undefined) {
  if (!__DEV__ || !event?.nativeEvent) return;
  const { tier, osVersion } = event.nativeEvent;
  const tag = `${Platform.OS}:${osVersion ?? "?"}:${tier ?? "unknown"}`;
  if (reportedTier === tag) return;
  reportedTier = tag;
  console.info(
    `[glass] ${Platform.OS} ${osVersion ?? "?"} → tier "${tier ?? "unknown"}"` +
      (canRenderNativeGlass
        ? ""
        : " (native module unavailable — expo-blur fallback is rendering)"),
  );
}

/**
 * Premium Liquid Glass surface.
 *
 * Two render paths, one look:
 *
 * - **Native** (`react-native-liquid-glassmorphism`) — real-time AGSL
 *   refractive-lens optics on Android 13+, `UIGlassEffect` on iOS 26+. The
 *   shader owns the edge: `rim` supplies the bright glass edge and `specular`
 *   its sheen, so this path draws **no** border of its own.
 * - **Blur fallback** (`expo-blur`) — a real backdrop blur plus the same milk
 *   tint. Blur alone has no edge lighting, so this path draws its own hairline.
 *
 * The optical look is deliberately *flat*. The pane is a sheet of translucent
 * glass lying on the background, not a tile hovering above it: the backdrop is
 * blurred and tinted, there is no cast shadow, and the lens is shallow so the
 * surface does not thicken into a slab that looks like it pops off the screen.
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
  const idRef = React.useRef<string | null>(null);
  if (!idRef.current) {
    idRef.current = `lgs_${++nextGlassSheenId}`;
  }
  const sheenGradId = `sheen_${idRef.current}`;
  const cornerLightId = `corner_${idRef.current}`;
  const topSpillId = `top_spill_${idRef.current}`;
  const bounceLightId = `bounce_${idRef.current}`;

  // In light mode: preserve rich glass highlights and specular edge.
  // In dark mode (Tourera crystal liquid glass):
  // - 95% High-Clarity Glass Core: milk tint is 2.5% ("rgba(255, 255, 255, 0.025)"), background colors breathe through with crystal fidelity.
  // - Real 3D Edge Lighting (NO vector stroke): smooth radial specular hotspot in top-left corner naturally spilling across curvature.
  // - True Liquid Refraction: thickness=0.34, refraction=true, specular=true, magnification=1.06.
  // - Zero white border outline (rim=false, borderWidth=0).
  // - Zero drop shadow: shadowStyle is strictly null in dark mode (flush, weightless).
  const effectiveRim = rim ?? (isLight ? true : false);
  const effectiveSpecular = specular ?? true;
  const milk =
    tintColor ??
    (isLight ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.025)");
  const scrim = dim ?? 0;
  const lift = brightness ?? (isLight ? 1 : 1.06);
  const floor = legibilityFloor ?? 0;
  const lensThickness = thickness ?? (isLight ? 0.3 : 0.34);
  const lensEdge = edgeReflectionStrength ?? (isLight ? 0.12 : 0.22);

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

  // Real 3D Edge Lighting & Specular Hotspot (NO vector stroke)
  const crystalGlassOptics = (
    <View
      style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Subtle satin diagonal sheen across glass face */}
          <SvgLinearGradient
            id={sheenGradId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.20 : 0.06}
            />
            <Stop
              offset="35%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.05 : 0.012}
            />
            <Stop
              offset="100%"
              stopColor="#FFFFFF"
              stopOpacity={0}
            />
          </SvgLinearGradient>

          {/* Real 3D Corner Hotspot: light catching the top-left curvature and spilling softly without any hard vector line */}
          <SvgRadialGradient
            id={cornerLightId}
            cx="12%"
            cy="14%"
            rx="58%"
            ry="46%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.45 : 0.28}
            />
            <Stop
              offset="26%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.16 : 0.09}
            />
            <Stop
              offset="58%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.04 : 0.02}
            />
            <Stop
              offset="100%"
              stopColor="#FFFFFF"
              stopOpacity={0}
            />
          </SvgRadialGradient>

          {/* Top curvature spill: light naturally spilling horizontally along the upper curve */}
          <SvgLinearGradient
            id={topSpillId}
            x1="5%"
            y1="0%"
            x2="60%"
            y2="0%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.25 : 0.14}
            />
            <Stop
              offset="45%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.08 : 0.04}
            />
            <Stop
              offset="100%"
              stopColor="#FFFFFF"
              stopOpacity={0}
            />
          </SvgLinearGradient>

          {/* Subtle bottom-right optical bounce reflection inside the liquid lens */}
          <SvgRadialGradient
            id={bounceLightId}
            cx="88%"
            cy="88%"
            rx="45%"
            ry="35%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.10 : 0.04}
            />
            <Stop
              offset="50%"
              stopColor="#FFFFFF"
              stopOpacity={isLight ? 0.03 : 0.01}
            />
            <Stop
              offset="100%"
              stopColor="#FFFFFF"
              stopOpacity={0}
            />
          </SvgRadialGradient>
        </Defs>

        {/* Satin face reflection */}
        <Rect width="100%" height="100%" fill={`url(#${sheenGradId})`} />
        {/* Soft 3D optical corner light */}
        <Rect width="100%" height="100%" fill={`url(#${cornerLightId})`} />
        {/* Natural light spill along upper curvature */}
        <Rect x="0" y="0" width="100%" height="22%" fill={`url(#${topSpillId})`} />
        {/* Ambient bottom-right lens bounce */}
        <Rect width="100%" height="100%" fill={`url(#${bounceLightId})`} />
      </Svg>
    </View>
  );

  if (!canRenderNativeGlass) {
    // Blur fallback: light mode retains its crisp top gloss hairline;
    // dark mode draws NO border whatsoever per user requirement.
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

    reportTier({ nativeEvent: { tier: "none", osVersion: 0 } });

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
        </View>
        {crystalGlassOptics}
        {children}
      </View>
    );
  }

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
      magnification={isLight ? 1.0 : 1.06}
      ior={1.48}
      paused={paused}
      onPipelineReady={reportTier}
      style={[{ borderRadius }, shadowStyle, style]}
    >
      {crystalGlassOptics}
      {children}
    </LiquidGlassView>
  );
};
