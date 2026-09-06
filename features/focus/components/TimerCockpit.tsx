import React from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppTextInput as TextInput, AppText as Text } from "@/shared/components/ui/AppText";
import { AppCard } from "@/shared/components/ui/AppCard";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import { FloatingGlow } from "@/shared/components/layout/AmbientBackground";
import { Spacing } from "@/shared/constants/spacing";
import { Typography } from "@/shared/constants/typography";

interface TimerCockpitProps {
  targetSlot?: React.ReactNode;
  mode: "pomodoro" | "stopwatch";
  pomodoroMode: "work" | "break";
  isActive: boolean;
  glowEnabled: boolean;
  colors: any;
  sessionTime: number;
  totalSessionTime: number;
  swRunning: boolean;
  swTime: number;
  showCustomInput: boolean;
  customMinutes: number;
  customMinsText: string;
  breakType: "short" | "long";
  handleStartPause: () => void;
  handleReset: () => void;
  swStartPause: () => void;
  swReset: () => void;
  swLap: () => void;
  selectDuration: (mins: number) => void;
  selectCustomDuration: () => void;
  adjustCustomMinutes: (amount: number) => void;
  handleCustomMinutesChange: (text: string) => void;
  handleCustomMinutesSubmitOrBlur: () => void;
  setBreakType: (val: "short" | "long") => void;
  setSessionTime: (val: number) => void;
  setTotalSessionTime: (val: number) => void;
}

