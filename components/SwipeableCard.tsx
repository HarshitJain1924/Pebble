import React from "react";
import { StyleSheet, View,  Dimensions, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

type SwipeableCardProps = {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSnooze?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  swipeThreshold?: number;
};

const SCREEN_WIDTH = Dimensions.get("window").width;

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 200,
  mass: 0.8,
};

const SNAP_SPRING = {
  damping: 18,
  stiffness: 280,
  mass: 0.6,
};

export function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  onSnooze,
  onEdit,
  onDelete,
  swipeThreshold = 80,
}: SwipeableCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const hasLeftActions = !!(onSnooze || onEdit || onDelete);
  const buttonCount = (onSnooze ? 1 : 0) + (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
  const buttonWidth = 44;
  const buttonGap = 8;
  const snapOffset = hasLeftActions 
    ? -((buttonCount * buttonWidth) + ((buttonCount - 1) * buttonGap) + 24)
    : -80;

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  const triggerLightHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const triggerMediumHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      let val = startX.value + event.translationX;
      
      // Rubber-band resistance past snap offset
      if (hasLeftActions && val < snapOffset) {
        const diff = val - snapOffset;
        val = snapOffset + diff * 0.3;
      }
      
      translateX.value = val;

      // Haptic tick when crossing threshold
      const crossThreshold = event.translationX > swipeThreshold || event.translationX < -swipeThreshold;
      if (!hasTriggeredHaptic.value && crossThreshold) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerLightHaptic)();
      }
      if (hasTriggeredHaptic.value && Math.abs(event.translationX) < swipeThreshold * 0.6) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((event) => {
      if (event.translationX > swipeThreshold && onSwipeRight) {
        // Animate out to right, complete task, and snap back
        translateX.value = withSpring(SCREEN_WIDTH * 0.4, SNAP_SPRING, () => {
          runOnJS(triggerMediumHaptic)();
          runOnJS(onSwipeRight)();
          translateX.value = withTiming(0, { duration: 250 });
        });
      } else if (hasLeftActions && event.translationX < -35) {
        // Snap open to action buttons row
        translateX.value = withSpring(snapOffset, SPRING_CONFIG);
      } else if (!hasLeftActions && event.translationX < -swipeThreshold && onSwipeLeft) {
        // Direct delete/swipe-left action
        translateX.value = withSpring(-SCREEN_WIDTH * 0.4, SNAP_SPRING, () => {
          runOnJS(triggerMediumHaptic)();
          runOnJS(onSwipeLeft)();
          translateX.value = withTiming(0, { duration: 250 });
        });
      } else {
        // Snap closed
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
      hasTriggeredHaptic.value = false;
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      if (translateX.value !== 0) {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const composedGesture = Gesture.Exclusive(gesture, tapGesture);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rightBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, 40, swipeThreshold],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [0, swipeThreshold],
      [0.8, 1],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ scale }] };
  });

  const leftBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-swipeThreshold, -40, 0],
      [1, 0.4, 0],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [-swipeThreshold, 0],
      [1, 0.8],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <View style={styles.container}>
      {/* Gesture indicator backgrounds */}
      <View style={styles.backgroundContainer}>
        {/* Swipe Right (Complete) */}
        <Animated.View
          style={[
            styles.rightBg,
            {
              backgroundColor: colors.success + "15",
              borderColor: colors.success + "44",
            },
            rightBgStyle,
          ]}
        >
          <Feather name="check-circle" size={18} color={colors.success} />
          <Text style={[styles.bgText, { color: colors.success }]}>Complete</Text>
        </Animated.View>

        {/* Swipe Left (Delete or custom action buttons row) */}
        {hasLeftActions ? (
          <View style={styles.leftActionsRow}>
            {onSnooze && (
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  translateX.value = withSpring(0, SPRING_CONFIG);
                  onSnooze();
                }}
                style={[styles.actionButton, { backgroundColor: "#F59E0B" }]}
              >
                <Feather name="clock" size={16} color="#FFFFFF" />
              </Pressable>
            )}
            {onEdit && (
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  translateX.value = withSpring(0, SPRING_CONFIG);
                  onEdit();
                }}
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
              >
                <Feather name="edit-2" size={16} color="#FFFFFF" />
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  translateX.value = withSpring(0, SPRING_CONFIG);
                  onDelete();
                }}
                style={[styles.actionButton, { backgroundColor: colors.error }]}
              >
                <Feather name="trash-2" size={16} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        ) : (
          onSwipeLeft && (
            <Animated.View
              style={[
                styles.leftBg,
                {
                  backgroundColor: colors.error + "15",
                  borderColor: colors.error + "44",
                },
                leftBgStyle,
              ]}
            >
              <Text style={[styles.bgText, { color: colors.error }]}>Delete</Text>
              <Feather name="trash-2" size={18} color={colors.error} />
            </Animated.View>
          )
        )}
      </View>

      {/* Interactive foreground view */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={cardStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
  },
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 20,
    overflow: "hidden",
  },
  rightBg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    gap: 8,
    height: "100%",
    borderWidth: 1,
    borderRadius: 20,
  },
  leftBg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 20,
    gap: 8,
    height: "100%",
    borderWidth: 1,
    borderRadius: 20,
  },
  bgText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  leftActionsRow: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
});
