import { InteractivePebbleJar } from "@/components/profile/InteractivePebbleJar";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getPebbleCounts } from "@/services/pebbleService";
import {
  getProfile,
  getSettings,
  isCurrentlyInQuietHours,
  saveSettings,
} from "@/services/settingsService";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { usePathname, useRouter } from "expo-router";
import { getSmartQuickSuggestions } from "@/services/quickSuggestions";
import type { Todo, Habit, TaskList } from "@/modules/types";
import { TODOS_STORAGE_KEY, DAILY_STORAGE_KEY } from "@/services/storage";
import { Accelerometer } from "expo-sensors";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
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
import Svg, { Line, Circle } from "react-native-svg";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MASCOT_WIDTH = 120;

type MascotState =
  | "idle"
  | "peek"
  | "chatting"
  | "focus"
  | "sleeping"
  | "worried";

interface MascotPoseConfig {
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  bubbleOffsetRight: number;
  breathingAmplitude: number;
  breathingDuration: number;
}

const MASCOT_POSE_CONFIGS: Record<MascotState, MascotPoseConfig> = {
  idle: {
    translateX: 30, // partially off-screen
    translateY: 0,
    scale: 1.0,
    rotation: 0,
    bubbleOffsetRight: 85,
    breathingAmplitude: -3,
    breathingDuration: 2400,
  },
  peek: {
    translateX: 24, // pop out a bit more
    translateY: -5,
    scale: 1.0,
    rotation: 0,
    bubbleOffsetRight: 85,
    breathingAmplitude: -4,
    breathingDuration: 2000,
  },
  chatting: {
    translateX: 24, // curious tilt
    translateY: -2,
    scale: 1.0,
    rotation: -10, // curious head tilt left
    bubbleOffsetRight: 85,
    breathingAmplitude: -5,
    breathingDuration: 1800,
  },
  focus: {
    translateX: 26, // partially off-screen
    translateY: 0,
    scale: 1.0, // align with idle crow
    rotation: -5, // slight head tilt
    bubbleOffsetRight: 85,
    breathingAmplitude: -2, // calm, slow breathing
    breathingDuration: 3000,
  },
  sleeping: {
    translateX: 28, // nestled partially off-screen
    translateY: 4, // resting slightly lower
    scale: 1.0, // same scale as idle
    rotation: 0,
    bubbleOffsetRight: 85,
    breathingAmplitude: -1.2, // slow, shallow breathing
    breathingDuration: 4500,
  },
  worried: {
    translateX: 0, // full pop-out in concern
    translateY: -8,
    scale: 1.0, // align with idle crow
    rotation: 12, // worried head tilt right
    bubbleOffsetRight: 85,
    breathingAmplitude: -6, // fast, shallow breathing
    breathingDuration: 1200,
  },
};

const MASCOT_ASSET_MAP: Record<string, any> = {
  idle: require("@/assets/images/mascot/mascot_idle.png"),
  peek: require("@/assets/images/mascot/mascot_peek.png"),
  chatting: require("@/assets/images/mascot/mascot_chatting.png"),
  focus: require("@/assets/images/mascot/mascot_focus.png"),
  sleeping: require("@/assets/images/mascot/mascot_sleeping.png"),
  worried: require("@/assets/images/mascot/mascot_worried.png"),
};

const checkIfDailyClear = async (): Promise<boolean> => {
  try {
    const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
    const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

    let pendingCount = 0;
    let completedCount = 0;

    if (rawTodos) {
      const parsed = JSON.parse(rawTodos);
      const todosMap = parsed.todos || {};
      Object.values(todosMap).forEach((list: any) => {
        list.forEach((todo: any) => {
          if (!todo.archived) {
            const todoDate = todo.scheduledDate || (todo.alarmTime ? `${new Date(todo.alarmTime).getFullYear()}-${String(new Date(todo.alarmTime).getMonth() + 1).padStart(2, "0")}-${String(new Date(todo.alarmTime).getDate()).padStart(2, "0")}` : todayStr);
            if (todoDate <= todayStr || todo.scheduledDate === "inbox") {
              if (todo.completed) {
                completedCount++;
              } else {
                pendingCount++;
              }
            }
          }
        });
      });
    }

    if (rawHabits) {
      const parsed = JSON.parse(rawHabits);
      const habits = parsed.dailyHabits || [];
      const dayOfWeek = new Date().getDay();
      habits.forEach((h: any) => {
        if (!h.archived) {
          const isActive = !h.reminderDays || h.reminderDays.length === 0 || h.reminderDays.includes(dayOfWeek);
          if (isActive) {
            if (h.completedToday) {
              completedCount++;
            } else {
              pendingCount++;
            }
          }
        }
      });
    }

    return completedCount > 0 && pendingCount === 0;
  } catch {
    return false;
  }
};

