import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
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

  const surfaceBg = isDark ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.65)";
  const surfaceBorder = isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.05)";

  // 1. INACTIVE / READY STATE — COMPACT UTILITY ROW
  if (!isActive) {
    return (
      <PressableScale
        onPress={onOpenPlayer}
        haptic
        style={[
          styles.inactiveBar,
          {
            backgroundColor: surfaceBg,
            borderColor: surfaceBorder,
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
              style={[styles.inactiveSub, { color: colors.textMuted }]}
            >
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
        },
      ]}
    >
      {/* Top row: Track identity + volume toggle */}
      <View style={styles.activeTopRow}>
        <PressableScale
          onPress={onOpenPlayer}
          haptic
          style={styles.activeTrackGroup}
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
          <Feather name="chevron-right" size={13} color={colors.textMuted} />
        </PressableScale>

        <PressableScale
          onPress={() => onToggleMute(!isMuted)}
          haptic
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name={isMuted ? "volume-x" : "volume-2"}
            size={13}
            color={isMuted ? colors.error || "#EF4444" : colors.textMuted}
          />
        </PressableScale>
      </View>

      {/* Subtle micro track indicator */}
      <View
        style={[
          styles.trackDivider,
          {
            backgroundColor: isDark
              ? "rgba(255, 255, 255, 0.07)"
              : "rgba(0, 0, 0, 0.05)",
          },
        ]}
      >
        {!isSilent && isPlaying && (
          <View
            style={[
              styles.trackFill,
              {
                backgroundColor: colors.primary,
                opacity: 0.6,
              },
            ]}
          />
        )}
      </View>

      {/* Supporting mini transport controls */}
      <View style={styles.transportRow}>
        <PressableScale
          onPress={onPrevTrack}
          haptic
          style={styles.transportBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="skip-back" size={14} color={colors.textMuted} />
        </PressableScale>

        <PressableScale
          onPress={onTogglePlay}
          haptic
          style={[
            styles.transportPlayBtn,
            {
              backgroundColor: `${colors.primary}18`,
              borderColor: `${colors.primary}33`,
            },
          ]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather
            name={isPlaying ? "pause" : "play"}
            size={13}
            color={colors.primary}
          />
        </PressableScale>

        <PressableScale
          onPress={onNextTrack}
          haptic
          style={styles.transportBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="skip-forward" size={14} color={colors.textMuted} />
        </PressableScale>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  activeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTrackGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    marginRight: 8,
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
  },
  volumeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  trackDivider: {
    height: 2,
    width: "100%",
    borderRadius: 1,
    overflow: "hidden",
  },
  trackFill: {
    width: "45%",
    height: "100%",
    borderRadius: 1,
  },
  transportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    paddingTop: 1,
  },
  transportBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  transportPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
