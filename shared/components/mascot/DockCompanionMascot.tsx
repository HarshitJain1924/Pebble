import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette, Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import { InteractivePebbleJar } from "@/features/profile/components/InteractivePebbleJar";
import { getPebbleCounts } from "@/features/profile/services/pebble.service";
import {
  getProfile,
  getSettings,
  type UserProfile,
} from "@/features/settings/services/settings.service";
import { addStateListener } from "@/services/events/state-events";
import { TaskRepository, HabitRepository, UiStateRepository } from "@/repositories";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { launchFocusSession } from "@/features/focus/services/FocusLaunchService";

const MASCOT_RIG = {
  body: require("@/assets/images/mascot/cairn_rig_body.png"),
  head: require("@/assets/images/mascot/cairn_rig_head.png"),
};

const MASCOT_POSES = {
  // Front-facing neutral (closed beak)
  frontNeutral: require("@/assets/images/mascot/new_pose_front.png"),
  // Front-facing speaking (open beak)
  frontSpeaking: require("@/assets/images/mascot/new_pose_front_speaking.png"),
};

// Subtle, continuous dock reaction targets mapped to radial sector positions
// Left-to-right arc (165° Today -> 90° Quick Add -> 15° Focus)
const SECTOR_RIG_REACTIONS: Record<
  number,
  {
    headTilt: number;
    headTranslateY: number;
    bodyTilt: number;
    leanX: number;
    hop: number;
  }
> = {
  // Neutral curious hover when dial blooms open
  [-1]: { headTilt: 3.0, headTranslateY: -1.0, bodyTilt: 1.8, leanX: 1.5, hop: -1.0 },
  // Sector 0: Today (165° low-left, closest to Cairn)
  0: { headTilt: -4.0, headTranslateY: 0.5, bodyTilt: 1.2, leanX: 1.0, hop: -0.5 },
  // Sector 1: Workspaces (127.5° mid-left)
  1: { headTilt: 1.5, headTranslateY: -1.5, bodyTilt: 2.0, leanX: 2.0, hop: -1.5 },
  // Sector 2: Quick Capture (90° top apex)
  2: { headTilt: 8.5, headTranslateY: -3.5, bodyTilt: 3.0, leanX: 2.8, hop: -2.5 },
  // Sector 3: Schedule (52.5° mid-right)
  3: { headTilt: 5.5, headTranslateY: -2.0, bodyTilt: 4.0, leanX: 3.8, hop: -2.0 },
  // Sector 4: Focus Mode (15° far-right)
  4: { headTilt: 11.0, headTranslateY: -1.0, bodyTilt: 5.0, leanX: 4.8, hop: -1.0 },
};

// Rigged Chunky Chibi scale
const MASCOT_CONTAINER_WIDTH = 68;
const MASCOT_CONTAINER_HEIGHT = 84;
const BODY_WIDTH = 64;
const BODY_HEIGHT = 55;
const HEAD_WIDTH = 58;
const HEAD_HEIGHT = 48;

interface MascotAction {
  label: string;
  action: () => void;
}

const checkIfDailyClear = async (): Promise<boolean> => {
  try {
    const uiState = await UiStateRepository.getUiState();
    const activeWorkspace = uiState.activeWorkspaceId || "default";
    const tasksMap = await TaskRepository.getTasks(activeWorkspace);
    const habitsMap = await HabitRepository.getHabits(activeWorkspace);
    const todayStr = getTodayDateKey();

    let pendingCount = 0;
    let completedCount = 0;

    Object.values(tasksMap).forEach((todo: any) => {
      if (!todo.archivedAt) {
        const todoDate = todo.dueDate || todayStr;
        if (todoDate <= todayStr || todo.dueDate === "inbox") {
          if (todo.completed) {
            completedCount++;
          } else {
            pendingCount++;
          }
        }
      }
    });

    Object.values(habitsMap).forEach((habit: any) => {
      if (!habit.archivedAt) {
        if (habit.history && habit.history[todayStr]) {
          completedCount++;
        } else {
          pendingCount++;
        }
      }
    });

    return completedCount > 0 && pendingCount === 0;
  } catch {
    return false;
  }
};

export interface DockCompanionMascotProps {
  isDialOpen?: boolean;
  activeSector?: number;
  selectedSector?: number | null;
  bottomOffset?: number;
}

