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

const MASCOT_POSES = {
  // 1. Natural idle: Facing RIGHT into the app and center dial
  lookRight: require("@/assets/images/mascot/new_pose_look_right.png"),
  // 2. Radial dial open: Looking UP and RIGHT at the blooming options
  curiousUp: require("@/assets/images/mascot/new_pose_curious_up.png"),
  // 3. Speaking / Tapped: Facing the user directly with a friendly smile
  front: require("@/assets/images/mascot/new_pose_front.png"),
};

// Bold, chunky Duolingo Duo scale (82pt tall)
const MASCOT_HEIGHT = 82;
const MASCOT_WIDTH = 61;

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
  bottomOffset?: number;
}

export const DockCompanionMascot: React.FC<DockCompanionMascotProps> = ({
  isDialOpen = false,
  bottomOffset = 0,
}) => {
  const router = useRouter();
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
  const tiltAnim = useSharedValue(0);

  // Interaction State
  const [whisperText, setWhisperText] = useState<string | null>(null);
  const [whisperAction, setWhisperAction] = useState<MascotAction | null>(null);
  const [currentPose, setCurrentPose] = useState<keyof typeof MASCOT_POSES>("lookRight");
  const whisperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };
  }, [loadData, checkFocusActive]);

  // Subtle, calm idle breathing when resting (Section 9: suppressed during focus sessions)
  useEffect(() => {
    if (isFocusActive || isDialOpen || whisperText) {
      // Still during focus sessions, open dial, or active whisper
      scaleYAnim.value = withTiming(1, { duration: 180 });
      scaleXAnim.value = withTiming(1, { duration: 180 });
      return;
    }

    scaleYAnim.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0, { duration: 2400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
    scaleXAnim.value = withRepeat(
      withSequence(
        withTiming(0.99, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0, { duration: 2400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [isFocusActive, isDialOpen, whisperText, scaleYAnim, scaleXAnim]);

  // React when radial navigation dial blooms open or closes
  useEffect(() => {
    if (isFocusActive) {
      // Cairn becomes still during focus sessions (Section 9)
      hopAnim.value = withTiming(0, { duration: 150 });
      tiltAnim.value = withTiming(0, { duration: 150 });
      setCurrentPose("lookRight");
      return;
    }

    if (isDialOpen) {
      setCurrentPose("curiousUp");
      hopAnim.value = withSequence(
        withTiming(-8, { duration: 150 }),
        withSpring(0, { damping: 12, stiffness: 220 })
      );
      tiltAnim.value = withSpring(4, { damping: 14 });
    } else {
      tiltAnim.value = withSpring(0, { damping: 16 });
      if (!whisperText) {
        setCurrentPose("lookRight");
      }
    }
  }, [isDialOpen, isFocusActive, hopAnim, tiltAnim, whisperText]);

  // Tactile press reaction: Duolingo Duo squash, spring jump hop, and dialogue
  const handlePress = useCallback(async () => {
    // Toggle whisper off if already open
    if (whisperText) {
      setWhisperText(null);
      setWhisperAction(null);
      setCurrentPose(isDialOpen ? "curiousUp" : "lookRight");
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
      setCurrentPose("front");

      if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
      whisperTimerRef.current = setTimeout(() => {
        setWhisperText(null);
        setCurrentPose("lookRight");
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

    // Playful jump hop upwards
    hopAnim.value = withSequence(
      withTiming(-16, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withSpring(0, { damping: 11, stiffness: 200 })
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
    setCurrentPose("front");

    // Auto-dismiss after 6 seconds
    if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    whisperTimerRef.current = setTimeout(() => {
      setWhisperText(null);
      setWhisperAction(null);
      setCurrentPose(isDialOpen ? "curiousUp" : "lookRight");
    }, 6000);
  }, [whisperText, isDialOpen, streak, scaleXAnim, scaleYAnim, hopAnim]);

  // Animated styles for Mascot body
  const mascotAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: hopAnim.value },
        { scaleX: scaleXAnim.value },
        { scaleY: scaleYAnim.value },
        { rotate: `${tiltAnim.value}deg` },
      ],
    };
  });

  // Animated shadow reacting to hop
  const shadowAnimatedStyle = useAnimatedStyle(() => {
    const shadowScale = interpolate(hopAnim.value, [-16, 0], [0.65, 1], "clamp");
    const shadowOpacity = interpolate(hopAnim.value, [-16, 0], [0.15, 0.45], "clamp");

    return {
      transform: [{ scaleX: shadowScale }],
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
        pointerEvents="box-none"
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
          hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
        >
          {/* Soft Dynamic Contact Shadow beneath feet */}
          <Animated.View
            style={[
              styles.contactShadow,
              {
                backgroundColor: isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(15, 23, 42, 0.4)",
              },
              shadowAnimatedStyle,
            ]}
          />

          {/* Freestanding Chunky Chibi Crow */}
          <Animated.View style={[styles.mascotWrapper, mascotAnimatedStyle]}>
            <Image
              source={MASCOT_POSES[currentPose]}
              style={styles.mascotImage}
              resizeMode="contain"
            />
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
    width: MASCOT_WIDTH + 8,
    height: MASCOT_HEIGHT + 6,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  contactShadow: {
    position: "absolute",
    bottom: 2,
    width: 44,
    height: 7,
    borderRadius: 4,
  },
  mascotWrapper: {
    position: "absolute",
    bottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  mascotImage: {
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
  },
  whisperContainer: {
    position: "absolute",
    bottom: MASCOT_HEIGHT + 16,
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
