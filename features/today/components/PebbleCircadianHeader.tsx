import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOutRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { RenderAvatar } from "@/features/profile/components/RenderAvatar";
import {
  AppText as Text,
  AppTextInput as TextInput,
} from "@/shared/components/ui/AppText";
import { type ThemeColors } from "@/shared/constants/theme";

const MORNING_LIGHT_ART = require("@/assets/images/today/pebble_morning_light.jpg");
const MORNING_DARK_ART = require("@/assets/images/today/pebble_morning_dark.jpg");
const AFTERNOON_ART = require("@/assets/images/today/pebble_afternoon.jpg");
const NIGHT_ART = require("@/assets/images/today/pebble_night.jpg");

export type CircadianPeriod = "morning" | "afternoon" | "night";

export const getCircadianPeriod = (date = new Date()): CircadianPeriod => {
  const hour = date.getHours();
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
};

export const getGreetingForPeriod = (period: CircadianPeriod): string => {
  switch (period) {
    case "morning":
      return "Good morning,";
    case "afternoon":
      return "Good afternoon,";
    case "night":
      return "Good evening,";
  }
};

export const getCircadianArtSource = (
  period: CircadianPeriod,
  isDark = false,
) => {
  switch (period) {
    case "morning":
      return isDark ? MORNING_DARK_ART : MORNING_LIGHT_ART;
    case "afternoon":
      return AFTERNOON_ART;
    case "night":
      return NIGHT_ART;
  }
};

export interface PebbleCircadianHeaderProps {
  forcePeriod?: CircadianPeriod;
  kicker?: string;
  title?: string;
  subtitle?: string;
  profile?: { name: string; avatar: string } | null;
  hasUnreadNotifs?: boolean;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  streak?: number;
  onStreakPress?: () => void;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  style?: any;
}

