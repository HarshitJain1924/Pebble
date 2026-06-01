import React from "react";
import { Platform, StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { BlurView } from "expo-blur";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 30,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  if (Platform.OS === "ios" || Platform.OS === "web") {
    return (
      <BlurView
        intensity={intensity}
        tint={isLight ? "light" : "dark"}
        style={[
          styles.card,
          {
            borderColor: isLight ? theme.border : "rgba(255, 255, 255, 0.065)",
            backgroundColor: isLight ? "rgba(255, 255, 255, 0.55)" : "rgba(24, 24, 27, 0.35)",
          },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }

  // Android fallback (translucent background, no BlurView due to performance issues)
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isLight ? theme.border : "rgba(255, 255, 255, 0.065)",
          backgroundColor: isLight ? "rgba(255, 255, 255, 0.85)" : "rgba(24, 24, 27, 0.72)",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
});
