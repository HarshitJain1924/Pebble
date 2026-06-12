import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppTextInput as TextInput, AppText as Text } from "@/components/ui/AppText";
import { AppCard } from "@/components/AppCard";
import { ProgressRing } from "@/components/ProgressRing";
import { FloatingGlow } from "@/components/AmbientBackground";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";

interface TimerCockpitProps {
  mode: "pomodoro" | "stopwatch";
  pomodoroMode: "work" | "break";
  isActive: boolean;
  glowEnabled: boolean;
  colors: any;
  sessionTime: number;
  totalSessionTime: number;
  focusedTaskId: string | null;
  todoList: any[];
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
  mode,
  pomodoroMode,
  isActive,
  glowEnabled,
  colors,
  sessionTime,
  totalSessionTime,
  focusedTaskId,
  todoList,
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
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progress = totalSessionTime > 0 ? (totalSessionTime - sessionTime) / totalSessionTime : 0;
  const linkedTaskTitle = focusedTaskId ? todoList.find((t) => t.id === focusedTaskId)?.title : null;

  return (
    <AppCard style={styles.timerCard}>
      {mode === "pomodoro" ? (
        <View style={styles.timerRingWrap}>
          {glowEnabled && (
            <FloatingGlow
              color={pomodoroMode === "work" ? (isActive ? colors.warning : colors.primary) : colors.success}
              size={210}
              opacity={isActive ? 0.15 : 0.08}
              pulseSpeed={isActive ? 4000 : 7500}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <ProgressRing
            progress={progress}
            size={230}
            strokeWidth={11}
            showText={false}
            color={pomodoroMode === "work" ? colors.primary : colors.success}
          />
          <View style={styles.timerContent}>
            <Text style={[styles.timerDigits, { color: colors.text }]}>
              {formatTime(sessionTime)}
            </Text>
            <Text
              style={[
                styles.timerSub,
                { color: pomodoroMode === "work" ? colors.textMuted : colors.success },
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
            {linkedTaskTitle && pomodoroMode === "work" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, maxWidth: 180 }}>
                <Feather name="target" size={14} color={colors.primary} />
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.textMuted }}>
                  {linkedTaskTitle}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.timerRingWrap}>
          {glowEnabled && (
            <FloatingGlow
              color={swRunning ? colors.primary : colors.textMuted}
              size={210}
              opacity={swRunning ? 0.15 : 0.08}
              pulseSpeed={swRunning ? 4000 : 7500}
              style={StyleSheet.absoluteFillObject}
            />
          )}
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
            <Text style={[styles.timerSub, { color: colors.textMuted }]}>
              {swRunning ? "Running" : "Paused"}
            </Text>
          </View>
        </View>
      )}

      {/* Work presets */}
      {mode === "pomodoro" && pomodoroMode === "work" && !isActive && (
        <View style={{ gap: 12, alignItems: "center" }}>
          <View style={styles.presetsRow}>
            {[15, 25, 45].map((mins) => {
              const isSelected = !showCustomInput && totalSessionTime === mins * 60;
              return (
                <Pressable
                  key={mins}
                  onPress={() => selectDuration(mins)}
                  style={[
                    styles.presetBtn,
                    {
                      backgroundColor: isSelected ? `${colors.primary}22` : colors.cardLight,
                      borderColor: isSelected ? colors.primary : colors.border,
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
                  backgroundColor: showCustomInput ? `${colors.primary}22` : colors.cardLight,
                  borderColor: showCustomInput ? colors.primary : colors.border,
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={customMinsText}
                  onChangeText={handleCustomMinutesChange}
                  onBlur={handleCustomMinutesSubmitOrBlur}
                  onSubmitEditing={handleCustomMinutesSubmitOrBlur}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={[styles.customAdjusterInput, { color: colors.text, borderColor: colors.border }]}
                />
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>mins</Text>
              </View>
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

      {/* Break presets */}
      {mode === "pomodoro" && pomodoroMode === "break" && !isActive && (
        <View style={{ gap: 12, alignItems: "center" }}>
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
                  style={[
                    styles.presetBtn,
                    {
                      backgroundColor: isSelected ? `${colors.success}22` : colors.cardLight,
                      borderColor: isSelected ? colors.success : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected ? colors.success : colors.text,
                      fontWeight: "600",
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

      {/* Controller */}
      <View style={styles.controlsRow}>
        {mode === "pomodoro" ? (
          <Pressable
            onPress={handleStartPause}
            style={[
              styles.mainBtn,
              { backgroundColor: pomodoroMode === "work" ? colors.primary : colors.success },
            ]}
          >
            <Feather name={isActive ? "pause" : "play"} size={20} color="#ffffff" />
            <Text style={styles.mainBtnText}>
              {isActive ? "Pause" : pomodoroMode === "work" ? "Start Focus" : "Start Break"}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={swStartPause} style={[styles.mainBtn, { backgroundColor: colors.primary }]}>
            <Feather name={swRunning ? "pause" : "play"} size={20} color="#ffffff" />
            <Text style={styles.mainBtnText}>{swRunning ? "Pause" : "Start"}</Text>
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
            <Text style={{ color: colors.text, fontWeight: "600" }}>Reset</Text>
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
  );
};

const styles = StyleSheet.create({
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
  customAdjusterInput: {
    fontSize: 16,
    fontWeight: "700",
    minWidth: 60,
    textAlign: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
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
});
