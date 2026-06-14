import React from "react";
import { Image, View, StyleSheet } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";

export const AVATAR_MAP: Record<string, any> = {
  avatar_studious: require("@/assets/images/avatars/crow_avatar_studious.png"),
  avatar_zen: require("@/assets/images/avatars/crow_avatar_zen.png"),
  avatar_determined: require("@/assets/images/avatars/crow_avatar_determined.png"),
  avatar_headphones: require("@/assets/images/avatars/crow_avatar_headphones.png"),
  avatar_creative: require("@/assets/images/avatars/crow_avatar_creative.png"),
  avatar_celebrating: require("@/assets/images/avatars/crow_avatar_celebrating.png"),
};

export type AvatarKey = keyof typeof AVATAR_MAP;

export const AVATAR_OPTIONS = [
  { id: "avatar_headphones", label: "Focused Beats", desc: "For deep work & lofi music" },
  { id: "avatar_studious", label: "Smart Scholar", desc: "For reading & intellectual focus" },
  { id: "avatar_zen", label: "Zen Master", desc: "For meditation & calm breathing" },
  { id: "avatar_determined", label: "Focused Runner", desc: "For high output & checklists" },
  { id: "avatar_creative", label: "Artist Beret", desc: "For creative design & expression" },
  { id: "avatar_celebrating", label: "Party Wave", desc: "For goal completions & success" },
];

export const EMOJI_OPTIONS = ["👨‍💻", "🧘", "🚀", "🔥", "🎯", "🎓", "🎨", "✍️", "☕️"];

export function RenderAvatar({ avatar, size = 40, style }: { avatar?: string; size?: number; style?: any }) {
  if (avatar && AVATAR_MAP[avatar]) {
    return (
      <Image
        source={AVATAR_MAP[avatar]}
        style={StyleSheet.flatten([
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            resizeMode: "contain",
          },
          style,
        ])}
      />
    );
  }

  // Fallback to emoji text
  return (
    <View
      style={StyleSheet.flatten([
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ])}
    >
      <Text style={{ fontSize: size * 0.48, textAlign: "center", lineHeight: size }}>
        {avatar || "👨‍💻"}
      </Text>
    </View>
  );
}
