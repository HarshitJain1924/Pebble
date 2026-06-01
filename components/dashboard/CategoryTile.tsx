import React from "react";
import { StyleSheet,  View, Pressable, ViewStyle, StyleProp, Platform } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type CategoryTileProps = {
  catKey: string;
  name: string;
  count: number;
  onPress: () => void;
};

// SVG Illustrations
function WorkMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Rect x="4" y="6" width="24" height="16" rx="3" fill="#3b82f6" fillOpacity={0.25} />
      <Rect x="6" y="8" width="10" height="2" rx="1" fill="#60a5fa" />
      <Rect x="6" y="12" width="16" height="1.5" rx="0.75" fill="#3b82f6" fillOpacity={0.3} />
      <Circle cx="16" cy="12" r="3" fill="#34d399" fillOpacity={0.5} />
    </Svg>
  );
}

function HealthMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Path
        d="M16 26C16 26 6 20 6 13C6 10 8.5 7 11.5 7C13.5 7 15 8.5 16 10C17 8.5 18.5 7 20.5 7C23.5 7 26 10 26 13C26 20 16 26 16 26Z"
        fill="#f43f5e"
        fillOpacity={0.25}
        stroke="#f43f5e"
        strokeWidth="1.2"
      />
      <Path
        d="M12 15L15 18L21 12"
        stroke="#f43f5e"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LearningMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Path
        d="M6 12L16 7L26 12L16 17L6 12Z"
        fill="#a855f7"
        fillOpacity={0.25}
        stroke="#a855f7"
        strokeWidth="1"
      />
      <Path
        d="M10 14V21C10 21 12.5 24 16 24C19.5 24 22 21 22 21V14"
        stroke="#a855f7"
        strokeWidth="1.2"
        fill="none"
      />
      <Path
        d="M26 12V20"
        stroke="#a855f7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CreativeMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Circle cx="12" cy="14" r="6" fill="#f59e0b" fillOpacity={0.2} stroke="#f59e0b" strokeWidth="1" />
      <Circle cx="20" cy="14" r="6" fill="#ef4444" fillOpacity={0.15} stroke="#ef4444" strokeWidth="1" />
      <Circle cx="16" cy="20" r="6" fill="#3b82f6" fillOpacity={0.15} stroke="#3b82f6" strokeWidth="1" />
    </Svg>
  );
}

function FocusMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Circle cx="16" cy="16" r="10" stroke="#06b6d4" strokeWidth="1.5" strokeOpacity={0.3} />
      <Circle cx="16" cy="16" r="6" stroke="#06b6d4" strokeWidth="1.2" strokeOpacity={0.5} />
      <Circle cx="16" cy="16" r="2.5" fill="#06b6d4" fillOpacity={0.6} />
      <Path d="M16 4V8" stroke="#06b6d4" strokeWidth="1" strokeLinecap="round" />
      <Path d="M16 24V28" stroke="#06b6d4" strokeWidth="1" strokeLinecap="round" />
      <Path d="M4 16H8" stroke="#06b6d4" strokeWidth="1" strokeLinecap="round" />
      <Path d="M24 16H28" stroke="#06b6d4" strokeWidth="1" strokeLinecap="round" />
    </Svg>
  );
}

function PersonalMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Circle cx="16" cy="12" r="4" fill="#f97316" fillOpacity={0.28} />
      <Path
        d="M8 24C8 20.5 11 18 16 18C21 18 24 20.5 24 24"
        stroke="#f97316"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <Path
        d="M12 12C12 14.2 13.8 16 16 16C18.2 16 20 14.2 20 12"
        stroke="#f97316"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CategoryBackgroundSvg({
  catKey,
  color,
  op,
}: {
  catKey: string;
  color: string;
  op: any;
}) {
  if (catKey === "work") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Rect x="10" y="30" width="30" height="40" rx="3" fill={color} fillOpacity={op.fillMedium} />
          <Rect x="45" y="15" width="25" height="55" rx="3" fill={color} fillOpacity={op.fillStrong} />
          <Circle cx="60" cy="15" r="10" stroke={color} strokeWidth="1" strokeOpacity={op.stroke} />
          <Path d="M10 50 L35 40 L50 60 L70 30" stroke={color} strokeWidth="1.2" strokeOpacity={op.strokeStrong} strokeDasharray="3 3" />
        </Svg>
      </View>
    );
  }
  if (catKey === "personal") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Path d="M10 50 L40 20 L70 50 Z" stroke={color} strokeWidth="1" strokeOpacity={op.stroke} />
          <Circle cx="40" cy="45" r="16" fill={color} fillOpacity={op.fill} />
          <Path d="M40 35 L43 41 L49 42 L45 46 L46 52 L40 49 L34 52 L35 46 L31 42 L37 41 Z" fill={color} fillOpacity={op.fillStrong} />
        </Svg>
      </View>
    );
  }
  if (catKey === "health") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Path d="M5 45 L20 45 L26 25 L34 60 L42 35 L48 48 L54 45 L75 45" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={op.strokeStrong} />
          <Circle cx="34" cy="60" r="4" fill={color} fillOpacity={op.stroke} />
          <Circle cx="26" cy="25" r="4" fill={color} fillOpacity={op.stroke} />
        </Svg>
      </View>
    );
  }
  if (catKey === "learning") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Path d="M10 25 C30 20, 50 30, 70 25 L70 65 C50 70, 30 60, 10 65 Z" fill={color} fillOpacity={op.fill} stroke={color} strokeWidth="0.8" strokeOpacity={op.fillStrong} />
          <Path d="M40 25 L40 63" stroke={color} strokeWidth="1" strokeOpacity={op.stroke} />
          <Circle cx="55" cy="45" r="12" stroke={color} strokeWidth="1.2" strokeOpacity={op.fillStrong} strokeDasharray="2 2" />
        </Svg>
      </View>
    );
  }
  if (catKey === "creative") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Circle cx="40" cy="35" r="18" fill={color} fillOpacity={op.fill} stroke={color} strokeWidth="1" strokeOpacity={op.fillStrong} />
          <Path d="M40 53 C40 53 45 42 45 35 M40 53 C40 53 35 42 35 35" stroke={color} strokeWidth="1.2" strokeOpacity={op.stroke} />
          <Path d="M34 56 H46" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity={op.stroke} />
          <Path d="M40 10 V15 M15 35 H20 M60 35 H65 M22 22 L26 26 M58 22 L54 26" stroke={color} strokeWidth="1" strokeLinecap="round" strokeOpacity={op.strokeStrong} />
        </Svg>
      </View>
    );
  }
  if (catKey === "focus") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Circle cx="40" cy="40" r="28" stroke={color} strokeWidth="1" strokeOpacity={op.fillMedium} />
          <Circle cx="40" cy="40" r="18" stroke={color} strokeWidth="1.2" strokeOpacity={op.stroke} strokeDasharray="3 3" />
          <Circle cx="40" cy="40" r="8" fill={color} fillOpacity={op.fillStrong} />
          <Path d="M40 5 V20 M40 60 V75 M5 40 H20 M60 40 H75" stroke={color} strokeWidth="1.2" strokeOpacity={op.stroke} />
        </Svg>
      </View>
    );
  }
  return null;
}

