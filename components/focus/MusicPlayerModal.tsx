import React, { useRef } from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather, AntDesign } from "@expo/vector-icons";
import { AppText as Text } from "@/components/ui/AppText";
import { AMBIENT_SOUNDS, getSoundMetadata } from "@/constants/sounds";

interface MusicPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedSoundId: string;
  onSelectSound: (id: string) => void;
  soundVolume: number;
  onAdjustVolume: (val: number) => void;
  isMuted: boolean;
  onToggleMute: (muted: boolean) => void;
  playerCurrentTime: number;
  setPlayerCurrentTime: (val: number) => void;
  playerDuration: number;
  soundRef: React.MutableRefObject<any>;
  likedSoundIds: string[];
  onToggleLike: (id: string) => void;
  customTracks: any[];
  onImportCustomTrack: () => void;
  onDeleteCustomTrack: (id: string) => void;
  isShuffle: boolean;
  onToggleShuffle: (shuffle: boolean) => void;
  isRepeat: boolean;
  onToggleRepeat: (repeat: boolean) => void;
  isPlaying: boolean;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  mode: "pomodoro" | "stopwatch";
  handleStartPause: () => void;
  swStartPause: () => void;
  isDraggingProgressRef: React.MutableRefObject<boolean>;
  colors: any;
  insets: any;
}

