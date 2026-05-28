import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type ProgressBarProps = {
  progress: number; // between 0 and 1
  height?: number;
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = 8,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];

  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withSpring(Math.min(Math.max(progress, 0), 1), {
      damping: 18,
      stiffness: 120,
    });
  }, [progress, width]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: `${width.value * 100}%`,
    };
  });

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: theme.cardLight,
          height,
          borderRadius: height / 2,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: theme.primary,
            height,
            borderRadius: height / 2,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    width: 0,
  },
});
