import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
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
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette, Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { DockCompanionMascot } from "@/shared/components/mascot/DockCompanionMascot";

const DOCK_SHORELINE_DARK = require("@/assets/images/dock/dock_shoreline_dark.png");
const DOCK_SHORELINE_LIGHT = require("@/assets/images/dock/dock_shoreline_light.png");

// Geometry constants: Strictly measured from Pebble center (0, 0)
export const RADIAL_RADIUS = 100; // Distance from Pebble center to item center
export const ITEM_SIZE = 48; // Uniform diameter for all 5 sectors
export const PEBBLE_SIZE = 54; // Diameter of central resting trigger pebble
export const DEADZONE_RADIUS = 26; // Distance under which touch is neutral/cancel
export const BACKDROP_RADIUS = 138; // Radius of semicircular halo shield

export const MASCOT_DOCK_HEIGHT = 82;
// Breathing room between last content card and dock companion/Pebble button
export const PEBBLE_CLEARANCE_BUFFER = 18;

/**
 * Single source of truth for bottom content clearance across all tab screens.
 * Ensures the last interactive card rests cleanly above both the floating Pebble button
 * and the dock companion mascot without any arbitrary or double-counted spacing.
 *
 * @param safeAreaBottom - insets.bottom from useSafeAreaInsets()
 */
export const getPebbleDockClearance = (safeAreaBottom: number): number => {
  const effectiveBottomInset = Math.max(safeAreaBottom, 16);
  const heroDockHeight = Math.max(PEBBLE_SIZE, MASCOT_DOCK_HEIGHT);
  return heroDockHeight + PEBBLE_CLEARANCE_BUFFER + effectiveBottomInset;
};

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
 * Environmental shoreline landscape backdrop across the bottom dock.
 * Bookends the top PebbleCircadianHeader to complete the zen nature terrarium illusion.
 *
 * NOTE: This is a purely visual, absolute background layer with pointerEvents="none".
 * It has a controlled height based on screen width and does NOT create layout space
 * or incorporate safe-area insets into its artwork dimensions.
 */
export const ShorelineSupportBackdrop: React.FC<{
  screenWidth: number;
  isDark: boolean;
  backgroundColor: string;
  style?: any;
}> = React.memo(({ screenWidth, isDark, backgroundColor, style }) => {
  // Controlled height based on screen width (preserving visual proportions without arbitrary inflation)
  const DOCK_ARTWORK_HEIGHT = Math.round(
    Math.min(220, Math.max(170, screenWidth * 0.46))
  );
  const source = isDark ? DOCK_SHORELINE_DARK : DOCK_SHORELINE_LIGHT;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.shorelineBackdropContainer,
        {
          width: screenWidth,
          height: DOCK_ARTWORK_HEIGHT,
        },
        style,
      ]}
    >
      {/* 1. High-Res Shoreline Scenic Artwork */}
      <Image
        source={source}
        style={[
          StyleSheet.absoluteFillObject,
          {
            width: screenWidth,
            height: DOCK_ARTWORK_HEIGHT,
          },
        ]}
        resizeMode="cover"
        accessibilityLabel={`Pebble ${isDark ? "night" : "morning"} dock shoreline artwork`}
      />

      {/* 2. Atmospheric Gradient Fade smoothly melting the artwork into the app background */}
      <Svg
        style={StyleSheet.absoluteFill}
        width={screenWidth}
        height={DOCK_ARTWORK_HEIGHT}
        pointerEvents="none"
      >
        <Defs>
          <SvgLinearGradient id="dockAtmosphericFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={backgroundColor} stopOpacity="1" />
            <Stop offset="22%" stopColor={backgroundColor} stopOpacity="0.88" />
            <Stop offset="45%" stopColor={backgroundColor} stopOpacity="0.45" />
            <Stop offset="70%" stopColor={backgroundColor} stopOpacity="0.10" />
            <Stop offset="88%" stopColor={backgroundColor} stopOpacity="0" />
            <Stop offset="100%" stopColor={backgroundColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width={screenWidth}
          height={DOCK_ARTWORK_HEIGHT}
          fill="url(#dockAtmosphericFade)"
        />
      </Svg>
    </View>
  );
});

ShorelineSupportBackdrop.displayName = "ShorelineSupportBackdrop";

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
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [isStickyOpen, setIsStickyOpen] = useState(false);

  const selectedSectorClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSectorRef = useRef<number>(-1);
  const isOpenRef = useRef<boolean>(false);
  const isStickyOpenRef = useRef<boolean>(false);
  const wasOpenOnGrant = useRef<boolean>(false);
  const touchStartTimestamp = useRef<number>(0);
  const hasDragged = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (selectedSectorClearTimer.current) {
        clearTimeout(selectedSectorClearTimer.current);
      }
    };
  }, []);

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
      if (selectedSectorClearTimer.current) {
        clearTimeout(selectedSectorClearTimer.current);
        selectedSectorClearTimer.current = null;
      }
      setSelectedSector(null);
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

      if (selectedSectorClearTimer.current) {
        clearTimeout(selectedSectorClearTimer.current);
      }
      setSelectedSector(sectorIndex);
      selectedSectorClearTimer.current = setTimeout(() => {
        setSelectedSector(null);
        selectedSectorClearTimer.current = null;
      }, 600);

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
      {/* 1. Fullscreen touch dismiss scrim when opened */}
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

      {/* 3. Navigation Controls Layer (Pebble + Radial dial) */}
      <View
        pointerEvents="box-none"
        style={[styles.overlayContainer, { paddingBottom: bottomInset }]}
      >
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

        {/* Cairn companion on the left side of dock */}
        <DockCompanionMascot
          isDialOpen={isOpen}
          activeSector={activeSector}
          selectedSector={selectedSector}
          bottomOffset={bottomInset}
        />
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
  // Full-width shoreline landscape backdrop anchored to bottom (purely visual, zero layout)
  shorelineBackdropContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: 0,
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
