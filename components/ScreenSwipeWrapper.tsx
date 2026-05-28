import React, { useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedMeshLayer } from "./AmbientBackground";

type ScreenSwipeWrapperProps = {
  children: React.ReactNode;
  prevRoute?: string;
  nextRoute?: string;
};

export function ScreenSwipeWrapper({
  children,
  prevRoute,
  nextRoute,
}: ScreenSwipeWrapperProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Set pan responder only if horizontal drag is distinct and intentional
        const isHorizontalDrag =
          Math.abs(gestureState.dx) > 35 && Math.abs(gestureState.dy) < 18;
        return isHorizontalDrag;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const threshold = 60;
        if (gestureState.dx > threshold) {
          // Dragged left-to-right (Swipe Right) -> Navigate to previous tab
          if (prevRoute) {
            router.push(prevRoute as any);
          }
        } else if (gestureState.dx < -threshold) {
          // Dragged right-to-left (Swipe Left) -> Navigate to next tab
          if (nextRoute) {
            router.push(nextRoute as any);
          }
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      {/* Dynamic hardware-accelerated ambient backdrop mesh */}
      <AnimatedMeshLayer />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
