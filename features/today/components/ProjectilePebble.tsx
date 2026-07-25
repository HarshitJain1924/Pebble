import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

export interface ProjectilePebbleProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  onComplete: () => void;
  type: "task" | "habit";
}

export const ProjectilePebble: React.FC<ProjectilePebbleProps> = ({
  startX,
  startY,
  endX,
  endY,
  onComplete,
  type,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 650 }, (finished) => {
      if (finished) {
        runOnJS(onComplete)();
      }
    });
  }, [progress, onComplete]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = startX + (endX - startX) * t;
    // Parabolic arc curve
    const y = startY + (endY - startY) * t - 150 * 4 * t * (1 - t);
    const scale = 1 - 0.4 * t;
    const rotate = `${t * 360}deg`;

    return {
      position: "absolute",
      left: x - 12,
      top: y - 12,
      zIndex: 99999,
      transform: [{ scale }, { rotate }],
      opacity: 1 - t * t * t,
    };
  });

  return (
    <Animated.Text style={[animatedStyle, { fontSize: 24 }]}>
      {type === "habit" ? "🟡" : "🟣"}
    </Animated.Text>
  );
};
