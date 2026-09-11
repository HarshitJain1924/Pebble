import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { AMBIENT_SOUNDS } from "@/shared/constants/sounds";

interface AmbientSoundBarProps {
  isActive: boolean;
  selectedSoundId: string;
  isMuted: boolean;
  onToggleMute: (muted: boolean) => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  onOpenPlayer: () => void;
  colors: any;
  customTracks?: any[];
}

// Single equalizer bar: slow, gentle rise and fall while audio plays.
const EQBar: React.FC<{ color: string; duration: number }> = ({ color, duration }) => {
  const height = useSharedValue(4);

  useEffect(() => {
    height.value = withRepeat(
      withSequence(
        withTiming(10, { duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [duration, height]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[styles.eqBar, { backgroundColor: color }, barStyle]}
    />
  );
};

const NowPlayingBars: React.FC<{ color: string }> = ({ color }) => (
  <View style={styles.eqRow}>
    <EQBar color={color} duration={360} />
    <EQBar color={color} duration={520} />
    <EQBar color={color} duration={430} />
  </View>
);

export const AmbientSoundBar: React.FC<AmbientSoundBarProps> = ({
  isActive,
  selectedSoundId,
  isMuted,
  onToggleMute,
  onPrevTrack,
  onNextTrack,
  onTogglePlay,
  isPlaying,
  onOpenPlayer,
  colors,
  customTracks = [],
}) => {
  const colorScheme = useColorScheme() ?? "dark";
  const isDark = colorScheme !== "light";

  const allTracks = [...AMBIENT_SOUNDS, ...customTracks];
  const soundItem = allTracks.find((s) => s.id === selectedSoundId);
  const isSilent = !selectedSoundId || selectedSoundId === "none";
  const soundTitle = isSilent ? "Off" : soundItem?.title || "Off";

  // Deep indigo glass — matches the cockpit's violet-tinted surface instead of
  // reading as a pure black slab over the violet mesh background.
  const surfaceBg = isDark
    ? "rgba(31, 31, 53, 0.72)"
    : "rgba(245, 246, 255, 0.8)";
  const surfaceBorder = isDark
    ? "rgba(129, 140, 248, 0.16)"
    : "rgba(79, 70, 229, 0.12)";

  // 1. INACTIVE / READY STATE — COMPACT UTILITY ROW
  if (!isActive) {
    return (
      <PressableScale
        onPress={onOpenPlayer}
        haptic
        accessibilityRole="button"
        accessibilityLabel={`Ambient sound: ${soundTitle}. Tap to select sound.`}
        style={styles.barWrapper}
        contentStyle={[
          styles.inactiveBar,
          {
            backgroundColor: surfaceBg,
            borderColor: surfaceBorder,
            borderTopColor: isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(255, 255, 255, 0.8)",
            borderBottomColor: isDark ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.08)",
          },
        ]}
      >
        <View style={styles.inactiveLeftGroup}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: isSilent
                  ? isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.04)"
                  : `${colors.primary}18`,
              },
            ]}
          >
            <Feather
              name={isSilent ? "volume-x" : "music"}
              size={14}
              color={isSilent ? colors.textMuted : colors.primary}
            />
          </View>
          <View style={styles.inactiveTextCol}>
            <Text style={[styles.inactiveLabel, { color: colors.text }]}>
              Ambient sound
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.inactiveSub, { color: colors.textMuted }]}>
              {soundTitle}
            </Text>
          </View>
        </View>

        <Feather name="chevron-right" size={16} color={colors.textMuted} />
      </PressableScale>
    );
  }

  // 2. ACTIVE / RUNNING STATE — SUPPORTING MINI PLAYER
  return (
    <View
      style={[
        styles.activeBar,
        {
          backgroundColor: surfaceBg,
          borderColor: surfaceBorder,
          borderTopColor: isDark
            ? "rgba(255, 255, 255, 0.12)"
            : "rgba(255, 255, 255, 0.8)",
          borderBottomColor: isDark ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.08)",
        },
      ]}
    >
      {/* Top row: Track identity + now-playing signal + volume toggle */}
      <View style={styles.activeTopRow}>
        <PressableScale
          onPress={onOpenPlayer}
          haptic
          accessibilityRole="button"
          accessibilityLabel={`Current ambient sound: ${soundTitle}. Tap to change sound.`}
          style={styles.activeTrackGroupWrapper}
          contentStyle={styles.activeTrackGroup}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View
            style={[
              styles.miniIconBadge,
              {
                backgroundColor: isSilent
                  ? isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.04)"
                  : `${colors.primary}18`,
              },
            ]}
          >
            <Feather
              name={isSilent ? "volume-x" : "music"}
              size={12}
              color={isSilent ? colors.textMuted : colors.primary}
            />
          </View>
          <Text
            numberOfLines={1}
            style={[styles.activeTrackTitle, { color: colors.text }]}
          >
            {isSilent ? "Ambient Sound · Off" : soundTitle}
          </Text>
          {!isSilent && isPlaying && (
            <NowPlayingBars color={colors.primary || "#6366F1"} />
          )}
          <Feather name="chevron-right" size={13} color={colors.textMuted} />
        </PressableScale>

        <PressableScale
          onPress={() => onToggleMute(!isMuted)}
          haptic
          accessibilityRole="button"
          accessibilityState={{ selected: isMuted }}
          accessibilityLabel={isMuted ? "Unmute ambient sound" : "Mute ambient sound"}
          style={[
            styles.volumeBtn,
            {
              backgroundColor: isMuted
                ? "rgba(239, 68, 68, 0.12)"
                : isDark
                ? "rgba(255, 255, 255, 0.06)"
                : "rgba(0, 0, 0, 0.04)",
            },
          ]}
          contentStyle={styles.iconCenter}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name={isMuted ? "volume-x" : "volume-2"}
            size={14}
            color={isMuted ? colors.error || "#EF4444" : colors.textMuted}
          />
        </PressableScale>
      </View>

      {/* Hairline separator between identity and transport */}
      <View
        style={[
          styles.trackDivider,
          {
            backgroundColor: isDark
              ? "rgba(255, 255, 255, 0.07)"
              : "rgba(0, 0, 0, 0.05)",
          },
        ]}
      />

      {/* Transport: prev / prominent play / next */}
      <View style={styles.transportRow}>
        <PressableScale
          onPress={onPrevTrack}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Previous ambient sound track"
          style={styles.transportBtn}
          contentStyle={styles.iconCenter}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="skip-back" size={15} color={colors.textMuted} />
        </PressableScale>

        <PressableScale
          onPress={onTogglePlay}
          haptic
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause ambient sound" : "Play ambient sound"}
          style={[
            styles.transportPlayBtn,
            {
              backgroundColor: colors.primary || "#6366F1",
            },
          ]}
          contentStyle={styles.iconCenter}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather
            name={isPlaying ? "pause" : "play"}
            size={15}
            color="#ffffff"
          />
        </PressableScale>

        <PressableScale
          onPress={onNextTrack}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Next ambient sound track"
          style={styles.transportBtn}
          contentStyle={styles.iconCenter}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="skip-forward" size={15} color={colors.textMuted} />
        </PressableScale>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  barWrapper: {
    width: "100%",
  },
  inactiveBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 48,
  },
  inactiveLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveTextCol: {
    flex: 1,
    gap: 1,
  },
  inactiveLabel: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  inactiveSub: {
    fontSize: 11,
    fontWeight: "500",
  },
  activeBar: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  activeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTrackGroupWrapper: {
    flex: 1,
    marginRight: 8,
  },
  activeTrackGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  miniIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTrackTitle: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 200,
    flexShrink: 1,
  },
  eqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 12,
    marginLeft: 1,
  },
  eqBar: {
    width: 3,
    borderRadius: 1.5,
  },
  iconCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  volumeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  trackDivider: {
    height: 1,
    width: "100%",
    borderRadius: 1,
  },
  transportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 26,
    paddingTop: 1,
  },
  transportBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  transportPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
});