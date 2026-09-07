import React from "react";
import { Platform, SafeAreaView, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenSwipeWrapper } from "@/shared/components/layout/ScreenSwipeWrapper";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

import { useFocusState } from "@/features/focus/hooks/useFocusState";
import { FocusHeader } from "@/features/focus/components/FocusHeader";
import { ModeSelector } from "@/features/focus/components/ModeSelector";
import { TimerCockpit } from "@/features/focus/components/TimerCockpit";
import { FocusTargetCard } from "@/features/focus/components/FocusTargetCard";
import { AmbientSoundBar } from "@/features/focus/components/AmbientSoundBar";
import { TaskPickerModal } from "@/features/focus/components/TaskPickerModal";
import { MusicPlayerModal } from "@/features/focus/components/MusicPlayerModal";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { FloatingGlow } from "@/shared/components/layout/AmbientBackground";

export default function FocusScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const insets = useSafeAreaInsets();
  const { height: windowHeight = 800 } = useWindowDimensions() ?? {};
  const isCompact = windowHeight > 0 && windowHeight < 700;

  const state = useFocusState();

  const targetTitle = state.focusedTaskId
    ? state.todoList.find((t) => t.id === state.focusedTaskId)?.title ||
      state.habitList.find((h) => h.id === state.focusedTaskId)?.title
    : undefined;

  // Atmospheric background layer state resolution for the Focus session workspace
  const isPomodoroWorkActive = state.pomodoroMode === "work" && state.isActive;
  const isBreakActive = state.pomodoroMode === "break" && state.isActive;
  const isBreak = state.pomodoroMode === "break";

  let atmosphereColor = colors.primary;
  let atmosphereOpacity = 0.07;
  let atmospherePulseSpeed = 9000;

  if (isPomodoroWorkActive) {
    atmosphereColor = colors.primary;
    atmosphereOpacity = 0.16;
    atmospherePulseSpeed = 7000;
  } else if (isBreak) {
    atmosphereColor = colors.success;
    atmosphereOpacity = isBreakActive ? 0.13 : 0.06;
    atmospherePulseSpeed = isBreakActive ? 7000 : 9000;
  }

  const atmosphereSize = isCompact ? 360 : 420;

  return (
    <ScreenSwipeWrapper prevRoute="/" nextRoute="/tasks" hideMesh={!state.glowEnabled}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: "transparent" }]}>
        <Animated.View entering={FadeInDown.duration(450).springify()} style={{ flex: 1 }}>
          {/* Atmospheric background treatment centered behind Focus workspace */}
          {state.glowEnabled && (
            <View style={styles.atmosphereWrapper} pointerEvents="none">
              <FloatingGlow
                id="focus_workspace_atmosphere"
                color={atmosphereColor}
                size={atmosphereSize}
                opacity={atmosphereOpacity}
                pulseSpeed={atmospherePulseSpeed}
                pulseRange={0.12}
                style={[
                  styles.atmosphereGlow,
                  {
                    top: isCompact ? 75 : 95,
                  },
                ]}
              />
            </View>
          )}

          <ScrollView
            contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <FocusHeader
              colors={colors}
              selectedSoundId={state.selectedSoundId}
              likedSoundIds={state.likedSoundIds}
              glowEnabled={state.glowEnabled}
              onMusicPress={() => state.setShowMusicPlayer(true)}
              onGlowToggle={state.toggleGlow}
              isBreak={isBreak}
            />

            {/* Mode Selector */}
            <ModeSelector
              mode={state.mode}
              setMode={state.setMode}
              pomodoroMode={state.pomodoroMode}
              setPomodoroMode={state.setPomodoroMode}
              onSelectFocus={state.transitionToWork}
              onSelectBreak={state.transitionToBreak}
              colors={colors}
            />

            {/* Unified Focus Session Workspace */}
            <TimerCockpit
              targetSlot={
                state.mode === "pomodoro" && state.pomodoroMode === "work" ? (
                  <FocusTargetCard
                    focusedTaskId={state.focusedTaskId}
                    todoList={state.todoList}
                    habitList={state.habitList}
                    onLinkPress={() => state.setShowTaskPicker(true)}
                    onUnlinkPress={() => state.setFocusedTaskId(null)}
                    colors={colors}
                  />
                ) : undefined
              }
              targetTitle={targetTitle}
              mode={state.mode}
              pomodoroMode={state.pomodoroMode}
              isActive={state.isActive}
              glowEnabled={state.glowEnabled}
              colors={colors}
              sessionTime={state.sessionTime}
              totalSessionTime={state.totalSessionTime}
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
              onStartBreak={state.transitionToBreak}
              setPomodoroMode={state.setPomodoroMode}
            />

            {/* Supporting Ambient Sound Utility */}
            <AmbientSoundBar
              isActive={state.isActive}
              selectedSoundId={state.selectedSoundId}
              isMuted={state.isMuted}
              onToggleMute={(muted) => state.setIsMuted(muted)}
              onPrevTrack={state.handlePrevTrack}
              onNextTrack={state.handleNextTrack}
              onTogglePlay={state.handleStartPause}
              isPlaying={state.isPlaying}
              onOpenPlayer={() => state.setShowMusicPlayer(true)}
              colors={colors}
              customTracks={state.customTracks}
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
    paddingTop: 12,
    gap: 12,
    paddingBottom: 100,
  },
  scrollContentCompact: {
    paddingTop: 8,
    gap: 10,
    paddingBottom: 80,
  },
  atmosphereWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    zIndex: 0,
  },
  atmosphereGlow: {
    position: "absolute",
  },
});
