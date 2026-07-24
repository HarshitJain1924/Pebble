import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  withTiming,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { PebbleJar } from "./PebbleJar";

export interface InteractivePebbleJarProps {
  mode: "view" | "reward";
  totalPebbles?: number; // used in 'view' mode
  startCount?: number;   // used in 'reward' mode
  targetCount?: number;  // used in 'reward' mode
  onComplete?: () => void; // callback on reward animation end
  colors: any;
  colorScheme: string;
  monthlyTypes?: { task: number; habit: number; focus: number };
  fallingPebbleType?: "task" | "habit" | "focus";
  profileAvatar?: string;
}

const triggerMediumHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

const getFillPct = (pebbles: number) => {
  const ratio = pebbles / 100;
  return Math.max(0.02, Math.min(0.95, ratio));
};

export function InteractivePebbleJar({
  mode,
  totalPebbles = 0,
  startCount = 0,
  targetCount = 0,
  onComplete,
  colors,
  colorScheme,
  monthlyTypes,
  fallingPebbleType,
  profileAvatar,
}: InteractivePebbleJarProps) {
  // Determine starting and ending pebble counts
  const initialPebbles = mode === "reward" ? startCount : totalPebbles;
  const finalPebbles = mode === "reward" ? targetCount : totalPebbles;

  const [displayedPebbles, setDisplayedPebbles] = useState(initialPebbles);

  // Shared values for PebbleJar animation
  const fillPctValue = useSharedValue(getFillPct(initialPebbles));
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const fallingPebbleY = useSharedValue(50);
  const fallingPebbleOpacity = useSharedValue(0);
  const crowX = useSharedValue(100);
  const crowY = useSharedValue(280);
  const crowOpacity = useSharedValue(1);

  // Determine crow stage
  let crowStage: "beginner" | "advanced" | "power" = "beginner";
  if (finalPebbles >= 101) {
    crowStage = "power";
  } else if (finalPebbles >= 26) {
    crowStage = "advanced";
  }

  const startCountTickUp = (current: number, target: number) => {
    let currentVal = current;
    const difference = target - current;
    if (difference <= 0) {
      setDisplayedPebbles(target);
      return;
    }

    const duration = 600;
    const steps = Math.min(difference, 15);
    const stepTime = duration / steps;
    const increment = Math.ceil(difference / steps);

    const interval = setInterval(() => {
      currentVal += increment;
      if (currentVal >= target) {
        setDisplayedPebbles(target);
        clearInterval(interval);
      } else {
        setDisplayedPebbles(currentVal);
      }
    }, stepTime);
  };

  useEffect(() => {
    if (mode === "view") {
      // Normal display mode
      const targetFill = getFillPct(totalPebbles);
      fillPctValue.value = withTiming(targetFill, { duration: 600 });
      fallingPebbleOpacity.value = 0;
      glowOpacity.value = 0;
      crowX.value = 100;
      crowY.value = 280;
      crowOpacity.value = 1;
      setDisplayedPebbles(totalPebbles);
    } else {
      // Reward animation mode: runs immediately on mount
      const targetFill = getFillPct(targetCount);
      const targetFillY = 315 - targetFill * 130;

      // 1. Reset values
      crowX.value = 100;
      crowY.value = 280;
      crowOpacity.value = 1;

      fallingPebbleY.value = 50;
      fallingPebbleOpacity.value = 0;

      glowScale.value = 1;
      glowOpacity.value = 0;

      // 2. Crow flies to grab point (160, 60)
      crowX.value = withTiming(160, { duration: 550 });
      crowY.value = withTiming(60, { duration: 550 }, () => {
        // Grab pebble
        fallingPebbleOpacity.value = 0;

        // Move to drop point (160, 140)
        crowX.value = withTiming(160, { duration: 500 });
        crowY.value = withTiming(140, { duration: 500 });

        fallingPebbleY.value = withTiming(135, { duration: 500 }, () => {
          // Drop pebble to targetFillY
          fallingPebbleOpacity.value = 1;
          // Pebble falls down straight in the middle (x coordinate is set at 200 in SVGG component, but we drop it to targetFillY)
          fallingPebbleY.value = withTiming(
            targetFillY,
            { duration: 450 },
            () => {
              // Impact!
              runOnJS(triggerMediumHaptic)();

              // Tick up count on JS thread
              runOnJS(startCountTickUp)(startCount, targetCount);

              // Smoothly transition water level to target
              fillPctValue.value = withTiming(targetFill, { duration: 200 });

              // Disable glow flash ripple
              glowScale.value = 1.0;
              glowOpacity.value = 0.0;

              // Hide falling pebble after landing
              fallingPebbleOpacity.value = withTiming(0, { duration: 150 });
            },
          );

          // Crow pauses to observe and flies back to perch
          crowX.value = withDelay(400, withTiming(100, { duration: 500 }));
          crowY.value = withDelay(
            400,
            withTiming(280, { duration: 500 }, (finished) => {
              if (finished && onComplete) {
                runOnJS(onComplete)();
              }
            })
          );
        });
      });
    }
  }, [mode, totalPebbles, startCount, targetCount]);

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <PebbleJar
        totalPebbles={displayedPebbles}
        colors={colors}
        colorScheme={colorScheme}
        fillPctValue={fillPctValue}
        fallingPebbleY={fallingPebbleY}
        fallingPebbleOpacity={fallingPebbleOpacity}
        glowScale={glowScale}
        glowOpacity={glowOpacity}
        crowX={crowX}
        crowY={crowY}
        crowOpacity={crowOpacity}
        crowStage={crowStage}
        monthlyTypes={monthlyTypes}
        fallingPebbleType={fallingPebbleType}
        profileAvatar={profileAvatar}
      />
    </View>
  );
}
