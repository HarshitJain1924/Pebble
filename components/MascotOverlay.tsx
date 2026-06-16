import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getPebbleCounts } from "@/services/pebbleService";
import { getProfile } from "@/services/settingsService";
import { addStateListener } from "@/services/stateEvents";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MASCOT_WIDTH = 120;
const OFFSET_IDLE = 30; // more visible for thinner idle crow
const OFFSET_PEEK = 24; // default peeking
const OFFSET_CHATTING = 24; // tapping chatting
const OFFSET_EVENT = 0; // full pop out

const getOffset = (state: MascotState) => {
  switch (state) {
    case "idle":
      return OFFSET_IDLE;
    case "peek":
      return OFFSET_PEEK;
    case "chatting":
      return OFFSET_CHATTING;
    default:
      return OFFSET_IDLE;
  }
};

const MASCOT_ASSET_MAP: Record<string, any> = {
  idle: require("@/assets/images/mascot/mascot_idle.png"),
  peek: require("@/assets/images/mascot/mascot_peek.png"),
  chatting: require("@/assets/images/mascot/mascot_chatting.png"),
};

type MascotState = "idle" | "peek" | "chatting";

export function MascotOverlay() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // State Variables
  const [profile, setProfile] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [todayPebbles, setTodayPebbles] = useState(0);
  const [yesterdayPebbles, setYesterdayPebbles] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [mascotState, setMascotState] = useState<MascotState>("idle");

  // Reanimated Shared Values
  const translateX = useSharedValue(130); // start completely hidden off-screen
  const translateY = useSharedValue(0);
  const bubbleScale = useSharedValue(0);
  const breathingY = useSharedValue(0);
  const scaleY = useSharedValue(1);
  const rotation = useSharedValue(0);

  // Keep track of active timers
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameRef = useRef(pathname);

  // Sync pathnameRef
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Load stats and state
  const loadStats = async () => {
    try {
      const prof = await getProfile();
      setProfile(prof);

      const pebbleStats = await getPebbleCounts();
      setStreak(pebbleStats.streak || 0);

      // Parse pebble counts for today and yesterday from log
      const log = pebbleStats.log || [];
      const todayStr = getOffsetDateStr(0);
      const yesterdayStr = getOffsetDateStr(-1);

      let todayCount = 0;
      let yesterdayCount = 0;

      log.forEach((entry: any) => {
        const d = new Date(entry.timestamp);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dateStr === todayStr) {
          todayCount++;
        } else if (dateStr === yesterdayStr) {
          yesterdayCount++;
        }
      });

      setTodayPebbles(todayCount);
      setYesterdayPebbles(yesterdayCount);
    } catch (e) {
      console.warn("Failed to load mascot stats", e);
    }
  };

  const getOffsetDateStr = (daysOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    loadStats();

    // Listen to changes to keep counts updated dynamically
    const unsubscribeTasks = addStateListener(
      "tasks_changed",
      () => void loadStats(),
    );
    const unsubscribeHabits = addStateListener(
      "habits_changed",
      () => void loadStats(),
    );
    const unsubscribeProfile = addStateListener(
      "profile_changed",
      () => void loadStats(),
    );

    const unsubscribePebbles = addStateListener("pebbles_changed", () => {
      loadStats();

      // State 3: Important Event (Task completed) -> Full Pop Out with slight bounce and chatting sprite
      setMascotState("chatting");
      translateX.value = withSpring(OFFSET_EVENT, {
        damping: 12,
        stiffness: 100,
      });

      const completionPhrases = [
        "Caw! Another pebble in the jar! 🥳",
        "Brilliant! The nest is growing. ✨",
        "Splendid drop! Keep it up! 🎉",
        "Every pebble counts! Fantastic! 🌟",
      ];
      triggerBubble(
        completionPhrases[Math.floor(Math.random() * completionPhrases.length)],
        4000,
      );

      // Revert to rest state after 4 seconds
      setTimeout(() => {
        setMascotState("idle");
        translateX.value = withSpring(getOffset("idle"), { damping: 18 });

        // Reset focus peek timer if applicable
        const currentPath = pathnameRef.current;
        if (currentPath === "/focus") {
          if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
          focusTimerRef.current = setTimeout(() => {
            setMascotState("peek");
            translateX.value = withSpring(OFFSET_EVENT, { damping: 18 });
            triggerBubble(
              "💤 Zzz... sleeping during your active focus session.",
              4000,
            );
            setTimeout(() => {
              translateX.value = withSpring(getOffset("idle"), { damping: 18 });
              setMascotState("idle");
            }, 4000);
          }, 15000);
        }
      }, 4000);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
      unsubscribeProfile();
      unsubscribePebbles();
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (tapDelayTimerRef.current) clearTimeout(tapDelayTimerRef.current);
      if (tapRevertTimerRef.current) clearTimeout(tapRevertTimerRef.current);
    };
  }, []);

  // Idle Breathing Animation Loop
  useEffect(() => {
    breathingY.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 2400 }),
        withTiming(0, { duration: 2400 }),
      ),
      -1,
      true,
    );
  }, []);

  // Micro Animations: Periodic Eye Blinks
  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout>;

    const triggerBlink = () => {
      scaleY.value = withSequence(
        withTiming(0.1, { duration: 80 }),
        withTiming(1, { duration: 80 }),
      );

      const nextDelay = 4000 + Math.random() * 4000;
      blinkTimeout = setTimeout(triggerBlink, nextDelay);
    };

    const firstDelay = 4000 + Math.random() * 4000;
    blinkTimeout = setTimeout(triggerBlink, firstDelay);

    return () => {
      clearTimeout(blinkTimeout);
    };
  }, []);

  // Micro Animations: Occasional Head Tilts
  useEffect(() => {
    let tiltTimeout: ReturnType<typeof setTimeout>;

    const triggerTilt = () => {
      if (mascotState === "idle") {
        const angle =
          (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 10);
        rotation.value = withSequence(
          withTiming(angle, { duration: 250 }),
          withTiming(0, { duration: 250 }),
        );
      }

      const nextDelay = 10000 + Math.random() * 10000;
      tiltTimeout = setTimeout(triggerTilt, nextDelay);
    };

    const firstDelay = 10000 + Math.random() * 10000;
    tiltTimeout = setTimeout(triggerTilt, firstDelay);

    return () => {
      clearTimeout(tiltTimeout);
    };
  }, [mascotState]);

  // Periodic Peeking Behavior (peeking crow in between sometimes)
  useEffect(() => {
    if (isDismissed) return;

    let peekTimeout: ReturnType<typeof setTimeout>;

    const triggerPeriodicPeek = () => {
      if (mascotState === "idle" && !bubbleText) {
        setMascotState("peek");
        translateX.value = withSpring(getOffset("peek"), { damping: 15 });

        const shouldSpeak = Math.random() < 0.35;
        if (shouldSpeak) {
          const peekPhrases = [
            "Caw! Keeping an eye on your progress! 👀",
            "Still working? You're doing great! 💪",
            "Just peeking in. Let's make today count! ✨",
            "Pssst... checked off any goals lately? 📋",
            "A clean jar is a happy nest! 🦅",
          ];
          triggerBubble(
            peekPhrases[Math.floor(Math.random() * peekPhrases.length)],
            4000,
          );
        }

        setTimeout(() => {
          translateX.value = withSpring(getOffset("idle"), { damping: 18 });
          setTimeout(() => {
            setMascotState("idle");
          }, 300);
        }, 4000);
      }

      const nextDelay = 30000 + Math.random() * 20000; // 30-50s
      peekTimeout = setTimeout(triggerPeriodicPeek, nextDelay);
    };

    const initialDelay = 20000 + Math.random() * 10000;
    peekTimeout = setTimeout(triggerPeriodicPeek, initialDelay);

    return () => {
      clearTimeout(peekTimeout);
    };
  }, [mascotState, bubbleText, isDismissed]);

  // Pan Responder for Swipe-to-Dismiss Gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && gestureState.dx > 0;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 40) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => {},
          );
          dismissMascot();
        }
      },
    }),
  ).current;

  const dismissMascot = () => {
    hideBubble();
    translateX.value = withTiming(MASCOT_WIDTH + 10, { duration: 300 }, () => {
      runOnJS(setIsDismissed)(true);
    });
  };

  const hideBubble = () => {
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
    bubbleScale.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setBubbleText)(null);
      runOnJS(setMascotState)("idle");
    });
  };

  const triggerBubble = (text: string, durationMs = 4500) => {
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
    }
    setBubbleText(text);
    bubbleScale.value = withSpring(1, { damping: 15 });

    bubbleTimerRef.current = setTimeout(() => {
      hideBubble();
    }, durationMs);
  };

  // Route-Specific / Passive Peek State Transitions
  useEffect(() => {
    if (isDismissed) return;

    // Anchor at Idle Peek (State 1) - 38% visible showing head + wing
    translateX.value = withSpring(getOffset("idle"), { damping: 18 });
    rotation.value = withSpring(0, { damping: 15 });

    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    setMascotState("idle");

    if (pathname === "/focus") {
      focusTimerRef.current = setTimeout(() => {
        setMascotState("peek");
        // State 3: Focus Sleep important event (slide fully out)
        translateX.value = withSpring(OFFSET_EVENT, { damping: 18 });
        triggerBubble(
          "💤 Zzz... sleeping during your active focus session.",
          4000,
        );
        setTimeout(() => {
          translateX.value = withSpring(getOffset("idle"), { damping: 18 });
          setMascotState("idle");
        }, 4000);
      }, 15000);
    }

    // Hide any active bubble when changing screens
    hideBubble();

    // Trigger proactive warnings only under important events (e.g. Streak Risk)
    const currentHour = new Date().getHours();
    const isEvening = currentHour >= 17;

    if (pathname !== "/") {
      if (isEvening && todayPebbles === 0 && streak > 0) {
        // High priority streak warning - State 3 (Full Pop Out)
        setMascotState("peek");
        translateX.value = withSpring(OFFSET_EVENT, {
          damping: 12,
          stiffness: 100,
        });
        rotation.value = withSpring(12, { damping: 12 }); // worried head tilt

        setTimeout(() => {
          triggerBubble(
            `Oh! Our ${streak}-day streak is at risk! Let's do one small goal.`,
            4500,
          );

          setTimeout(() => {
            translateX.value = withSpring(getOffset("idle"), { damping: 18 });
            rotation.value = withSpring(0, { damping: 15 });
            setMascotState("idle");
          }, 4500);
        }, 1000);
      }
    }
  }, [pathname, isDismissed]);

  const handleTapMascot = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (bubbleText) {
      hideBubble();
      translateX.value = withSpring(getOffset("idle"), { damping: 18 });
      rotation.value = withSpring(0, { damping: 15 });
      setMascotState("idle");
      return;
    }

    // State 2: Crow slides further out (75% visible) showing more body
    translateX.value = withSpring(getOffset("chatting"), { damping: 15 });
    rotation.value = withSpring(-10, { damping: 12 }); // Curious head tilt
    setMascotState("chatting");

    if (tapDelayTimerRef.current) clearTimeout(tapDelayTimerRef.current);
    if (tapRevertTimerRef.current) clearTimeout(tapRevertTimerRef.current);

    // Wait 200ms before trigger speech bubble
    tapDelayTimerRef.current = setTimeout(() => {
      let phrase = "Caw! One pebble at a time.";
      const rand = Math.random();

      const currentHour = new Date().getHours();
      const isEvening = currentHour >= 17;

      if (isEvening && todayPebbles === 0 && streak > 0) {
        rotation.value = withSpring(12, { damping: 12 }); // Worried head tilt
        phrase = `Oh no! Our ${streak}-day streak is at risk. Let's check off one pebble! 😰`;
      } else if (todayPebbles >= 5 && rand < 0.25) {
        phrase =
          "Wow, 5+ pebbles dropped! We're building a beautiful sanctuary. 🥳";
      } else if (yesterdayPebbles > 0 && todayPebbles === 0 && rand < 0.4) {
        phrase = `You completed ${yesterdayPebbles} pebbles yesterday! Let's get our first drop today. 🌟`;
      } else {
        if (pathname === "/") {
          const crowPhrases = [
            "Shiny things belong in jars! ✨",
            "One pebble at a time builds the nest.",
            "Caw! Ready to drop some pebbles?",
            "Need a break? Just sit by the sanctuary pool.",
          ];
          phrase = crowPhrases[Math.floor(Math.random() * crowPhrases.length)];
        } else if (pathname === "/tasks") {
          phrase = "Workspaces! Organize, conquer, repeat. 📋";
        } else if (pathname === "/daily") {
          phrase = "Everyday habits build consistency. Keep the flames lit! 🔥";
        } else if (pathname === "/focus") {
          phrase = "Cozy beats and deep focus. Time to flow! 🧘";
        } else if (pathname === "/settings") {
          phrase = "Adjusting the sanctuary dials. Be gentle! 🛠";
        } else {
          phrase = "Looking good! Let's make today count.";
        }
      }

      triggerBubble(phrase, 4500);

      // Revert position and rotation back after bubble closes
      tapRevertTimerRef.current = setTimeout(() => {
        translateX.value = withSpring(getOffset("idle"), { damping: 18 });
        rotation.value = withSpring(0, { damping: 15 });
        setMascotState("idle");
      }, 4500);
    }, 200);
  };

  if (isDismissed) return null;

  const animatedMascotStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value + breathingY.value },
        { scaleY: scaleY.value },
        { rotate: `${rotation.value}deg` },
      ],
    };
  });

  const animatedBubbleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: bubbleScale.value }],
      opacity: bubbleScale.value,
      right: 85 - translateX.value,
    };
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Dynamic Bubble Box */}
      {bubbleText && (
        <Animated.View
          style={[
            styles.bubbleContainer,
            { top: SCREEN_HEIGHT - 190 - 120 + 31 },
            animatedBubbleStyle,
          ]}
        >
          <BlurView
            intensity={colorScheme === "light" ? 65 : 85}
            tint={colorScheme === "light" ? "light" : "dark"}
            style={[
              styles.bubbleContent,
              {
                borderColor: colors.border,
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(255, 255, 255, 0.94)"
                    : "rgba(24, 24, 27, 0.94)",
              },
            ]}
          >
            <Text style={[styles.bubbleText, { color: colors.text }]}>
              {bubbleText}
            </Text>
          </BlurView>
          {/* Custom Arrow */}
          <View
            style={[
              styles.bubbleArrow,
              {
                borderLeftColor:
                  colorScheme === "light"
                    ? "rgba(255, 255, 255, 0.94)"
                    : "rgba(24, 24, 27, 0.94)",
              },
            ]}
          />
        </Animated.View>
      )}

      {/* Peeking Mascot Head */}
      <Animated.View
        style={[
          styles.mascotWrapper,
          { top: SCREEN_HEIGHT - 190 - 120 },
          animatedMascotStyle,
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={handleTapMascot} style={styles.mascotButton}>
          <Image
            source={MASCOT_ASSET_MAP[mascotState]}
            style={styles.avatarImage}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  mascotWrapper: {
    position: "absolute",
    right: 0,
    width: 120,
    height: 120,
  },
  mascotButton: {
    width: 120,
    height: 120,
  },
  avatarImage: {
    width: 120,
    height: 120,
    resizeMode: "contain",
  },
  bubbleContainer: {
    position: "absolute",
    width: 175,
    alignItems: "flex-end",
  },
  bubbleContent: {
    borderRadius: 16,
    borderWidth: 1.2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  bubbleText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "left",
  },
  bubbleArrow: {
    position: "absolute",
    top: 36,
    right: -8,
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderTopWidth: 6,
    borderRightWidth: 0,
    borderBottomWidth: 6,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
  },
});
