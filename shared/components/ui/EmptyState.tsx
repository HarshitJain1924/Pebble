import React from "react";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  View,
  ViewStyle,
  useColorScheme,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Colors } from "@/shared/constants/theme";

export type MascotVariant =
  | "idle"
  | "peek"
  | "chatting"
  | "focus"
  | "sleeping"
  | "worried";

export const MASCOT_ASSETS: Record<MascotVariant, ImageSourcePropType> = {
  idle: require("@/assets/images/mascot/mascot_idle.png"),
  peek: require("@/assets/images/mascot/mascot_peek.png"),
  chatting: require("@/assets/images/mascot/mascot_chatting.png"),
  focus: require("@/assets/images/mascot/mascot_focus.png"),
  sleeping: require("@/assets/images/mascot/mascot_sleeping.png"),
  worried: require("@/assets/images/mascot/mascot_worried.png"),
};

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  accessibilityHint?: string;
  testID?: string;
}

export interface EmptyStateProps {
  graphic?: React.ReactNode;
  mascot?: MascotVariant;
  mascotSize?: number;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  style?: ViewStyle | ViewStyle[] | any;
  colors?: any;
  testID?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  graphic,
  mascot,
  mascotSize = 72,
  title,
  description,
  action,
  secondaryAction,
  style,
  colors: colorsProp,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const colors = colorsProp ?? Colors[colorScheme === "light" ? "light" : "dark"];

  return (
    <Animated.View
      entering={FadeInDown.duration(500).springify().damping(20).stiffness(120)}
      style={[
        styles.container,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="summary"
    >
      {/* Mascot or Custom Graphic */}
      {mascot ? (
        <View style={styles.mascotWrap}>
          <Image
            source={MASCOT_ASSETS[mascot]}
            style={{ width: mascotSize, height: mascotSize }}
            resizeMode="contain"
            accessible={false}
            importantForAccessibility="no"
            accessibilityElementsHidden={true}
          />
        </View>
      ) : graphic ? (
        <View style={styles.graphicWrap}>{graphic}</View>
      ) : null}

      {/* Title */}
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        {title}
      </Text>

      {/* Description */}
      {description ? (
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {description}
        </Text>
      ) : null}

      {/* Actions */}
      {(action || secondaryAction) && (
        <View style={styles.actionsContainer}>
          {action && (
            <PressableScale
              onPress={action.onPress}
              haptic
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={action.accessibilityHint}
              testID={action.testID}
              style={styles.actionWrapper}
              contentStyle={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
              ]}
            >
              {action.icon && (
                <Feather
                  name={action.icon}
                  size={15}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={styles.primaryButtonText}>{action.label}</Text>
            </PressableScale>
          )}

          {secondaryAction && (
            <PressableScale
              onPress={secondaryAction.onPress}
              haptic
              accessibilityRole="button"
              accessibilityLabel={secondaryAction.label}
              accessibilityHint={secondaryAction.accessibilityHint}
              testID={secondaryAction.testID}
              style={styles.actionWrapper}
              contentStyle={[
                styles.secondaryButton,
                {
                  borderColor: colors.border,
                  backgroundColor: "transparent",
                },
              ]}
            >
              {secondaryAction.icon && (
                <Feather
                  name={secondaryAction.icon}
                  size={15}
                  color={colors.text}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                {secondaryAction.label}
              </Text>
            </PressableScale>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 28,
    paddingHorizontal: 24,
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
  mascotWrap: {
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  graphicWrap: {
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
  },
  actionWrapper: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});
