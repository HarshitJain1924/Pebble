import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather, AntDesign } from "@expo/vector-icons";
import { AppText as Text } from "@/components/ui/AppText";
import { Typography } from "@/constants/typography";

interface FocusHeaderProps {
  colors: any;
  selectedSoundId: string;
  likedSoundIds: string[];
  glowEnabled: boolean;
  onMusicPress: () => void;
  onGlowToggle: () => void;
}

export const FocusHeader: React.FC<FocusHeaderProps> = ({
  colors,
  selectedSoundId,
  likedSoundIds,
  glowEnabled,
  onMusicPress,
  onGlowToggle,
}) => {
  return (
    <View style={styles.headerRow}>
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
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={onMusicPress} style={styles.glowToggleBtn}>
          <View style={{ position: "relative" }}>
            <Feather
              name="music"
              size={22}
              color={selectedSoundId !== "none" ? colors.primary : colors.textMuted}
            />
            {likedSoundIds.includes(selectedSoundId) && (
              <View style={[styles.heartBadgeContainer, { backgroundColor: colors.card }]}>
                <AntDesign
                  name="heart"
                  size={10}
                  color={colors.primary}
                />
              </View>
            )}
          </View>
        </Pressable>
        <Pressable onPress={onGlowToggle} style={styles.glowToggleBtn}>
          <Feather
            name={glowEnabled ? ("eye" as any) : ("eye-off" as any)}
            size={22}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  header: {
    gap: 4,
    flex: 1,
  },
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
  subtitle: {
    fontSize: Typography.sizes.sm,
  },
  glowToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  heartBadgeContainer: {
    position: "absolute",
    right: -4,
    top: -4,
    borderRadius: 6,
    padding: 1,
  },
});
