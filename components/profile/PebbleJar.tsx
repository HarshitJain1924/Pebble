import React, { useEffect } from "react";
import { View, Platform, Image as RNImage } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Image as SvgImage,
} from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  interpolate,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { AVATAR_MAP } from "./RenderAvatar";

const isWeb = Platform.OS === "web";
const AnimatedG = Animated.createAnimatedComponent(G) as any;

// Crow frame image assets
const idleUpright = require("../../assets/images/crow/idle_upright.png");
const lookDownPebble = require("../../assets/images/crow/look_down_pebble.png");
const holdPebbleUp = require("../../assets/images/crow/hold_pebble_up.png");
const holdPebbleNeck = require("../../assets/images/crow/hold_pebble_neck.png");
const flightFrame = require("../../assets/images/crow/flight.png");
const lookDownGround = require("../../assets/images/crow/look_down_ground.png");
const crowStreak = require("../../assets/images/crow/crow_streak.png");
const mascotIdle = require("../../assets/images/crow/mascot_idle.png");

// Jar and Pebble image assets
const emptyJar = require("../../assets/images/jar_pebbles/empty_jar.png");
const pebbleRegular1 = require("../../assets/images/jar_pebbles/pebble_regular_1.png");
const pebbleRegular2 = require("../../assets/images/jar_pebbles/pebble_regular_2.png");
const pebbleShiny1 = require("../../assets/images/jar_pebbles/pebble_shiny_1.png");
const pebbleShiny2 = require("../../assets/images/jar_pebbles/pebble_shiny_2.png");
const pebbleLegendary1 = require("../../assets/images/jar_pebbles/pebble_legendary_1.png");
const pebbleLegendary2 = require("../../assets/images/jar_pebbles/pebble_legendary_2.png");



// Sanctuary Floating Dots Node for Level 5 Crow Nest
export function FloatingNode({ delay, color }: { delay: number; color: string }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500 + delay }),
        withTiming(0, { duration: 1500 + delay }),
      ),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1200 + delay }),
        withTiming(0.2, { duration: 1200 + delay }),
      ),
      -1,
      true,
    );
  }, [delay, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, { position: "absolute" }]}>
      <Svg width={6} height={6}>
        <Circle cx={3} cy={3} r={2.5} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export const PEBBLE_THRESHOLDS = [
  // Stage 1 (0-10): 10 pebbles
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  // Stage 2 (11-25): 15 pebbles
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
  // Stage 3 (26-50): 15 pebbles
  26, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 46, 48, 49, 50,
  // Stage 4 (51-100): 10 pebbles
  52, 55, 60, 65, 70, 75, 80, 85, 90, 100,
];