const CATEGORIES_METADATA: Record<string, { label: string; icon: React.ReactNode; darkBg: string; lightBg: string; darkText: string; lightText: string; accentColor: string }> = {
  work: {
    label: "Work",
    icon: <WorkMiniSvg />,
    darkBg: "rgba(99, 102, 241, 0.10)",
    lightBg: "rgba(99, 102, 241, 0.08)",
    darkText: "#c7d2fe",
    lightText: "#312E81",
    accentColor: "#4F46E5",
  },
  personal: {
    label: "Personal",
    icon: <PersonalMiniSvg />,
    darkBg: "rgba(16, 185, 129, 0.08)",
    lightBg: "rgba(16, 185, 129, 0.06)",
    darkText: "#bbf7d0",
    lightText: "#065F46",
    accentColor: "#059669",
  },
  health: {
    label: "Health",
    icon: <HealthMiniSvg />,
    darkBg: "rgba(245, 158, 11, 0.08)",
    lightBg: "rgba(245, 158, 11, 0.06)",
    darkText: "#fde68a",
    lightText: "#78350F",
    accentColor: "#D97706",
  },
  learning: {
    label: "Learning",
    icon: <LearningMiniSvg />,
    darkBg: "rgba(59, 130, 246, 0.08)",
    lightBg: "rgba(59, 130, 246, 0.06)",
    darkText: "#bfdbfe",
    lightText: "#1E3A8A",
    accentColor: "#2563EB",
  },
  creative: {
    label: "Creative",
    icon: <CreativeMiniSvg />,
    darkBg: "rgba(168, 85, 247, 0.08)",
    lightBg: "rgba(168, 85, 247, 0.06)",
    darkText: "#e9d5ff",
    lightText: "#581C87",
    accentColor: "#7C3AED",
  },
  focus: {
    label: "Focus",
    icon: <FocusMiniSvg />,
    darkBg: "rgba(6, 182, 212, 0.08)",
    lightBg: "rgba(6, 182, 212, 0.06)",
    darkText: "#a5f3fc",
    lightText: "#164E63",
    accentColor: "#0891B2",
  },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const CategoryTile: React.FC<CategoryTileProps> = ({
  catKey,
  name,
  count,
  onPress,
}) => {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === "light";
  const scale = useSharedValue(1);

  const meta = CATEGORIES_METADATA[catKey];

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  if (!meta) return null;

  const bg = isLight ? meta.lightBg : meta.darkBg;
  const textColor = isLight ? meta.lightText : meta.darkText;
  const accentColor = meta.accentColor;

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const op = isLight
    ? {
        fill: 0.16,
        fillMedium: 0.22,
        fillStrong: 0.28,
        stroke: 0.26,
        strokeStrong: 0.38,
      }
    : {
        fill: 0.04,
        fillMedium: 0.06,
        fillStrong: 0.08,
        stroke: 0.1,
        strokeStrong: 0.15,
      };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.categoryCard,
        {
          backgroundColor: bg,
        },
        animatedStyle,
      ]}
    >
      <CategoryBackgroundSvg catKey={catKey} color={accentColor} op={op} />
      <View style={styles.contentWrap}>
        <View style={styles.catIconWrap}>{meta.icon}</View>
        <Text style={[styles.catName, { color: textColor }]}>
          {name}
        </Text>
      </View>
      <Text style={[styles.catCount, { color: accentColor }]}>
        {count}
      </Text>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  categoryCard: {
    borderRadius: 18,
    padding: 14,
    height: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
    width: "48%",
    marginBottom: "4%",
    ...Platform.select({
      web: {
        cursor: "pointer",
        userSelect: "none",
      },
    }),
  },
  catBgDecorator: {
    position: "absolute",
    right: -10,
    bottom: -10,
    opacity: 0.8,
  },
  contentWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  catName: {
    fontSize: 14,
    fontWeight: "700",
  },
  catCount: {
    fontSize: 18,
    fontWeight: "800",
    zIndex: 1,
  },
});
