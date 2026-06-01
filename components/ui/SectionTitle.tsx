import React from "react";
import { StyleSheet,  View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  actionText?: string;
  onActionPress?: () => void;
};

export const SectionTitle: React.FC<SectionTitleProps> = ({
  title,
  subtitle,
  actionText,
  onActionPress,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
      </View>
      {actionText && onActionPress && (
        <Pressable onPress={onActionPress}>
          <Text style={[styles.actionText, { color: colors.primary }]}>{actionText}</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  actionText: {
    fontWeight: "600",
    fontSize: 13,
  },
});
