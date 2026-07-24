import React from "react";
import { StyleSheet, View } from "react-native";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { AnimatedMeshLayer } from "./AmbientBackground";

type ScreenSwipeWrapperProps = {
  children: React.ReactNode;
  prevRoute?: string;
  nextRoute?: string;
  hideMesh?: boolean;
};

export function ScreenSwipeWrapper({
  children,
  prevRoute,
  nextRoute,
  hideMesh = false,
}: ScreenSwipeWrapperProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Dynamic hardware-accelerated ambient backdrop mesh */}
      {!hideMesh && <AnimatedMeshLayer />}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
