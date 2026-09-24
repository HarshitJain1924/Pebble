import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette, type ThemeColors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Colors } from "@/shared/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Radial Configuration
const RADIAL_RADIUS = 108; // Distance from pebble center to option centers
const DEADZONE_RADIUS = 28; // Center deadzone where release cancels
const PEBBLE_SIZE = 56;

export interface RadialNavOption {
  key: string;
  name: string;
  label: string;
  sublabel: string;
  icon: keyof typeof Feather.glyphMap;
  angleDeg: number; // 0 = right, 90 = top, 180 = left
  color: string;
}

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
 * Animated individual radial option node
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

    // Smooth transform blooming outward from center (0,0) to target (x,y)
    const animatedStyle = useAnimatedStyle(() => {
      const p = dialProgress.value;
      const transX = option.x * p;
      const transY = option.y * p;
      const scale = interpolate(p, [0, 0.4, 1], [0.1, 0.6, 1]);
      const opacity = interpolate(p, [0, 0.25, 1], [0, 0.5, 1]);

      return {
        opacity,
        transform: [
          { translateX: transX },
          { translateY: transY },
          { scale: scale * (isSelected ? 1.22 : 1) },
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
                      ? "rgba(30, 41, 59, 0.95)"
                      : "rgba(255, 255, 255, 0.98)",
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
            size={isSelected ? 22 : 18}
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
  descriptors,
  onQuickAddPress,
}) => {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const theme = Colors[colorScheme ?? "dark"];

  // Active route
  const activeRoute = state.routes[state.index];
  const activeRouteName = activeRoute?.name ?? "index";

  // Reanimated shared values
  const dialProgress = useSharedValue(0);
  const pebbleScale = useSharedValue(1);

  // Interaction State
  const [isOpen, setIsOpen] = useState(false);
  const [activeSector, setActiveSector] = useState<number>(-1);
  const [isStickyOpen, setIsStickyOpen] = useState(false);

  const activeSectorRef = useRef<number>(-1);
  const isOpenRef = useRef<boolean>(false);
  const isStickyOpenRef = useRef<boolean>(false);
  const touchStartTimestamp = useRef<number>(0);
  const hasDragged = useRef<boolean>(false);

  // Compute option coordinates
  const optionCoords = useMemo(() => {
    return RADIAL_NAV_OPTIONS.map((opt) => {
      const rad = (opt.angleDeg * Math.PI) / 180;
      const x = Math.round(RADIAL_RADIUS * Math.cos(rad));
      const y = Math.round(-RADIAL_RADIUS * Math.sin(rad));
      return { ...opt, x, y };
    });
  }, []);

  // Nearest neighbor sector resolution
  const resolveNearestSector = useCallback((dx: number, dy: number): number => {
    const dist = Math.hypot(dx, dy);
    if (dist < DEADZONE_RADIUS) {
      return -1; // Center deadzone = cancel
    }

    // Angle in degrees from thumb vector (0 = right, 90 = up, 180 = left)
    let angleDeg = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (angleDeg < -35 && angleDeg > -145) {
      return -1; // Dragging down towards screen bottom = cancel
    }
    if (angleDeg < 0) {
      angleDeg = angleDeg > -90 ? 0 : 180;
    }

    // Find option with minimal angular deviation
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

  // Update active sector with haptic feedback
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
        damping: 15,
        stiffness: 190,
        mass: 0.7,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [dialProgress],
  );

  // Close dial
  const closeDial = useCallback(() => {
    isOpenRef.current = false;
    isStickyOpenRef.current = false;
    setIsOpen(false);
    setIsStickyOpen(false);
    updateActiveSector(-1);
    dialProgress.value = withTiming(0, {
      duration: 160,
      easing: Easing.out(Easing.quad),
    });
    pebbleScale.value = withSpring(1, { damping: 15 });
  }, [dialProgress, pebbleScale, updateActiveSector]);

  // Commit selection and execute navigation
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

      // Navigate to destination
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

  // PanResponder with distinct Tap vs Drag recognition
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only take over move gesture if user moved > 6px
          return Math.hypot(gestureState.dx, gestureState.dy) > 6;
        },
        onPanResponderGrant: () => {
          touchStartTimestamp.current = Date.now();
          hasDragged.current = false;
          pebbleScale.value = withSpring(0.9, { damping: 14 });

          // If already in sticky open mode, touch on pebble toggles it closed
          if (isStickyOpenRef.current) {
            closeDial();
            return;
          }

          // Open dial in drag mode
          openDial(false);
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isOpenRef.current) return;
          const dist = Math.hypot(gestureState.dx, gestureState.dy);
          if (dist > 10) {
            hasDragged.current = true;
          }
          const sector = resolveNearestSector(gestureState.dx, gestureState.dy);
          updateActiveSector(sector);
        },
        onPanResponderRelease: (_, gestureState) => {
          const duration = Date.now() - touchStartTimestamp.current;
          const dist = Math.hypot(gestureState.dx, gestureState.dy);

          // Quick tap (< 200ms and < 10px movement):
          // Switch to sticky mode so the dial stays comfortably open to tap options
          if (duration < 200 && dist < 10 && !hasDragged.current) {
            isStickyOpenRef.current = true;
            setIsStickyOpen(true);
            pebbleScale.value = withSpring(1, { damping: 14 });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            return;
          }

          // Continuous GTA Drag Release:
          // Commit whatever sector thumb is resting on
          const finalSector = resolveNearestSector(gestureState.dx, gestureState.dy);
          if (finalSector >= 0) {
            commitSelection(finalSector);
          } else {
            closeDial();
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

  // Animated styles
  const dialBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: dialProgress.value,
      transform: [
        {
          scale: interpolate(dialProgress.value, [0, 1], [0.82, 1]),
        },
      ],
    };
  });

  const pebbleAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pebbleScale.value }],
    };
  });

  // Active option info
  const activeOption = activeSector >= 0 ? RADIAL_NAV_OPTIONS[activeSector] : null;

  // Resting visual
  const currentRouteOption = useMemo(() => {
    return RADIAL_NAV_OPTIONS.find((o) => o.name === activeRouteName);
  }, [activeRouteName]);

  const restingIcon = currentRouteOption?.icon ?? "disc";
  const restingColor = currentRouteOption?.color ?? Palette.pine400;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlayContainer,
        { paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      {/* Fullscreen Touch Dismiss Layer when in Sticky Open Mode */}
      {isOpen && isStickyOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeDial}
          accessibilityLabel="Dismiss navigation dial"
        />
      )}

      {/* Semicircular Radial Dial Backdrop & Items */}
      <Animated.View
        pointerEvents={isOpen ? "box-none" : "none"}
        style={[styles.radialAnchor, dialBackdropStyle]}
      >
        {/* Soft Ambient Semicircular Fan Shield */}
        <View
          style={[
            styles.semicircleShield,
            {
              backgroundColor: isDark
                ? "rgba(15, 23, 42, 0.88)"
                : "rgba(255, 255, 255, 0.94)",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.12)"
                : "rgba(0, 0, 0, 0.08)",
            },
          ]}
        >
          {Platform.OS === "ios" && (
            <BlurView
              intensity={isDark ? 35 : 55}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>

        {/* Floating Active Option Label Capsule */}
        {activeOption ? (
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
        ) : isOpen ? (
          <View style={styles.guidanceCapsule}>
            <Text style={[styles.guidanceText, { color: theme.textMuted }]}>
              {isStickyOpen
                ? "Tap any option or tap pebble to close"
                : "Drag into an option · Release to launch"}
            </Text>
          </View>
        ) : null}

        {/* 5 Animated Radial Sector Nodes */}
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
      <View style={styles.pebbleAnchor}>
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
                name={isOpen ? (activeOption ? activeOption.icon : "x") : restingIcon}
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
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  pebbleAnchor: {
    alignItems: "center",
    justifyContent: "center",
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
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  radialAnchor: {
    position: "absolute",
    bottom: PEBBLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    width: RADIAL_RADIUS * 2 + 70,
    height: RADIAL_RADIUS + 70,
  },
  semicircleShield: {
    position: "absolute",
    bottom: 0,
    width: RADIAL_RADIUS * 2 + 60,
    height: RADIAL_RADIUS + 40,
    borderTopLeftRadius: RADIAL_RADIUS + 30,
    borderTopRightRadius: RADIAL_RADIUS + 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  radialItemSlot: {
    position: "absolute",
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  radialItemCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    width: 50,
    height: 50,
    borderRadius: 25,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  activeLabelCapsule: {
    position: "absolute",
    top: -26,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  activeLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeLabelTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  activeLabelSub: {
    fontSize: 11,
    fontWeight: "500",
  },
  guidanceCapsule: {
    position: "absolute",
    top: -16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  guidanceText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
