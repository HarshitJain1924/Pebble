import React from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppTextInput as TextInput, AppText as Text } from "@/shared/components/ui/AppText";
import { AppCard } from "@/shared/components/ui/AppCard";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import { FloatingGlow } from "@/shared/components/layout/AmbientBackground";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Colors } from "@/shared/constants/theme";

/**
 * Safely converts a hex or rgb/rgba color string to rgba with the specified alpha.
 */
function toRgba(color: string, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  if (color.startsWith("rgba(") || color.startsWith("rgb(")) return color;
  const clean = color.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/**
 * Blends an accent color over a base surface color with the specified opacity.
 * Generates solid editorial surface colors adhering to the theme system.
 */
function blendSurface(baseHex: string, accentHex: string, opacity: number): string {
  if (!baseHex || !accentHex) return baseHex || accentHex || "#1C1C21";
  const parse = (hex: string) => {
    const clean = hex.replace("#", "");
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    if (clean.length >= 6) {
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    }
    return [0, 0, 0];
  };

  const [r1, g1, b1] = parse(baseHex);
  const [r2, g2, b2] = parse(accentHex);

  const r = Math.round(r1 * (1 - opacity) + r2 * opacity);
  const g = Math.round(g1 * (1 - opacity) + g2 * opacity);
  const b = Math.round(b1 * (1 - opacity) + b2 * opacity);

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

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

  const colorScheme = useColorScheme() ?? "dark";
  const isDark = colorScheme !== "light";
  const theme = Colors[colorScheme] ?? Colors.dark;
  const activeColors = { ...theme, ...colors };
  const isBreakMode = mode === "pomodoro" && pomodoroMode === "break";

  const accentColor = isBreakMode
    ? activeColors.success || theme.success
    : activeColors.primary || theme.primary;

  // Editorial Session Surface Palette derived from theme tokens
  const baseSurface = isDark
    ? activeColors.background || theme.background || "#121215"
    : activeColors.card || theme.card || "#FFFFFF";

  const surfaceBg = isDark
    ? isBreakMode
      ? blendSurface(baseSurface, activeColors.success || theme.success, 0.1) // Restful dark emerald for break
      : isImmersiveWork
      ? blendSurface(baseSurface, activeColors.primary || theme.primary, 0.13) // Focused midnight violet for active work
      : blendSurface(baseSurface, activeColors.primary || theme.primary, 0.08) // Rich midnight violet/indigo for ready work/stopwatch
    : isBreakMode
    ? blendSurface(baseSurface, activeColors.success || theme.success, 0.06) // Fresh pastel mint for break in light mode
    : isImmersiveWork
    ? blendSurface(baseSurface, activeColors.primary || theme.primary, 0.09) // Soft focused lavender for active work in light mode
    : blendSurface(baseSurface, activeColors.primary || theme.primary, 0.05); // Soft periwinkle/lavender for ready work/stopwatch in light mode

  const surfaceBorder = isDark
    ? isImmersiveWork
      ? toRgba(accentColor, 0.35)
      : isBreakMode
      ? toRgba(accentColor, 0.25)
      : toRgba(accentColor, 0.2)
    : isImmersiveWork
    ? toRgba(accentColor, 0.28)
    : isBreakMode
    ? toRgba(accentColor, 0.2)
    : toRgba(accentColor, 0.18);

  // Timer Tonal Cushion (circular grounding backing behind the ring)
  const timerPodBg = toRgba(accentColor, isDark ? 0.08 : 0.06);
  const timerPodBorder = toRgba(accentColor, isDark ? 0.14 : 0.1);

  const ringSize = isCompact ? 160 : 176;
  const glowSize = isImmersiveWork ? (isCompact ? 150 : 175) : (isCompact ? 140 : 160);
  const strokeWidth = isImmersiveWork ? (isCompact ? 7 : 8) : (isCompact ? 6 : 7);
  const timerFontSize = isCompact ? 38 : 44;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progress = totalSessionTime > 0 ? (totalSessionTime - sessionTime) / totalSessionTime : 0;

  return (
    <AppCard
      style={[
        styles.timerCard,
        {
          backgroundColor: surfaceBg,
          borderColor: surfaceBorder,
          borderTopColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.8)",
          borderBottomColor: isDark ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.08)",
          shadowColor: activeColors.primary || theme.primary,
        },
        isCompact && styles.timerCardCompact,
      ]}
    >
      {/* 1. FOCUS TARGET */}
      {targetSlot && (
        <View style={styles.targetSlotWrap}>
          {targetSlot}
        </View>
      )}

      {/* 2. CIRCULAR TIMER WITH DISCRETE PEBBLE PROGRESS */}
      {mode === "pomodoro" ? (
        <View
          style={[
            styles.timerRingWrap,
            {
              width: ringSize,
              height: ringSize,
              backgroundColor: timerPodBg,
              borderColor: timerPodBorder,
              borderRadius: ringSize / 2,
            },
          ]}
        >
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
                ? (colors.border ? `${colors.border}22` : "rgba(255, 255, 255, 0.04)")
                : (isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)")
            }
            variant="pebbles"
          />
          <View style={styles.timerContent}>
            <Text
              style={[
                styles.timerDigits,
                {
                  fontSize: timerFontSize,
                  color: colors.text,
                  opacity: isActive ? 1 : 0.9,
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
        <View
          style={[
            styles.timerRingWrap,
            {
              width: ringSize,
              height: ringSize,
              backgroundColor: timerPodBg,
              borderColor: timerPodBorder,
              borderRadius: ringSize / 2,
            },
          ]}
        >
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
            trackColor={isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"}
            variant="pebbles"
          />
          <View style={styles.timerContent}>
            <Text
              style={[
                styles.timerDigits,
                {
                  fontSize: timerFontSize,
                  color: colors.text,
                  opacity: swRunning ? 1 : 0.9,
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
                shadowColor: pomodoroMode === "work" ? colors.primary : colors.success,
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
                shadowColor: colors.primary,
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

      {/* 4. DURATION OPTIONS (INTENTIONAL TACTILE PILL PRESETS) */}
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
                        ? colors.primary
                        : isDark
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(0, 0, 0, 0.04)",
                      borderColor: isSelected
                        ? colors.primary
                        : isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(0, 0, 0, 0.06)",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected ? "#ffffff" : colors.textMuted,
                      fontWeight: isSelected ? "700" : "600",
                      fontSize: 13,
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
                    ? colors.primary
                    : isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.04)",
                  borderColor: showCustomInput
                    ? colors.primary
                    : isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(0, 0, 0, 0.06)",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: showCustomInput ? "#ffffff" : colors.textMuted,
                  fontWeight: showCustomInput ? "700" : "600",
                  fontSize: 13,
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
                        ? colors.success
                        : isDark
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(0, 0, 0, 0.04)",
                      borderColor: isSelected
                        ? colors.success
                        : isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(0, 0, 0, 0.06)",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected ? "#ffffff" : colors.textMuted,
                      fontWeight: isSelected ? "700" : "600",
                      fontSize: 13,
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
    borderRadius: 32,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    gap: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  timerCardCompact: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  targetSlotWrap: {
    width: "100%",
    paddingBottom: 2,
  },
  targetDivider: {
    height: 0,
    width: "100%",
  },
  timerRingWrap: {
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
    borderWidth: 1,
  },
  timerContent: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  timerDigits: {
    fontWeight: "800",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  timerSub: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
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
    minHeight: 52,
    borderRadius: 26,
    paddingVertical: 14,
    paddingHorizontal: 36,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
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
    gap: 8,
  },
  presetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 40,
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
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  customAdjusterInput: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 58,
    height: 36,
    textAlign: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  secondaryArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    minHeight: 30,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