export const PebbleCircadianHeader: React.FC<PebbleCircadianHeaderProps> = ({
  forcePeriod,
  kicker,
  title,
  subtitle = "Small steps. A calmer you.",
  profile,
  hasUnreadNotifs = false,
  showSearch = true,
  searchQuery = "",
  onSearchQueryChange,
  streak,
  onStreakPress,
  colors,
  colorScheme,
  style,
}) => {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isSearching, setIsSearching] = useState(false);
  const isDark = colorScheme === "dark";

  const period = forcePeriod || getCircadianPeriod();
  const artSource = getCircadianArtSource(period, isDark);

  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? RNStatusBar.currentHeight || 28 : 20,
  );
  const totalHeaderHeight = 180 + topInset;

  const displayKicker = kicker
    ? kicker.endsWith(",")
      ? kicker
      : `${kicker},`
    : getGreetingForPeriod(period);

  const displayName =
    (title && title.trim()) || (profile?.name && profile.name.trim()) || "User";

  return (
    <View
      style={[
        styles.container,
        {
          width: screenWidth,
          height: totalHeaderHeight,
          marginLeft: -16,
          marginRight: -16,
        },
        style,
      ]}
    >
      {/* Background Scenic Art extending full bleed under status bar & camera */}
      <Image
        source={artSource}
        style={[
          styles.backgroundImage,
          {
            width: screenWidth,
            height: totalHeaderHeight,
          },
        ]}
        resizeMode="cover"
        accessibilityLabel={`Pebble ${period} scenic artwork`}
      />

      {/* SVG Gradient Fade seamlessly melting the artwork into colors.background */}
      <Svg
        style={StyleSheet.absoluteFill}
        width={screenWidth}
        height={totalHeaderHeight}
        pointerEvents="none"
      >
        <Defs>
          {/* Subtle top vignette for front camera punch-hole and status bar readability */}
          <LinearGradient id="circadianTopVignette" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0%"
              stopColor="#000000"
              stopOpacity={isDark ? "0.32" : "0.15"}
            />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </LinearGradient>
          {/* Bottom fade into background */}
          <LinearGradient id="circadianFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.background} stopOpacity="0" />
            <Stop offset="35%" stopColor={colors.background} stopOpacity="0" />
            <Stop
              offset="60%"
              stopColor={colors.background}
              stopOpacity={isDark ? "0.35" : "0.2"}
            />
            <Stop
              offset="80%"
              stopColor={colors.background}
              stopOpacity={isDark ? "0.8" : "0.7"}
            />
            <Stop offset="100%" stopColor={colors.background} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {/* Top Vignette behind status bar & camera punch-hole */}
        <Rect
          x="0"
          y="0"
          width={screenWidth}
          height={topInset + 12}
          fill="url(#circadianTopVignette)"
        />
        {/* Bottom Fade */}
        <Rect
          x="0"
          y="0"
          width={screenWidth}
          height={totalHeaderHeight}
          fill="url(#circadianFade)"
        />
      </Svg>

      {/* Header Controls & Titles safely padded below the front camera and status bar */}
      <View
        style={[
          styles.contentWrap,
          {
            paddingTop: topInset + 8,
          },
        ]}
      >
        {isSearching ? (
          <Animated.View
            entering={FadeInRight.duration(200)}
            exiting={FadeOutRight.duration(150)}
            style={[
              styles.searchContainer,
              {
                backgroundColor: isDark
                  ? "rgba(28, 28, 33, 0.9)"
                  : "rgba(255, 255, 255, 0.95)",
                borderColor: colors.border,
              },
            ]}
          >
            <Feather
              name="search"
              size={15}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder="Search today's tasks & habits..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
              autoFocus
            />
            <Pressable
              onPress={() => {
                setIsSearching(false);
                onSearchQueryChange?.("");
              }}
              style={styles.clearSearchBtn}
              hitSlop={8}
            >
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          </Animated.View>
        ) : (
          <View style={styles.headerRow}>
            {/* Left: Greeting & Title */}
            <View style={styles.titleColumn}>
              <Text
                style={[
                  styles.kickerText,
                  {
                    color: isDark ? "rgba(228, 228, 231, 0.9)" : "#4B5563",
                    textShadowColor: isDark
                      ? "rgba(0, 0, 0, 0.85)"
                      : "transparent",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  },
                ]}
              >
                {displayKicker}
              </Text>
              <Text
                style={[
                  styles.nameTitleText,
                  {
                    color: colors.text,
                    textShadowColor: isDark
                      ? "rgba(0, 0, 0, 0.9)"
                      : "rgba(255, 255, 255, 0.9)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  },
                ]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text
                style={[
                  styles.subtitleText,
                  {
                    color: isDark ? "rgba(228, 228, 231, 0.8)" : "#6B7280",
                    textShadowColor: isDark
                      ? "rgba(0, 0, 0, 0.85)"
                      : "transparent",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>

            {/* Right: Actions (Search, Streak, Avatar) */}
            <View style={styles.rightActionsRow}>
              {showSearch && (
                <Pressable
                  onPress={() => setIsSearching(true)}
                  style={({ pressed }) => [
                    styles.circleActionButton,
                    {
                      backgroundColor: isDark
                        ? "rgba(20, 20, 25, 0.65)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.18)"
                        : "rgba(0, 0, 0, 0.08)",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Search tasks"
                  hitSlop={6}
                >
                  <Feather name="search" size={16} color={colors.text} />
                </Pressable>
              )}

              {streak !== undefined && streak > 0 && (
                <Pressable
                  onPress={onStreakPress}
                  style={({ pressed }) => [
                    styles.streakPill,
                    {
                      backgroundColor: isDark
                        ? "rgba(245, 158, 11, 0.2)"
                        : "rgba(254, 243, 199, 0.9)",
                      borderColor: isDark
                        ? "rgba(245, 158, 11, 0.3)"
                        : "rgba(245, 158, 11, 0.4)",
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  hitSlop={6}
                >
                  <Text style={styles.streakText}>{`🔥 ${streak}`}</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => router.push("/profile")}
                style={({ pressed }) => [
                  styles.avatarWrapper,
                  {
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.25)"
                      : "rgba(0, 0, 0, 0.1)",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                hitSlop={6}
              >
                <RenderAvatar
                  avatar={profile?.avatar}
                  size={36}
                  style={styles.avatarInner}
                />
                {hasUnreadNotifs && <View style={styles.unreadBadgeDot} />}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  contentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    zIndex: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleColumn: {
    flex: 1,
    paddingRight: 12,
  },
  kickerText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  nameTitleText: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  rightActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  streakPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  streakText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D97706",
  },
  avatarWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  unreadBadgeDot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 14,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
});