// Predefined coordinates for pebbles inside the jar (fits within x:32 to 88, y:25 to 94)
export const PEBBLE_POSITIONS = [
  // --- Stage 1: Base Row/Bottom layer (1 to 10) ---
  { cx: 60, cy: 90, rx: 6, ry: 4, rot: 15 },
  { cx: 50, cy: 89, rx: 5.5, ry: 3.8, rot: -20 },
  { cx: 70, cy: 89, rx: 5.8, ry: 4, rot: 10 },
  { cx: 40, cy: 87, rx: 5, ry: 3.5, rot: 45 },
  { cx: 80, cy: 87, rx: 5, ry: 3.5, rot: -45 },
  { cx: 60, cy: 84, rx: 5.5, ry: 3.8, rot: 5 },
  { cx: 50, cy: 83, rx: 5.2, ry: 3.6, rot: -15 },
  { cx: 70, cy: 83, rx: 5.4, ry: 3.8, rot: 25 },
  { cx: 36, cy: 80, rx: 4.8, ry: 3.5, rot: 35 },
  { cx: 84, cy: 80, rx: 4.8, ry: 3.5, rot: -35 },

  // --- Stage 2: Layer 2 (11 to 25) ---
  { cx: 60, cy: 78, rx: 6, ry: 4, rot: -10 },
  { cx: 45, cy: 77, rx: 5.5, ry: 3.8, rot: 30 },
  { cx: 75, cy: 77, rx: 5.8, ry: 4, rot: -25 },
  { cx: 53, cy: 75, rx: 5.2, ry: 3.6, rot: 15 },
  { cx: 67, cy: 75, rx: 5.4, ry: 3.8, rot: -15 },
  { cx: 38, cy: 73, rx: 4.8, ry: 3.4, rot: 40 },
  { cx: 82, cy: 73, rx: 4.8, ry: 3.4, rot: -40 },
  { cx: 60, cy: 71, rx: 5.5, ry: 3.8, rot: 5 },
  { cx: 49, cy: 70, rx: 5, ry: 3.6, rot: -20 },
  { cx: 71, cy: 70, rx: 5.2, ry: 3.6, rot: 20 },
  { cx: 42, cy: 67, rx: 4.8, ry: 3.4, rot: -30 },
  { cx: 78, cy: 67, rx: 4.8, ry: 3.4, rot: 30 },
  { cx: 57, cy: 65, rx: 5.4, ry: 3.8, rot: 12 },
  { cx: 63, cy: 65, rx: 5.2, ry: 3.8, rot: -12 },
  { cx: 50, cy: 61, rx: 5, ry: 3.6, rot: -25 },

  // --- Stage 3: Layer 3 (26 to 50) ---
  { cx: 70, cy: 61, rx: 5.2, ry: 3.6, rot: 25 },
  { cx: 36, cy: 58, rx: 4.6, ry: 3.4, rot: 45 },
  { cx: 84, cy: 58, rx: 4.6, ry: 3.4, rot: -45 },
  { cx: 60, cy: 56, rx: 5.8, ry: 4, rot: 5 },
  { cx: 45, cy: 54, rx: 5.2, ry: 3.6, rot: -35 },
  { cx: 75, cy: 54, rx: 5.4, ry: 3.6, rot: 35 },
  { cx: 52, cy: 51, rx: 5, ry: 3.5, rot: 15 },
  { cx: 68, cy: 51, rx: 5, ry: 3.5, rot: -15 },
  { cx: 38, cy: 48, rx: 4.6, ry: 3.4, rot: 40 },
  { cx: 82, cy: 48, rx: 4.6, ry: 3.4, rot: -40 },
  { cx: 60, cy: 46, rx: 5.6, ry: 3.8, rot: 10 },
  { cx: 47, cy: 44, rx: 5, ry: 3.6, rot: -20 },
  { cx: 73, cy: 44, rx: 5.2, ry: 3.6, rot: 20 },
  { cx: 55, cy: 41, rx: 4.8, ry: 3.5, rot: 15 },
  { cx: 65, cy: 41, rx: 4.8, ry: 3.5, rot: -15 },

  // --- Stage 4: Layer 4 (51 to 100) ---
  { cx: 40, cy: 38, rx: 4.6, ry: 3.4, rot: -30 },
  { cx: 80, cy: 38, rx: 4.6, ry: 3.4, rot: 30 },
  { cx: 60, cy: 36, rx: 5.4, ry: 3.6, rot: 5 },
  { cx: 48, cy: 34, rx: 4.8, ry: 3.5, rot: -15 },
  { cx: 72, cy: 34, rx: 5, ry: 3.5, rot: 15 },
  { cx: 60, cy: 30, rx: 5.2, ry: 3.6, rot: -5 },
  { cx: 53, cy: 28, rx: 4.8, ry: 3.5, rot: 20 },
  { cx: 67, cy: 28, rx: 4.8, ry: 3.5, rot: -20 },
  { cx: 45, cy: 26, rx: 4.5, ry: 3.3, rot: -40 },
  { cx: 75, cy: 26, rx: 4.5, ry: 3.3, rot: 40 },
];

export interface PebbleJarProps {
  totalPebbles: number;
  colors: any;
  colorScheme: string;
  fillPctValue: SharedValue<number>;
  fallingPebbleY: SharedValue<number>;
  fallingPebbleOpacity: SharedValue<number>;
  glowScale: SharedValue<number>;
  glowOpacity: SharedValue<number>;
  crowX: SharedValue<number>;
  crowY: SharedValue<number>;
  crowOpacity: SharedValue<number>;
  crowStage: "beginner" | "advanced" | "power";
  monthlyTypes?: { task: number; habit: number; focus: number };
  fallingPebbleType?: "task" | "habit" | "focus";
  profileAvatar?: string;
}

