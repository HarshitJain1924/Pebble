import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette, Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

// Geometry constants: Strictly measured from Pebble center (0, 0)
const RADIAL_RADIUS = 100; // Distance from Pebble center to item center
const ITEM_SIZE = 48; // Uniform diameter for all 5 sectors
const PEBBLE_SIZE = 54; // Diameter of central resting trigger pebble
const DEADZONE_RADIUS = 26; // Distance under which touch is neutral/cancel
const BACKDROP_RADIUS = 138; // Radius of semicircular halo shield

export interface RadialNavOption {
  key: string;
  name: string;
  label: string;
  sublabel: string;
  icon: keyof typeof Feather.glyphMap;
  angleDeg: number; // 0 = right, 90 = top, 180 = left
  color: string;
  isHero?: boolean;
}

// 5 evenly distributed sectors across 180° (exactly 37.5° between adjacent items)
export const RADIAL_NAV_OPTIONS: RadialNavOption[] = [
  {
    key: "index",
    name: "index",
    label: "Today",
    sublabel: "Daily focus & habits",
    icon: "home",
    angleDeg: 165,
    color: Palette.pine400,
  },
  {
    key: "tasks",
    name: "tasks",
    label: "Workspaces",
    sublabel: "Folders & projects",
    icon: "folder",
    angleDeg: 127.5,
    color: Palette.blue500,
  },
  {
    key: "quick_add",
    name: "quick_add",
    label: "Quick Capture",
    sublabel: "New task, habit, note",
    icon: "plus",
    angleDeg: 90,
    color: Palette.emerald400,
    isHero: true,
  },
  {
    key: "calendar",
    name: "calendar",
    label: "Schedule",
    sublabel: "Timeline & agenda",
    icon: "calendar",
    angleDeg: 52.5,
    color: Palette.violet500,
  },
  {
    key: "focus",
    name: "focus",
    label: "Focus Mode",
    sublabel: "Timed zen session",
    icon: "target",
    angleDeg: 15,
    color: Palette.amber500,
  },
];

export interface PebbleRadialTabBarProps extends BottomTabBarProps {
  onQuickAddPress?: () => void;
}

/**
 * Helper to build an organic, tapered blade of grass with quadratic bezier curve
 */
const createBladePath = (
  bx: number,
  by: number,
  h: number,
  lean: number,
  w = 2.4,
) => {
  const tipX = bx + lean;
  const tipY = by - h;
  const midY = by - h * 0.52;
  const c1x = bx + lean * 0.25 - w * 0.6;
  const c2x = bx + lean * 0.6 + w * 0.6;
  return `M ${bx - w / 2},${by} Q ${c1x},${midY} ${tipX},${tipY} Q ${c2x},${midY} ${bx + w / 2},${by} Z`;
};

/**
 * Organic riverbed wave dock background with Bioluminescent Aurora glow
 * and living botanical grass sprigs cradling the central Pebble button.
 */
