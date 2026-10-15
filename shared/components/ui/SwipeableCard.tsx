import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { Radius } from "@/shared/constants/radii";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
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
  disabled?: boolean;
};

/** Snap-open / snap-closed: calm, settles without a wobble back past the edge. */
const SPRING_CONFIG = {
  damping: 22,
  stiffness: 200,
  mass: 0.8,
};

/** Committed action: quicker, so the row clears out right as the action lands. */
const COMMIT_SPRING = {
  damping: 18,
  stiffness: 280,
  mass: 0.6,
};

/** How far a committed row travels before it is considered out of the way. */
const EXIT_TRAVEL = 104;

/**
 * A committed row waits briefly before drifting home. In a list the action usually
 * unmounts the row (an exiting fade), so nothing moves; when the row survives — a
 * habit toggled, a checklist swept — it returns to rest instead of staying open.
 */
const RETURN_DELAY = 240;

/**
 * Past the engage point the row is elastic rather than free: dragging further pushes
 * back at a fraction of the finger's travel, so an over-swipe reads as "that's the
 * end of the track" instead of the row sliding loose off the card.
 */
const OVERDRAG_RESISTANCE = 0.3;

/**
 * A deliberate flick commits the action without the row having to be dragged all the
 * way to the engage point. `FLICK_MIN_TRAVEL` keeps a fast scroll from qualifying.
 */
const FLICK_VELOCITY = 550;
const FLICK_MIN_TRAVEL = 28;

/**
 * Vertical travel that hands the gesture back to the list. Without this a scroll that
 * drifts sideways can be captured by the row, which makes the list feel stuck.
 */
const SCROLL_FAIL_Y = 14;

/**
 * Horizontal travel before the row claims the gesture. Higher than the vertical fail
 * offset so an intentional row swipe still wins over the list.
 */
const SWIPE_ACTIVE_X = 12;

/**
 * Vertical inset of the reveal wash. Rows sit inside a 2pt vertical margin (the row
 * itself owns that margin), so the wash is inset to match instead of bleeding above
 * and below the card.
 */
const REVEAL_VERTICAL_INSET = 2;

