import React, { useEffect } from "react";
import { StyleSheet, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AnimatedCheckboxProps = {
  checked: boolean;
  onToggle?: (event?: any) => void;
  size?: number;
};

export const AnimatedCheckbox: React.FC<AnimatedCheckboxProps> = ({
  checked,
  onToggle,
  size = 26,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];

  const scale = useSharedValue(1);
  const checkedScale = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    checkedScale.value = withSpring(checked ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [checked, checkedScale]);

  const toggleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const checkMarkStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: checkedScale.value }],
      opacity: checkedScale.value,
    };
  });

  const handlePressIn = () => {
    if (onToggle) {
      scale.value = withSpring(0.85, { damping: 10, stiffness: 200 });
    }
  };

  const handlePressOut = () => {
    if (onToggle) {
      scale.value = withSpring(1, { damping: 10, stiffness: 200 });
    }
  };

  const handlePress = (event: any) => {
    if (onToggle) {
      onToggle(event);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onToggle}
    >
      <Animated.View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: checked ? theme.primary : theme.textMuted,
            backgroundColor: checked ? theme.primary : "transparent",
          },
          toggleStyle,
        ]}
      >
        <Animated.View style={[styles.checkmarkWrap, checkMarkStyle]}>
          <Ionicons name="checkmark" size={size * 0.6} color="#ffffff" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  checkmarkWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
