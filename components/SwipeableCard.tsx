import React, { useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  Text,
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type SwipeableCardProps = {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  swipeThreshold?: number;
};

export function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  swipeThreshold = 75,
}: SwipeableCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Set responder if drag is horizontal
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 8;
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > swipeThreshold) {
          // Swipe right action
          Animated.spring(pan, {
            toValue: { x: Dimensions.get("window").width, y: 0 },
            tension: 40,
            friction: 9,
            useNativeDriver: false,
          }).start(() => {
            onSwipeRight?.();
            // Reset position immediately
            pan.setValue({ x: 0, y: 0 });
          });
        } else if (gestureState.dx < -swipeThreshold) {
          // Swipe left action
          Animated.spring(pan, {
            toValue: { x: -Dimensions.get("window").width, y: 0 },
            tension: 40,
            friction: 9,
            useNativeDriver: false,
          }).start(() => {
            onSwipeLeft?.();
            // Reset position immediately
            pan.setValue({ x: 0, y: 0 });
          });
        } else {
          // Reset card back to center
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            tension: 50,
            friction: 7,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const rightBgOpacity = pan.x.interpolate({
    inputRange: [0, 60],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const leftBgOpacity = pan.x.interpolate({
    inputRange: [-60, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      {/* Gesture indicator backgrounds */}
      <View style={styles.backgroundContainer}>
        {/* Swipe Right (Complete Check) */}
        <Animated.View
          style={[
            styles.rightBg,
            {
              backgroundColor: colors.success + "15",
              borderColor: colors.success + "44",
              opacity: rightBgOpacity,
            },
          ]}
        >
          <Feather name="check-circle" size={18} color={colors.success} />
          <Text style={[styles.bgText, { color: colors.success }]}>Complete</Text>
        </Animated.View>

        {/* Swipe Left (Trash / Delete) */}
        <Animated.View
          style={[
            styles.leftBg,
            {
              backgroundColor: colors.error + "15",
              borderColor: colors.error + "44",
              opacity: leftBgOpacity,
            },
          ]}
        >
          <Text style={[styles.bgText, { color: colors.error }]}>Delete</Text>
          <Feather name="trash-2" size={18} color={colors.error} />
        </Animated.View>
      </View>

      {/* Interactive foreground view */}
      <Animated.View
        style={{
          transform: [{ translateX: pan.x }],
        }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
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
});
