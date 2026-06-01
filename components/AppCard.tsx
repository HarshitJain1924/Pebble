import React from "react";
import { Platform, TouchableOpacity, StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Shadows } from "@/constants/shadows";
import { Spacing } from "@/constants/spacing";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AppCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  interactive?: boolean;
};

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export const AppCard: React.FC<AppCardProps> = ({
  children,
  style,
  onPress,
  interactive = !!onPress,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (interactive) {
      scale.value = withSpring(0.97, { damping: 15, stiffness: 200 });
    }
  };

  const handlePressOut = () => {
    if (interactive) {
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    }
  };

  const dynamicShadow = colorScheme === "light" ? Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
    },
    android: {
      elevation: 3,
    },
    web: {
      boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.04), 0px 1px 2px rgba(0, 0, 0, 0.02)",
    },
    default: {},
  }) : Shadows.soft;

  if (!interactive) {
    return (
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colorScheme === "light" ? "#FFFFFF" : "rgba(24, 24, 27, 0.72)",
            borderColor: colorScheme === "light" ? theme.border : "rgba(255, 255, 255, 0.065)",
          },
          dynamicShadow,
          animatedStyle,
          style,
        ]}
      >
        {children}
      </Animated.View>
    );
  }

  return (
    <AnimatedTouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      delayPressIn={80}
      activeOpacity={1}
      style={[
        styles.card,
        {
          backgroundColor: colorScheme === "light" ? "#FFFFFF" : "rgba(24, 24, 27, 0.72)",
          borderColor: colorScheme === "light" ? theme.border : "rgba(255, 255, 255, 0.065)",
        },
        dynamicShadow,
        animatedStyle,
        style,
      ]}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
  },
});
