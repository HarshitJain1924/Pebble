import { InteractivePebbleJar } from "@/features/profile/components/InteractivePebbleJar";
import {
  getGemsBalance,
  getPebbleCounts,
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
import { getMilestoneInfo } from "@/shared/utils/pebble-milestones";
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
    const unsubscribePebbles = addStateListener("pebbles_changed", loadData);
    const unsubscribeProfile = addStateListener("profile_changed", loadData);
    return () => {
      unsubscribePebbles();
      unsubscribeProfile();
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

  const handlePress = (action: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    action();
  };

  const accentSurface =
    colorScheme === "dark"
      ? "rgba(99, 102, 241, 0.08)"
      : "rgba(79, 70, 229, 0.05)";
  const accentBorder =
    colorScheme === "dark"
      ? "rgba(129, 140, 248, 0.18)"
      : "rgba(79, 70, 229, 0.14)";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            {
              backgroundColor: pressed ? colors.cardLight : "transparent",
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
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
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={handlePress(() => router.push("/profile"))}
        >
          <Feather name="user" size={19} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={enteringAnim(0)} style={styles.heroSection}>
          <Text style={[styles.collectionEyebrow, { color: colors.textMuted }]}>
            YOUR COLLECTION
          </Text>

          <View
            style={[
              styles.jarAura,
              {
                backgroundColor: accentSurface,
                borderColor: accentBorder,
                ...Shadows.glow,
              },
            ]}
          >
            <InteractivePebbleJar
              mode="view"
              totalPebbles={lifetime}
              colors={colors}
              colorScheme={colorScheme ?? "dark"}
              // The jar is a lifetime collection, so its pebble color mix is too.
              monthlyTypes={pebbleCounts.lifetimeTypes}
              profileAvatar={profile?.avatar}
            />
          </View>

          <View style={styles.heroCountGroup}>
            <View style={styles.heroCountRow}>
              <Text style={[styles.heroCount, { color: colors.text }]}>
                {lifetime}
              </Text>
              <Text style={[styles.heroUnit, { color: colors.textMuted }]}>
                PEBBLES
              </Text>
            </View>
            <Text style={[styles.heroCaption, { color: colors.textMuted }]}>
              Lifetime collection
            </Text>
            <Text style={[styles.monthlyNote, { color: colors.primary }]}>
              +{monthly} this month
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          entering={enteringAnim(70)}
          style={[
            styles.milestoneSection,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.milestoneHeadingRow}>
            <View style={styles.milestoneTitleGroup}>
              <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>
                PROGRESSION
              </Text>
              <Text style={[styles.milestoneTitle, { color: colors.text }]}>
                Stage {milestone.stage} <Text style={{ color: colors.textMuted }}>·</Text>{" "}
                {milestone.name}
              </Text>
            </View>
            <Feather name="compass" size={18} color={colors.primary} />
          </View>

          {!milestone.isMaxStage ? (
            <View style={styles.progressBlock}>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: colors.cardLight },
                ]}
                accessibilityRole="progressbar"
                accessibilityLabel={`Progress to stage ${milestone.nextStage}`}
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(milestone.progressRatio * 100),
                }}
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
              <View style={styles.progressMetaRow}>
                <Text style={[styles.progressCaption, { color: colors.textMuted }]}>
                  {milestone.remaining} pebble
                  {milestone.remaining === 1 ? "" : "s"} to Stage {milestone.nextStage}
                </Text>
                {milestone.nextUnlock ? (
                  <Text style={[styles.unlockCaption, { color: colors.warning }]}>
                    Next unlock · {milestone.nextUnlock}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <Text style={[styles.progressCaption, { color: colors.textMuted }]}>
              Highest Sanctuary stage reached.
            </Text>
          )}
        </Animated.View>

        <Animated.View entering={enteringAnim(130)}>
          <Text style={[styles.sectionEyebrow, styles.sourcesLabel, { color: colors.textMuted }]}>
            PEBBLES EARNED FROM
          </Text>
          <View
            style={[
              styles.sourceGroup,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sourceRow}>
              <View style={styles.sourceLead}>
                <View style={[styles.sourceIcon, { backgroundColor: accentSurface }]}>
                  <Feather name="check-square" size={15} color={colors.primary} />
                </View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Tasks</Text>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.task}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.sourceRow}>
              <View style={styles.sourceLead}>
                <View
                  style={[
                    styles.sourceIcon,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(245, 158, 11, 0.12)"
                          : "rgba(217, 119, 6, 0.08)",
                    },
                  ]}
                >
                  <Feather name="repeat" size={15} color={colors.warning} />
                </View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Habits</Text>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.habit}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.sourceRow}>
              <View style={styles.sourceLead}>
                <View
                  style={[
                    styles.sourceIcon,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(16, 185, 129, 0.12)"
                          : "rgba(5, 150, 105, 0.08)",
                    },
                  ]}
                >
                  <Feather name="zap" size={15} color={colors.success} />
                </View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Focus</Text>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.focus}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.sourceRow}>
              <View style={styles.sourceLead}>
                <View
                  style={[
                    styles.sourceIcon,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(37, 99, 235, 0.08)",
                    },
                  ]}
                >
                  <Feather name="list" size={15} color={colors.secondary} />
                </View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Checklists</Text>
              </View>
              <Text style={[styles.sourceCount, { color: colors.text }]}>
                {pebbleCounts.lifetimeTypes.checklist}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={enteringAnim(190)} style={styles.gemRow}>
          <View style={[styles.gemIcon, { backgroundColor: colors.cardLight }]}>
            <Feather name="disc" size={15} color={colors.warning} />
          </View>
          <Text style={[styles.gemValue, { color: colors.text }]}>
            {gemsBalance} Gems
          </Text>
          <Text style={[styles.gemCaption, { color: colors.textMuted }]}>in your economy</Text>
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
    paddingBottom: 72,
    gap: 24,
  },
  heroSection: {
    alignItems: "center",
    gap: 8,
  },
  collectionEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  jarAura: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  heroCountGroup: {
    alignItems: "center",
    gap: 2,
  },
  heroCountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  heroCount: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 46,
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
  monthlyNote: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  milestoneSection: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  milestoneHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  milestoneTitleGroup: {
    flex: 1,
    gap: 4,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  milestoneTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  progressBlock: {
    gap: 8,
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
  progressMetaRow: {
    gap: 4,
  },
  progressCaption: {
    fontSize: 12,
    fontWeight: "600",
  },
  unlockCaption: {
    fontSize: 11,
    fontWeight: "600",
  },
  sourcesLabel: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sourceGroup: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  sourceRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sourceLead: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sourceIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceName: {
    fontSize: 14,
    fontWeight: "600",
  },
  sourceCount: {
    minWidth: 28,
    textAlign: "right",
    fontSize: 15,
    fontWeight: "800",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  gemRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  gemIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  gemValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  gemCaption: {
    fontSize: 12,
    fontWeight: "500",
  },
});
