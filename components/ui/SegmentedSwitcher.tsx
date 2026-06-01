import React, { useState, useEffect } from "react";
import { StyleSheet,  View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import * as Haptics from "expo-haptics";

type Option = {
  key: string;
  label: string;
  icon?: string; // Feather icon name
};

type SegmentedSwitcherProps = {
  options: Option[];
  activeKey: string;
  onChange: (key: any) => void;
};

export const SegmentedSwitcher: React.FC<SegmentedSwitcherProps> = ({
  options,
  activeKey,
  onChange,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const [containerWidth, setContainerWidth] = useState(0);
  const activeIndex = options.findIndex((o) => o.key === activeKey);

  const translation = useSharedValue(0);

  useEffect(() => {
    translation.value = withSpring(activeIndex === -1 ? 0 : activeIndex, {
      damping: 20,
      stiffness: 150,
    });
  }, [activeIndex]);

  // Dynamic pill width based on current container measurements
  const pillWidth = containerWidth > 0 ? (containerWidth - 8) / options.length : 0;

  const animatedPillStyle = useAnimatedStyle(() => {
    return {
      width: pillWidth,
      transform: [
        {
          translateX: translation.value * pillWidth,
        },
      ],
    };
  });

  const handleSelect = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(key);
  };

  return (
    <View
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={[
        styles.container,
        {
          backgroundColor: isLight ? "#E2E8F0" : "#27272A",
        },
      ]}
    >
      {/* Dynamic Animated Sliding Pill */}
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              backgroundColor: theme.primary,
            },
            animatedPillStyle,
          ]}
        />
      )}

      {options.map((option) => {
        const isActive = activeKey === option.key;
        return (
          <Pressable
            key={option.key}
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => handleSelect(option.key)}
          >
            <Text
              style={[
                styles.text,
                {
                  color: isActive ? "#FFFFFF" : theme.textMuted,
                  fontWeight: isActive ? "700" : "600",
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginVertical: 8,
    position: "relative",
  },
  button: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    zIndex: 2, // Keep label text above the sliding pill
  },
  pill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 10,
    zIndex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  text: {
    fontSize: 12,
  },
});
