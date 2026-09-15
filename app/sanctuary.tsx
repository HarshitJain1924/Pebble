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
  const storyCopy = milestone.isMaxStage
    ? "The jar is full of hard-won water. The Crow has found its Sanctuary."
    : milestone.isPrelude
      ? "An empty jar, a thirsty Crow, and a first Pebble."
      : milestone.stage <= 3
        ? "The Crow learned the old trick: drop in Pebbles and let the water rise."
        : milestone.stage <= 5
          ? "The water is rising. The Crow's little refuge is becoming a Sanctuary."
          : "A towering summit of zen. Golden light fills the Sanctuary.";

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
            THE THIRSTY CROW
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
              pebbleTypes={pebbleCounts.lifetimeTypes}
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

          <View style={[styles.storyCue, { borderLeftColor: accentBorder }]}>
            <View style={[styles.storyCueIcon, { backgroundColor: accentSurface }]}>
              <Feather name="droplet" size={14} color={colors.primary} />
            </View>
            <Text style={[styles.storyCueText, { color: colors.textMuted }]}>
              {storyCopy}
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
                {milestone.isPrelude ? "Next up · Chapter 1" : `Chapter ${milestone.stage}`} {" "}
                <Text style={{ color: colors.textMuted }}>—</Text>{" "}
                {milestone.name}
              </Text>
            </View>
            <Feather name="compass" size={18} color={colors.primary} />
          </View>

          {!milestone.isMaxStage ? (
            <>
              <View
                style={styles.milestoneTrail}
                accessibilityRole="progressbar"
                accessibilityLabel={
                  milestone.isPrelude
                    ? "Progress toward chapter 1"
                    : `Progress from chapter ${milestone.stage} to chapter ${milestone.nextStage}`
                }
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(milestone.progressRatio * 100),
                }}
              >
                <View style={styles.trailStop}>
                  <View style={[styles.trailNode, { backgroundColor: colors.primary }]}>
                    <Feather
                      name={milestone.isPrelude ? "droplet" : "compass"}
                      size={16}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={[styles.trailStage, { color: colors.primary }]}>
                    {milestone.isPrelude ? "Start" : `Chapter ${milestone.stage}`}
                  </Text>
                  <Text style={[styles.trailName, { color: colors.text }]} numberOfLines={2}>
                    {milestone.isPrelude ? "0 Pebbles" : milestone.name}
                  </Text>
                </View>

                <View style={[styles.trailConnector, { backgroundColor: colors.cardLight }]}>
                  <View
                    style={[
                      styles.trailConnectorFill,
                      {
                        width: `${Math.max(
                          8,
                          Math.min(100, milestone.progressRatio * 100),
                        )}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>

                <View style={styles.trailStop}>
                  <View style={[styles.trailNode, styles.nextTrailNode, { borderColor: colors.border }]}>
                    <Feather name="lock" size={15} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.trailStage, { color: colors.textMuted }]}>
                    Chapter {milestone.isPrelude ? 1 : milestone.nextStage}
                  </Text>
                  <Text style={[styles.trailName, { color: colors.textMuted }]} numberOfLines={2}>
                    {milestone.isPrelude ? milestone.name : milestone.nextStageName}
                  </Text>
                </View>
              </View>

              <View style={styles.progressMetaRow}>
                <Text style={[styles.progressCaption, { color: colors.textMuted }]}>
                  {milestone.remaining} pebble
                  {milestone.remaining === 1 ? "" : "s"} to unlock the next chapter
                </Text>
                {milestone.nextUnlock ? (
                  <View style={styles.unlockRow}>
                    <Feather name="gift" size={13} color={colors.warning} />
                    <Text style={[styles.unlockCaption, { color: colors.warning }]}>
                      {milestone.nextUnlock}
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.maxStageRow}>
              <View style={[styles.trailNode, { backgroundColor: colors.success }]}>
                <Feather name="check" size={16} color="#FFFFFF" />
              </View>
              <Text style={[styles.progressCaption, { color: colors.textMuted }]}>
                Highest Sanctuary chapter reached.
              </Text>
            </View>
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
  storyCue: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
  storyCueIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  storyCueText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
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
  milestoneTrail: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  preludeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  preludeCopy: {
    flex: 1,
    gap: 4,
  },
  trailStop: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  trailNode: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  nextTrailNode: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  trailConnector: {
    flex: 1,
    height: 4,
    borderRadius: Radius.pill,
    overflow: "hidden",
    marginTop: 16,
  },
  trailConnectorFill: {
    height: "100%",
    borderRadius: Radius.pill,
  },
  trailStage: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  trailName: {
    minHeight: 28,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    textAlign: "center",
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
  unlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  maxStageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