export function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  onSnooze,
  onEdit,
  onDelete,
  swipeThreshold = 80,
  disabled = false,
}: SwipeableCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const reducedMotion = useReducedMotion();

  const hasLeftActions = !!(onSnooze || onEdit || onDelete);
  const buttonCount = (onSnooze ? 1 : 0) + (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
  const buttonWidth = 44;
  const buttonGap = 8;
  const snapOffset = hasLeftActions
    ? -((buttonCount * buttonWidth) + ((buttonCount - 1) * buttonGap) + 24)
    : -swipeThreshold;

  // Where the row has travelled far enough to mean "do it". A row with action buttons
  // engages on its reveal edge; a row with a direct action engages on the threshold.
  const rightEngage = swipeThreshold;
  const leftEngage = hasLeftActions ? snapOffset : -swipeThreshold;

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  const triggerLightHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const triggerMediumHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const triggerSuccessHaptic = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-SWIPE_ACTIVE_X, SWIPE_ACTIVE_X])
    .failOffsetY([-SCROLL_FAIL_Y, SCROLL_FAIL_Y])
    .onStart(() => {
      if (disabled) return;
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      if (disabled) return;
      const raw = startX.value + event.translationX;

      // Elastic on both edges, so an over-drag always pushes back rather than sliding
      // free — this is the whole difference between "stuck to my finger" and "detached".
      let val = raw;
      if (raw > rightEngage) {
        val = rightEngage + (raw - rightEngage) * OVERDRAG_RESISTANCE;
      } else if (raw < leftEngage) {
        val = leftEngage + (raw - leftEngage) * OVERDRAG_RESISTANCE;
      }

      translateX.value = val;

      // Notch the haptic once the row reaches an engage point, and re-arm when it is
      // pulled back — measured from the row's position, not the frame's translation, so
      // it stays correct when the row starts already open. The boundary is inclusive so
      // the notch lands exactly where the reveal reads as fully engaged.
      const pastEngage = val >= rightEngage || val <= leftEngage;
      const backInside = val < rightEngage * 0.6 && val > leftEngage * 0.6;
      if (!hasTriggeredHaptic.value && pastEngage) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerLightHaptic)();
      } else if (hasTriggeredHaptic.value && backInside) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((event) => {
      if (disabled) return;
      hasTriggeredHaptic.value = false;

      const position = translateX.value;
      const velocity = event.velocityX;
      const flickedRight = velocity > FLICK_VELOCITY;
      const flickedLeft = velocity < -FLICK_VELOCITY;

      // Inclusive bounds, so a row resting exactly on its reveal edge (an open action
      // row, or a drag let go right at the threshold) holds its state instead of
      // collapsing because the finger travelled a pixel back.
      const rightCommitted =
        position >= rightEngage || (flickedRight && position > FLICK_MIN_TRAVEL);
      const leftCommitted =
        position <= leftEngage || (flickedLeft && position < -FLICK_MIN_TRAVEL);

      // Complete: commit on release, then carry the row out of the way as confirmation.
      if (onSwipeRight && rightCommitted) {
        runOnJS(triggerSuccessHaptic)();
        runOnJS(onSwipeRight)();
        if (reducedMotion) {
          translateX.value = 0;
        } else {
          translateX.value = withSpring(EXIT_TRAVEL, COMMIT_SPRING, () => {
            translateX.value = withDelay(RETURN_DELAY, withSpring(0, SPRING_CONFIG));
          });
        }
        return;
      }

      // Revealed action buttons: settle open rather than firing anything yet.
      if (hasLeftActions) {
        if (reducedMotion) {
          translateX.value = leftCommitted ? snapOffset : 0;
        } else {
          translateX.value = withSpring(leftCommitted ? snapOffset : 0, {
            ...SPRING_CONFIG,
            velocity,
          });
        }
        return;
      }

      // Direct delete: commit on release and carry the row out.
      if (onSwipeLeft && leftCommitted) {
        runOnJS(triggerMediumHaptic)();
        runOnJS(onSwipeLeft)();
        if (reducedMotion) {
          translateX.value = 0;
        } else {
          translateX.value = withSpring(-EXIT_TRAVEL, COMMIT_SPRING, () => {
            translateX.value = withDelay(RETURN_DELAY, withSpring(0, SPRING_CONFIG));
          });
        }
        return;
      }

      // Snap closed, handing the finger's momentum to the spring so a reversal glides
      // back instead of restarting.
      translateX.value = reducedMotion
        ? 0
        : withSpring(0, { ...SPRING_CONFIG, velocity });
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (translateX.value !== 0) {
      translateX.value = withSpring(0, SPRING_CONFIG);
    }
  });

  const composedGesture = disabled
    ? tapGesture
    : Gesture.Exclusive(gesture, tapGesture);

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
                accessibilityRole="button"
                accessibilityLabel="Snooze"
                hitSlop={8}
                style={[styles.actionButton, { backgroundColor: Palette.amber500 }]}
              >
                <Feather name="clock" size={16} color={Palette.white} />
              </Pressable>
            )}
            {onEdit && (
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  translateX.value = withSpring(0, SPRING_CONFIG);
                  onEdit();
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit"
                hitSlop={8}
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
              >
                <Feather name="edit-2" size={16} color={Palette.white} />
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={() => {
                  triggerLightHaptic();
                  translateX.value = withSpring(0, SPRING_CONFIG);
                  onDelete();
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete"
                hitSlop={8}
                style={[styles.actionButton, { backgroundColor: colors.error }]}
              >
                <Feather name="trash-2" size={16} color={Palette.white} />
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
    position: "absolute",
    left: 0,
    right: 0,
    // Matches the row's own vertical margin so the wash never bleeds past the card.
    top: REVEAL_VERTICAL_INSET,
    bottom: REVEAL_VERTICAL_INSET,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // Matches the card's corner radius (ROW radius, not the larger modal radius) so the
    // wash follows the card's corners instead of peeking out past them.
    borderRadius: Radius.lg,
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
    borderRadius: Radius.lg,
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
    borderRadius: Radius.lg,
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
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 9,
    fontWeight: "800",
    color: Palette.white,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
});
