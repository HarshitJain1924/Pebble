import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle, StyleSheet } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

type Props = Omit<PressableProps, "children"> & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
};

export const PressableScale: React.FC<Props> = ({
  children,
  onPressIn,
  onPressOut,
  onPress,
  style,
  contentStyle,
  scaleTo = 0.97,
  haptic = false,
  hitSlop,
  accessibilityRole,
  accessibilityState,
  ...rest
}) => {
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: any) => {
    scale.value = withSpring(scaleTo, { damping: 12, stiffness: 200 });
    if (haptic) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } catch {}
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    onPressOut?.(e);
  };

  const resolvedRole = accessibilityRole ?? (onPress ? "button" : undefined);
  const resolvedState =
    rest.disabled !== undefined || accessibilityState
      ? { disabled: Boolean(rest.disabled), ...accessibilityState }
      : undefined;

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      // Provides an expanded baseline hit area; small sub-28pt visual elements must specify explicit hitSlop or min dimensions to reach 44pt.
      hitSlop={hitSlop ?? 8}
      accessibilityRole={resolvedRole}
      accessibilityState={resolvedState}
      {...rest}
      style={style}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.flatten(contentStyle), aStyle]}>{children}</Animated.View>
    </Pressable>
  );
};

export default PressableScale;