const RiverbedSupportWave: React.FC<{
  screenWidth: number;
  bottomInset: number;
  isDark: boolean;
}> = React.memo(({ screenWidth, bottomInset, isDark }) => {
  const cx = screenWidth / 2;
  const WAVE_CANVAS_HEIGHT = bottomInset + PEBBLE_SIZE + 24;

  const pebbleCenterY = WAVE_CANVAS_HEIGHT - (bottomInset + PEBBLE_SIZE / 2);
  const pebbleTopY = pebbleCenterY - PEBBLE_SIZE / 2;
  const crestPeakY = pebbleTopY - 6;
  const crestSideY = WAVE_CANVAS_HEIGHT - (bottomInset + 12);
  const hillHalfWidth = 88;

  // Rear atmospheric wave crest (slightly higher, offset for layered depth)
  const rearPeakY = crestPeakY - 10;
  const rearSideY = crestSideY - 6;
  const rearHalfWidth = 104;

  const rearWavePath = useMemo(() => {
    return `
      M 0,${rearSideY}
      L ${cx - rearHalfWidth},${rearSideY}
      C ${cx - rearHalfWidth * 0.52},${rearSideY} ${cx - rearHalfWidth * 0.4},${rearPeakY} ${cx},${rearPeakY}
      C ${cx + rearHalfWidth * 0.4},${rearPeakY} ${cx + rearHalfWidth * 0.52},${rearSideY} ${cx + rearHalfWidth},${rearSideY}
      L ${screenWidth},${rearSideY}
      L ${screenWidth},${WAVE_CANVAS_HEIGHT + 10}
      L 0,${WAVE_CANVAS_HEIGHT + 10}
      Z
    `;
  }, [cx, rearHalfWidth, rearPeakY, rearSideY, screenWidth, WAVE_CANVAS_HEIGHT]);

  const frontWavePath = useMemo(() => {
    return `
      M 0,${crestSideY}
      L ${cx - hillHalfWidth},${crestSideY}
      C ${cx - hillHalfWidth * 0.55},${crestSideY} ${cx - hillHalfWidth * 0.42},${crestPeakY} ${cx},${crestPeakY}
      C ${cx + hillHalfWidth * 0.42},${crestPeakY} ${cx + hillHalfWidth * 0.55},${crestSideY} ${cx + hillHalfWidth},${crestSideY}
      L ${screenWidth},${crestSideY}
      L ${screenWidth},${WAVE_CANVAS_HEIGHT + 10}
      L 0,${WAVE_CANVAS_HEIGHT + 10}
      Z
    `;
  }, [cx, crestPeakY, crestSideY, hillHalfWidth, screenWidth, WAVE_CANVAS_HEIGHT]);

  const crestStrokePath = useMemo(() => {
    return `
      M 0,${crestSideY}
      L ${cx - hillHalfWidth},${crestSideY}
      C ${cx - hillHalfWidth * 0.55},${crestSideY} ${cx - hillHalfWidth * 0.42},${crestPeakY} ${cx},${crestPeakY}
      C ${cx + hillHalfWidth * 0.42},${crestPeakY} ${cx + hillHalfWidth * 0.55},${crestSideY} ${cx + hillHalfWidth},${crestSideY}
      L ${screenWidth},${crestSideY}
    `;
  }, [cx, crestPeakY, crestSideY, hillHalfWidth, screenWidth]);

  // Botanical Grass Blades: Nestled naturally around the Pebble and across the dune
  const grassPaths = useMemo(() => {
    const backBlades = [
      createBladePath(cx - 35, crestPeakY + 18, 16, -6, 2.0),
      createBladePath(cx + 35, crestPeakY + 18, 16, 6, 2.0),
      createBladePath(cx - 75, crestSideY + 3, 14, -6, 2.2),
      createBladePath(cx + 75, crestSideY + 3, 14, 6, 2.2),
    ].join(" ");

    const foreBlades = [
      // Left pebble flank
      createBladePath(cx - 29, crestPeakY + 12, 13, -3, 2.2),
      createBladePath(cx - 33, crestPeakY + 16, 19, -6, 2.5),
      createBladePath(cx - 38, crestPeakY + 20, 12, -7, 1.8),
      // Right pebble flank
      createBladePath(cx + 29, crestPeakY + 12, 13, 3, 2.2),
      createBladePath(cx + 33, crestPeakY + 16, 19, 6, 2.5),
      createBladePath(cx + 38, crestPeakY + 20, 12, 7, 1.8),
      // Left dune slope tuft
      createBladePath(cx - 67, crestSideY, 15, -4, 2.2),
      createBladePath(cx - 71, crestSideY + 2, 20, -5, 2.4),
      createBladePath(cx - 61, crestSideY - 3, 11, 2, 1.8),
      // Right dune slope tuft
      createBladePath(cx + 67, crestSideY, 15, 4, 2.2),
      createBladePath(cx + 71, crestSideY + 2, 20, 5, 2.4),
      createBladePath(cx + 61, crestSideY - 3, 11, -2, 1.8),
      // Solitary shoreline sprigs
      createBladePath(cx - 122, crestSideY + 1, 10, -3, 1.7),
      createBladePath(cx + 122, crestSideY + 1, 10, 3, 1.7),
    ].join(" ");

    return { backBlades, foreBlades };
  }, [cx, crestPeakY, crestSideY]);

  // Glowing micro dew drops on the tips of the tallest blades
  const dewdrops = useMemo(() => {
    return [
      { cx: cx - 33 - 6, cy: crestPeakY + 16 - 19, r: 1.2 },
      { cx: cx + 33 + 6, cy: crestPeakY + 16 - 19, r: 1.2 },
      { cx: cx - 71 - 5, cy: crestSideY + 2 - 20, r: 1.2 },
      { cx: cx + 71 + 5, cy: crestSideY + 2 - 20, r: 1.2 },
    ];
  }, [cx, crestPeakY, crestSideY]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.waveContainer,
        { height: WAVE_CANVAS_HEIGHT, width: screenWidth },
      ]}
    >
      <Svg
        width={screenWidth}
        height={WAVE_CANVAS_HEIGHT}
        viewBox={`0 0 ${screenWidth} ${WAVE_CANVAS_HEIGHT}`}
      >
        <Defs>
          {/* Ambient Bioluminescent Aurora Radial Glow (Elliptical, zero rectangle edges) */}
          <RadialGradient
            id="auroraGlow"
            cx={cx}
            cy={crestPeakY - 4}
            rx={120}
            ry={36}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0%"
              stopColor={Palette.pine400}
              stopOpacity={isDark ? 0.32 : 0.20}
            />
            <Stop
              offset="50%"
              stopColor={Palette.pine500}
              stopOpacity={isDark ? 0.10 : 0.06}
            />
            <Stop offset="82%" stopColor={Palette.pine400} stopOpacity="0.02" />
            <Stop offset="100%" stopColor={Palette.pine400} stopOpacity="0" />
          </RadialGradient>

          {/* Rear Dune Fill (Translucent Pine Tint) */}
          <SvgLinearGradient id="rearWaveFill" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0%"
              stopColor={Palette.pine500}
              stopOpacity={isDark ? 0.38 : 0.25}
            />
            <Stop
              offset="100%"
              stopColor={
                isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.7)"
              }
              stopOpacity={0.8}
            />
          </SvgLinearGradient>

          {/* Front Dune Fill (Deep Glassmorphic Slate/White) */}
          <SvgLinearGradient id="frontWaveFill" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0%"
              stopColor={
                isDark ? "rgba(17, 24, 39, 0.88)" : "rgba(255, 255, 255, 0.94)"
              }
            />
            <Stop
              offset="100%"
              stopColor={
                isDark ? "rgba(3, 7, 18, 0.98)" : "rgba(248, 250, 252, 0.98)"
              }
            />
          </SvgLinearGradient>

          {/* Glowing Crest Highlight Stroke */}
          <SvgLinearGradient
            id="crestStrokeGrad"
            x1="0"
            y1="0"
            x2={screenWidth}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0%"
              stopColor={
                isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)"
              }
            />
            <Stop
              offset={(cx - 80) / screenWidth}
              stopColor={
                isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"
              }
            />
            <Stop
              offset={(cx - 20) / screenWidth}
              stopColor={Palette.pine400}
              stopOpacity={0.7}
            />
            <Stop
              offset={cx / screenWidth}
              stopColor={Palette.pine300}
              stopOpacity={0.95}
            />
            <Stop
              offset={(cx + 20) / screenWidth}
              stopColor={Palette.pine400}
              stopOpacity={0.7}
            />
            <Stop
              offset={(cx + 80) / screenWidth}
              stopColor={
                isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"
              }
            />
            <Stop
              offset="100%"
              stopColor={
                isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)"
              }
            />
          </SvgLinearGradient>

          {/* Grass Blade Gradient (Deep rooted pine to glowing meadow green tip) */}
          <SvgLinearGradient id="grassBladeGrad" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0%" stopColor={Palette.pine600} />
            <Stop offset="60%" stopColor={Palette.pine400} />
            <Stop offset="100%" stopColor={Palette.pine300} />
          </SvgLinearGradient>

          {/* Background Grass Blade Gradient */}
          <SvgLinearGradient id="grassBladeBackGrad" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0%" stopColor={Palette.pine600} stopOpacity={0.7} />
            <Stop offset="100%" stopColor={Palette.pine500} stopOpacity={0.65} />
          </SvgLinearGradient>
        </Defs>

        {/* 1. Ambient Aurora Light Glow (Organic Ellipse, zero hard edges) */}
        <Ellipse
          cx={cx}
          cy={crestPeakY - 4}
          rx={120}
          ry={36}
          fill="url(#auroraGlow)"
        />

        {/* 2. Layered Rear Wave */}
        <Path d={rearWavePath} fill="url(#rearWaveFill)" />

        {/* 3. Background Depth Grass Blades */}
        <Path d={grassPaths.backBlades} fill="url(#grassBladeBackGrad)" />

        {/* 4. Front Riverbed Dune */}
        <Path d={frontWavePath} fill="url(#frontWaveFill)" />

        {/* 5. Glowing Crest Stroke */}
        <Path
          d={crestStrokePath}
          fill="none"
          stroke="url(#crestStrokeGrad)"
          strokeWidth={1.5}
        />

        {/* 6. Foreground Living Grass Blades */}
        <Path d={grassPaths.foreBlades} fill="url(#grassBladeGrad)" />

        {/* 7. Shimmering Dewdrop Specks on Blade Tips */}
        {dewdrops.map((drop, idx) => (
          <Circle
            key={idx}
            cx={drop.cx}
            cy={drop.cy}
            r={drop.r}
            fill={Palette.pine200}
            opacity={0.85}
          />
        ))}
      </Svg>
    </View>
  );
});

