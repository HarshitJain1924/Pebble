import React, { useCallback, useEffect, useRef } from "react";
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
  type: "task" | "habit" | "checklist" | "focus";
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

  // The animation lifecycle must be independent of callback identity. Parent
  // re-renders (dashboard reloads after a completion, another projectile being
  // added/removed) recreate the inline onComplete prop, so the effect cannot
  // depend on it — otherwise every re-render restarts the animation and can
  // fire the completion callback multiple times. Keep the latest handler in a
  // ref so the animation always finishes with the CURRENT handler.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const callOnComplete = useCallback(() => {
    onCompleteRef.current();
  }, []);

  // Animate exactly once per mount: `progress` (a shared value) and
  // `callOnComplete` (stable useCallback) never change identity, so parent
  // re-renders cannot restart or duplicate the animation. The `disposed` guard
  // prevents the completion callback from firing after unmount.
  useEffect(() => {
    let disposed = false;
    progress.value = withTiming(1, { duration: 650 }, (finished) => {
      if (finished && !disposed) {
        runOnJS(callOnComplete)();
      }
    });
    return () => {
      disposed = true;
    };
  }, [progress, callOnComplete]);

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
      {type === "habit"
        ? "🟡"
        : type === "checklist"
          ? "🔵"
          : type === "focus"
            ? "🟢"
            : "🟣"}
    </Animated.Text>
  );
};