export function PebbleJar({
  totalPebbles,
  colors,
  colorScheme,
  fillPctValue,
  fallingPebbleY,
  fallingPebbleOpacity,
  glowScale,
  glowOpacity,
  crowX,
  crowY,
  crowOpacity,
  crowStage,
  monthlyTypes,
  fallingPebbleType,
  profileAvatar,
}: PebbleJarProps) {
  const isMasterStage = totalPebbles >= 500;
  const jarColor = isMasterStage
    ? colors.warning
    : colorScheme === "light"
      ? "#312E81"
      : "#A5B4FC";
  const jarStrokeOpacity = colorScheme === "light" ? 0.25 : 0.45;
  const twigColor =
    colorScheme === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";

  // Crow Idle animations
  const crowIdleY = useSharedValue(0);
  const crowIdleRot = useSharedValue(0);
  const crowIdleWingScale = useSharedValue(1);

  useEffect(() => {
    crowIdleY.value = withRepeat(
      withSequence(
        withTiming(-1.5, { duration: 2200 }),
        withTiming(0, { duration: 2200 }),
      ),
      -1,
      true,
    );
    crowIdleRot.value = withRepeat(
      withSequence(
        withTiming(2, { duration: 2800 }),
        withTiming(-2, { duration: 2800 }),
      ),
      -1,
      true,
    );
    crowIdleWingScale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1600 }),
        withTiming(1.0, { duration: 1600 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedFillStyle = useAnimatedStyle(() => {
    const translateY = 315 - fillPctValue.value * 130;
    return {
      transform: [{ translateY }],
    };
  });

  const animatedGlowStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: glowScale.value }],
      opacity: glowOpacity.value,
    };
  });

  const animatedPebbleStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      fallingPebbleY.value,
      [135, 270],
      [0.6, 1.0],
      "clamp"
    );
    return {
      transform: [
        { translateX: 200 },
        { translateY: fallingPebbleY.value },
        { scale },
      ],
      opacity: fallingPebbleOpacity.value,
    };
  });

  const animatedCrowStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: crowX.value },
        { translateY: crowY.value + crowIdleY.value },
      ],
      opacity: crowOpacity.value,
    };
  });

  const activeFrame = useDerivedValue(() => {
    const x = crowX.value;
    const y = crowY.value;

    // Perch / Idle
    if (x < 110 && y > 260) {
      return "idle";
    }
    // Grabbing at top
    if (x > 150 && y < 70) {
      return "grab";
    }
    // Dropping at drop point
    if (x > 150 && y > 130 && y < 150) {
      if (fallingPebbleOpacity.value > 0.5 && fallingPebbleY.value >= 135) {
        return "released";
      }
      return "drop";
    }
    // Carrying down
    if (x > 150 && y >= 70 && y <= 130) {
      return "carry";
    }
    // Default is flying
    return "flight";
  });

  const animatedIdleStyle = useAnimatedStyle(() => ({
    opacity: activeFrame.value === "idle" ? 1 : 0,
  }));
  const animatedGrabStyle = useAnimatedStyle(() => ({
    opacity: activeFrame.value === "grab" ? 1 : 0,
  }));
  const animatedCarryStyle = useAnimatedStyle(() => ({
    opacity: activeFrame.value === "carry" ? 1 : 0,
  }));
  const animatedDropStyle = useAnimatedStyle(() => ({
    opacity: activeFrame.value === "drop" ? 1 : 0,
  }));
  const animatedReleasedStyle = useAnimatedStyle(() => ({
    opacity: activeFrame.value === "released" ? 1 : 0,
  }));
  const animatedFlightStyle = useAnimatedStyle(() => ({
    opacity: activeFrame.value === "flight" ? 1 : 0,
  }));


  // Seeded deterministic color distribution
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const pebbleTypesList: ("task" | "habit" | "focus")[] = [];
  if (monthlyTypes) {
    const { task = 0, habit = 0, focus = 0 } = monthlyTypes;
    for (let i = 0; i < task; i++) pebbleTypesList.push("task");
    for (let i = 0; i < habit; i++) pebbleTypesList.push("habit");
    for (let i = 0; i < focus; i++) pebbleTypesList.push("focus");
  }

  const shuffledTypes = [...pebbleTypesList];
  let pSeed = 12345;
  for (let i = shuffledTypes.length - 1; i > 0; i--) {
    const r = seededRandom(pSeed++);
    const j = Math.floor(r * (i + 1));
    const temp = shuffledTypes[i];
    shuffledTypes[i] = shuffledTypes[j];
    shuffledTypes[j] = temp;
  }

  const getPebbleTypeAtIndex = (idx: number) => {
    return shuffledTypes[idx] || "task";
  };

  // Convert old predefined pebble positions to new 400x320 grid coordinates
  const convertedPebbles = PEBBLE_POSITIONS.map((pos) => ({
    cx: 150 + ((pos.cx - 30) / 60) * 100,
    cy: 180 + ((pos.cy - 12) / 84) * 135,
    rx: pos.rx * 1.5,
    ry: pos.ry * 1.5,
    rot: pos.rot,
  }));

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        height: 280,
        marginVertical: 16,
      }}
    >
      {/* Floating Animated Dots for Level 5+ / high level */}
      {totalPebbles >= 100 && (
        <>
          <View style={{ position: "absolute", top: 15, left: 60 }}>
            <FloatingNode delay={0} color={colors.primary} />
          </View>
          <View style={{ position: "absolute", top: 35, left: 120 }}>
            <FloatingNode
              delay={400}
              color={colorScheme === "light" ? "#000" : "#fff"}
            />
          </View>
          <View style={{ position: "absolute", top: 20, left: 240 }}>
            <FloatingNode delay={800} color={colors.primary} />
          </View>
        </>
      )}

      {/* Extra floating golden zen nodes for 500+ pebbles */}
      {isMasterStage && (
        <>
          <View style={{ position: "absolute", top: 10, left: 90 }}>
            <FloatingNode delay={200} color={colors.warning} />
          </View>
          <View style={{ position: "absolute", top: 25, left: 210 }}>
            <FloatingNode delay={600} color={colors.warning} />
          </View>
        </>
      )}

      <Svg width={320} height={280} viewBox="0 0 400 340">
        <Defs>
          {/* Jar Background Gradient (Deep Indigo Translucent Glass) */}
          <LinearGradient id="jarGlassBack" x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop
              offset="0%"
              stopColor={colorScheme === "light" ? "#818CF8" : "#312E81"}
              stopOpacity={colorScheme === "light" ? 0.15 : 0.4}
            />
            <Stop
              offset="100%"
              stopColor={colorScheme === "light" ? "#EEF2F6" : "#1E1B4B"}
              stopOpacity={colorScheme === "light" ? 0.05 : 0.2}
            />
          </LinearGradient>

          {/* Liquid Fill Gradient */}
          <LinearGradient id="liquidGrad" x1="0%" x2="0%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.65} />
            <Stop offset="100%" stopColor="#38BDF8" stopOpacity={0.2} />
          </LinearGradient>

          {/* Glowing Falling Pebble Gradient */}
          <RadialGradient id="pebbleGrad" cx="30%" cy="30%" r="70%">
            <Stop
              offset="0%"
              stopColor={isMasterStage ? "#FFE082" : colors.primaryLight}
            />
            <Stop
              offset="100%"
              stopColor={isMasterStage ? "#D97706" : colors.primary}
            />
          </RadialGradient>

          {/* Static Pebbles Gradient (Smooth violet-purple stone gradient) */}
          <RadialGradient id="staticPebbleGrad" cx="35%" cy="35%" r="65%">
            <Stop
              offset="0%"
              stopColor={colorScheme === "light" ? "#C7D2FE" : "#818CF8"}
            />
            <Stop
              offset="70%"
              stopColor={colorScheme === "light" ? "#6366F1" : "#4F46E5"}
            />
            <Stop
              offset="100%"
              stopColor={colorScheme === "light" ? "#312E81" : "#1E1B4B"}
            />
          </RadialGradient>

          {/* Shiny Pebbles Gradient (Bright, high-contrast violet) */}
          <RadialGradient id="shinyPebbleGrad" cx="30%" cy="30%" r="70%">
            <Stop
              offset="0%"
              stopColor={colorScheme === "light" ? "#EEF2F6" : "#C084FC"}
            />
            <Stop
              offset="60%"
              stopColor={colorScheme === "light" ? "#818CF8" : "#7C3AED"}
            />
            <Stop
              offset="100%"
              stopColor={colorScheme === "light" ? "#4C1D95" : "#2E1065"}
            />
          </RadialGradient>

          {/* Golden/Legendary Pebbles Gradient */}
          <RadialGradient id="goldPebbleGrad" cx="30%" cy="30%" r="70%">
            <Stop offset="0%" stopColor="#FDE047" />
            <Stop offset="45%" stopColor="#EC4899" />
            <Stop offset="100%" stopColor="#4C1D95" />
          </RadialGradient>

          {/* Jar ClipPath (Narrowed to fit the interior cavity of the generated jar PNG) */}
          <ClipPath id="jarClip">
            <Path d="M164,180 L236,180 Q244,180 244,190 L244,295 Q244,308 231,308 L169,308 Q156,308 156,295 L156,190 Q156,180 164,180 Z" />
          </ClipPath>

        </Defs>

        {/* Nest (twigs holding the jar) */}
        <G id="nest" transform="translate(200, 310)">
          <Path
            d="M-60,0 Q-40,15 0,15 Q40,15 60,0"
            fill="none"
            stroke={twigColor}
            strokeLinecap="round"
            strokeWidth={3}
          />
          <Path
            d="M-55,5 Q-20,18 20,12 Q50,10 55,2"
            fill="none"
            stroke={twigColor}
            strokeLinecap="round"
            strokeWidth={2}
          />
          <Path
            d="M-45,-2 Q-10,12 30,8"
            fill="none"
            stroke={twigColor}
            strokeLinecap="round"
            strokeWidth={2}
          />
        </G>

        {/* Glow Pulse behind Jar */}
        <AnimatedG style={animatedGlowStyle}>
          <Circle
            cx={200}
            cy={247}
            r={60}
            fill={isMasterStage ? colors.warning : colors.primary}
          />
        </AnimatedG>

        {/* Jar Background Illustration */}
        <SvgImage
          href={emptyJar}
          x={148}
          y={170}
          width={104}
          height={149}
          opacity={colorScheme === "light" ? 0.85 : 0.95}
        />

        {/* Jar Liquid Fill (Clipped & Animated) */}
        <G clipPath="url(#jarClip)">
          <AnimatedG style={animatedFillStyle}>
            <Rect
              x={150}
              y={0}
              width={100}
              height={150}
              fill="url(#liquidGrad)"
            />
          </AnimatedG>
        </G>

        {/* Falling Pebble (Raster PNG) */}
        <AnimatedG style={animatedPebbleStyle}>
          <G transform="rotate(10)">
            <SvgImage
              href={pebbleRegular1}
              x={-9.5}
              y={-6.5}
              width={19}
              height={13}
            />
            {fallingPebbleType && (
              <Ellipse
                cx={0}
                cy={0}
                rx={9.5}
                ry={6.5}
                fill={
                  fallingPebbleType === "focus"
                    ? "#10B981"
                    : fallingPebbleType === "habit"
                      ? "#F59E0B"
                      : "#6366F1"
                }
                opacity={0.35}
              />
            )}
          </G>
        </AnimatedG>

        {/* Predefined Pebbles rendered dynamically (Raster PNGs) */}
        <G clipPath="url(#jarClip)">
          {convertedPebbles.map((pos, index) => {
            const threshold = PEBBLE_THRESHOLDS[index] ?? 1000;
            if (totalPebbles < threshold) return null;

            const isLegendary = totalPebbles >= 500;
            const isShiny = !isLegendary && (
              (totalPebbles >= 251 && index >= 20) ||
              (totalPebbles >= 101 && index >= 35)
            );

            // Alternate variant PNG assets to create a natural, varied pile
            const isAlt = index % 2 === 1;
            const pebbleSource = isLegendary
              ? (isAlt ? pebbleLegendary2 : pebbleLegendary1)
              : isShiny
                ? (isAlt ? pebbleShiny2 : pebbleShiny1)
                : (isAlt ? pebbleRegular2 : pebbleRegular1);

            const pType = getPebbleTypeAtIndex(index);
            const overlayColor =
              pType === "focus"
                ? "#10B981"
                : pType === "habit"
                  ? "#F59E0B"
                  : "#6366F1";

            return (
              <G
                key={index}
                transform={`translate(${pos.cx}, ${pos.cy}) rotate(${pos.rot})`}
              >
                <SvgImage
                  href={pebbleSource}
                  x={-pos.rx}
                  y={-pos.ry}
                  width={pos.rx * 2}
                  height={pos.ry * 2}
                />
                {!isLegendary && (
                  <Ellipse
                    cx={0}
                    cy={0}
                    rx={pos.rx}
                    ry={pos.ry}
                    fill={overlayColor}
                    opacity={0.35}
                  />
                )}
              </G>
            );
          })}
        </G>

        {/* Floating Sparks for stage 7 (500+ pebbles) */}
        {isMasterStage && (
          <G fill={colors.warning} opacity={0.8}>
            <Path d="M 170,195 L 173,198 L 170,201 L 167,198 Z" />
            <Path d="M 230,190 L 233,193 L 230,196 L 227,193 Z" />
            <Path d="M 200,165 L 203,168 L 200,171 L 197,168 Z" />
          </G>
        )}

        {/* Jar Foreground Glass Overlay (places reflections & lip on top of pebbles) */}
        <SvgImage
          href={emptyJar}
          x={148}
          y={170}
          width={104}
          height={149}
          opacity={colorScheme === "light" ? 0.35 : 0.45}
        />


        {/* Refined Sleeker Crow Mascot (Raster Sprites with UI-Thread Frame Swapping) */}
        <AnimatedG style={animatedCrowStyle}>
          <AnimatedG style={animatedIdleStyle}>
            <SvgImage href={idleUpright} x={-40.0} y={-21.9} width={63.3} height={48.3} />
          </AnimatedG>
          <AnimatedG style={animatedGrabStyle}>
            <SvgImage href={lookDownPebble} x={-50.4} y={-11.4} width={68.7} height={38.7} />
          </AnimatedG>
          <AnimatedG style={animatedCarryStyle}>
            <SvgImage href={holdPebbleNeck} x={-38.2} y={-22.7} width={79.0} height={44.0} />
          </AnimatedG>
          <AnimatedG style={animatedDropStyle}>
            <SvgImage href={holdPebbleUp} x={-35.7} y={-24.5} width={69.3} height={51.0} />
          </AnimatedG>
          <AnimatedG style={animatedReleasedStyle}>
            <SvgImage href={lookDownGround} x={-55.3} y={-19.2} width={70.0} height={41.0} />
          </AnimatedG>
          <AnimatedG style={animatedFlightStyle}>
            <SvgImage href={flightFrame} x={-42.9} y={-34.2} width={73.7} height={53.7} />
          </AnimatedG>
        </AnimatedG>
      </Svg>
    </View>
  );
}

