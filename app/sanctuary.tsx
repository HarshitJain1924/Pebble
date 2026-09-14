import { InteractivePebbleJar } from "@/features/profile/components/InteractivePebbleJar";
import {
  getPebbleCounts,
  getGemsBalance,
  type PebbleCounts,
} from "@/features/profile/services/pebble.service";
import {
  getProfile,
  type UserProfile,
} from "@/features/settings/services/settings.service";
import { addStateListener } from "@/services/events/state-events";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Radius } from "@/shared/constants/radii";
import { Shadows } from "@/shared/constants/shadows";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  getMilestoneInfo,
  PEBBLE_MILESTONES,
  PEBBLE_STAGE_THRESHOLDS,
} from "@/shared/utils/pebble-milestones";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

const isWeb = Platform.OS === "web";
const enteringAnim = (delay = 0, duration = 400) => {
  if (isWeb) return undefined;
  return FadeInDown.delay(delay).duration(duration);
};

export default function SanctuaryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pebbleCounts, setPebbleCounts] = useState<PebbleCounts | null>(null);
  const [gemsBalance, setGemsBalance] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [userProfile, counts, gems] = await Promise.all([
        getProfile(),
        getPebbleCounts(),
        getGemsBalance(),
      ]);
      setProfile(userProfile);
      setPebbleCounts(counts);
      setGemsBalance(gems);
    } catch (err) {
      console.warn("Failed to load sanctuary data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    const unsubPebbles = addStateListener("pebbles_changed", () => {
      loadData();
    });
    const unsubProfile = addStateListener("profile_changed", () => {
      loadData();
    });
    return () => {
      unsubPebbles();
      unsubProfile();
    };
  }, [loadData]);

  if (loading || !pebbleCounts) {
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

  const lifetime = pebbleCounts.lifetime ?? 0;
  const monthly = pebbleCounts.monthly ?? 0;
  const milestone = getMilestoneInfo(lifetime);
  const waterPct = Math.min(100, Math.round(monthly));

  const handlePress = (action: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    action();
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            {
              backgroundColor: pressed ? colors.cardLight : "transparent",
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={handlePress(() => router.back())}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Pebble Sanctuary
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            {
              backgroundColor: pressed ? colors.cardLight : "transparent",
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          hitSlop={10}
          onPress={handlePress(() => router.push("/profile"))}
        >
          <Feather name="user" size={19} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section 1: The Living Jar (Hero) ─────────────────────── */}
        <Animated.View entering={enteringAnim(0)} style={styles.heroSection}>
          <View
            style={[
              styles.jarAura,
              {
                backgroundColor:
                  colorScheme === "dark"
                    ? "rgba(99, 102, 241, 0.06)"
                    : "rgba(79, 70, 229, 0.04)",
                borderColor:
                  colorScheme === "dark"
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.04)",
              },
            ]}
          >
            <InteractivePebbleJar
              mode="view"
              totalPebbles={lifetime}
              colors={colors}
              colorScheme={colorScheme ?? "dark"}
              monthlyTypes={pebbleCounts.monthlyTypes}
              profileAvatar={profile?.avatar}
            />
          </View>

          <View style={styles.heroTextGroup}>
            <View style={styles.heroCountRow}>
              <Text style={[styles.heroCount, { color: colors.text }]}>
                {monthly}
              </Text>
              <Text style={[styles.heroUnit, { color: colors.textMuted }]}>
                PEBBLES
              </Text>
            </View>
            <Text style={[styles.heroCaption, { color: colors.textMuted }]}>
              Harvested this month
            </Text>

            <View
              style={[
                styles.capacityBadge,
                {
                  backgroundColor:
                    colorScheme === "dark"
                      ? "rgba(99, 102, 241, 0.12)"
                      : "rgba(79, 70, 229, 0.08)",
                  borderColor:
                    colorScheme === "dark"
                      ? "rgba(99, 102, 241, 0.2)"
                      : "rgba(79, 70, 229, 0.14)",
                },
              ]}
            >
              <Feather name="droplet" size={11} color={colors.primary} />
              <Text style={[styles.capacityText, { color: colors.primary }]}>
                {waterPct}% Jar Capacity
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Section 2: Current Biome & Milestone Plaque ───────────── */}
        <Animated.View entering={enteringAnim(60)}>
          <View
            style={[
              styles.milestoneCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                ...Shadows.soft,
              },
            ]}
          >
            <View style={styles.milestoneTopRow}>
              <View style={styles.milestoneHeaderTag}>
                <Feather name="compass" size={12} color={colors.primary} />
                <Text
                  style={[styles.milestoneEyebrow, { color: colors.textMuted }]}
                >
                  CURRENT BIOME
                </Text>
              </View>
              <View
                style={[
                  styles.stagePill,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(99, 102, 241, 0.12)"
                        : "rgba(79, 70, 229, 0.08)",
                    borderColor:
                      colorScheme === "dark"
                        ? "rgba(99, 102, 241, 0.22)"
                        : "rgba(79, 70, 229, 0.15)",
                  },
                ]}
              >
                <Text style={[styles.stagePillText, { color: colors.primary }]}>
                  Stage {milestone.stage} of 7
                </Text>
              </View>
            </View>

            <View style={styles.milestoneTitleRow}>
              <Text style={[styles.milestoneName, { color: colors.text }]}>
                {milestone.name}
              </Text>
              <Text style={[styles.milestoneRange, { color: colors.textMuted }]}>
                {milestone.range} pebbles
              </Text>
            </View>

            <Text style={[styles.milestoneDesc, { color: colors.textMuted }]}>
              {milestone.desc}
            </Text>

            {/* Progress Track */}
            {!milestone.isMaxStage ? (
              <View style={styles.progressBlock}>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: colors.cardLight },
                  ]}
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Progress to stage ${milestone.nextStage}`}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(
                          4,
                          Math.min(100, milestone.progressRatio * 100),
                        )}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[styles.progressCaption, { color: colors.textMuted }]}
                >
                  {milestone.remaining} pebble
                  {milestone.remaining === 1 ? "" : "s"} to Stage{" "}
                  {milestone.nextStage}
                </Text>
              </View>
            ) : (
              <Text
                style={[styles.progressCaption, { color: colors.textMuted }]}
              >
                You&apos;ve reached the highest sanctuary milestone.
              </Text>
            )}

            {milestone.unlock ? (
              <View
                style={[
                  styles.unlockBanner,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(245, 158, 11, 0.1)"
                        : "rgba(217, 119, 6, 0.08)",
                    borderColor:
                      colorScheme === "dark"
                        ? "rgba(245, 158, 11, 0.22)"
                        : "rgba(217, 119, 6, 0.16)",
                  },
                ]}
              >
                <Feather name="star" size={12} color={colors.warning} />
                <Text style={[styles.unlockText, { color: colors.warning }]}>
                  Next milestone reward: {milestone.unlock}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* ── Section 3: Economy Summary Tiles ───────────────────────── */}
        <Animated.View entering={enteringAnim(120)}>
          <View style={styles.economyRow}>
            <View
              style={[
                styles.economyTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  ...Shadows.soft,
                },
              ]}
            >
              <View
                style={[
                  styles.economyIconBadge,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(245, 158, 11, 0.14)"
                        : "rgba(217, 119, 6, 0.09)",
                  },
                ]}
              >
                <Feather name="disc" size={14} color={colors.warning} />
              </View>
              <Text style={[styles.economyValue, { color: colors.text }]}>
                {gemsBalance}
              </Text>
              <Text style={[styles.economyLabel, { color: colors.textMuted }]}>
                Gems balance
              </Text>
            </View>

            <View
              style={[
                styles.economyTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  ...Shadows.soft,
                },
              ]}
            >
              <View
                style={[
                  styles.economyIconBadge,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(99, 102, 241, 0.14)"
                        : "rgba(79, 70, 229, 0.09)",
                  },
                ]}
              >
                <Feather name="shield" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.economyValue, { color: colors.text }]}>
                {lifetime}
              </Text>
              <Text style={[styles.economyLabel, { color: colors.textMuted }]}>
                Lifetime pebbles
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Section 4: Collection Sources Breakdown ────────────────── */}
        <Animated.View entering={enteringAnim(180)}>
          <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>
            COLLECTION SOURCES
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {/* Tasks */}
            <View style={styles.sourceRow}>
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(99, 102, 241, 0.14)"
                          : "rgba(79, 70, 229, 0.09)",
                    },
                  ]}
                >
                  <Feather
                    name="check-square"
                    size={14}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Tasks completed
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    1 pebble per finished action
                  </Text>
                </View>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.task}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Habits */}
            <View style={styles.sourceRow}>
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(245, 158, 11, 0.14)"
                          : "rgba(217, 119, 6, 0.09)",
                    },
                  ]}
                >
                  <Feather name="repeat" size={14} color={colors.warning} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Habits maintained
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Daily routines &amp; streaks
                  </Text>
                </View>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.habit}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Focus */}
            <View style={styles.sourceRow}>
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(16, 185, 129, 0.14)"
                          : "rgba(5, 150, 105, 0.09)",
                    },
                  ]}
                >
                  <Feather name="zap" size={14} color={colors.success} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Deep focus sessions
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Dedicated timer completions
                  </Text>
                </View>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.focus}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Section 5: The Milestone Journey ───────────────────────── */}
        <Animated.View entering={enteringAnim(240)}>
          <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>
            SANCTUARY JOURNEY
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {PEBBLE_MILESTONES.map((m, index) => {
              const prevThreshold =
                index === 0 ? 0 : PEBBLE_STAGE_THRESHOLDS[index - 1];
              const isUnlocked = lifetime >= prevThreshold;
              const isCurrent = milestone.stage === m.stage;

              return (
                <React.Fragment key={m.stage}>
                  {index > 0 ? (
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: colors.border },
                      ]}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.journeyRow,
                      isCurrent
                        ? {
                            backgroundColor:
                              colorScheme === "dark"
                                ? "rgba(99, 102, 241, 0.05)"
                                : "rgba(79, 70, 229, 0.03)",
                          }
                        : null,
                    ]}
                  >
                    <View style={styles.rowLead}>
                      <View
                        style={[
                          styles.iconBadge,
                          {
                            backgroundColor: isCurrent
                              ? colorScheme === "dark"
                                ? "rgba(99, 102, 241, 0.18)"
                                : "rgba(79, 70, 229, 0.12)"
                              : isUnlocked
                              ? colorScheme === "dark"
                                ? "rgba(16, 185, 129, 0.12)"
                                : "rgba(5, 150, 105, 0.08)"
                              : colorScheme === "dark"
                              ? "rgba(161, 161, 170, 0.08)"
                              : "rgba(100, 116, 139, 0.06)",
                          },
                        ]}
                      >
                        <Feather
                          name={
                            isCurrent
                              ? "compass"
                              : isUnlocked
                              ? "check"
                              : "lock"
                          }
                          size={13}
                          color={
                            isCurrent
                              ? colors.primary
                              : isUnlocked
                              ? colors.success
                              : colors.textMuted
                          }
                        />
                      </View>
                      <View style={styles.rowText}>
                        <View style={styles.stageTitleLine}>
                          <Text
                            style={[
                              styles.journeyStageName,
                              {
                                color: isUnlocked
                                  ? colors.text
                                  : colors.textMuted,
                                fontWeight: isCurrent ? "800" : "600",
                              },
                            ]}
                          >
                            {m.name}
                          </Text>
                          {isCurrent ? (
                            <View
                              style={[
                                styles.currentPill,
                                {
                                  backgroundColor: colors.primary,
                                },
                              ]}
                            >
                              <Text style={styles.currentPillText}>
                                ACTIVE
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.rowCaption,
                            { color: colors.textMuted },
                          ]}
                        >
                          {m.range} pebbles
                        </Text>
                      </View>
                    </View>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 44) : 0,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 80,
    gap: 20,
  },
  heroSection: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  jarAura: {
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  heroTextGroup: {
    alignItems: "center",
    gap: 4,
  },
  heroCountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  heroCount: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 40,
  },
  heroUnit: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  heroCaption: {
    fontSize: 13,
    fontWeight: "500",
  },
  capacityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: 2,
  },
  capacityText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  milestoneCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  milestoneTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  milestoneHeaderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  milestoneEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  stagePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  milestoneTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  milestoneName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  milestoneRange: {
    fontSize: 12,
    fontWeight: "600",
  },
  milestoneDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressBlock: {
    gap: 6,
    marginTop: 2,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: Radius.pill,
  },
  progressCaption: {
    fontSize: 12,
    fontWeight: "500",
  },
  unlockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  unlockText: {
    fontSize: 11,
    fontWeight: "700",
  },
  economyRow: {
    flexDirection: "row",
    gap: 12,
  },
  economyTile: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  economyIconBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  economyValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  economyLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  group: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  rowLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  sourceCount: {
    fontSize: 15,
    fontWeight: "700",
    paddingLeft: 8,
  },
  journeyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  stageTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  journeyStageName: {
    fontSize: 14,
  },
  currentPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  currentPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.6,
  },
});