export const TimerCockpit: React.FC<TimerCockpitProps> = ({
  targetSlot,
  mode,
  pomodoroMode,
  isActive,
  glowEnabled,
  colors,
  sessionTime,
  totalSessionTime,
  swRunning,
  swTime,
  showCustomInput,
  customMinutes,
  customMinsText,
  breakType,
  handleStartPause,
  handleReset,
  swStartPause,
  swReset,
  swLap,
  selectDuration,
  selectCustomDuration,
  adjustCustomMinutes,
  handleCustomMinutesChange,
  handleCustomMinutesSubmitOrBlur,
  setBreakType,
  setSessionTime,
  setTotalSessionTime,
}) => {
  const { height: windowHeight = 800 } = useWindowDimensions() ?? {};
  const isCompact = windowHeight > 0 && windowHeight < 700;
  const isImmersiveWork = mode === "pomodoro" && pomodoroMode === "work" && isActive;

  const ringSize = isCompact ? 160 : 180;
  const glowSize = isImmersiveWork ? (isCompact ? 150 : 175) : (isCompact ? 140 : 160);
  const strokeWidth = isImmersiveWork ? (isCompact ? 7 : 8) : (isCompact ? 6 : 7);
  const timerFontSize = isCompact ? 34 : 38;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progress = totalSessionTime > 0 ? (totalSessionTime - sessionTime) / totalSessionTime : 0;

  return (
    <AppCard style={[styles.timerCard, isCompact && styles.timerCardCompact]}>
      {/* 1. FOCUS TARGET */}
      {targetSlot && (
        <View style={styles.targetSlotWrap}>
          {targetSlot}
          <View
            style={[
              styles.targetDivider,
              {
                backgroundColor: colors.border || "rgba(255, 255, 255, 0.08)",
                opacity: isImmersiveWork ? 0.15 : 0.2,
              },
            ]}
          />
        </View>
      )}

      {/* 2. TIMER (VISUAL CENTER) */}
      {mode === "pomodoro" ? (
        <View style={[styles.timerRingWrap, { width: ringSize, height: ringSize }]}>
          {glowEnabled && (
            <FloatingGlow
              color={pomodoroMode === "work" ? colors.primary : colors.success}
              size={glowSize}
              opacity={isImmersiveWork ? 0.18 : (isActive ? 0.15 : 0.04)}
              pulseSpeed={isImmersiveWork ? 3000 : (isActive ? 3500 : 8000)}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <ProgressRing
            progress={progress}
            size={ringSize}
            strokeWidth={strokeWidth}
            showText={false}
            color={pomodoroMode === "work" ? colors.primary : colors.success}
            trackColor={
              isImmersiveWork
                ? (colors.border ? `${colors.border}33` : "rgba(255, 255, 255, 0.04)")
                : (colors.border ? `${colors.border}44` : "rgba(255, 255, 255, 0.06)")
            }
          />
          <View style={styles.timerContent}>
            <Text
              style={[
                styles.timerDigits,
                {
                  fontSize: timerFontSize,
                  color: colors.text,
                  opacity: isActive ? 1 : 0.88,
                },
              ]}
            >
              {formatTime(sessionTime)}
            </Text>
            <Text
              style={[
                styles.timerSub,
                {
                  color:
                    pomodoroMode === "work"
                      ? isActive
                        ? colors.primary
                        : colors.textMuted
                      : isActive
                      ? colors.success
                      : colors.textMuted,
                },
              ]}
            >
              {pomodoroMode === "work"
                ? isActive
                  ? "Focusing"
                  : "Paused"
                : isActive
                ? "Break Active"
                : "Break Paused"}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.timerRingWrap, { width: ringSize, height: ringSize }]}>
          {glowEnabled && (
            <FloatingGlow
              color={swRunning ? colors.primary : colors.textMuted}
              size={glowSize}
              opacity={swRunning ? 0.15 : 0.04}
              pulseSpeed={swRunning ? 3500 : 8000}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <ProgressRing
            progress={1}
            size={ringSize}
            strokeWidth={strokeWidth}
            showText={false}
            color={swRunning ? colors.primary : colors.border}
            trackColor={colors.border ? `${colors.border}44` : "rgba(255, 255, 255, 0.06)"}
          />
          <View style={styles.timerContent}>
            <Text
              style={[
                styles.timerDigits,
                {
                  fontSize: timerFontSize,
                  color: colors.text,
                  opacity: swRunning ? 1 : 0.88,
                },
              ]}
            >
              {formatTime(swTime)}
            </Text>
            <Text
              style={[
                styles.timerSub,
                { color: swRunning ? colors.primary : colors.textMuted },
              ]}
            >
              {swRunning ? "Running" : "Paused"}
            </Text>
          </View>
        </View>
      )}

      {/* 3. PRIMARY CONTROL (PROMINENT BENEATH TIMER) */}
      <View style={styles.primaryActionWrap}>
        {mode === "pomodoro" ? (
          <Pressable
            onPress={handleStartPause}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: pomodoroMode === "work" ? colors.primary : colors.success,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Feather name={isActive ? "pause" : "play"} size={16} color="#ffffff" />
            <Text style={styles.primaryBtnText}>
              {isActive ? "Pause" : pomodoroMode === "work" ? "Start Focus" : "Start Break"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={swStartPause}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Feather name={swRunning ? "pause" : "play"} size={16} color="#ffffff" />
            <Text style={styles.primaryBtnText}>{swRunning ? "Pause" : "Start"}</Text>
          </Pressable>
        )}
      </View>

      {/* 4. DURATION OPTIONS (BENEATH PRIMARY ACTION) */}
      {mode === "pomodoro" && pomodoroMode === "work" && !isActive && (
        <View style={styles.durationSection}>
          <View style={styles.presetsRow}>
            {[15, 25, 45].map((mins) => {
              const isSelected = !showCustomInput && totalSessionTime === mins * 60;
              return (
                <Pressable
                  key={mins}
                  onPress={() => selectDuration(mins)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.presetBtn,
                    {
                      backgroundColor: isSelected
                        ? `${colors.primary}18`
                        : "transparent",
                      borderColor: isSelected
                        ? `${colors.primary}55`
                        : colors.border ? `${colors.border}44` : "rgba(255, 255, 255, 0.06)",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected ? colors.primary : colors.textMuted,
                      fontWeight: isSelected ? "700" : "500",
                      fontSize: 12,
                    }}
                  >
                    {mins}m
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={selectCustomDuration}
              hitSlop={6}
              style={({ pressed }) => [
                styles.presetBtn,
                {
                  backgroundColor: showCustomInput
                    ? `${colors.primary}18`
                    : "transparent",
                  borderColor: showCustomInput
                    ? `${colors.primary}55`
                    : colors.border ? `${colors.border}44` : "rgba(255, 255, 255, 0.06)",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: showCustomInput ? colors.primary : colors.textMuted,
                  fontWeight: showCustomInput ? "700" : "500",
                  fontSize: 12,
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
                hitSlop={6}
                style={({ pressed }) => [
                  styles.adjustBtn,
                  {
                    backgroundColor: colors.cardLight || "rgba(255, 255, 255, 0.05)",
                    borderColor: colors.border || "rgba(255, 255, 255, 0.1)",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather name="minus" size={14} color={colors.text} />
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={customMinsText}
                  onChangeText={handleCustomMinutesChange}
                  onBlur={handleCustomMinutesSubmitOrBlur}
                  onSubmitEditing={handleCustomMinutesSubmitOrBlur}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={[
                    styles.customAdjusterInput,
                    {
                      color: colors.text,
                      borderColor: colors.border || "rgba(255, 255, 255, 0.12)",
                      backgroundColor: colors.cardLight || "rgba(255, 255, 255, 0.03)",
                    },
                  ]}
                />
                <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 12 }}>mins</Text>
              </View>
              <Pressable
                onPress={() => adjustCustomMinutes(5)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.adjustBtn,
                  {
                    backgroundColor: colors.cardLight || "rgba(255, 255, 255, 0.05)",
                    borderColor: colors.border || "rgba(255, 255, 255, 0.1)",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather name="plus" size={14} color={colors.text} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {mode === "pomodoro" && pomodoroMode === "break" && !isActive && (
        <View style={styles.durationSection}>
          <View style={styles.presetsRow}>
            {[5, 15].map((mins) => {
              const isSelected = totalSessionTime === mins * 60;
              return (
                <Pressable
                  key={mins}
                  onPress={() => {
                    setSessionTime(mins * 60);
                    setTotalSessionTime(mins * 60);
                    setBreakType(mins === 5 ? "short" : "long");
                  }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.presetBtn,
                    {
                      backgroundColor: isSelected
                        ? `${colors.success}18`
                        : "transparent",
                      borderColor: isSelected
                        ? `${colors.success}55`
                        : colors.border ? `${colors.border}44` : "rgba(255, 255, 255, 0.06)",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected ? colors.success : colors.textMuted,
                      fontWeight: isSelected ? "700" : "500",
                      fontSize: 12,
                    }}
                  >
                    {mins === 5 ? "Short Break (5m)" : "Long Break (15m)"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* 5. SECONDARY INFORMATION / ACTIONS (SUBTLE FOOTER AREA) */}
      <View style={styles.secondaryArea}>
        {mode === "pomodoro" ? (
          <Pressable
            onPress={handleReset}
            hitSlop={8}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather name="rotate-ccw" size={13} color={colors.textMuted} />
            <Text style={[styles.secondaryBtnText, { color: colors.textMuted }]}>Reset</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={swRunning ? swLap : swReset}
            hitSlop={8}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather
              name={swRunning ? "clock" : "rotate-ccw"}
              size={13}
              color={colors.textMuted}
            />
            <Text style={[styles.secondaryBtnText, { color: colors.textMuted }]}>
              {swRunning ? "Lap" : "Reset"}
            </Text>
          </Pressable>
        )}
      </View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  timerCard: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 14,
  },
  timerCardCompact: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  targetSlotWrap: {
    width: "100%",
    paddingBottom: 2,
  },
  targetDivider: {
    height: 1,
    width: "100%",
    opacity: 0.2,
    marginTop: 8,
  },
  timerRingWrap: {
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 2,
  },
  timerContent: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  timerDigits: {
    fontWeight: "800",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  timerSub: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  primaryActionWrap: {
    width: "100%",
  },
  primaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  durationSection: {
    width: "100%",
    alignItems: "center",
    gap: 8,
    marginTop: -2,
  },
  presetsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  customAdjusterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  adjustBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  customAdjusterInput: {
    fontSize: 14,
    fontWeight: "600",
    minWidth: 50,
    height: 30,
    textAlign: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  secondaryArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 0,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    minHeight: 28,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
