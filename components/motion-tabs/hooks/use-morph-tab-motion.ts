import { useEffect } from "react";
import {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ViewStyle } from "react-native";
import type { IPalette } from "../typings/motion-tabs";
import { DURATION, EASING, ICON_BOX, LABEL_PAD } from "../utils/constants";

function useMorphTabMotion<
  T extends boolean,
  C extends IPalette,
  L extends number,
>(active: T, colors: C, labelW: L) {
  const progress = useSharedValue<number>(active ? 1 : 0);
  const held = useSharedValue<number>(0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: DURATION,
      easing: EASING,
    });
  }, [active, progress]);

  const containerStyle = useAnimatedStyle<
    Pick<ViewStyle, "width" | "backgroundColor">
  >(() => {
    const p = progress.value;
    const pad = labelW > 0 ? LABEL_PAD : 0;
    return {
      width: ICON_BOX + p * (labelW + pad),
      backgroundColor: interpolateColor(
        p,
        [0, 1],
        ["rgba(0,0,0,0)", colors.accent],
      ),
    };
  });

  const holdCircleStyle = useAnimatedStyle<
    Pick<ViewStyle, "opacity" | "transform">
  >(() => ({
    opacity: interpolate(held.value, [0, 1], [0, active ? 0.35 : 1]),
    transform: [{ scale: interpolate(held.value, [0, 1], [0.68, 1]) }],
  }));

  const labelStyle = useAnimatedStyle<
    Pick<ViewStyle, "width" | "opacity" | "transform">
  >(() => {
    const pad = labelW > 0 ? LABEL_PAD : 0;
    return {
      width: progress.value * (labelW + pad),
      opacity: interpolate(progress.value, [0, 0.3, 1], [0, 0, 1]),
      transform: [{ translateX: -8 * (1 - progress.value) }],
    };
  });

  const iconActiveStyle = useAnimatedStyle<Pick<ViewStyle, "opacity">>(() => ({
    opacity: progress.value,
  }));
  const iconInactiveStyle = useAnimatedStyle<Pick<ViewStyle, "opacity">>(
    () => ({
      opacity: 1 - progress.value,
    }),
  );

  const iconSqueezeStyle = useAnimatedStyle<Pick<ViewStyle, "transform">>(
    () => {
      const p = held.value;
      return {
        transform: [
          { translateY: interpolate(p, [0, 1], [0, 1.5]) },
          { scaleX: interpolate(p, [0, 1], [1, 1.08]) },
          {
            scaleY: interpolate(p, [0, 1], [1, 0.76], Extrapolation.CLAMP),
          },
        ],
      };
    },
  );

  const hold = () => {
    held.value = withSpring(1, { damping: 12, stiffness: 220 });
  };
  const release = () => {
    held.value = withSpring(0, { damping: 15, stiffness: 180 });
  };

  return {
    containerStyle,
    hold,
    holdCircleStyle,
    iconActiveStyle,
    iconInactiveStyle,
    iconSqueezeStyle,
    labelStyle,
    release,
  };
}

export { useMorphTabMotion };