// Crow Mascot Component
export interface CrowMascotProps {
  stage: "beginner" | "advanced" | "power";
  colors: any;
  colorScheme: string;
  size?: number;
}

export function CrowMascot({
  stage,
  colors,
  colorScheme,
  size = 100,
}: CrowMascotProps) {
  const breathing = useSharedValue(0);

  useEffect(() => {
    breathing.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 }),
      ),
      -1,
      true,
    );
  }, []);

  const scale = size / 50;

  const animatedStyle = useAnimatedStyle(() => {
    if (isWeb) {
      return {
        transform: [{ scale: scale }] as any,
      };
    }
    const translateY = breathing.value * 1.5;
    const scaleY = 1 + breathing.value * 0.015;
    return {
      transform: [{ translateY }, { scaleY }, { scale: scale }],
    };
  });

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        height: size,
        width: size,
      }}
    >
      <Animated.Image
        source={mascotIdle}
        style={[
          animatedStyle,
          { width: size, height: size, resizeMode: "contain" },
        ]}
      />
    </View>
  );
}

export function CrowStreakMascot({ size = 100 }: { size?: number }) {
  const breathing = useSharedValue(0);

  useEffect(() => {
    breathing.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 }),
      ),
      -1,
      true,
    );
  }, []);

  const scale = size / 50;

  const animatedStyle = useAnimatedStyle(() => {
    if (isWeb) {
      return {
        transform: [{ scale: scale }] as any,
      };
    }
    const translateY = breathing.value * 1.5;
    const scaleY = 1 + breathing.value * 0.015;
    return {
      transform: [{ translateY }, { scaleY }, { scale: scale }],
    };
  });

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        height: size,
        width: size,
      }}
    >
      <Animated.Image
        source={crowStreak}
        style={[
          animatedStyle,
          { width: size, height: size, resizeMode: "contain" },
        ]}
      />
    </View>
  );
}
