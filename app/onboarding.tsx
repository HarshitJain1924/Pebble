import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Dimensions,
  ScrollView,
  SafeAreaView,
  Platform,
  Image,
  useWindowDimensions,
} from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  withSpring,
  interpolate,
  interpolateColor,
  SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
import PressableScale from "@/components/ui/PressableScale";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Slide Content Wrapper with scroll-driven parallax / fade transition
interface SlideContentProps {
  index: number;
  scrollX: SharedValue<number>;
  containerWidth: number;
  children: React.ReactNode;
}

function SlideContent({ index, scrollX, containerWidth, children }: SlideContentProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * containerWidth, index * containerWidth, (index + 1) * containerWidth],
      [0, 1, 0],
      "clamp"
    );
    const scale = interpolate(
      scrollX.value,
      [(index - 1) * containerWidth, index * containerWidth, (index + 1) * containerWidth],
      [0.92, 1, 0.92],
      "clamp"
    );
    const translateY = interpolate(
      scrollX.value,
      [(index - 1) * containerWidth, index * containerWidth, (index + 1) * containerWidth],
      [15, 0, -15],
      "clamp"
    );
    return {
      opacity,
      transform: [{ scale }, { translateY }],
    };
  });

  return (
    <Animated.View style={[styles.contentWrap, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

// Slide 1: Pebble Jar Illustration with Falling Pebbles & Water Level Rise
function PebbleJarIllustration() {
  const timeline = useSharedValue(0);

  useEffect(() => {
    timeline.value = withRepeat(
      withTiming(1, { duration: 3800 }),
      -1,
      false
    );
  }, []);

  // Pebble 1: lands at progress = 0.22
  const p1Style = useAnimatedStyle(() => {
    const t = timeline.value;
    let y = -80;
    let opacity = 0;

    if (t < 0.22) {
      const phase = t / 0.22;
      y = -80 + 132 * (phase * phase); // acceleration ease-in
      opacity = interpolate(phase, [0, 0.2], [0, 1]);
    } else {
      y = 52;
      const settle = (t - 0.22) / 0.1;
      if (settle < 1) {
        y = 52 + Math.sin(settle * Math.PI) * 4;
      }
      opacity = interpolate(t, [0.85, 0.95], [1, 0]);
    }

    return {
      transform: [{ translateY: y }],
      opacity,
    };
  });

  // Pebble 2: lands at progress = 0.52
  const p2Style = useAnimatedStyle(() => {
    const t = timeline.value;
    let y = -80;
    let opacity = 0;

    if (t < 0.3) {
      y = -80;
      opacity = 0;
    } else if (t < 0.52) {
      const phase = (t - 0.3) / 0.22;
      y = -80 + 124 * (phase * phase);
      opacity = interpolate(phase, [0, 0.2], [0, 1]);
    } else {
      y = 44;
      const settle = (t - 0.52) / 0.1;
      if (settle < 1) {
        y = 44 + Math.sin(settle * Math.PI) * 3;
      }
      opacity = interpolate(t, [0.85, 0.95], [1, 0]);
    }

    return {
      transform: [{ translateY: y }],
      opacity,
    };
  });

  // Pebble 3: lands at progress = 0.82
  const p3Style = useAnimatedStyle(() => {
    const t = timeline.value;
    let y = -80;
    let opacity = 0;

    if (t < 0.6) {
      y = -80;
      opacity = 0;
    } else if (t < 0.82) {
      const phase = (t - 0.6) / 0.22;
      y = -80 + 116 * (phase * phase);
      opacity = interpolate(phase, [0, 0.2], [0, 1]);
    } else {
      y = 36;
      const settle = (t - 0.82) / 0.1;
      if (settle < 1) {
        y = 36 + Math.sin(settle * Math.PI) * 2;
      }
      opacity = interpolate(t, [0.85, 0.95], [1, 0]);
    }

    return {
      transform: [{ translateY: y }],
      opacity,
    };
  });

  // Ripple Style: expands and fades out at 0.22, 0.52, 0.82
  const rippleStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    let scale = 0;
    let opacity = 0;

    const checkRipple = (impactTime: number) => {
      if (t >= impactTime && t < impactTime + 0.15) {
        const phase = (t - impactTime) / 0.15;
        scale = phase * 1.8;
        opacity = 1 - phase;
      }
    };

    checkRipple(0.22);
    checkRipple(0.52);
    checkRipple(0.82);

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  // Impact glow at bottom of jar
  const glowStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    let opacity = 0;

    const checkGlow = (impactTime: number) => {
      if (t >= impactTime && t < impactTime + 0.12) {
        const phase = (t - impactTime) / 0.12;
        opacity = (1 - phase) * 0.45;
      }
    };

    checkGlow(0.22);
    checkGlow(0.52);
    checkGlow(0.82);

    return { opacity };
  });

  // Liquid / progress fill level inside the jar
  const liquidStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    let height = 15;

    if (t < 0.22) {
      height = 15;
    } else if (t < 0.52) {
      height = interpolate(t, [0.22, 0.28], [15, 28], "clamp");
    } else if (t < 0.82) {
      height = interpolate(t, [0.52, 0.58], [28, 42], "clamp");
    } else {
      if (t < 0.88) {
        height = interpolate(t, [0.82, 0.88], [42, 56], "clamp");
      } else {
        height = interpolate(t, [0.90, 0.98], [56, 15], "clamp");
      }
    }

    return {
      height,
    };
  });

  return (
    <View style={[styles.illContainer, { alignItems: "center", justifyContent: "flex-end", height: 180 }]}>
      <View style={styles.jarGlowBackground} />
      <View style={styles.jarBody}>
        <View style={styles.jarLid} />
        
        {/* Dynamic accumulative progress level */}
        <Animated.View style={[styles.jarLiquid, liquidStyle]} />

        {/* Existing baseline pebbles */}
        <View style={[styles.pebble, { bottom: 8, left: 10, transform: [{ rotate: "10deg" }], width: 22, height: 14, opacity: 0.4 }]} />
        <View style={[styles.pebble, { bottom: 6, right: 12, transform: [{ rotate: "-15deg" }], width: 20, height: 13, opacity: 0.4, backgroundColor: "#A78BFA" }]} />

        {/* Falling pebbles */}
        <Animated.View style={[styles.pebble, { left: 35, backgroundColor: "#8B5CF6" }, p1Style]} />
        <Animated.View style={[styles.pebble, { left: 18, backgroundColor: "#A78BFA" }, p2Style]} />
        <Animated.View style={[styles.pebble, { left: 48, backgroundColor: "#C4B5FD" }, p3Style]} />

        {/* Ripples & Impact Glows */}
        <Animated.View style={[styles.jarRipple, rippleStyle]} />
        <Animated.View style={[styles.jarImpactGlow, glowStyle]} />
      </View>
    </View>
  );
}

