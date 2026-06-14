import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    
    
    View } from "react-native";
import { AppTextInput as TextInput } from "@/components/ui/AppText";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FloatingGlow } from "@/components/AmbientBackground";
import { AppCard } from "@/components/AppCard";
import { ProgressRing } from "@/components/ProgressRing";
import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
import { Spacing } from "@/constants/spacing";
import { Colors } from "@/constants/theme";
import { Typography } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";


export default function FocusScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [sessionTime, setSessionTime] = useState(25 * 60); // 25 mins Pomodoro
  const [isActive, setIsActive] = useState(false);
  const [totalSessionTime, setTotalSessionTime] = useState(25 * 60);
  const [completedToday, setCompletedToday] = useState(0);
  const [totalFocusTime, setTotalFocusTime] = useState(0);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(25);
  const [mode, setMode] = useState<"pomodoro" | "stopwatch">("pomodoro");
  // Stopwatch
  const [swRunning, setSwRunning] = useState(false);
  const [swTime, setSwTime] = useState(0); // seconds
  const [swLaps, setSwLaps] = useState<number[]>([]);

  const intervalRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem("todoapp:focus:stats").then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.completedToday !== undefined)
            setCompletedToday(parsed.completedToday);
          if (parsed.totalFocusTime !== undefined)
            setTotalFocusTime(parsed.totalFocusTime);
        } else {
          setCompletedToday(0);
          setTotalFocusTime(0);
        }
      });
      // load checklists
      
    }, []),
  );

  useEffect(() => {
    if (isActive && sessionTime > 0) {
      intervalRef.current = setInterval(() => {
        setSessionTime((prev) => prev - 1);
      }, 1000) as any;
    } else if (sessionTime === 0 && isActive) {
      setIsActive(false);
      const minutes = Math.round(totalSessionTime / 60);
      setCompletedToday((prev) => {
        const nextCompleted = prev + 1;
        setTotalFocusTime((prevTime) => {
          const nextTime = prevTime + minutes;
          AsyncStorage.setItem(
            "todoapp:focus:stats",
            JSON.stringify({
              completedToday: nextCompleted,
              totalFocusTime: nextTime,
            }),
          );
          return nextTime;
        });
        return nextCompleted;
      });
      AlertFinish();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, sessionTime]);

  // Stopwatch interval
  useEffect(() => {
    let swInterval: any = null;
    if (swRunning) {
      swInterval = setInterval(() => setSwTime((t) => t + 1), 1000);
    }
    return () => {
      if (swInterval) clearInterval(swInterval);
    };
  }, [swRunning]);

  const swStartPause = () => setSwRunning((v) => !v);
  const swReset = () => {
    setSwRunning(false);
    setSwTime(0);
    setSwLaps([]);
  };
  const swLap = () => setSwLaps((l) => [swTime, ...l]);

  

  const AlertFinish = () => {
    if (Platform.OS === "web") {
      try {
        new Notification("Focus Session Complete", {
          body: "🎉 Great work! Time for a short break.",
        });
      } catch {
        alert("🎉 Focus Session Complete! Great work!");
      }
    } else {
      // Native alert
      alert("🎉 Focus Session Complete! Great work!");
    }
  };

  const handleStartPause = () => {
    setIsActive(!isActive);
  };

  const handleReset = () => {
    setIsActive(false);
    if (showCustomInput) {
      setSessionTime(customMinutes * 60);
      setTotalSessionTime(customMinutes * 60);
    } else {
      setSessionTime(25 * 60);
      setTotalSessionTime(25 * 60);
    }
  };

  const selectDuration = (mins: number) => {
    if (isActive) return;
    setShowCustomInput(false);
    setSessionTime(mins * 60);
    setTotalSessionTime(mins * 60);
  };

  const selectCustomDuration = () => {
    if (isActive) return;
    setShowCustomInput(true);
    setSessionTime(customMinutes * 60);
    setTotalSessionTime(customMinutes * 60);
  };

  const adjustCustomMinutes = (amount: number) => {
    if (isActive) return;
    const newMinutes = Math.min(180, Math.max(1, customMinutes + amount));
    setCustomMinutes(newMinutes);
    setSessionTime(newMinutes * 60);
    setTotalSessionTime(newMinutes * 60);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progress = (totalSessionTime - sessionTime) / totalSessionTime;

  return (
    <ScreenSwipeWrapper prevRoute="/" nextRoute="/tasks">
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: "transparent" }]}
      >
        <Animated.View
          entering={FadeInDown.duration(450).springify()}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.kicker, { color: colors.primary }]}>
                SESSION
              </Text>
              <Text style={[styles.title, { color: colors.text }]}>
                Focus Mode
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Deep focus is the key to deep work.
              </Text>
            </View>

            {/* Mode Selector */}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 6,
                marginBottom: 6,
              }}
            >
              <Pressable
                onPress={() => setMode("pomodoro")}
                style={{ flex: 1 }}
              >
                <View
                  style={{
                    paddingVertical: 8,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor:
                      mode === "pomodoro" ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor:
                      mode === "pomodoro" ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: mode === "pomodoro" ? "#fff" : colors.text,
                      fontWeight: "700",
                    }}
                  >
                    Pomodoro
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setMode("stopwatch")}
                style={{ flex: 1 }}
              >
                <View
                  style={{
                    paddingVertical: 8,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor:
                      mode === "stopwatch" ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor:
                      mode === "stopwatch" ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: mode === "stopwatch" ? "#fff" : colors.text,
                      fontWeight: "700",
                    }}
                  >
                    Stopwatch
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Timer Cockpit */}
            <AppCard style={styles.timerCard}>
              {mode === "pomodoro" ? (
                <View style={styles.timerRingWrap}>
                  <FloatingGlow
                    color={isActive ? colors.warning : colors.primary}
                    size={210}
                    opacity={isActive ? 0.15 : 0.08}
                    pulseSpeed={isActive ? 4000 : 7500}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <ProgressRing
                    progress={progress}
                    size={230}
                    strokeWidth={11}
                    showText={false}
                  />
                  <View style={styles.timerContent}>
                    <Text style={[styles.timerDigits, { color: colors.text }]}>
                      {formatTime(sessionTime)}
                    </Text>
                    <Text
                      style={[styles.timerSub, { color: colors.textMuted }]}
                    >
                      {isActive ? "Focusing" : "Paused"}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.timerRingWrap}>
                  <FloatingGlow
                    color={swRunning ? colors.primary : colors.textMuted}
                    size={210}
                    opacity={swRunning ? 0.15 : 0.08}
                    pulseSpeed={swRunning ? 4000 : 7500}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <ProgressRing
                    progress={1}
                    size={230}
                    strokeWidth={11}
                    showText={false}
                    color={swRunning ? colors.primary : colors.border}
                  />
                  <View style={styles.timerContent}>
                    <Text style={[styles.timerDigits, { color: colors.text }]}>
                      {formatTime(swTime)}
                    </Text>
                    <Text
                      style={[styles.timerSub, { color: colors.textMuted }]}
                    >
                      {swRunning ? "Running" : "Paused"}
                    </Text>
                  </View>
                </View>
              )}

              {/* Quick presets */}
              {mode === "pomodoro" && !isActive && (
                <View style={{ gap: 12, alignItems: "center" }}>
                  <View style={styles.presetsRow}>
                    {[15, 25, 45].map((mins) => {
                      const isSelected =
                        !showCustomInput && totalSessionTime === mins * 60;
                      return (
                        <Pressable
                          key={mins}
                          onPress={() => selectDuration(mins)}
                          style={[
                            styles.presetBtn,
                            {
                              backgroundColor: isSelected
                                ? `${colors.primary}22`
                                : colors.cardLight,
                              borderColor: isSelected
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: isSelected ? colors.primary : colors.text,
                              fontWeight: "600",
                            }}
                          >
                            {mins}m
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={selectCustomDuration}
                      style={[
                        styles.presetBtn,
                        {
                          backgroundColor: showCustomInput
                            ? `${colors.primary}22`
                            : colors.cardLight,
                          borderColor: showCustomInput
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: showCustomInput ? colors.primary : colors.text,
                          fontWeight: "600",
                        }}
                      >
                        Custom
                      </Text>
                    </Pressable>
                  </View>

                  {showCustomInput && (
                    <View style={styles.customAdjusterRow}>
                      <Pressable
                        onPress={() => adjustCustomMinutes(-5)}
                        style={[
                          styles.adjustBtn,
                          {
                            backgroundColor: colors.cardLight,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Feather name="minus" size={16} color={colors.text} />
                      </Pressable>
                      <Text
                        style={[
                          styles.customAdjusterText,
                          { color: colors.text },
                        ]}
                      >
                        {customMinutes} mins
                      </Text>
                      <Pressable
                        onPress={() => adjustCustomMinutes(5)}
                        style={[
                          styles.adjustBtn,
                          {
                            backgroundColor: colors.cardLight,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Feather name="plus" size={16} color={colors.text} />
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* Controller */}
              <View style={styles.controlsRow}>
                {mode === "pomodoro" ? (
                  <Pressable
                    onPress={handleStartPause}
                    style={[
                      styles.mainBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Feather
                      name={isActive ? "pause" : "play"}
                      size={20}
                      color="#ffffff"
                    />
                    <Text style={styles.mainBtnText}>
                      {isActive ? "Pause" : "Start Focus"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={swStartPause}
                    style={[
                      styles.mainBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Feather
                      name={swRunning ? "pause" : "play"}
                      size={20}
                      color="#ffffff"
                    />
                    <Text style={styles.mainBtnText}>
                      {swRunning ? "Pause" : "Start"}
                    </Text>
                  </Pressable>
                )}

                {mode === "pomodoro" ? (
                  <Pressable
                    onPress={handleReset}
                    style={[
                      styles.resetBtn,
                      {
                        backgroundColor: colors.cardLight,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather name="rotate-ccw" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: "600" }}>
                      Reset
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={swRunning ? swLap : swReset}
                    style={[
                      styles.resetBtn,
                      {
                        backgroundColor: colors.cardLight,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather name={swRunning ? "clock" : "rotate-ccw"} size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: "600" }}>
                      {swRunning ? "Lap" : "Reset"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </AppCard>

            {/* Laps List */}
            {mode === "stopwatch" && swLaps.length > 0 && (
              <AppCard style={{ padding: 16, gap: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>Laps</Text>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                {swLaps.map((lapTime, idx) => (
                  <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: idx === swLaps.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                    <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Lap {swLaps.length - idx}</Text>
                    <Text style={{ color: colors.text, fontWeight: "700", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{formatTime(lapTime)}</Text>
                  </View>
                ))}
              </AppCard>
            )}

            {/* Focus Analytics Metrics */}
            <AppCard style={styles.statsCard}>
              <Text style={[styles.statsTitle, { color: colors.text }]}>
                {"Today's Stats"}
              </Text>
              <View style={styles.divider} />

              <View style={styles.statsGrid}>
                <View style={styles.statCell}>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                    Completed
                  </Text>
                  <Text style={[styles.statVal, { color: colors.text }]}>
                    {completedToday} Sessions
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                    Focus Time
                  </Text>
                  <Text style={[styles.statVal, { color: colors.text }]}>
                    {totalFocusTime} mins
                  </Text>
                </View>
              </View>
            </AppCard>

            
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </ScreenSwipeWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
    paddingBottom: 110,
  },
  header: { gap: 4 },
  kicker: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: Typography.sizes.display,
    fontWeight: "700",
    lineHeight: 38,
  },
  subtitle: { fontSize: Typography.sizes.sm },
  timerCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.ux,
    gap: Spacing.xl,
  },
  timerRingWrap: {
    width: 230,
    height: 230,
    justifyContent: "center",
    alignItems: "center",
  },
  timerContent: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  timerDigits: {
    fontSize: 48,
    fontWeight: "800",
  },
  timerSub: {
    fontSize: Typography.sizes.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    paddingHorizontal: Spacing.md,
  },
  mainBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
  },
  mainBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: Typography.sizes.md,
  },
  resetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  statsCard: {
    padding: Spacing.lg,
    gap: 12,
  },
  statsTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCell: {
    flex: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: "600",
  },
  statVal: {
    fontSize: Typography.sizes.lg,
    fontWeight: "800",
  },
  customAdjusterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 4,
  },
  adjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  customAdjusterText: {
    fontSize: 16,
    fontWeight: "700",
    minWidth: 70,
    textAlign: "center",
  },
});
