import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { DURATION, EASING, PANEL_SLIDE } from "../utils/constants";

function usePanelMotion<T extends boolean, D extends number>(
  active: T,
  direction: D,
) {
  const progress = useSharedValue<number>(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming<number>(active ? 1 : 0, {
      duration: Math.max(100, DURATION - 80),
      easing: EASING,
    });
  }, [active, progress]);

  const style = useAnimatedStyle<
    Pick<ViewStyle, "opacity" | "transform">
  >(() => {
    const p = progress.value;
    const travel = direction === 0 ? 0 : direction * PANEL_SLIDE;
    const translateX = active ? travel * (1 - p) : -travel * (1 - p);
    const scale = 0.97 + 0.03 * p;
    return {
      opacity: p,
      transform: [{ translateX }, { scale }],
    };
  }, [active, direction]);

  return { style };
}

export { usePanelMotion };

