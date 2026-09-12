import React, { useEffect } from "react";
import {
  BackHandler,
  Keyboard,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOutRight } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { AppText as Text, AppTextInput as TextInput } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import type { ThemeColors } from "@/shared/constants/theme";

export interface TodaySearchControlProps {
  query: string;
  active: boolean;
  colors: ThemeColors;
  onOpen: () => void;
  onChangeText: (query: string) => void;
  onExit: () => void;
}

export const TodaySearchControl: React.FC<TodaySearchControlProps> = ({
  query,
  active,
  colors,
  onOpen,
  onChangeText,
  onExit,
}) => {
  useEffect(() => {
    if (!active) return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onExit();
        return true;
      },
    );

    return () => subscription.remove();
  }, [active, onExit]);

  if (!active) {
    return (
      <PressableScale
        onPress={onOpen}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Search available work"
        style={[styles.searchButton, { backgroundColor: colors.card, borderColor: colors.border }]}
        contentStyle={styles.searchButtonContent}
      >
        <Feather name="search" size={15} color={colors.textMuted} />
        <Text style={[styles.searchButtonText, { color: colors.text }]}>Search</Text>
      </PressableScale>
    );
  }

  return (
    <>
      <Animated.View
        entering={FadeInRight.duration(160)}
        exiting={FadeOutRight.duration(120)}
        style={[styles.searchField, { backgroundColor: colors.card, borderColor: colors.primary }]}
      >
        <Feather name="search" size={15} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={onChangeText}
          placeholder="Search available work"
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search available work"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {query.length > 0 ? (
          <PressableScale
            onPress={() => onChangeText("")}
            haptic
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.iconButton}
            contentStyle={styles.iconButtonContent}
          >
            <Feather name="x" size={15} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </Animated.View>

      <PressableScale
        onPress={onExit}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Exit search"
        style={[styles.exitButton, { borderColor: colors.border }]}
        contentStyle={styles.iconButtonContent}
      >
        <Feather name="x" size={16} color={colors.textMuted} />
      </PressableScale>
    </>
  );
};

export interface TodaySearchEmptyStateProps {
  query: string;
  colors: ThemeColors;
  onClear: () => void;
}

export const TodaySearchEmptyState: React.FC<TodaySearchEmptyStateProps> = ({
  query,
  colors,
  onClear,
}) => (
  <View style={styles.emptyContainer}>
    <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.primary}15` }]}>
      <Feather name="search" size={22} color={colors.primary} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches</Text>
    <Text style={[styles.emptyDescription, { color: colors.textMuted }]}>
      {`Nothing in your day matches “${query}”.`}
    </Text>
    <PressableScale
      onPress={onClear}
      haptic
      accessibilityRole="button"
      accessibilityLabel="Clear search"
      style={styles.clearButton}
      contentStyle={styles.clearButtonContent}
    >
      <Text style={[styles.clearButtonText, { color: colors.primary }]}>Clear search</Text>
    </PressableScale>
  </View>
);

const styles = StyleSheet.create({
  searchButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  searchButtonContent: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  searchButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  searchField: {
    minHeight: 44,
    flex: 1,
    flexBasis: 130,
    maxWidth: 220,
    minWidth: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    paddingVertical: 0,
    fontSize: 13,
  },
  exitButton: {
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  iconButton: {
    minWidth: 32,
    minHeight: 32,
  },
  iconButtonContent: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    marginHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 32,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emptyDescription: {
    marginTop: 6,
    fontSize: 13,
    textAlign: "center",
  },
  clearButton: {
    minHeight: 44,
    marginTop: 10,
  },
  clearButtonContent: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
});

