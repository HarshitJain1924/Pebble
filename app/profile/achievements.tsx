import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  SafeAreaView,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
  StatusBar,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { Radius } from "@/shared/constants/radii";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { FloatingGlow } from "@/shared/components/layout/AmbientBackground";
import { addStateListener } from "@/services/events/state-events";
import {
  buildAchievements,
  countUnlockedAchievements,
  groupAchievementsByCategory,
  TOTAL_ACHIEVEMENTS,
  type Achievement,
} from "@/features/profile/achievements";
import { getAchievementStats } from "@/features/profile/services/achievement-stats.service";

export default function AchievementsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [selectedAch, setSelectedAch] = useState<Achievement | null>(null);

  const loadData = useCallback(async () => {
    try {
      const stats = await getAchievementStats();
      setAchievements(buildAchievements(stats));
    } catch (err) {
      console.warn("Failed loading achievements", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when progress changes elsewhere (e.g. streak recovery, pebble awards)
  useEffect(() => {
    return addStateListener("pebbles_changed", () => {
      loadData();
    });
  }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: colors.background, justifyContent: "center" },
        ]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const unlockedCount = countUnlockedAchievements(achievements);
  const groups = groupAchievementsByCategory(achievements);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            router.back();
          }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Achievements
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FloatingGlow
          color={colors.primary}
          size={200}
          opacity={0.06}
          pulseSpeed={6000}
          style={{ position: "absolute", right: -50, top: 20 }}
        />

        {/* ── Summary ─────────────────────────────────────────────── */}
        <View style={styles.summary}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {`${unlockedCount} of ${TOTAL_ACHIEVEMENTS} unlocked`}
          </Text>
          <View
            style={[styles.summaryTrack, { backgroundColor: colors.border }]}
            accessibilityRole="progressbar"
            accessibilityLabel={`${unlockedCount} of ${TOTAL_ACHIEVEMENTS} achievements unlocked`}
          >
            <View
              style={[
                styles.summaryFill,
                {
                  width: `${Math.round(
                    (unlockedCount / TOTAL_ACHIEVEMENTS) * 100,
                  )}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </View>

        {/* ── Grouped gallery ─────────────────────────────────────── */}
        {groups.map((group) => {
          const groupUnlocked = group.items.filter((a) => a.unlocked).length;
          return (
            <View key={group.category} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
                  {group.label.toUpperCase()}
                </Text>
                <Text style={[styles.groupCount, { color: colors.textMuted }]}>
                  {`${groupUnlocked}/${group.items.length}`}
                </Text>
              </View>

              {group.items.map((ach) => (
                <Pressable
                  key={ach.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${ach.title}, ${
                    ach.unlocked ? "unlocked" : "locked"
                  }`}
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Light,
                    ).catch(() => {});
                    setSelectedAch(ach);
                  }}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      borderColor: ach.unlocked ? colors.primary : colors.border,
                      backgroundColor: ach.unlocked
                        ? `${colors.primary}14`
                        : colors.card,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.cardIcon,
                      {
                        backgroundColor: ach.unlocked
                          ? `${colors.primary}20`
                          : colors.cardLight,
                      },
                    ]}
                  >
                    <Feather
                      name={ach.unlocked ? ach.icon : "lock"}
                      size={18}
                      color={ach.unlocked ? colors.primary : colors.textMuted}
                    />
                  </View>

                  <View style={styles.cardText}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {ach.title}
                    </Text>
                    <Text
                      style={[styles.cardCaption, { color: colors.textMuted }]}
                    >
                      {ach.unlocked
                        ? ach.unlockedDesc
                        : ach.targetValue > 1
                          ? `${ach.desc} · ${Math.min(ach.progressValue, ach.targetValue)}/${ach.targetValue}`
                          : ach.desc}
                    </Text>
                  </View>

                  {ach.unlocked ? (
                    <Feather name="check" size={16} color={colors.success} />
                  ) : (
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={colors.textMuted}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Detail sheet ─────────────────────────────────────────── */}
      <Modal
        visible={selectedAch !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAch(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close achievement details"
            onPress={() => setSelectedAch(null)}
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {selectedAch && (
              <>
                <View style={styles.sheetHandleTrack}>
                  <View
                    style={[
                      styles.sheetHandle,
                      { backgroundColor: colors.border },
                    ]}
                  />
                </View>

                <View style={styles.sheetHeaderRow}>
                  <View
                    style={[
                      styles.sheetIcon,
                      {
                        backgroundColor: selectedAch.unlocked
                          ? `${colors.primary}20`
                          : colors.cardLight,
                      },
                    ]}
                  >
                    <Feather
                      name={selectedAch.unlocked ? selectedAch.icon : "lock"}
                      size={26}
                      color={
                        selectedAch.unlocked ? colors.primary : colors.textMuted
                      }
                    />
                  </View>
                  <View style={styles.sheetHeaderText}>
                    <Text
                      style={[styles.sheetTitle, { color: colors.text }]}
                    >
                      {selectedAch.title}
                    </Text>
                    <Text
                      style={[
                        styles.sheetState,
                        {
                          color: selectedAch.unlocked
                            ? colors.success
                            : colors.textMuted,
                        },
                      ]}
                    >
                      {selectedAch.unlocked ? "Unlocked" : "Locked"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close achievement details"
                    hitSlop={10}
                    onPress={() => setSelectedAch(null)}
                  >
                    <Feather name="x" size={20} color={colors.text} />
                  </Pressable>
                </View>

                <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                  {selectedAch.unlocked
                    ? selectedAch.unlockedDesc
                    : selectedAch.desc}
                </Text>

                {!selectedAch.unlocked && (
                  <View style={styles.sheetProgress}>
                    <Text
                      style={[
                        styles.sheetProgressValue,
                        { color: colors.text },
                      ]}
                    >
                      {`${Math.min(
                        selectedAch.progressValue,
                        selectedAch.targetValue,
                      )} / ${selectedAch.targetValue}`}
                    </Text>
                    <View
                      style={[
                        styles.sheetProgressTrack,
                        { backgroundColor: colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.sheetProgressFill,
                          {
                            width: `${Math.min(
                              100,
                              (selectedAch.progressValue /
                                selectedAch.targetValue) *
                                100,
                            )}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setSelectedAch(null)}
                  style={({ pressed }) => [
                    styles.sheetClose,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={styles.sheetCloseText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 44) : 0,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 28,
  },
  summary: { gap: 10 },
  summaryTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  summaryTrack: {
    height: 5,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  summaryFill: { height: "100%", borderRadius: Radius.pill },
  group: { gap: 10 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  groupCount: { fontSize: 11, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardCaption: { fontSize: 12, lineHeight: 16 },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    width: "100%",
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  sheetHandleTrack: { alignItems: "center", paddingVertical: 6 },
  sheetHandle: { width: 40, height: 4, borderRadius: Radius.pill },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeaderText: { flex: 1, gap: 2 },
  sheetTitle: { fontSize: 17, fontWeight: "800" },
  sheetState: { fontSize: 12, fontWeight: "600" },
  sheetBody: { fontSize: 13, lineHeight: 19 },
  sheetProgress: { gap: 8 },
  sheetProgressValue: { fontSize: 13, fontWeight: "700" },
  sheetProgressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  sheetProgressFill: { height: "100%", borderRadius: Radius.pill },
  sheetClose: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