RiverbedSupportWave.displayName = "RiverbedSupportWave";

/**
 * Individual radial option node, smoothly fanning out from the Pebble center
 */
const RadialOptionNode = React.memo(
  ({
    option,
    index,
    dialProgress,
    activeSector,
    isRouteActive,
    isDark,
    onSelect,
  }: {
    option: RadialNavOption & { x: number; y: number };
    index: number;
    dialProgress: SharedValue<number>;
    activeSector: number;
    isRouteActive: boolean;
    isDark: boolean;
    onSelect: (index: number) => void;
  }) => {
    const isSelected = activeSector === index;

    // Smooth outward fan translation from (0, 0)
    const animatedStyle = useAnimatedStyle(() => {
      const p = dialProgress.value;
      const transX = option.x * p;
      const transY = option.y * p;
      const scale = interpolate(p, [0, 0.35, 1], [0.2, 0.7, 1]);
      const opacity = interpolate(p, [0, 0.25, 1], [0, 0.5, 1]);

      return {
        opacity,
        transform: [
          { translateX: transX },
          { translateY: transY },
          { scale: scale * (isSelected ? 1.14 : 1) },
        ],
      };
    });

    return (
      <Animated.View
        style={[styles.radialItemSlot, animatedStyle]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => onSelect(index)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${option.label}: ${option.sublabel}`}
          style={[
            styles.radialItemCircle,
            isSelected
              ? [
                  styles.radialItemActive,
                  {
                    backgroundColor: option.color,
                    borderColor: Palette.white,
                    shadowColor: option.color,
                  },
                ]
              : [
                  styles.radialItemIdle,
                  {
                    backgroundColor: isDark
                      ? "rgba(30, 41, 59, 0.88)"
                      : "rgba(255, 255, 255, 0.94)",
                    borderColor: isRouteActive
                      ? option.color
                      : isDark
                      ? "rgba(255, 255, 255, 0.15)"
                      : "rgba(0, 0, 0, 0.1)",
                  },
                ],
          ]}
        >
          <Feather
            name={option.icon}
            size={isSelected ? 22 : 20}
            color={
              isSelected
                ? Palette.white
                : isRouteActive
                ? option.color
                : isDark
                ? Palette.slate200
                : Palette.slate700
            }
          />
        </Pressable>
      </Animated.View>
    );
  },
);

RadialOptionNode.displayName = "RadialOptionNode";

export const PebbleRadialTabBar: React.FC<PebbleRadialTabBarProps> = ({
  state,
  navigation,
  onQuickAddPress,
}) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const theme = Colors[colorScheme ?? "dark"];

  // Active route
  const activeRoute = state.routes[state.index];
  const activeRouteName = activeRoute?.name ?? "index";

  // Reanimated shared values
  const dialProgress = useSharedValue(0);
  const pebbleScale = useSharedValue(1);

  // States
  const [isOpen, setIsOpen] = useState(false);
  const [activeSector, setActiveSector] = useState<number>(-1);
  const [isStickyOpen, setIsStickyOpen] = useState(false);

  const activeSectorRef = useRef<number>(-1);
  const isOpenRef = useRef<boolean>(false);
  const isStickyOpenRef = useRef<boolean>(false);
  const wasOpenOnGrant = useRef<boolean>(false);
  const touchStartTimestamp = useRef<number>(0);
  const hasDragged = useRef<boolean>(false);

  // Calculate dynamic bottom inset
  const bottomInset = Math.max(insets.bottom, 16);

  // Cartesian coordinates mapped strictly from Pebble center (0, 0)
  const optionCoords = useMemo(() => {
    return RADIAL_NAV_OPTIONS.map((opt) => {
      const rad = (opt.angleDeg * Math.PI) / 180;
      const x = Math.round(RADIAL_RADIUS * Math.cos(rad));
      const y = Math.round(-RADIAL_RADIUS * Math.sin(rad)); // Negative Y points up
      return { ...opt, x, y };
    });
  }, []);

  // Nearest-neighbor sector resolution with deadzone check
  const resolveNearestSector = useCallback((dx: number, dy: number): number => {
    const dist = Math.hypot(dx, dy);
    if (dist < DEADZONE_RADIUS) {
      return -1; // Center deadzone cancels
    }

    // Angle in degrees from thumb vector (0 = right, 90 = up, 180 = left)
    let angleDeg = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (angleDeg < -20 && angleDeg > -160) {
      return -1; // Dragging down = cancel
    }
    if (angleDeg < 0) {
      angleDeg = angleDeg > -90 ? 0 : 180;
    }

    let closestIndex = 0;
    let minDeviation = 999;
    for (let i = 0; i < RADIAL_NAV_OPTIONS.length; i++) {
      const deviation = Math.abs(angleDeg - RADIAL_NAV_OPTIONS[i].angleDeg);
      if (deviation < minDeviation) {
        minDeviation = deviation;
        closestIndex = i;
      }
    }
    return closestIndex;
  }, []);

  // Update active sector with haptic ticks
  const updateActiveSector = useCallback((sectorIndex: number) => {
    if (activeSectorRef.current !== sectorIndex) {
      activeSectorRef.current = sectorIndex;
      setActiveSector(sectorIndex);

      if (sectorIndex >= 0) {
        Haptics.selectionAsync().catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }
  }, []);

  // Open dial
  const openDial = useCallback(
    (sticky = false) => {
      isOpenRef.current = true;
      isStickyOpenRef.current = sticky;
      setIsOpen(true);
      setIsStickyOpen(sticky);
      dialProgress.value = withSpring(1, {
        damping: 17,
        stiffness: 220,
        mass: 0.65,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [dialProgress],
  );

  // Close dial
  const closeDial = useCallback(() => {
    isOpenRef.current = false;
    isStickyOpenRef.current = false;
    wasOpenOnGrant.current = false;
    setIsOpen(false);
    setIsStickyOpen(false);
    updateActiveSector(-1);
    dialProgress.value = withTiming(0, {
      duration: 150,
      easing: Easing.out(Easing.quad),
    });
    pebbleScale.value = withSpring(1, { damping: 15 });
  }, [dialProgress, pebbleScale, updateActiveSector]);

  // Commit selection
  const commitSelection = useCallback(
    (sectorIndex: number) => {
      if (sectorIndex < 0 || sectorIndex >= RADIAL_NAV_OPTIONS.length) {
        closeDial();
        return;
      }

      const selected = RADIAL_NAV_OPTIONS[sectorIndex];
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      if (selected.key === "quick_add") {
        closeDial();
        if (onQuickAddPress) {
          onQuickAddPress();
        }
        return;
      }

      const targetRoute = state.routes.find((r) => r.name === selected.name);
      if (targetRoute) {
        const isCurrent = state.routes[state.index]?.name === selected.name;
        if (!isCurrent) {
          navigation.navigate(selected.name);
        }
      }
      closeDial();
    },
    [closeDial, navigation, onQuickAddPress, state.index, state.routes],
  );

  // PanResponder with tap-to-stick, hold-drag, and clean toggle close
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.hypot(gestureState.dx, gestureState.dy) > 5;
        },
        onPanResponderGrant: () => {
          touchStartTimestamp.current = Date.now();
          hasDragged.current = false;
          wasOpenOnGrant.current = isOpenRef.current;
          pebbleScale.value = withSpring(0.92, { damping: 14 });

          // If currently closed, start blooming outward immediately
          if (!isOpenRef.current) {
            openDial(false);
          }
        },
        onPanResponderMove: (_, gestureState) => {
          const dist = Math.hypot(gestureState.dx, gestureState.dy);
          if (dist > 8) {
            hasDragged.current = true;
          }
          if (!isOpenRef.current) return;
          const sector = resolveNearestSector(gestureState.dx, gestureState.dy);
          updateActiveSector(sector);
        },
        onPanResponderRelease: (_, gestureState) => {
          const duration = Date.now() - touchStartTimestamp.current;
          const dist = Math.hypot(gestureState.dx, gestureState.dy);
          const isTap = duration < 280 && dist < 14 && !hasDragged.current;

          pebbleScale.value = withSpring(1, { damping: 14 });

          // Tap gesture handling
          if (isTap) {
            if (wasOpenOnGrant.current) {
              // User tapped the close 'X' button while dial was already open!
              closeDial();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              return;
            } else {
              // User tapped to open in persistent sticky mode!
              isStickyOpenRef.current = true;
              setIsStickyOpen(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              return;
            }
          }

          // Drag release gesture
          if (hasDragged.current) {
            const finalSector = resolveNearestSector(gestureState.dx, gestureState.dy);
            if (finalSector >= 0) {
              commitSelection(finalSector);
            } else {
              closeDial();
            }
          } else {
            // Held without dragging
            if (!isStickyOpenRef.current) {
              closeDial();
            }
          }
        },
        onPanResponderTerminate: () => {
          closeDial();
        },
      }),
    [
      closeDial,
      commitSelection,
      openDial,
      pebbleScale,
      resolveNearestSector,
      updateActiveSector,
    ],
  );

  // Animated styles for the radial layer: Morphs upward out of the wave crest
  const radialLayerStyle = useAnimatedStyle(() => {
    return {
      opacity: dialProgress.value,
      transform: [
        {
          scale: interpolate(dialProgress.value, [0, 1], [0.35, 1]),
        },
      ],
    };
  });

  // Animated style for soft full-screen backdrop scrim
  const scrimAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(dialProgress.value, [0, 1], [0, 0.45]),
    };
  });

  const pebbleAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pebbleScale.value }],
    };
  });

  const activeOption = activeSector >= 0 ? RADIAL_NAV_OPTIONS[activeSector] : null;

  const currentRouteOption = useMemo(() => {
    return RADIAL_NAV_OPTIONS.find((o) => o.name === activeRouteName);
  }, [activeRouteName]);

  const restingIcon = currentRouteOption?.icon ?? "disc";
  const restingColor = currentRouteOption?.color ?? Palette.pine400;

  return (
    <>
      {/* Fullscreen touch dismiss scrim when opened */}
      {isOpen && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            scrimAnimatedStyle,
            { backgroundColor: Palette.black, zIndex: 9998 },
          ]}
          pointerEvents="auto"
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeDial}
            accessibilityLabel="Dismiss navigation dial"
          />
        </Animated.View>
      )}

      <View
        pointerEvents="box-none"
        style={[styles.overlayContainer, { paddingBottom: bottomInset }]}
      >
        {/* Riverbed Support Wave Dock (Full-width organic shoreline behind the Pebble) */}
        <RiverbedSupportWave
          screenWidth={screenWidth}
          bottomInset={bottomInset}
          isDark={isDark}
        />

        {/* Unified Anchor Container: Centers both the Pebble and the Radial Arc at the identical point */}
        <View style={styles.pebbleAnchorContainer} pointerEvents="box-none">
          {/* Radial Arc & Items Anchor: Positioned at the exact (27, 27) center of the Pebble */}
          <Animated.View
            pointerEvents={isOpen ? "box-none" : "none"}
            style={[styles.radialPivotAnchor, radialLayerStyle]}
          >
            {/* Semicircular Halo Shield: Translucent, symmetrically cradling the Pebble */}
            <View
              style={[
                styles.semicircleShield,
                {
                  backgroundColor: isDark
                    ? "rgba(17, 24, 39, 0.85)"
                    : "rgba(255, 255, 255, 0.92)",
                  borderColor: isDark
                    ? "rgba(255, 255, 255, 0.12)"
                    : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              {Platform.OS === "ios" && (
                <BlurView
                  intensity={isDark ? 55 : 75}
                  tint={isDark ? "dark" : "light"}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </View>

            {/* Floating Label / Guidance text: Positioned safely 20pt above highest sector */}
            {activeOption ? (
              <View style={styles.labelContainer} pointerEvents="none">
                <View
                  style={[
                    styles.activeLabelCapsule,
                    {
                      backgroundColor: isDark ? Palette.gray900 : Palette.white,
                      borderColor: activeOption.color,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.activeLabelDot,
                      { backgroundColor: activeOption.color },
                    ]}
                  />
                  <Text
                    style={[
                      styles.activeLabelTitle,
                      { color: isDark ? Palette.white : Palette.gray900 },
                    ]}
                  >
                    {activeOption.label}
                  </Text>
                  <Text
                    style={[
                      styles.activeLabelSub,
                      { color: isDark ? Palette.slate400 : Palette.slate500 },
                    ]}
                  >
                    {`· ${activeOption.sublabel}`}
                  </Text>
                </View>
              </View>
            ) : isOpen ? (
              <View style={styles.labelContainer} pointerEvents="none">
                <View
                  style={[
                    styles.guidanceCapsule,
                    {
                      backgroundColor: isDark
                        ? "rgba(15, 23, 42, 0.75)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.12)"
                        : "rgba(0, 0, 0, 0.08)",
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.guidanceText, { color: theme.textMuted }]}
                  >
                    {isStickyOpen
                      ? "Tap an icon or tap pebble to close"
                      : "Drag to an icon · Release to launch"}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 5 Radial Sector Nodes radiating uniformly from (0, 0) */}
            {optionCoords.map((option, index) => (
              <RadialOptionNode
                key={option.key}
                option={option}
                index={index}
                dialProgress={dialProgress}
                activeSector={activeSector}
                isRouteActive={activeRouteName === option.name}
                isDark={isDark}
                onSelect={commitSelection}
              />
            ))}
          </Animated.View>

          {/* The Central Floating Pebble Trigger */}
          <Animated.View style={pebbleAnimatedStyle}>
            <View
              {...panResponder.panHandlers}
              accessibilityRole="button"
              accessibilityLabel="Pebble Navigation Dial. Hold and drag to select destination, or tap to open options."
              style={[
                styles.pebbleButton,
                {
                  backgroundColor: isDark ? Palette.gray900 : Palette.white,
                  borderColor: isOpen
                    ? activeOption
                      ? activeOption.color
                      : Palette.pine400
                    : isDark
                    ? "rgba(255, 255, 255, 0.18)"
                    : "rgba(0, 0, 0, 0.12)",
                  shadowColor: isDark
                    ? Palette.black
                    : activeOption
                    ? activeOption.color
                    : restingColor,
                },
              ]}
            >
              {/* Pebble Stone Inner Core */}
              <View
                style={[
                  styles.pebbleCore,
                  {
                    backgroundColor: isOpen
                      ? activeOption
                        ? `${activeOption.color}25`
                        : `${Palette.pine400}22`
                      : `${restingColor}18`,
                  },
                ]}
              >
                <Feather
                  name={
                    isOpen ? (activeOption ? activeOption.icon : "x") : restingIcon
                  }
                  size={22}
                  color={
                    isOpen
                      ? activeOption
                        ? activeOption.color
                        : Palette.pine400
                      : restingColor
                  }
                />
              </View>

              {/* Glowing active indicator pip */}
              <View
                style={[
                  styles.activePip,
                  {
                    backgroundColor: isOpen
                      ? activeOption
                        ? activeOption.color
                        : Palette.pine400
                      : restingColor,
                  },
                ]}
              />
            </View>
          </Animated.View>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  // Full-width organic wave container anchored to the bottom edge
  waveContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  // Centered wrapper anchoring both the pebble trigger and the radial arc
  pebbleAnchorContainer: {
    width: PEBBLE_SIZE,
    height: PEBBLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  // Pivot anchor positioned exactly at the center of the Pebble (PEBBLE_SIZE/2, PEBBLE_SIZE/2)
  radialPivotAnchor: {
    position: "absolute",
    left: PEBBLE_SIZE / 2,
    top: PEBBLE_SIZE / 2,
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  // Semicircular shield with smooth rounded corners cradling the Pebble symmetrically
  semicircleShield: {
    position: "absolute",
    bottom: -(PEBBLE_SIZE / 2 + 8),
    left: -BACKDROP_RADIUS,
    width: BACKDROP_RADIUS * 2,
    height: BACKDROP_RADIUS + PEBBLE_SIZE / 2 + 8,
    borderTopLeftRadius: BACKDROP_RADIUS,
    borderTopRightRadius: BACKDROP_RADIUS,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  // Radial option slot centered at (0, 0) then translated by (opt.x, opt.y)
  radialItemSlot: {
    position: "absolute",
    left: -ITEM_SIZE / 2,
    top: -ITEM_SIZE / 2,
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  radialItemCircle: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  radialItemIdle: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  radialItemActive: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  // Floating label container: Centered horizontally on (0, 0), positioned 20pt above highest sector
  labelContainer: {
    position: "absolute",
    bottom: RADIAL_RADIUS + ITEM_SIZE / 2 + 20,
    left: -160,
    width: 320,
    alignItems: "center",
    justifyContent: "center",
  },
  activeLabelCapsule: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    gap: 7,
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  activeLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeLabelTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  activeLabelSub: {
    fontSize: 11,
    fontWeight: "500",
  },
  guidanceCapsule: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  guidanceText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  pebbleButton: {
    width: PEBBLE_SIZE,
    height: PEBBLE_SIZE,
    borderRadius: PEBBLE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  pebbleCore: {
    width: PEBBLE_SIZE - 12,
    height: PEBBLE_SIZE - 12,
    borderRadius: (PEBBLE_SIZE - 12) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  activePip: {
    position: "absolute",
    bottom: 4,
    left: (PEBBLE_SIZE - 4) / 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