// Slide 2: Pebble Capture Illustration with Equalizer Waveform & Morphing Task Card
// Tiny animated equalizer bar — uses useAnimatedStyle so Reanimated can
// reactively update height without triggering the inline-.value warning.
function EqBar({ h }: { h: import("react-native-reanimated").SharedValue<number> }) {
  const animStyle = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.eqBar, animStyle]} />;
}

function PebbleCaptureIllustration() {
  const timeline = useSharedValue(0);
  const h1 = useSharedValue(4);
  const h2 = useSharedValue(4);
  const h3 = useSharedValue(4);
  const h4 = useSharedValue(4);
  const h5 = useSharedValue(4);

  useEffect(() => {
    timeline.value = withRepeat(
      withTiming(1, { duration: 4800 }),
      -1,
      false
    );

    const animateWave = (sv: SharedValue<number>, min: number, max: number, duration: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(max, { duration }),
          withTiming(min, { duration })
        ),
        -1,
        true
      );
    };

    animateWave(h1, 4, 25, 450);
    animateWave(h2, 6, 35, 550);
    animateWave(h3, 5, 40, 480);
    animateWave(h4, 6, 28, 600);
    animateWave(h5, 4, 18, 520);
  }, []);

  const waveContainerStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    const opacity = interpolate(t, [0, 0.05, 0.35, 0.42], [0, 1, 1, 0], "clamp");
    const translateY = interpolate(t, [0.35, 0.42], [0, -10], "clamp");
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const bubbleStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    const opacity = interpolate(t, [0.08, 0.15, 0.35, 0.42], [0, 1, 1, 0], "clamp");
    const scale = interpolate(t, [0.08, 0.15, 0.35, 0.42], [0.8, 1, 1, 0.8], "clamp");
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const cardStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    let opacity = 0;
    let scale = 0.8;
    let translateY = 15;

    if (t > 0.42) {
      opacity = interpolate(t, [0.42, 0.48], [0, 1], "clamp");
      scale = interpolate(t, [0.42, 0.48, 0.54], [0.85, 1.03, 1], "clamp");
      translateY = interpolate(t, [0.42, 0.48], [15, 0], "clamp");
    }

    if (t > 0.88) {
      opacity = interpolate(t, [0.88, 0.94], [1, 0], "clamp");
      scale = interpolate(t, [0.88, 0.94], [1, 0.9], "clamp");
    }

    return {
      opacity,
      transform: [{ scale }, { translateY }],
    };
  });

  const checkStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    let scale = 0;
    let backgroundColor = "rgba(139, 92, 246, 0)";
    let borderColor = "rgba(139, 92, 246, 0.4)";

    if (t > 0.58) {
      scale = interpolate(t, [0.58, 0.66, 0.74], [0.5, 1.1, 1], "clamp");
      backgroundColor = "#8B5CF6";
      borderColor = "#8B5CF6";
    }

    return {
      transform: [{ scale }],
      backgroundColor,
      borderColor,
    };
  });

  const checkIconStyle = useAnimatedStyle(() => {
    const t = timeline.value;
    const opacity = interpolate(t, [0.64, 0.7], [0, 1], "clamp");
    const scale = interpolate(t, [0.64, 0.7], [0.5, 1], "clamp");
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <View style={[styles.illContainer, { alignItems: "center", justifyContent: "center", height: 180, gap: 15 }]}>
      {/* Microphone Waveform */}
      <Animated.View style={[styles.waveContainer, waveContainerStyle]}>
        <View style={styles.micCircle}>
          <Feather name="mic" size={20} color="#fff" />
        </View>
        <View style={styles.equalizerRow}>
          <EqBar h={h1} />
          <EqBar h={h2} />
          <EqBar h={h3} />
          <EqBar h={h4} />
          <EqBar h={h5} />
        </View>
      </Animated.View>

      {/* Transcription Bubble */}
      <Animated.View style={[styles.transcribeBubble, bubbleStyle]}>
        <Text style={styles.transcribeText}>{"\"Read 10 pages today\""}</Text>
      </Animated.View>

      {/* Structured Task Card */}
      <Animated.View style={[styles.outputTaskCard, cardStyle]}>
        <View style={styles.taskCardCheckboxOutline}>
          <Animated.View style={[styles.taskCardCheckboxFill, checkStyle]}>
            <Animated.View style={checkIconStyle}>
              <Feather name="check" size={10} color="#fff" />
            </Animated.View>
          </Animated.View>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.taskCardTitle}>Read 10 pages</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={styles.taskCardTag}>
              <Text style={styles.taskCardTagText}>Habit</Text>
            </View>
            <Text style={styles.taskCardTime}>Today, 8:00 AM</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// Slide 3: Focus Timer Illustration with Smooth Momentum Orbit & Trailing Trails
function FocusIllustration() {
  const rotation = useSharedValue(0);
  const breath = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 8000 }),
      -1,
      false
    );

    breath.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1800 }),
        withTiming(0.96, { duration: 1800 })
      ),
      -1,
      true
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
    shadowOpacity: interpolate(breath.value, [0.96, 1.04], [0.2, 0.45]),
    shadowRadius: interpolate(breath.value, [0.96, 1.04], [8, 18]),
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const orbitStyleOpposite = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-rotation.value * 1.5}deg` }],
  }));

  return (
    <View style={styles.focusContainer}>
      {/* Dashed Orbital Tracks */}
      <View style={[styles.orbitRing, { width: 140, height: 140, borderRadius: 70, opacity: 0.15 }]} />
      <View style={[styles.orbitRing, { width: 106, height: 106, borderRadius: 53, opacity: 0.25 }]} />

      {/* Orbit Track 1: Outer (Clockwise) */}
      <Animated.View style={[StyleSheet.absoluteFillObject, orbitStyle, { justifyContent: "center", alignItems: "center" }]}>
        <View style={[styles.orbitPebble, { top: 10, backgroundColor: "#8B5CF6", width: 10, height: 10, borderRadius: 5 }]} />
        <View style={[styles.orbitPebbleTail, { top: 7, left: "53%", width: 6, height: 6, borderRadius: 3, opacity: 0.55 }]} />
        <View style={[styles.orbitPebbleTail, { top: 5, left: "56%", width: 4, height: 4, borderRadius: 2, opacity: 0.25 }]} />
      </Animated.View>

      {/* Orbit Track 2: Inner (Counter-Clockwise) */}
      <Animated.View style={[StyleSheet.absoluteFillObject, orbitStyleOpposite, { justifyContent: "center", alignItems: "center" }]}>
        <View style={[styles.orbitPebble, { bottom: 27, left: 27, backgroundColor: "#C4B5FD", width: 8, height: 8, borderRadius: 4 }]} />
        <View style={[styles.orbitPebbleTail, { bottom: 35, left: 22, width: 5, height: 5, borderRadius: 2.5, opacity: 0.35 }]} />
      </Animated.View>

      {/* Central Breathing Orb */}
      <Animated.View style={[styles.innerOrb, orbStyle]}>
        <Feather name="target" size={24} color="#fff" />
        <Text style={styles.orbText}>25:00</Text>
      </Animated.View>
    </View>
  );
}

// Slide 4 Welcome Page components: Breathing Glow Overlay and Floating Particles
function WelcomeLogoGlow() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 2200 }),
        withTiming(1, { duration: 2200 })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 2200 }),
        withTiming(0.2, { duration: 2200 })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.welcomeGlowRing, glowStyle]} />
  );
}

function WelcomeParticles() {
  const p1y = useSharedValue(50);
  const p1x = useSharedValue(0);
  const p1o = useSharedValue(0);

  const p2y = useSharedValue(60);
  const p2x = useSharedValue(-20);
  const p2o = useSharedValue(0);

  const p3y = useSharedValue(70);
  const p3x = useSharedValue(20);
  const p3o = useSharedValue(0);

  const p4y = useSharedValue(40);
  const p4x = useSharedValue(-40);
  const p4o = useSharedValue(0);

  useEffect(() => {
    p1y.value = withRepeat(
      withSequence(
        withTiming(50, { duration: 0 }),
        withTiming(-80, { duration: 3200 })
      ),
      -1,
      false
    );
    p1x.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 1600 }),
        withTiming(12, { duration: 1600 })
      ),
      -1,
      true
    );
    p1o.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(0.65, { duration: 600 }),
        withTiming(0.65, { duration: 2000 }),
        withTiming(0, { duration: 600 })
      ),
      -1,
      false
    );

    p2y.value = withRepeat(
      withSequence(
        withTiming(60, { duration: 0 }),
        withTiming(-100, { duration: 4000 })
      ),
      -1,
      false
    );
    p2x.value = withRepeat(
      withSequence(
        withTiming(18, { duration: 2000 }),
        withTiming(-18, { duration: 2000 })
      ),
      -1,
      true
    );
    p2o.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(0.5, { duration: 800 }),
        withTiming(0.5, { duration: 2400 }),
        withTiming(0, { duration: 800 })
      ),
      -1,
      false
    );

    p3y.value = withRepeat(
      withSequence(
        withTiming(70, { duration: 0 }),
        withTiming(-90, { duration: 2800 })
      ),
      -1,
      false
    );
    p3x.value = withRepeat(
      withSequence(
        withTiming(-20, { duration: 1400 }),
        withTiming(20, { duration: 1400 })
      ),
      -1,
      true
    );
    p3o.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(0.7, { duration: 500 }),
        withTiming(0.7, { duration: 1800 }),
        withTiming(0, { duration: 500 })
      ),
      -1,
      false
    );

    p4y.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 0 }),
        withTiming(-120, { duration: 4400 })
      ),
      -1,
      false
    );
    p4x.value = withRepeat(
      withSequence(
        withTiming(15, { duration: 2200 }),
        withTiming(-15, { duration: 2200 })
      ),
      -1,
      true
    );
    p4o.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(0.4, { duration: 1000 }),
        withTiming(0.4, { duration: 2400 }),
        withTiming(0, { duration: 1000 })
      ),
      -1,
      false
    );
  }, []);

  const p1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: p1y.value }, { translateX: p1x.value }],
    opacity: p1o.value,
  }));
  const p2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: p2y.value }, { translateX: p2x.value }],
    opacity: p2o.value,
  }));
  const p3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: p3y.value }, { translateX: p3x.value }],
    opacity: p3o.value,
  }));
  const p4Style = useAnimatedStyle(() => ({
    transform: [{ translateY: p4y.value }, { translateX: p4x.value }],
    opacity: p4o.value,
  }));

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[styles.particle, { left: "28%" }, p1Style]} />
      <Animated.View style={[styles.particle, { left: "44%", width: 3, height: 3 }, p2Style]} />
      <Animated.View style={[styles.particle, { left: "58%" }, p3Style]} />
      <Animated.View style={[styles.particle, { left: "72%", width: 5, height: 5 }, p4Style]} />
    </View>
  );
}

interface OnboardingDotProps {
  i: number;
  scrollX: SharedValue<number>;
  containerWidth: number;
  isDark: boolean;
  colors: any;
}

function OnboardingDot({ i, scrollX, containerWidth, isDark, colors }: OnboardingDotProps) {
  const dotStyle = useAnimatedStyle(() => {
    const width = interpolate(
      scrollX.value,
      [(i - 1) * containerWidth, i * containerWidth, (i + 1) * containerWidth],
      [6, 20, 6],
      "clamp"
    );
    
    const opacity = interpolate(
      scrollX.value,
      [(i - 1) * containerWidth, i * containerWidth, (i + 1) * containerWidth],
      [0.35, 1, 0.35],
      "clamp"
    );

    const backgroundColor = interpolateColor(
      scrollX.value,
      [(i - 1) * containerWidth, i * containerWidth, (i + 1) * containerWidth],
      [
        isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.18)",
        colors.primary,
        isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.18)",
      ]
    );

    const shadowOpacity = interpolate(
      scrollX.value,
      [(i - 1) * containerWidth, i * containerWidth, (i + 1) * containerWidth],
      [0, 0.45, 0],
      "clamp"
    );

    return {
      width,
      opacity,
      backgroundColor,
      shadowOpacity,
    };
  });

  return (
    <Animated.View
      style={[styles.dot, dotStyle]}
    />
  );
}

export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(windowWidth);

  // Animated scroll tracker
  const scrollX = useSharedValue(0);

  // Sync containerWidth when windowWidth changes
  useEffect(() => {
    setContainerWidth(windowWidth);
  }, [windowWidth]);

  // Adjust scroll offset on containerWidth change (orientation change)
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndex * containerWidth, animated: false });
    scrollX.value = activeIndex * containerWidth;
  }, [containerWidth, activeIndex]);

  const onLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const handleNext = () => {
    if (activeIndex < 3) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * containerWidth, animated: true });
      setActiveIndex(activeIndex + 1);
    } else {
      completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem("todoapp:onboarding_completed", "true");
    router.replace("/(tabs)");
  };

  const handleScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    scrollX.value = x; // Propagate horizontal position to shared value
    const index = Math.round(x / containerWidth);
    if (index !== activeIndex && index >= 0 && index <= 3) {
      setActiveIndex(index);
    }
  };

  return (
    <ScreenSwipeWrapper>
      <SafeAreaView style={styles.safeContainer} onLayout={onLayout}>
        <Animated.View entering={FadeIn.delay(100).duration(700)} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={styles.scrollView}
            contentContainerStyle={{ backgroundColor: "transparent" }}
          >
            {/* Slide 1 */}
            <View style={[styles.slide, { width: containerWidth }]}>
              <SlideContent index={0} scrollX={scrollX} containerWidth={containerWidth}>
                <PebbleJarIllustration />
                <View style={styles.textContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>Small actions matter.</Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    Every task, habit, and focus session is another pebble toward your goals.
                  </Text>
                </View>
              </SlideContent>
            </View>

            {/* Slide 2 */}
            <View style={[styles.slide, { width: containerWidth }]}>
              <SlideContent index={1} scrollX={scrollX} containerWidth={containerWidth}>
                <PebbleCaptureIllustration />
                <View style={styles.textContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>Capture ideas instantly.</Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    Use Pebble Capture to turn natural language into structured tasks and habits.
                  </Text>
                </View>
              </SlideContent>
            </View>

            {/* Slide 3 */}
            <View style={[styles.slide, { width: containerWidth }]}>
              <SlideContent index={2} scrollX={scrollX} containerWidth={containerWidth}>
                <FocusIllustration />
                <View style={styles.textContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>Build momentum every day.</Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    Track habits, focus deeply, and watch your progress grow over time.
                  </Text>
                </View>
              </SlideContent>
            </View>

            {/* Slide 4 */}
            <View style={[styles.slide, { width: containerWidth }]}>
              <SlideContent index={3} scrollX={scrollX} containerWidth={containerWidth}>
                <View style={styles.welcomeLogoContainer}>
                  <WelcomeLogoGlow />
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={styles.welcomeLogo}
                  />
                  <WelcomeParticles />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.title, { color: colors.text, fontSize: 28 }]}>
                    Welcome to Pebble
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: 15 }]}>
                    Big goals are achieved one pebble at a time.
                  </Text>
                </View>
              </SlideContent>
            </View>
          </ScrollView>
        </Animated.View>

        {/* Bottom Pagination & Action Row */}
        <View style={styles.bottomBar}>
          <View style={styles.dotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <OnboardingDot
                key={i}
                i={i}
                scrollX={scrollX}
                containerWidth={containerWidth}
                isDark={isDark}
                colors={colors}
              />
            ))}
          </View>

          <View style={styles.buttonRow}>
            {activeIndex < 3 ? (
              <>
                <PressableScale
                  onPress={completeOnboarding}
                  contentStyle={styles.skipButton}
                  haptic
                >
                  <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
                </PressableScale>
                
                <PressableScale
                  onPress={handleNext}
                  contentStyle={[styles.nextButton, { backgroundColor: colors.primary }]}
                  haptic
                >
                  <Text style={styles.nextText}>Next</Text>
                  <Feather name="arrow-right" size={14} color="#fff" />
                </PressableScale>
              </>
            ) : (
              <PressableScale
                onPress={completeOnboarding}
                style={{ flex: 1 }}
                contentStyle={[styles.startButton, { backgroundColor: colors.primary }]}
                haptic
              >
                <Text style={styles.startText}>Start Building Momentum</Text>
                <Feather name="check" size={16} color="#fff" />
              </PressableScale>
            )}
          </View>
        </View>
      </SafeAreaView>
    </ScreenSwipeWrapper>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  slide: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  contentWrap: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 40,
    marginTop: -40,
  },
  textContainer: {
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700", // Maps to Outfit_700Bold
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500", // Maps to Outfit_500Medium
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  bottomBar: {
    width: "100%",
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 24 : 16,
    gap: 20,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "700", // Maps to Outfit_700Bold
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  nextText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700", // Maps to Outfit_700Bold
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 24,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  startText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700", // Maps to Outfit_700Bold
  },

  // Illustrations Layout Container
  illContainer: {
    width: 200,
    height: 180,
    position: "relative",
    marginBottom: 10,
  },
  
  // Pebble Jar styles
  jarGlowBackground: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(139, 92, 246, 0.04)",
    alignSelf: "center",
    bottom: -10,
    zIndex: 0,
  },
  jarBody: {
    width: 100,
    height: 120,
    borderWidth: 3,
    borderColor: "rgba(139, 92, 246, 0.45)",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    position: "relative",
    overflow: "visible",
  },
  jarLid: {
    position: "absolute",
    top: -6,
    left: -10,
    right: -10,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(139, 92, 246, 0.65)",
  },
  jarLiquid: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(139, 92, 246, 0.16)",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  pebble: {
    position: "absolute",
    width: 30,
    height: 20,
    borderRadius: 12,
    backgroundColor: "rgba(139, 92, 246, 0.8)",
  },
  jarRipple: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    width: 60,
    height: 8,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "rgba(139, 92, 246, 0.8)",
    backgroundColor: "transparent",
  },
  jarImpactGlow: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    width: 70,
    height: 20,
    borderRadius: 35,
    backgroundColor: "rgba(139, 92, 246, 0.5)",
  },

  // Voice Capture (Slide 2) styles
  waveContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    position: "absolute",
    top: 15,
  },
  micCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  equalizerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3.5,
    height: 40,
  },
  eqBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: "#8B5CF6",
  },
  transcribeBubble: {
    position: "absolute",
    top: 72,
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    borderColor: "rgba(139, 92, 246, 0.25)",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderBottomLeftRadius: 2,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  transcribeText: {
    fontSize: 12,
    color: "#C4B5FD",
    fontWeight: "500", // Maps to Outfit_500Medium
  },
  outputTaskCard: {
    position: "absolute",
    bottom: 15,
    width: 190,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#1C1C21",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  taskCardCheckboxOutline: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  taskCardCheckboxFill: {
    width: "100%",
    height: "100%",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  taskCardTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700", // Maps to Outfit_700Bold
  },
  taskCardTag: {
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
  },
  taskCardTagText: {
    fontSize: 9,
    color: "#A78BFA",
    fontWeight: "600", // Maps to Outfit_600SemiBold
  },
  taskCardTime: {
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "500", // Maps to Outfit_500Medium
  },

  // Focus Timer (Slide 3) styles
  focusContainer: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 10,
  },
  orbitRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(139, 92, 246, 0.22)",
    borderStyle: "dashed",
    alignSelf: "center",
  },
  orbitPebble: {
    position: "absolute",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 4,
  },
  orbitPebbleTail: {
    position: "absolute",
    backgroundColor: "rgba(139, 92, 246, 0.35)",
  },
  innerOrb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  orbText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700", // Maps to Outfit_700Bold
  },

  // Slide 4 Welcome Page styles
  welcomeLogoContainer: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 20,
  },
  welcomeLogo: {
    width: 100,
    height: 100,
    borderRadius: 24,
    zIndex: 2,
  },
  welcomeGlowRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    zIndex: 1,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  particle: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C4B5FD",
    zIndex: 3,
  },
});
