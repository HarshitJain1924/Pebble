import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type EmptyStateProps = {
  graphic?: React.ReactNode;
  title: string;
  description?: string;
  style?: ViewStyle | ViewStyle[] | any;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  graphic,
  title,
  description,
  style,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <Animated.View
      entering={FadeInDown.duration(600).springify().damping(20).stiffness(120)}
      style={[
        styles.container,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        style,
      ]}
    >
      {graphic && <View style={styles.graphicWrap}>{graphic}</View>}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "solid",
    gap: 8,
    marginVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  graphicWrap: {
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
