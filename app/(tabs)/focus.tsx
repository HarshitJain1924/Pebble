import React from "react";
import { Platform, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useFocusState } from "@/components/focus/useFocusState";
import { FocusHeader } from "@/components/focus/FocusHeader";
import { ModeSelector } from "@/components/focus/ModeSelector";
import { TimerCockpit } from "@/components/focus/TimerCockpit";
import { FocusTargetCard } from "@/components/focus/FocusTargetCard";
import { FocusStatsCard } from "@/components/focus/FocusStatsCard";
import { TaskPickerModal } from "@/components/focus/TaskPickerModal";
import { MusicPlayerModal } from "@/components/focus/MusicPlayerModal";
import { AppCard } from "@/components/AppCard";
import { AppText as Text } from "@/components/ui/AppText";

export default function FocusScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const insets = useSafeAreaInsets();

  const state = useFocusState();

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <ScreenSwipeWrapper prevRoute="/" nextRoute="/tasks" hideMesh={!state.glowEnabled}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: "transparent" }]}>
        <Animated.View entering={FadeInDown.duration(450).springify()} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <FocusHeader
              colors={colors}
              selectedSoundId={state.selectedSoundId}
              likedSoundIds={state.likedSoundIds}
              glowEnabled={state.glowEnabled}
              onMusicPress={() => state.setShowMusicPlayer(true)}
              onGlowToggle={state.toggleGlow}
            />

            {/* Mode Selector */}
            <ModeSelector mode={state.mode} setMode={state.setMode} colors={colors} />

            {/* Timer Cockpit */}
            <TimerCockpit
              mode={state.mode}
              pomodoroMode={state.pomodoroMode}
              isActive={state.isActive}
              glowEnabled={state.glowEnabled}
              colors={colors}
              sessionTime={state.sessionTime}
              totalSessionTime={state.totalSessionTime}
              focusedTaskId={state.focusedTaskId}
              todoList={state.todoList}
              swRunning={state.swRunning}
              swTime={state.swTime}
              showCustomInput={state.showCustomInput}
              customMinutes={state.customMinutes}
              customMinsText={state.customMinsText}
              breakType={state.breakType}
              handleStartPause={state.handleStartPause}
              handleReset={state.handleReset}
              swStartPause={state.swStartPause}
              swReset={state.swReset}
              swLap={state.swLap}
              selectDuration={state.selectDuration}
              selectCustomDuration={state.selectCustomDuration}
              adjustCustomMinutes={state.adjustCustomMinutes}
              handleCustomMinutesChange={state.handleCustomMinutesChange}
              handleCustomMinutesSubmitOrBlur={state.handleCustomMinutesSubmitOrBlur}
              setBreakType={state.setBreakType}
              setSessionTime={state.setSessionTime}
              setTotalSessionTime={state.setTotalSessionTime}
            />

            {/* Focus Target Card */}
            {state.mode === "pomodoro" && state.pomodoroMode === "work" && (
              <FocusTargetCard
                focusedTaskId={state.focusedTaskId}
                todoList={state.todoList}
                habitList={state.habitList}
                onLinkPress={() => state.setShowTaskPicker(true)}
                onUnlinkPress={() => state.setFocusedTaskId(null)}
                colors={colors}
              />
            )}

            {/* Laps List */}
            {state.mode === "stopwatch" && state.swLaps.length > 0 && (
              <AppCard style={styles.lapsCard}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>Laps</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                {state.swLaps.map((lapTime, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.lapRow,
                      {
                        borderBottomWidth: idx === state.swLaps.length - 1 ? 0 : 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.textMuted, fontWeight: "600" }}>
                      Lap {state.swLaps.length - idx}
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                      }}
                    >
                      {formatTime(lapTime)}
                    </Text>
                  </View>
                ))}
              </AppCard>
            )}

            {/* Focus Analytics Metrics */}
            <FocusStatsCard
              completedToday={state.completedToday}
              totalFocusTime={state.totalFocusTime}
              colors={colors}
            />
          </ScrollView>
        </Animated.View>
      </SafeAreaView>

      <TaskPickerModal
        visible={state.showTaskPicker}
        onClose={() => state.setShowTaskPicker(false)}
        todoList={state.todoList}
        habitList={state.habitList}
        focusedTaskId={state.focusedTaskId}
        onSelectTask={(id) => state.setFocusedTaskId(id)}
        colors={colors}
        insets={insets}
      />

      <MusicPlayerModal
        visible={state.showMusicPlayer}
        onClose={() => state.setShowMusicPlayer(false)}
        selectedSoundId={state.selectedSoundId}
        onSelectSound={state.handleSelectSound}
        soundVolume={state.soundVolume}
        onAdjustVolume={state.handleAdjustVolume}
        isMuted={state.isMuted}
        onToggleMute={(muted) => state.setIsMuted(muted)}
        playerCurrentTime={state.playerCurrentTime}
        setPlayerCurrentTime={state.setPlayerCurrentTime}
        playerDuration={state.playerDuration}
        soundRef={state.soundRef}
        likedSoundIds={state.likedSoundIds}
        onToggleLike={state.handleToggleLike}
        customTracks={state.customTracks}
        onImportCustomTrack={state.handleImportCustomTrack}
        onDeleteCustomTrack={state.handleDeleteCustomTrack}
        isShuffle={state.isShuffle}
        onToggleShuffle={(shuffle) => {
          state.setIsShuffle(shuffle);
          AsyncStorage.setItem("todoapp:focus:is_shuffle", String(shuffle)).catch(() => {});
        }}
        isRepeat={state.isRepeat}
        onToggleRepeat={(repeat) => {
          state.setIsRepeat(repeat);
          AsyncStorage.setItem("todoapp:focus:is_repeat", String(repeat)).catch(() => {});
        }}
        isPlaying={state.isPlaying}
        onPrevTrack={state.handlePrevTrack}
        onNextTrack={state.handleNextTrack}
        mode={state.mode}
        handleStartPause={state.handleStartPause}
        swStartPause={state.swStartPause}
        isDraggingProgressRef={state.isDraggingProgressRef}
        colors={colors}
        insets={insets}
      />
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
  lapsCard: {
    padding: 16,
    gap: 12,
  },
  divider: {
    height: 1,
    opacity: 0.2,
  },
  lapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
});
