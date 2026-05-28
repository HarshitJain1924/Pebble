import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
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
  const [completedToday, setCompletedToday] = useState(3); // Mock initial stats
  const [totalFocusTime, setTotalFocusTime] = useState(75); // Mock initial stats

  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (isActive && sessionTime > 0) {
      intervalRef.current = setInterval(() => {
        setSessionTime((prev) => prev - 1);
      }, 1000) as any;
    } else if (sessionTime === 0 && isActive) {
      setIsActive(false);
      setCompletedToday((prev) => prev + 1);
      setTotalFocusTime((prev) => prev + Math.round(totalSessionTime / 60));
      AlertFinish();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, sessionTime]);

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
    setSessionTime(25 * 60);
    setTotalSessionTime(25 * 60);
  };

  const selectDuration = (mins: number) => {
    if (isActive) return;
    setSessionTime(mins * 60);
    setTotalSessionTime(mins * 60);
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
    <ScreenSwipeWrapper prevRoute="/calendar">
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

            {/* Timer Cockpit */}
            <AppCard style={styles.timerCard}>
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
                  <Text style={[styles.timerSub, { color: colors.textMuted }]}>
                    {isActive ? "Focusing" : "Paused"}
                  </Text>
                </View>
              </View>

              {/* Quick presets */}
              {!isActive && (
                <View style={styles.presetsRow}>
                  {[15, 25, 45].map((mins) => {
                    const isSelected = totalSessionTime === mins * 60;
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
                </View>
              )}

              {/* Controller */}
              <View style={styles.controlsRow}>
                <Pressable
                  onPress={handleStartPause}
                  style={[styles.mainBtn, { backgroundColor: colors.primary }]}
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
              </View>
            </AppCard>

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
});