export const DockCompanionMascot: React.FC<DockCompanionMascotProps> = ({
  isDialOpen = false,
  activeSector = -1,
  selectedSector = null,
  bottomOffset = 0,
}) => {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  // App settings & profile
  const [isEnabled, setIsEnabled] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState(0);
  const [isFocusActive, setIsFocusActive] = useState(false);

  // Duolingo Duo Squash & Stretch Animation Values
  const scaleXAnim = useSharedValue(1);
  const scaleYAnim = useSharedValue(1);
  const hopAnim = useSharedValue(0);
  const leanXAnim = useSharedValue(0);

  // Rigged Head & Body Values
  const headTiltAnim = useSharedValue(0);
  const headTranslateYAnim = useSharedValue(0);
  const bodyTiltAnim = useSharedValue(0);
  const bodyScaleYAnim = useSharedValue(1);

  // Interaction State
  const [whisperText, setWhisperText] = useState<string | null>(null);
  const [whisperAction, setWhisperAction] = useState<MascotAction | null>(null);
  const whisperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Front Transition & Speaking State
  const frontTransitionAnim = useSharedValue(0);
  const [mouthFrame, setMouthFrame] = useState<"neutral" | "speaking">("neutral");
  const speakingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearSpeakingTimers = useCallback(() => {
    speakingTimersRef.current.forEach((t) => clearTimeout(t));
    speakingTimersRef.current = [];
  }, []);

  // Reward Overlay Modal States (Inherited from former MascotOverlay)
  const [showRewardOverlay, setShowRewardOverlay] = useState(false);
  const [rewardStartCount, setRewardStartCount] = useState(0);
  const [rewardTargetCount, setRewardTargetCount] = useState(0);
  const [fallingPebbleType, setFallingPebbleType] = useState<
    "task" | "habit" | "focus" | "checklist" | undefined
  >(undefined);
  const [monthlyTypes, setMonthlyTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
    checklist: number;
  }>({ task: 0, habit: 0, focus: 0, checklist: 0 });
  const lifetimePebblesRef = useRef(0);

  // Check if a Focus Session or Stopwatch is actively running
  const checkFocusActive = useCallback(async () => {
    try {
      const rawSession = await AsyncStorage.getItem("todoapp:focus:current_session");
      if (rawSession) {
        const session = JSON.parse(rawSession);
        if (session?.isActive) {
          const now = Date.now();
          const elapsed =
            (session.elapsedBeforeStart || 0) +
            Math.floor((now - (session.startTime || now)) / 1000);
          if (elapsed < (session.duration || 0)) {
            setIsFocusActive(true);
            return;
          }
        }
      }
      const rawSw = await AsyncStorage.getItem("todoapp:focus:current_stopwatch");
      if (rawSw) {
        const sw = JSON.parse(rawSw);
        if (sw?.isRunning) {
          setIsFocusActive(true);
          return;
        }
      }
      setIsFocusActive(false);
    } catch {
      setIsFocusActive(false);
    }
  }, []);

  // 1. Sync stats and settings
  const loadData = useCallback(async () => {
    try {
      const settings = await getSettings();
      setIsEnabled(settings.showMascot !== false);

      const prof = await getProfile();
      setProfile(prof);

      const pebbleStats = await getPebbleCounts();
      setStreak(pebbleStats.streak || 0);
      lifetimePebblesRef.current = pebbleStats.lifetime || 0;
      setMonthlyTypes(
        pebbleStats.monthlyTypes || { task: 0, habit: 0, focus: 0, checklist: 0 }
      );
    } catch {
      // Graceful fallback
    }
  }, []);

  useEffect(() => {
    void loadData();
    void checkFocusActive();

    // Listen to changes across the app
    const unsubTasks = addStateListener("tasks_changed", () => void loadData());
    const unsubHabits = addStateListener("habits_changed", () => void loadData());
    const unsubProfile = addStateListener("profile_changed", () => void loadData());
    const unsubSettings = addStateListener("settings_changed", () => void loadData());
    const unsubFocus = addStateListener("focus_changed", () => void checkFocusActive());

    // Listen to pebble completions (Milestone rewards & +1 Pebble modal)
    const unsubPebbles = addStateListener("pebbles_changed", async () => {
      const pebbleStats = await getPebbleCounts();
      const newLifetime = pebbleStats.lifetime || 0;
      const prevLifetime = lifetimePebblesRef.current;

      await loadData();

      if (newLifetime > prevLifetime) {
        const log = pebbleStats.log || [];
        const lastEntry = log[log.length - 1];
        const pType = lastEntry ? lastEntry.type : "task";

        const milestones = [10, 25, 50, 100, 250, 500];
        const isMilestone = milestones.includes(newLifetime);
        const isDailyClear = await checkIfDailyClear();
        const isFirstToday = pebbleStats.today === 1;

        if (isMilestone || isDailyClear || isFirstToday) {
          setRewardStartCount(prevLifetime);
          setRewardTargetCount(newLifetime);
          setFallingPebbleType(pType as any);
          setShowRewardOverlay(true);
        }
      }
    });

    return () => {
      unsubTasks();
      unsubHabits();
      unsubProfile();
      unsubSettings();
      unsubFocus();
      unsubPebbles();
      if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
      clearSpeakingTimers();
    };
  }, [loadData, checkFocusActive, clearSpeakingTimers]);

  // Behavior 1: Subtle, calm idle breathing when resting (Section 9: suppressed during focus, dial open, or reduced motion)
  useEffect(() => {
    if (
      isFocusActive ||
      isDialOpen ||
      whisperText ||
      reducedMotion ||
      (selectedSector !== null && selectedSector !== undefined)
    ) {
      // Still during focus sessions, open dial, active whisper, or reduced motion
      bodyScaleYAnim.value = withTiming(1, { duration: 180 });
      scaleYAnim.value = withTiming(1, { duration: 180 });
      scaleXAnim.value = withTiming(1, { duration: 180 });
      return;
    }

    // Gentle chest/body breathing
    bodyScaleYAnim.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0, { duration: 2400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [
    isFocusActive,
    isDialOpen,
    whisperText,
    reducedMotion,
    selectedSector,
    bodyScaleYAnim,
    scaleYAnim,
    scaleXAnim,
  ]);

  // Behavior 2 & 3: While radial menu is open and user drags across sectors
  // Head rotates expressively tracking dial; body leans subtly in sync
  useEffect(() => {
    if (isFocusActive) {
      // Focus invariant (Section 9): Cairn becomes still
      headTiltAnim.value = withTiming(0, { duration: 150 });
      headTranslateYAnim.value = withTiming(0, { duration: 150 });
      bodyTiltAnim.value = withTiming(0, { duration: 150 });
      leanXAnim.value = withTiming(0, { duration: 150 });
      hopAnim.value = withTiming(0, { duration: 150 });
      return;
    }

    if (!isDialOpen) return;

    if (reducedMotion) {
      headTiltAnim.value = 0;
      headTranslateYAnim.value = 0;
      bodyTiltAnim.value = 0;
      leanXAnim.value = 0;
      hopAnim.value = 0;
      return;
    }

    const reaction =
      SECTOR_RIG_REACTIONS[activeSector] ?? SECTOR_RIG_REACTIONS[-1];

    // Smooth, continuous spring tracking across sectors
    headTiltAnim.value = withSpring(reaction.headTilt, {
      damping: 17,
      stiffness: 170,
      mass: 0.5,
    });
    headTranslateYAnim.value = withSpring(reaction.headTranslateY, {
      damping: 17,
      stiffness: 170,
      mass: 0.5,
    });
    bodyTiltAnim.value = withSpring(reaction.bodyTilt, {
      damping: 19,
      stiffness: 160,
      mass: 0.6,
    });
    leanXAnim.value = withSpring(reaction.leanX, {
      damping: 19,
      stiffness: 160,
      mass: 0.6,
    });
    hopAnim.value = withSpring(reaction.hop, {
      damping: 19,
      stiffness: 160,
      mass: 0.6,
    });
  }, [
    isDialOpen,
    activeSector,
    isFocusActive,
    reducedMotion,
    headTiltAnim,
    headTranslateYAnim,
    bodyTiltAnim,
    leanXAnim,
    hopAnim,
  ]);

  // Behavior 4: Tiny acknowledgment movement on selection, then return to neutral
  useEffect(() => {
    if (
      selectedSector !== null &&
      selectedSector !== undefined &&
      selectedSector >= 0
    ) {
      if (isFocusActive) return;

      if (reducedMotion) {
        headTiltAnim.value = 0;
        headTranslateYAnim.value = 0;
        bodyTiltAnim.value = 0;
        leanXAnim.value = 0;
        hopAnim.value = 0;
        scaleXAnim.value = 1;
        scaleYAnim.value = 1;
        bodyScaleYAnim.value = 1;
        return;
      }

      // Small, polite nod & hop acknowledgment
      headTiltAnim.value = withSequence(
        withTiming(-4, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 14, stiffness: 220 })
      );
      hopAnim.value = withSequence(
        withTiming(-3, { duration: 80, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 15, stiffness: 220 })
      );
      scaleYAnim.value = withSequence(
        withTiming(1.03, { duration: 70 }),
        withSpring(1, { damping: 14 })
      );
      scaleXAnim.value = withSequence(
        withTiming(0.98, { duration: 70 }),
        withSpring(1, { damping: 14 })
      );
      bodyTiltAnim.value = withSpring(0, { damping: 16, stiffness: 200 });
      leanXAnim.value = withSpring(0, { damping: 16, stiffness: 200 });
    }
  }, [
    selectedSector,
    isFocusActive,
    reducedMotion,
    headTiltAnim,
    hopAnim,
    scaleYAnim,
    scaleXAnim,
    bodyTiltAnim,
    leanXAnim,
    bodyScaleYAnim,
  ]);

  // Behavior 5: Dial closes without selection -> smoothly return to neutral
  useEffect(() => {
    if (
      !isDialOpen &&
      (selectedSector === null || selectedSector === undefined)
    ) {
      if (reducedMotion) {
        headTiltAnim.value = 0;
        headTranslateYAnim.value = 0;
        bodyTiltAnim.value = 0;
        leanXAnim.value = 0;
        hopAnim.value = 0;
        scaleXAnim.value = 1;
        scaleYAnim.value = 1;
        bodyScaleYAnim.value = 1;
        return;
      }

      headTiltAnim.value = withSpring(0, { damping: 18, stiffness: 180 });
      headTranslateYAnim.value = withSpring(0, { damping: 18, stiffness: 180 });
      bodyTiltAnim.value = withSpring(0, { damping: 18, stiffness: 180 });
      leanXAnim.value = withSpring(0, { damping: 18, stiffness: 180 });
      hopAnim.value = withSpring(0, { damping: 18, stiffness: 180 });
      scaleXAnim.value = withSpring(1, { damping: 18 });
      scaleYAnim.value = withSpring(1, { damping: 18 });
      bodyScaleYAnim.value = withSpring(1, { damping: 18 });
    }
  }, [
    isDialOpen,
    selectedSector,
    reducedMotion,
    headTiltAnim,
    headTranslateYAnim,
    bodyTiltAnim,
    leanXAnim,
    hopAnim,
    scaleXAnim,
    scaleYAnim,
    bodyScaleYAnim,
  ]);

  // Behavior 6: Speaking mouth loop and smooth front-facing turn
  useEffect(() => {
    clearSpeakingTimers();

    if (!whisperText) {
      setMouthFrame("neutral");
      if (reducedMotion) {
        frontTransitionAnim.value = 0;
      } else {
        frontTransitionAnim.value = withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.quad),
        });
      }
      return;
    }

    // Entering speech: transition to front-facing pose
    if (reducedMotion) {
      frontTransitionAnim.value = 1;
      setMouthFrame("neutral");
      return;
    }

    frontTransitionAnim.value = withTiming(1, {
      duration: 160,
      easing: Easing.out(Easing.quad),
    });

    // In focus mode, remain calm and still in neutral pose (Section 9)
    if (isFocusActive) {
      setMouthFrame("neutral");
      return;
    }

    // Recommended Speaking Loop:
    // front_neutral -> front_speaking -> front_neutral -> front_speaking -> front_neutral
    // Uses roughly 160–220ms intervals between changes without rapid flickering
    const textLen = whisperText.trim().length;
    const isShort = textLen < 22;

    const scheduleFrame = (frame: "neutral" | "speaking", delayMs: number) => {
      const timer = setTimeout(() => {
        setMouthFrame(frame);
      }, delayMs);
      speakingTimersRef.current.push(timer);
    };

    // Cycle 1: Open beak at 160ms, close at 380ms
    scheduleFrame("speaking", 160);
    scheduleFrame("neutral", 380);

    // Cycle 2: Open beak at 580ms, close at 800ms
    scheduleFrame("speaking", 580);
    scheduleFrame("neutral", 800);

    // If message is longer, Cycle 3: Open beak at 1020ms, close at 1240ms
    if (!isShort) {
      scheduleFrame("speaking", 1020);
      scheduleFrame("neutral", 1240);
    }

    return () => {
      clearSpeakingTimers();
    };
  }, [
    whisperText,
    isFocusActive,
    reducedMotion,
    clearSpeakingTimers,
    frontTransitionAnim,
  ]);

  // Dismiss speech if user opens radial dial to keep dial interaction clean
  useEffect(() => {
    if (isDialOpen && whisperText) {
      setWhisperText(null);
      setWhisperAction(null);
      clearSpeakingTimers();
      if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    }
  }, [isDialOpen, whisperText, clearSpeakingTimers]);

  // Tactile press reaction: Duolingo Duo squash, spring jump hop, and dialogue
  const handlePress = useCallback(async () => {
    // Toggle whisper off if already open
    if (whisperText) {
      setWhisperText(null);
      setWhisperAction(null);
      clearSpeakingTimers();
      if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
      return;
    }

    // Focus session invariant (Section 9: Cairn becomes still, quiet accompaniment)
    if (isFocusActive) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      scaleYAnim.value = withSequence(
        withTiming(0.97, { duration: 60 }),
        withSpring(1, { damping: 14 })
      );
      setWhisperText("In the zone. Keep going.");
      setWhisperAction(null);

      if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
      whisperTimerRef.current = setTimeout(() => {
        setWhisperText(null);
      }, 4000);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // 1. Duo-style Squash down on impact
    scaleXAnim.value = withSequence(
      withTiming(1.22, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(0.92, { damping: 8, stiffness: 260 }),
      withSpring(1, { damping: 12, stiffness: 180 })
    );
    scaleYAnim.value = withSequence(
      withTiming(0.78, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(1.16, { damping: 8, stiffness: 260 }),
      withSpring(1, { damping: 12, stiffness: 180 })
    );

    // Playful jump hop upwards & head tilt
    hopAnim.value = withSequence(
      withTiming(-16, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withSpring(0, { damping: 11, stiffness: 200 })
    );
    headTiltAnim.value = withSequence(
      withTiming(-6, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 12, stiffness: 220 })
    );

    // Check live context (Daily clear, streak, focus recommendation)
    const isDailyClear = await checkIfDailyClear();
    const hour = new Date().getHours();

    let text = "";
    let action: MascotAction | null = null;

    if (isDailyClear) {
      text = "All clear today. Nice run.";
    } else if (streak >= 3) {
      text = `Look at that — ${streak} days.`;
      action = {
        label: "Focus",
        action: () => {
          void launchFocusSession({
            targetId: "mascot_focus",
            durationSeconds: 25 * 60,
          });
          setWhisperText(null);
        },
      };
    } else if (hour < 12) {
      text = "What's first today?";
      action = {
        label: "Focus",
        action: () => {
          void launchFocusSession({
            targetId: "mascot_focus",
            durationSeconds: 25 * 60,
          });
          setWhisperText(null);
        },
      };
    } else if (hour >= 18) {
      text = "Still there when you're ready.";
    } else {
      text = "One step at a time.";
      action = {
        label: "Focus",
        action: () => {
          void launchFocusSession({
            targetId: "mascot_focus",
            durationSeconds: 25 * 60,
          });
          setWhisperText(null);
        },
      };
    }

    setWhisperText(text);
    setWhisperAction(action);

    // Auto-dismiss after 6 seconds
    if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    whisperTimerRef.current = setTimeout(() => {
      setWhisperText(null);
      setWhisperAction(null);
    }, 6000);
  }, [
    whisperText,
    isFocusActive,
    streak,
    scaleXAnim,
    scaleYAnim,
    hopAnim,
    headTiltAnim,
    clearSpeakingTimers,
  ]);

  // Overall Mascot Container transform (squash, hop, lean)
  const mascotAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: leanXAnim.value },
        { translateY: hopAnim.value },
        { scaleX: scaleXAnim.value },
        { scaleY: scaleYAnim.value },
      ],
    };
  });

  // Body layer transform (subtle lean & chest breathing)
  const bodyAnchorAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${bodyTiltAnim.value}deg` },
        { scaleY: bodyScaleYAnim.value },
      ],
    };
  });

  // Head layer transform (rotates around neck base pivot at 41, 44)
  const headAnchorAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: headTranslateYAnim.value },
        { rotate: `${headTiltAnim.value}deg` },
      ],
    };
  });

  // Front-facing communicating Cairn opacity & subtle scale transition
  const frontContainerAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: frontTransitionAnim.value,
      transform: [
        {
          scale: interpolate(
            frontTransitionAnim.value,
            [0, 1],
            [0.94, 1],
            "clamp"
          ),
        },
      ],
    };
  });

  // Side-facing rigged Cairn fades out when speaking
  const rigContainerAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        frontTransitionAnim.value,
        [0, 0.7, 1],
        [1, 0.2, 0],
        "clamp"
      ),
    };
  });

  // Animated shadow reacting to hop & subtle horizontal lean
  const shadowAnimatedStyle = useAnimatedStyle(() => {
    const shadowScale = interpolate(hopAnim.value, [-16, 0], [0.65, 1], "clamp");
    const shadowOpacity = interpolate(hopAnim.value, [-16, 0], [0.15, 0.45], "clamp");

    return {
      transform: [
        { translateX: leanXAnim.value * 0.4 },
        { scaleX: shadowScale },
      ],
      opacity: shadowOpacity,
    };
  });

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      <View
        style={[
          styles.container,
          {
            bottom: bottomOffset + 4,
          },
        ]}
        pointerEvents={isDialOpen ? "none" : "box-none"}
      >
        {/* Speech Whisper Bubble */}
        {whisperText && (
          <Animated.View
            entering={FadeInUp.springify().damping(14).stiffness(240)}
            exiting={FadeOutDown.duration(140)}
            style={[
              styles.whisperContainer,
              {
                backgroundColor: isDark
                  ? "rgba(24, 24, 28, 0.96)"
                  : "rgba(255, 255, 255, 0.97)",
                borderColor: isDark
                  ? "rgba(255, 255, 255, 0.14)"
                  : "rgba(0, 0, 0, 0.08)",
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable onPress={() => setWhisperText(null)} style={styles.whisperPressable}>
              <View style={styles.whisperHeaderRow}>
                <Text
                  style={[
                    styles.whisperLabel,
                    { color: isDark ? Palette.slate400 : Palette.slate500 },
                  ]}
                >
                  CAIRN
                </Text>
                <Feather
                  name="x"
                  size={12}
                  color={isDark ? Palette.slate400 : Palette.slate500}
                />
              </View>
              <Text
                style={[
                  styles.whisperText,
                  { color: isDark ? Palette.white : Palette.gray900 },
                ]}
                numberOfLines={3}
              >
                {whisperText}
              </Text>
            </Pressable>

            {/* Action button if suggestion has next step */}
            {whisperAction && (
              <Pressable
                onPress={whisperAction.action}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={styles.actionButtonText}>{whisperAction.label}</Text>
              </Pressable>
            )}

            {/* Bubble Pointer Arrow aligned down toward crow's beak */}
            <View
              pointerEvents="none"
              style={[
                styles.bubblePointer,
                {
                  borderTopColor: isDark
                    ? "rgba(24, 24, 28, 0.96)"
                    : "rgba(255, 255, 255, 0.97)",
                },
              ]}
            />
          </Animated.View>
        )}

        {/* Mascot Pressable Button */}
        <Pressable
          onPress={handlePress}
          style={styles.pressableArea}
          accessibilityRole="button"
          accessibilityLabel="Cairn, your Pebble companion. Tap to interact."
        >
          {/* Soft Dynamic Contact Shadow beneath feet */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.contactShadow,
              {
                backgroundColor: isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(15, 23, 42, 0.4)",
              },
              shadowAnimatedStyle,
            ]}
          />

          {/* Freestanding Chunky Chibi Crow (Rigged Body + Head & Front Speaking System) */}
          <Animated.View
            pointerEvents="none"
            style={[styles.mascotWrapper, mascotAnimatedStyle]}
          >
            {/* 1. Side-facing Rigged Cairn (Body + Head) */}
            <Animated.View
              style={[styles.rigContainer, rigContainerAnimatedStyle]}
              pointerEvents="none"
            >
              {/* Body Layer (Anchored at feet pivot: 32, 84) */}
              <Animated.View style={[styles.bodyAnchor, bodyAnchorAnimatedStyle]}>
                <Image
                  source={MASCOT_RIG.body}
                  style={styles.rigBodyImage}
                  resizeMode="contain"
                />
              </Animated.View>
              {/* Head Layer (Anchored at neck pivot: 41, 44) */}
              <Animated.View style={[styles.headAnchor, headAnchorAnimatedStyle]}>
                <Image
                  source={MASCOT_RIG.head}
                  style={styles.rigHeadImage}
                  resizeMode="contain"
                />
              </Animated.View>
            </Animated.View>

            {/* 2. Front-facing Communicating Cairn (Neutral & Speaking) */}
            <Animated.View
              style={[styles.frontMascotContainer, frontContainerAnimatedStyle]}
              pointerEvents="none"
            >
              {/* Neutral closed beak base (always loaded) */}
              <Image
                source={MASCOT_POSES.frontNeutral}
                style={styles.mascotFrontImage}
                resizeMode="contain"
              />
              {/* Speaking open beak overlay with zero flicker/jump */}
              {mouthFrame === "speaking" && (
                <Image
                  source={MASCOT_POSES.frontSpeaking}
                  style={[styles.mascotFrontImage, styles.speakingOverlay]}
                  resizeMode="contain"
                />
              )}
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>

      {/* Global Pebble Reward Overlay Modal (Inherited from former MascotOverlay) */}
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
                    ? "rgba(255, 255, 255, 0.92)"
                    : "rgba(24, 24, 27, 0.88)",
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
                  }, 400);
                }}
                colors={colors}
                colorScheme={colorScheme ?? "dark"}
                pebbleTypes={monthlyTypes}
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
    </>
  );
};

const styles = StyleSheet.create({
  // Anchored cleanly to the LEFT side of the dock
  container: {
    position: "absolute",
    left: 20,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  pressableArea: {
    width: MASCOT_CONTAINER_WIDTH,
    height: MASCOT_CONTAINER_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  contactShadow: {
    position: "absolute",
    bottom: 0,
    width: 44,
    height: 7,
    borderRadius: 4,
  },
  mascotWrapper: {
    position: "absolute",
    bottom: 0,
    width: MASCOT_CONTAINER_WIDTH,
    height: MASCOT_CONTAINER_HEIGHT,
  },
  rigContainer: {
    width: MASCOT_CONTAINER_WIDTH,
    height: MASCOT_CONTAINER_HEIGHT,
    position: "absolute",
    top: 0,
    left: 0,
  },
  frontMascotContainer: {
    width: MASCOT_CONTAINER_WIDTH,
    height: MASCOT_CONTAINER_HEIGHT,
    position: "absolute",
    top: 0,
    left: 0,
  },
  bodyAnchor: {
    position: "absolute",
    left: 32,
    top: 84,
    width: 0,
    height: 0,
  },
  rigBodyImage: {
    position: "absolute",
    left: -32,
    top: -55,
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
  },
  headAnchor: {
    position: "absolute",
    left: 41,
    top: 44,
    width: 0,
    height: 0,
  },
  rigHeadImage: {
    position: "absolute",
    left: -32,
    top: -44,
    width: HEAD_WIDTH,
    height: HEAD_HEIGHT,
  },
  mascotFrontImage: {
    width: MASCOT_CONTAINER_WIDTH,
    height: MASCOT_CONTAINER_HEIGHT,
  },
  speakingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  whisperContainer: {
    position: "absolute",
    bottom: MASCOT_CONTAINER_HEIGHT + 16,
    left: -4,
    width: 220,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  whisperPressable: {
    width: "100%",
  },
  whisperHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  whisperLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  whisperText: {
    fontSize: 12.5,
    fontWeight: "500",
    lineHeight: 17,
    letterSpacing: 0.1,
  },
  actionButton: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    color: Palette.white,
    fontSize: 11,
    fontWeight: "700",
  },
  bubblePointer: {
    position: "absolute",
    bottom: -7,
    left: 28,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  // Modal Reward Overlay Styles
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
    shadowColor: Palette.black,
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