export const MusicPlayerModal: React.FC<MusicPlayerModalProps> = ({
  visible,
  onClose,
  selectedSoundId,
  onSelectSound,
  soundVolume,
  onAdjustVolume,
  isMuted,
  onToggleMute,
  playerCurrentTime,
  setPlayerCurrentTime,
  playerDuration,
  soundRef,
  likedSoundIds,
  onToggleLike,
  customTracks,
  onImportCustomTrack,
  onDeleteCustomTrack,
  isShuffle,
  onToggleShuffle,
  isRepeat,
  onToggleRepeat,
  isPlaying,
  onPrevTrack,
  onNextTrack,
  mode,
  handleStartPause,
  swStartPause,
  isDraggingProgressRef,
  colors,
  insets,
}) => {
  const volumeTrackRef = useRef<any>(null);
  const volumeLayoutRef = useRef<{ pageXOffset: number; width: number }>({ pageXOffset: 0, width: 0 });

  const handleVolumeResponderGrant = (event: any) => {
    const { pageX } = event.nativeEvent;
    if (volumeTrackRef.current) {
      volumeTrackRef.current.measure((x: number, y: number, width: number, height: number, pageXOffset: number) => {
        if (width && typeof pageXOffset === "number") {
          volumeLayoutRef.current = { pageXOffset, width };
          const relativeX = pageX - pageXOffset;
          const pct = Math.max(0, Math.min(1, relativeX / width));
          onToggleMute(false);
          onAdjustVolume(pct);
        }
      });
    }
  };

  const handleVolumeResponderMove = (event: any) => {
    const { pageX } = event.nativeEvent;
    const { pageXOffset, width } = volumeLayoutRef.current;
    if (width) {
      const relativeX = pageX - pageXOffset;
      const pct = Math.max(0, Math.min(1, relativeX / width));
      onToggleMute(false);
      onAdjustVolume(pct);
    }
  };

  const progressTrackRef = useRef<any>(null);
  const progressLayoutRef = useRef<{ pageXOffset: number; width: number }>({ pageXOffset: 0, width: 0 });

  const handleProgressResponderGrant = (event: any) => {
    isDraggingProgressRef.current = true;
    const { pageX } = event.nativeEvent;
    if (progressTrackRef.current) {
      progressTrackRef.current.measure((x: number, y: number, width: number, height: number, pageXOffset: number) => {
        if (width && typeof pageXOffset === "number") {
          progressLayoutRef.current = { pageXOffset, width };
          const relativeX = pageX - pageXOffset;
          const pct = Math.max(0, Math.min(1, relativeX / width));
          const durationVal = playerDuration || 180;
          const targetTime = pct * durationVal;
          setPlayerCurrentTime(targetTime);
        }
      });
    }
  };

  const handleProgressResponderMove = (event: any) => {
    const { pageX } = event.nativeEvent;
    const { pageXOffset, width } = progressLayoutRef.current;
    if (width) {
      const relativeX = pageX - pageXOffset;
      const pct = Math.max(0, Math.min(1, relativeX / width));
      const durationVal = playerDuration || 180;
      const targetTime = pct * durationVal;
      setPlayerCurrentTime(targetTime);
    }
  };

  const handleProgressResponderRelease = (event: any) => {
    isDraggingProgressRef.current = false;
    const { pageX } = event.nativeEvent;
    const { pageXOffset, width } = progressLayoutRef.current;
    if (width) {
      const relativeX = pageX - pageXOffset;
      const pct = Math.max(0, Math.min(1, relativeX / width));
      const durationVal = playerDuration || 180;
      const targetTime = pct * durationVal;
      setPlayerCurrentTime(targetTime);
      if (soundRef.current) {
        try {
          soundRef.current.seekTo(targetTime);
        } catch (err) {
          console.log("Error seeking audio player:", err);
        }
      }
    }
  };

  const metadata = getSoundMetadata(selectedSoundId, customTracks);
  const isTrackLiked = likedSoundIds.includes(selectedSoundId);
  
  const formatProgressTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const durationVal = playerDuration || 180;
  const progressPct = Math.min(100, Math.max(0, (playerCurrentTime / durationVal) * 100));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[
          styles.modalContent,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(24, insets.bottom),
          }
        ]}>
          <View style={styles.sheetHandle} />
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="music" size={20} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Ambient Player
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.divider} />

          {/* Spotify Player Card */}
          <View style={[styles.spotifyPlayerCard, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>
            {/* Album Art Cover */}
            <View style={[styles.albumArtContainer, { backgroundColor: metadata.gradient[0] }]}>
              <View style={styles.albumArtOverlay} />
              <Feather name={metadata.icon as any} size={48} color="#ffffff" />
            </View>

            {/* Metadata Row (Title, Artist, Heart) */}
            <View style={styles.metaContainer}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.trackTitleText, { color: colors.text }]} numberOfLines={1}>
                  {[...AMBIENT_SOUNDS, ...customTracks].find((s) => s.id === selectedSoundId)?.title || "Silent"}
                </Text>
                <Text style={[styles.artistText, { color: colors.textMuted }]} numberOfLines={1}>
                  {metadata.artist}
                </Text>
              </View>
              <Pressable onPress={() => onToggleLike(selectedSoundId)} style={{ padding: 6 }}>
                {isTrackLiked ? (
                  <AntDesign
                    name="heart"
                    color={colors.primary}
                    size={20}
                  />
                ) : (
                  <Feather
                    name="heart"
                    color={colors.textMuted}
                    size={20}
                  />
                )}
              </Pressable>
            </View>

            {/* Progress Bar & Timeline */}
            <View style={styles.progressSection}>
              <View
                ref={progressTrackRef}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleProgressResponderGrant}
                onResponderMove={handleProgressResponderMove}
                onResponderRelease={handleProgressResponderRelease}
                onResponderTerminate={handleProgressResponderRelease}
                style={[styles.progressTrack, { backgroundColor: `${colors.border}88`, position: "relative", justifyContent: "center" }]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPct}%`,
                      backgroundColor: colors.primary,
                    }
                  ]}
                />
                <View
                  style={[
                    styles.progressSliderKnob,
                    {
                      left: `${progressPct}%`,
                      backgroundColor: colors.text,
                    }
                  ]}
                />
              </View>
              <View style={styles.timeLabelsRow}>
                <Text style={[styles.timeLabelText, { color: colors.textMuted }]}>
                  {formatProgressTime(playerCurrentTime)}
                </Text>
                <Text style={[styles.timeLabelText, { color: colors.textMuted }]}>
                  {formatProgressTime(durationVal)}
                </Text>
              </View>
            </View>

            {/* Spotify Control Buttons */}
            <View style={styles.playerControlsRow}>
              <Pressable onPress={() => onToggleShuffle(!isShuffle)} style={styles.controlIconBtn}>
                <Feather name="shuffle" size={16} color={isShuffle ? colors.primary : colors.textMuted} />
              </Pressable>

              <Pressable onPress={onPrevTrack} style={styles.controlIconBtn}>
                <Feather name="skip-back" size={24} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={() => {
                  if (mode === "pomodoro") {
                    handleStartPause();
                  } else {
                    swStartPause();
                  }
                }}
                style={[styles.playPauseCircleBtn, { backgroundColor: colors.primary }]}
              >
                <Feather
                  name={isPlaying ? "pause" : "play"}
                  size={24}
                  color="#ffffff"
                  style={{ marginLeft: isPlaying ? 0 : 2 }}
                />
              </Pressable>

              <Pressable onPress={onNextTrack} style={styles.controlIconBtn}>
                <Feather name="skip-forward" size={24} color={colors.text} />
              </Pressable>

              <Pressable onPress={() => onToggleRepeat(!isRepeat)} style={styles.controlIconBtn}>
                <Feather name="repeat" size={16} color={isRepeat ? colors.primary : colors.textMuted} />
              </Pressable>
            </View>

            {/* Volume Bar */}
            <View style={styles.volumeControllerRow}>
              <Pressable
                onPress={() => onToggleMute(!isMuted)}
                style={styles.volumeIconBtn}
              >
                <Feather
                  name={isMuted || soundVolume === 0 ? "volume-x" : soundVolume < 0.5 ? "volume-1" : "volume-2"}
                  size={18}
                  color={isMuted ? colors.error : colors.textMuted}
                />
              </Pressable>

              <View
                ref={volumeTrackRef}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleVolumeResponderGrant}
                onResponderMove={handleVolumeResponderMove}
                style={[styles.volumeSliderTrack, { backgroundColor: `${colors.border}88` }]}
              >
                <View
                  style={[
                    styles.volumeSliderFill,
                    {
                      width: `${isMuted ? 0 : soundVolume * 100}%`,
                      backgroundColor: colors.primary,
                    }
                  ]}
                />
                <View
                  style={[
                    styles.volumeSliderKnob,
                    {
                      left: `${isMuted ? 0 : soundVolume * 100}%`,
                      backgroundColor: colors.text,
                    }
                  ]}
                />
              </View>

              <Text style={[styles.volumeText, { color: colors.textMuted }]}>
                {isMuted ? "0%" : `${Math.round(soundVolume * 100)}%`}
              </Text>
            </View>
          </View>

          {/* Soundscapes List */}
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.textMuted, marginTop: 8, letterSpacing: 1 }}>
            SELECT SOUNDSCAPE
          </Text>
          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            {/* Import local track button */}
            <Pressable
              onPress={onImportCustomTrack}
              style={[
                styles.importBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: `${colors.primary}11`,
                }
              ]}
            >
              <Feather name="plus-circle" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>
                Import Local Audio File
              </Text>
            </Pressable>

            {[...AMBIENT_SOUNDS, ...customTracks].map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              const isPlayingActive = isSelected && sound.id !== "none" && isPlaying;
              const soundMeta = getSoundMetadata(sound.id, customTracks);
              const isCustom = sound.id.startsWith("custom_");

              const handleDeleteCustom = (e: any) => {
                e.stopPropagation();
                onDeleteCustomTrack(sound.id);
              };

              return (
                <Pressable
                  key={sound.id}
                  onPress={() => onSelectSound(sound.id)}
                  style={[
                    styles.soundItem,
                    {
                      borderBottomColor: `${colors.border}44`,
                      backgroundColor: isSelected ? `${colors.primary}12` : "transparent",
                      borderColor: isSelected ? `${colors.primary}44` : "transparent",
                      borderWidth: isSelected ? 1 : 0,
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginVertical: 4,
                    }
                  ]}
                >
                  {/* Mini artwork */}
                  <View style={[styles.miniArtwork, { backgroundColor: soundMeta.gradient[0] }]}>
                    <Feather name={soundMeta.icon as any} size={16} color="#ffffff" />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: 14, fontWeight: isSelected ? "700" : "600" }} numberOfLines={1}>
                        {sound.title}
                      </Text>
                      {isSelected && (
                        <View style={{
                          backgroundColor: `${colors.primary}22`,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                        }}>
                          <Text style={{ color: colors.primary, fontSize: 9, fontWeight: "700" }}>
                            {isPlayingActive ? "PLAYING" : "SELECTED"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "500" }} numberOfLines={1}>
                      {soundMeta.artist} • {soundMeta.description}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {isCustom && (
                      <Pressable onPress={handleDeleteCustom} style={{ padding: 6 }}>
                        <Feather name="trash-2" size={16} color={colors.error} />
                      </Pressable>
                    )}
                    {isSelected && (
                      isPlayingActive && !isMuted ? (
                        <Feather name="volume-2" size={18} color={colors.primary} />
                      ) : (
                        <Feather name="check" size={18} color={colors.primary} />
                      )
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    gap: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignSelf: "center",
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  spotifyPlayerCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    width: "100%",
    alignItems: "center",
  },
  albumArtContainer: {
    width: 140,
    height: 140,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
    position: "relative",
  },
  albumArtOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  metaContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  trackTitleText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  artistText: {
    fontSize: 14,
    fontWeight: "500",
  },
  progressSection: {
    width: "100%",
    gap: 6,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressSliderKnob: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -3,
    marginLeft: -5,
  },
  timeLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  timeLabelText: {
    fontSize: 11,
    fontWeight: "600",
  },
  playerControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "80%",
    marginVertical: 4,
  },
  controlIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseCircleBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  volumeControllerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    paddingTop: 4,
  },
  volumeIconBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeText: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 32,
    textAlign: "right",
  },
  volumeSliderTrack: {
    height: 6,
    borderRadius: 3,
    flex: 1,
    position: "relative",
    justifyContent: "center",
  },
  volumeSliderFill: {
    height: "100%",
    borderRadius: 3,
  },
  volumeSliderKnob: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  miniArtwork: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  soundItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    marginVertical: 8,
  },
});
