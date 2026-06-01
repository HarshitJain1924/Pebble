import React from "react";
import { StyleSheet,  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type EmptyStateProps = {
  graphic: React.ReactNode;
  title: string;
  description: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  graphic,
  title,
  description,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <View style={styles.graphicWrap}>{graphic}</View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    backgroundColor: "transparent",
    gap: 12,
    marginVertical: 10,
  },
  graphicWrap: {
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