export function MascotOverlay() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // State Variables
  const [profile, setProfile] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [todayPebbles, setTodayPebbles] = useState(0);
  const [yesterdayPebbles, setYesterdayPebbles] = useState(0);
  const [isDismissed, setIsDismissed] = useState(true);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [mascotState, setMascotState] = useState<MascotState>("idle");

  interface MascotSuggestionAction {
    label: string;
    type: "break" | "focus" | "add_task" | "add_habit";
    payload?: {
      title: string;
    };
  }

  const router = useRouter();
  const [suggestionAction, setSuggestionAction] = useState<MascotSuggestionAction | null>(null);
  const ignoreNextEventRef = useRef(false);

  const handleDismissComplete = () => {
    setIsDismissed(true);
    persistMascotDismissed(true);
    isDismissingRef.current = false;
  };

  const handleSettingsDismissComplete = () => {
    setIsDismissed(true);
    isDismissingRef.current = false;
  };

  // Reward overlay states
  const [showRewardOverlay, setShowRewardOverlay] = useState(false);
  const [rewardStartCount, setRewardStartCount] = useState(0);
  const [rewardTargetCount, setRewardTargetCount] = useState(0);
  const [fallingPebbleType, setFallingPebbleType] = useState<
    "task" | "habit" | "focus" | undefined
  >(undefined);
  const [monthlyTypes, setMonthlyTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
  }>({
    task: 0,
    habit: 0,
    focus: 0,
  });

  const lifetimePebblesRef = useRef(0);
  const prevLevelRef = useRef(0);
  const prevTodayPebblesRef = useRef(0);
  const lastActiveTimeRef = useRef<number>(0);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDismissedRef = useRef(isDismissed);
  const mascotStateRef = useRef(mascotState);
  const isDismissingRef = useRef(false);

  useEffect(() => {
    isDismissedRef.current = isDismissed;
  }, [isDismissed]);

  useEffect(() => {
    mascotStateRef.current = mascotState;
  }, [mascotState]);

  const resetActivityTimer = () => {
    lastActiveTimeRef.current = Date.now();
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
    }
    activityTimerRef.current = setTimeout(
      () => {
        revertToPassiveState();
      },
      5 * 60 * 1000,
    ); // 5 minutes
  };

  const revertToPassiveState = async () => {
    try {
      const settings = await getSettings();
      const currentHour = new Date().getHours();
      const inQuietHours = isCurrentlyInQuietHours(settings, currentHour);
      const isUserCurrentlyActive =
        Date.now() - lastActiveTimeRef.current < 5 * 60 * 1000;

      const rawSession = await AsyncStorage.getItem(
        "todoapp:focus:current_session",
      );
      let isFocusSessionRunning = false;
      if (rawSession) {
        const session = JSON.parse(rawSession);
        isFocusSessionRunning =
          session && session.type === "work" && session.isActive;
      }

      if (inQuietHours && !isUserCurrentlyActive) {
        setMascotState("sleeping");
      } else if (isFocusSessionRunning) {
        setMascotState("focus");
      } else {
        setMascotState("idle");
      }
    } catch {
      setMascotState("idle");
    }
  };

  const wakeUpTemporarily = async (
    reason?: "task" | "habit" | "shake" | "settings",
  ) => {
    lastActiveTimeRef.current = Date.now();
    resetActivityTimer();

    const wasSleeping = mascotState === "sleeping";
    await revertToPassiveState();

    if (wasSleeping) {
      let phrase = "Yawn... Working late? Let's do this! ☕";
      if (reason === "task") {
        const taskPhrases = [
          "Yawn... Oh, you're getting things done! Let's go! 📋",
          "Mascot awake! Ready for some productivity! 🦅",
          "I'm awake! Let's drop some pebbles! 🌟",
        ];
        phrase = taskPhrases[Math.floor(Math.random() * taskPhrases.length)];
      } else if (reason === "habit") {
        const habitPhrases = [
          "Yawn... I smell habits being completed! 🔥",
          "Awake and energized! Let's keep those flames lit! 🦅",
        ];
        phrase = habitPhrases[Math.floor(Math.random() * habitPhrases.length)];
      } else if (reason === "shake") {
        phrase = "Yawn... Whoa! Shaken awake! 🦅💫";
      } else if (reason === "settings") {
        phrase = "Yawn... Adjusting the dials? I'm awake! 🛠";
      }
      triggerBubble(phrase, 4500);
    }
  };

  // Reanimated Shared Values
  const translateX = useSharedValue(130); // start completely hidden off-screen
  const translateY = useSharedValue(0);
  const bubbleScale = useSharedValue(0);
  const breathingY = useSharedValue(0);
  const scaleY = useSharedValue(1);
  const rotation = useSharedValue(0);
  const bubbleOffsetRightShared = useSharedValue(55);

  // Keep track of active timers
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameRef = useRef(pathname);

  // Sync pathnameRef
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Load stats and state
  const loadStats = async (isInitial = false) => {
    try {
      const prof = await getProfile();
      setProfile(prof);
      if (prevLevelRef.current === 0 && prof) {
        prevLevelRef.current = prof.level;
      }

      const settings = await getSettings();
      if (isInitial) {
        const dismissedRaw = await AsyncStorage.getItem("todoapp:mascot:dismissed");
        const isTempDismissed = dismissedRaw === "true";
        setIsDismissed(!settings.showMascot || isTempDismissed);
      }

      const pebbleStats = await getPebbleCounts();
      setStreak(pebbleStats.streak || 0);
      lifetimePebblesRef.current = pebbleStats.lifetime || 0;
      setMonthlyTypes(
        pebbleStats.monthlyTypes || { task: 0, habit: 0, focus: 0 },
      );

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

      // Detect streak saved relief!
      if (
        prevTodayPebblesRef.current === 0 &&
        todayCount > 0 &&
        (pebbleStats.streak || 0) > 0
      ) {
        const currentHour = new Date().getHours();
        if (currentHour >= 17) {
          setTimeout(() => {
            triggerBubble("Streak saved! Caw! That was close. 🦅", 4500);
          }, 1200);
        }
      }
      prevTodayPebblesRef.current = todayCount;

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
    loadStats(true);

    // Listen to changes to keep counts updated dynamically
    const unsubscribeTasks = addStateListener("tasks_changed", () => {
      void loadStats();
      if (!ignoreNextEventRef.current) {
        void wakeUpTemporarily("task");
      }
    });
    const unsubscribeHabits = addStateListener("habits_changed", () => {
      void loadStats();
      if (!ignoreNextEventRef.current) {
        void wakeUpTemporarily("habit");
      }
    });
    const unsubscribeProfile = addStateListener("profile_changed", () => {
      void loadStats();
      if (!ignoreNextEventRef.current) {
        void wakeUpTemporarily("settings");
      }
    });

    const unsubscribeSettings = addStateListener(
      "settings_changed",
      async () => {
        const settings = await getSettings();
        if (settings.showMascot) {
          await AsyncStorage.setItem("todoapp:mascot:dismissed", "false");
        }
        
        const dismissedRaw = await AsyncStorage.getItem("todoapp:mascot:dismissed");
        const isTempDismissed = dismissedRaw === "true";
        const nextDismissed = !settings.showMascot || isTempDismissed;

        setIsDismissed((currDismissed) => {
          if (currDismissed && !nextDismissed) {
            translateX.value = MASCOT_WIDTH + 10;
            return false;
          } else if (!currDismissed && nextDismissed) {
            isDismissingRef.current = true;
            hideBubble(false);
            translateX.value = withTiming(MASCOT_WIDTH + 10, { duration: 300 }, () => {
              runOnJS(handleSettingsDismissComplete)();
            });
            return false;
          }
          return currDismissed;
        });
        await loadStats(false);
        await revertToPassiveState();
      },
    );

    const unsubscribeFocus = addStateListener("focus_changed", async () => {
      await loadStats();
      await revertToPassiveState();
    });

    const unsubscribePebbles = addStateListener("pebbles_changed", async () => {
      const pebbleStats = await getPebbleCounts();
      const newLifetime = pebbleStats.lifetime || 0;
      const prevLifetime = lifetimePebblesRef.current;

      const prevLevel = prevLevelRef.current;
      await loadStats();

      if (newLifetime > prevLifetime) {
        const log = pebbleStats.log || [];
        const lastEntry = log[log.length - 1];
        const pType = lastEntry ? lastEntry.type : "task";

        // Check Big Win Triggers:
        // 1. Level up
        const currentProf = await getProfile();
        const isLevelUp = currentProf && prevLevel > 0 && currentProf.level > prevLevel;
        if (currentProf) {
          prevLevelRef.current = currentProf.level;
        }

        // 2. Stage/milestone update
        const milestones = [10, 25, 50, 100, 250, 500];
        const isMilestone = milestones.includes(newLifetime);

        // 3. Daily Clear (all tasks/habits checked)
        const isDailyClear = await checkIfDailyClear();

        if (isLevelUp || isMilestone || isDailyClear) {
          setRewardStartCount(prevLifetime);
          setRewardTargetCount(newLifetime);
          setFallingPebbleType(pType);
          setShowRewardOverlay(true);
        }
      }
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
      unsubscribeProfile();
      unsubscribePebbles();
      unsubscribeSettings();
      unsubscribeFocus();
      if (tapDelayTimerRef.current) clearTimeout(tapDelayTimerRef.current);
      if (tapRevertTimerRef.current) clearTimeout(tapRevertTimerRef.current);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, []);

  // Synchronized State-Based Mascot Animation
  useEffect(() => {
    if (isDismissed || isDismissingRef.current) return;

    const config = MASCOT_POSE_CONFIGS[mascotState];
    const springConfig =
      mascotState === "worried"
        ? { damping: 12, stiffness: 100 }
        : { damping: 18 };

    translateX.value = withSpring(config.translateX, springConfig);
    translateY.value = withSpring(config.translateY, springConfig);
    scaleY.value = withSpring(config.scale, springConfig);
    rotation.value = withSpring(config.rotation, springConfig);
    bubbleOffsetRightShared.value = withSpring(
      config.bubbleOffsetRight,
      springConfig,
    );

    // Apply breathing animation loop dynamically matching the state config
    breathingY.value = withRepeat(
      withSequence(
        withTiming(config.breathingAmplitude, {
          duration: config.breathingDuration,
        }),
        withTiming(0, { duration: config.breathingDuration }),
      ),
      -1,
      true,
    );
  }, [mascotState, isDismissed]);

  // Micro Animations: Periodic Eye Blinks
  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout>;

    const triggerBlink = () => {
      if (isDismissed) return;
      const currentScale = MASCOT_POSE_CONFIGS[mascotState].scale;
      scaleY.value = withSequence(
        withTiming(0.1, { duration: 80 }),
        withTiming(currentScale, { duration: 80 }),
      );

      const nextDelay = 4000 + Math.random() * 4000;
      blinkTimeout = setTimeout(triggerBlink, nextDelay);
    };

    const firstDelay = 4000 + Math.random() * 4000;
    blinkTimeout = setTimeout(triggerBlink, firstDelay);

    return () => {
      clearTimeout(blinkTimeout);
    };
  }, [mascotState, isDismissed]);

  // Micro Animations: Occasional Head Tilts
  useEffect(() => {
    let tiltTimeout: ReturnType<typeof setTimeout>;

    const triggerTilt = () => {
      if (mascotState === "idle" && !isDismissed) {
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
  }, [mascotState, isDismissed]);

  // Shake Gesture Summon / Dismiss Detection
  useEffect(() => {
    let subscription: any = null;
    let lastShakeTime = 0;

    const handleShake = async () => {
      const now = Date.now();
      if (now - lastShakeTime < 2500) return;
      lastShakeTime = now;

      try {
        const settings = await getSettings();

        // If mascot is explicitly disabled in Settings, shake does nothing!
        if (!settings.showMascot) {
          console.log("[MascotOverlay] Shake ignored because mascot is disabled in Settings.");
          return;
        }

        resetActivityTimer();
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});

        const currentIsDismissed = isDismissedRef.current;
        const currentMascotState = mascotStateRef.current;

        // If mascot is currently swiped away/hidden, summon it!
        if (currentIsDismissed) {
          setIsDismissed(false);
          await AsyncStorage.setItem("todoapp:mascot:dismissed", "false");
          translateX.value = MASCOT_WIDTH + 10; // pop from off-screen
          setTimeout(() => {
            triggerBubble("You summoned me! Caw! 🦅", 4500);
          }, 300);
          return;
        }

        // If mascot is visible, but sleeping: WAKE IT UP!
        if (currentMascotState === "sleeping") {
          await wakeUpTemporarily("shake");
          return;
        }

        // If mascot is visible and awake: dismiss/hide it!
        dismissMascot();
      } catch (e) {
        console.warn("Failed handling shake gesture", e);
      }
    };

    const startListening = async () => {
      try {
        const isAvailable = await Accelerometer.isAvailableAsync();
        if (!isAvailable) return;

        Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const acceleration = Math.sqrt(x * x + y * y + z * z);
          const sensibility = 2.2; // G-force threshold for a solid shake
          if (acceleration >= sensibility) {
            handleShake();
          }
        });
      } catch (e) {
        console.warn("Accelerometer not available", e);
      }
    };

    startListening();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // Periodic Peeking Behavior (peeking crow in between sometimes)
  useEffect(() => {
    if (isDismissed) return;

    let peekTimeout: ReturnType<typeof setTimeout>;

    const triggerPeriodicPeek = () => {
      if (mascotState === "idle" && !bubbleText) {
        setMascotState("peek");

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
          revertToPassiveState();
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
      onStartShouldSetPanResponder: () => false,
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

  const persistMascotDismissed = async (dismissed: boolean) => {
    try {
      await AsyncStorage.setItem("todoapp:mascot:dismissed", String(dismissed));
    } catch (e) {
      console.warn("Failed to persist mascot dismissal", e);
    }
  };

  const dismissMascot = () => {
    isDismissingRef.current = true;
    hideBubble(false);
    setSuggestionAction(null);
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
    if (tapDelayTimerRef.current) {
      clearTimeout(tapDelayTimerRef.current);
      tapDelayTimerRef.current = null;
    }
    if (tapRevertTimerRef.current) {
      clearTimeout(tapRevertTimerRef.current);
      tapRevertTimerRef.current = null;
    }
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
    translateX.value = withTiming(MASCOT_WIDTH + 10, { duration: 300 }, () => {
      runOnJS(handleDismissComplete)();
    });
  };

  const hideBubble = (shouldRevert = true) => {
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
    bubbleScale.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setBubbleText)(null);
      runOnJS(setSuggestionAction)(null);
      if (shouldRevert) {
        runOnJS(revertToPassiveState)();
      }
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

    const resolvePassiveState = async () => {
      try {
        const settings = await getSettings();
        const currentHour = new Date().getHours();
        const isEvening = currentHour >= 17;
        const inQuietHours = isCurrentlyInQuietHours(settings, currentHour);
        const isUserCurrentlyActive =
          Date.now() - lastActiveTimeRef.current < 5 * 60 * 1000;

        const rawSession = await AsyncStorage.getItem(
          "todoapp:focus:current_session",
        );
        let isFocusSessionRunning = false;
        if (rawSession) {
          const session = JSON.parse(rawSession);
          isFocusSessionRunning =
            session && session.type === "work" && session.isActive;
        }

        console.log("[MascotOverlay] resolvePassiveState running:", {
          pathname,
          isDismissed,
          currentHour,
          inQuietHours,
          isUserCurrentlyActive,
          isFocusSessionRunning,
          todayPebbles,
          streak,
        });

        if (bubbleText) {
          hideBubble();
        }

        if (inQuietHours && !isUserCurrentlyActive) {
          console.log("[MascotOverlay] resolved state: sleeping");
          setMascotState("sleeping");
        } else if (isFocusSessionRunning) {
          console.log("[MascotOverlay] resolved state: focus");
          setMascotState("focus");
        } else if (
          pathname !== "/" &&
          isEvening &&
          todayPebbles === 0 &&
          streak > 0
        ) {
          console.log("[MascotOverlay] resolved state: worried");
          setMascotState("worried");

          setTimeout(() => {
            triggerBubble(
              `Oh! Our ${streak}-day streak is at risk! Let's do one small goal.`,
              4500,
            );

            setTimeout(() => {
              revertToPassiveState();
            }, 4500);
          }, 1000);
        } else {
          console.log("[MascotOverlay] resolved state: idle");
          setMascotState("idle");
        }
      } catch (e) {
        console.warn("Failed resolving passive state for mascot", e);
      }
    };

    resolvePassiveState();
  }, [pathname, isDismissed, todayPebbles, streak]);

  const handleTapMascot = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    resetActivityTimer(); // Tapping wakes up the mascot

    if (bubbleText) {
      hideBubble();
      return;
    }

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
        revertToPassiveState();
      }, 4500);
    }, 200);
  };

  const fetchSmartActionSuggestion = async (): Promise<{ title: string; type: "task" | "habit" } | null> => {
    try {
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      const parsedTodos = rawTodos ? JSON.parse(rawTodos) : { lists: [], todos: {} };
      const tasks = Object.values(parsedTodos.todos || {}).flat() as Todo[];
      const workspaces = (parsedTodos.lists || []) as TaskList[];

      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      const habits = rawHabits ? JSON.parse(rawHabits).dailyHabits || [] : [];

      const smartSugInput = { tasks, habits, workspaces };
      const recs = await getSmartQuickSuggestions(smartSugInput);

      if (recs && recs.length > 0) {
        const text = recs[0];
        const isHabit = text.toLowerCase().includes("daily") || 
                        text.toLowerCase().includes("every") || 
                        text.toLowerCase().includes("weekly");
        return {
          title: text,
          type: isHabit ? "habit" : "task",
        };
      }
    } catch (e) {
      console.warn("Failed to fetch smart action suggestion", e);
    }
    return null;
  };

  const triggerBubbleWithAction = (text: string, action: MascotSuggestionAction | null, durationMs = 8000) => {
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
    }
    setBubbleText(text);
    setSuggestionAction(action);
    bubbleScale.value = withSpring(1, { damping: 15 });

    bubbleTimerRef.current = setTimeout(() => {
      hideBubble();
    }, durationMs);
  };

  const handlePebbleCompletedSuggestion = async (type: "task" | "habit" | "focus") => {
    const phrases: Record<string, string[]> = {
      task: [
        "Task complete! Pebble dropped! Caw! 🦅",
        "One more task down. Outstanding! ✨",
        "Caw! That's another pebble in the jar! 💎",
      ],
      habit: [
        "Habit completed! Keep the fire burning! 🔥",
        "Habit done! Building that consistency! 💪",
        "Caw! Consistency is key! 🦅",
      ],
      focus: [
        "Focused session complete! Zen status achieved! 🧘⚡",
        "Great focus! You're unstoppable! 🚀",
        "Yawn... oh wait, you're done! Spectacular focus! 🎓",
      ],
    };
    const list = phrases[type] || phrases.task;
    const randomPhrase = list[Math.floor(Math.random() * list.length)];

    lastActiveTimeRef.current = Date.now();
    await revertToPassiveState();

    let action: MascotSuggestionAction | null = null;
    let customText = randomPhrase;

    if (type === "task") {
      const rand = Math.random();
      if (rand < 0.4) {
        action = {
          label: "Start 5m Zen Break 🧘",
          type: "break",
        };
        customText = `${randomPhrase} How about a well-deserved short break?`;
      } else if (rand < 0.7) {
        action = {
          label: "Start 25m Focus Flow ⚡",
          type: "focus",
        };
        customText = `${randomPhrase} Want to flow directly into the next task?`;
      } else {
        const smartRec = await fetchSmartActionSuggestion();
        if (smartRec) {
          action = {
            label: `+ Suggestion: "${smartRec.title.length > 25 ? smartRec.title.substring(0, 22) + '...' : smartRec.title}"`,
            type: smartRec.type === "habit" ? "add_habit" : "add_task",
            payload: { title: smartRec.title },
          };
          customText = `${randomPhrase} Ready for your next objective? Try this suggestion:`;
        }
      }
    } else if (type === "habit") {
      const rand = Math.random();
      if (rand < 0.5) {
        action = {
          label: "Start 25m Focus Session 🧘",
          type: "focus",
        };
        customText = `${randomPhrase} Ready to lock in and focus?`;
      } else {
        const smartRec = await fetchSmartActionSuggestion();
        if (smartRec) {
          action = {
            label: `+ Suggestion: "${smartRec.title.length > 25 ? smartRec.title.substring(0, 22) + '...' : smartRec.title}"`,
            type: smartRec.type === "habit" ? "add_habit" : "add_task",
            payload: { title: smartRec.title },
          };
          customText = `${randomPhrase} Consistency builds character. Try adding this habit:`;
        }
      }
    } else if (type === "focus") {
      action = {
        label: "Start 5m Break ☕",
        type: "break",
      };
      customText = `${randomPhrase} Great work! Rest is essential. Take a 5-minute breather?`;
    }

    triggerBubbleWithAction(customText, action, 10000);
  };

  const handleExecuteAction = async () => {
    if (!suggestionAction) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const { type, payload } = suggestionAction;
    hideBubble(true);

    try {
      if (type === "break") {
        router.push("/focus");
        await AsyncStorage.setItem(
          "todoapp:focus:current_session",
          JSON.stringify({
            type: "break",
            startTime: Date.now(),
            duration: 300,
            elapsedBeforeStart: 0,
            isActive: true,
            breakType: "short",
            focusedTaskId: null,
            loggedMinutes: 0,
            lastSaved: Date.now(),
          }),
        );
        emitStateChange("focus_changed", "MascotOverlay");
      } else if (type === "focus") {
        router.push("/focus");
        await AsyncStorage.setItem(
          "todoapp:focus:current_session",
          JSON.stringify({
            type: "work",
            startTime: Date.now(),
            duration: 1500,
            elapsedBeforeStart: 0,
            isActive: true,
            breakType: "short",
            focusedTaskId: null,
            loggedMinutes: 0,
            lastSaved: Date.now(),
          }),
        );
        emitStateChange("focus_changed", "MascotOverlay");
      } else if (type === "add_task" && payload) {
        ignoreNextEventRef.current = true;
        setTimeout(() => {
          ignoreNextEventRef.current = false;
        }, 1500);

        const newTodo: Todo = {
          id: String(Date.now()),
          title: payload.title,
          completed: false,
          category: "learning",
          priority: "medium",
          folderId: "default",
        };
        const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        const parsedTodos = rawTodos ? JSON.parse(rawTodos) : { lists: [], todos: {} };
        const currentTodos = parsedTodos.todos || {};
        const listTodos = currentTodos["default"] ?? [];
        
        const updated = {
          ...currentTodos,
          ["default"]: [newTodo, ...listTodos],
        };
        await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify({
          lists: parsedTodos.lists || [{ id: "default", name: "📋 My Pebbles" }],
          selectedList: parsedTodos.selectedList || "default",
          todos: updated
        }));
        emitStateChange("tasks_changed");
        setTimeout(() => {
          triggerBubble("Caw! Suggestion added to tasks! 📋✨", 4000);
        }, 300);
      } else if (type === "add_habit" && payload) {
        ignoreNextEventRef.current = true;
        setTimeout(() => {
          ignoreNextEventRef.current = false;
        }, 1500);

        const newHabit: Habit = {
          id: `habit-${Date.now()}`,
          title: payload.title,
          streak: 0,
          bestStreak: 0,
          completedToday: false,
          priority: "medium",
        };
        const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        let currentHabits: Habit[] = [];
        if (raw) {
          const parsed = JSON.parse(raw);
          currentHabits = parsed.dailyHabits ?? [];
        }
        const updated = [newHabit, ...currentHabits];
        await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({ dailyHabits: updated }));
        emitStateChange("habits_changed");
        setTimeout(() => {
          triggerBubble("Caw! Suggestion added to habits! 🔥✨", 4000);
        }, 300);
      }
    } catch (e) {
      console.warn("Failed executing mascot suggestion action", e);
    }
  };

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
      right: bubbleOffsetRightShared.value - translateX.value,
    };
  });

  const animatedCardContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: bubbleScale.value },
        { translateY: translateY.value + breathingY.value },
      ],
      opacity: bubbleScale.value,
      right: bubbleOffsetRightShared.value - translateX.value - 14,
    };
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Speech Bubble (only shown for general chatter / when no suggestionAction) */}
      {!isDismissed && bubbleText && !suggestionAction && (
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

      {/* Dangling Suggestion Card (shown when there is a suggestionAction) */}
      {!isDismissed && bubbleText && suggestionAction && (
        <Animated.View
          style={[
            styles.cardContainer,
            { top: SCREEN_HEIGHT - 190 - 120 },
            animatedCardContainerStyle,
          ]}
        >
          {/* Hanging Thread (SVG) */}
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* The twine string */}
            <Line
              x1={181}
              y1={68}
              x2={166}
              y2={108}
              stroke={colorScheme === "light" ? "#A78B68" : "#8C714E"}
              strokeWidth={1.5}
            />
            {/* Knot at beak */}
            <Circle
              cx={181}
              cy={68}
              r={2.5}
              fill={colorScheme === "light" ? "#A78B68" : "#8C714E"}
            />
            {/* Knot at card hole */}
            <Circle
              cx={166}
              cy={108}
              r={2}
              fill={colorScheme === "light" ? "#A78B68" : "#8C714E"}
            />
          </Svg>

          {/* Parchment Card with tilt */}
          <BlurView
            intensity={colorScheme === "light" ? 70 : 90}
            tint={colorScheme === "light" ? "light" : "dark"}
            style={[
              styles.parchmentCard,
              {
                borderColor: colors.border,
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(253, 251, 242, 0.96)"
                    : "rgba(30, 29, 27, 0.96)",
              },
            ]}
          >
            {/* Small punch hole at the top-right where the thread connects */}
            <View style={[styles.cardHole, { borderColor: colors.border }]} />

            <View style={styles.cardHeader}>
              <Text style={[styles.cardHeaderText, { color: colors.primary }]}>
                CROW'S SUGGESTION 🦅
              </Text>
            </View>

            <Text style={[styles.cardText, { color: colors.text }]}>
              {bubbleText}
            </Text>

            <Pressable
              onPress={handleExecuteAction}
              style={({ pressed }) => [
                styles.cardButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={styles.cardButtonText}>
                {suggestionAction.label}
              </Text>
            </Pressable>
          </BlurView>
        </Animated.View>
      )}

      {/* Peeking Mascot Head */}
      {!isDismissed && (
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
      )}

      {/* Reward Overlay Modal */}
      <Modal
        visible={showRewardOverlay}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRewardOverlay(false)}
      >
        <View style={styles.overlayContainer}>
          <BlurView
            intensity={colorScheme === "light" ? 40 : 60}
            style={StyleSheet.absoluteFill}
            tint={colorScheme === "light" ? "light" : "dark"}
          />
          <View
            style={[
              styles.overlayContent,
              {
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(255, 255, 255, 0.9)"
                    : "rgba(24, 24, 27, 0.85)",
                borderColor:
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(255,255,255,0.08)",
              },
            ]}
          >
            <Text
              style={[
                styles.rewardTitle,
                { color: colors.primaryLight || colors.primary },
              ]}
            >
              +1 PEBBLE!
            </Text>
            {showRewardOverlay && (
              <InteractivePebbleJar
                mode="reward"
                startCount={rewardStartCount}
                targetCount={rewardTargetCount}
                onComplete={() => {
                  setTimeout(() => {
                    setShowRewardOverlay(false);
                    // Mascot congratulates and suggests next steps!
                    void handlePebbleCompletedSuggestion(fallingPebbleType || "task");
                  }, 400);
                }}
                colors={colors}
                colorScheme={colorScheme ?? "dark"}
                monthlyTypes={monthlyTypes}
                fallingPebbleType={fallingPebbleType}
                profileAvatar={profile?.avatar}
              />
            )}
            <Text style={[styles.rewardSubtitle, { color: colors.textMuted }]}>
              Adding pebble to your sanctuary jar
            </Text>
          </View>
        </View>
      </Modal>
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
  suggestionButton: {
    alignSelf: "stretch",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  suggestionButtonText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
    textAlign: "center",
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
  cardContainer: {
    position: "absolute",
    width: 185,
    alignItems: "flex-end",
  },
  parchmentCard: {
    marginTop: 105, // Height of string + offset (67 + 38)
    width: 185,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    transform: [{ rotate: "-4deg" }],
  },
  cardHole: {
    position: "absolute",
    top: 8,
    right: 12,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: "transparent",
    opacity: 0.6,
  },
  cardHeader: {
    marginBottom: 6,
  },
  cardHeaderText: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cardText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "left",
    marginBottom: 8,
  },
  cardButton: {
    alignSelf: "stretch",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardButtonText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
    textAlign: "center",
  },
  overlayContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  overlayContent: {
    width: "85%",
    borderRadius: 32,
    borderWidth: 1.5,
    padding: 24,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  rewardTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  rewardSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
});
