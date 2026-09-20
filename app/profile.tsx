import {
  AVATAR_OPTIONS,
  EMOJI_OPTIONS,
  RenderAvatar,
} from "@/features/profile/components/RenderAvatar";
import {
  buildAchievements,
  countUnlockedAchievements,
  TOTAL_ACHIEVEMENTS,
} from "@/features/profile/achievements";
import { getAchievementStats } from "@/features/profile/services/achievement-stats.service";
import {
  getGemsBalance,
  getPebbleCounts,
} from "@/features/profile/services/pebble.service";
import {
  getProfile,
  saveProfile,
  type UserProfile,
} from "@/features/settings/services/settings.service";
import { addStateListener, emitStateChange } from "@/services/events/state-events";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Radius } from "@/shared/constants/radii";
import { Shadows } from "@/shared/constants/shadows";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { getMilestoneInfo } from "@/shared/utils/pebble-milestones";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

const isWeb = Platform.OS === "web";
const enteringAnim = (delay = 0, duration = 450) => {
  if (isWeb) return undefined;
  return FadeInDown.delay(delay).duration(duration);
};

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lifetimePebbles, setLifetimePebbles] = useState(0);
  const [monthlyPebbles, setMonthlyPebbles] = useState(0);
  const [gemsBalance, setGemsBalance] = useState(0);
  const [unlockedAchievements, setUnlockedAchievements] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Avatar picker
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Profile details editor (name + email)
  const [showDetailsEditor, setShowDetailsEditor] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const loadProfileData = useCallback(async () => {
    try {
      const [userProfile, pebbleCounts, gems, achievementStats] =
        await Promise.all([
          getProfile(),
          getPebbleCounts(),
          getGemsBalance(),
          getAchievementStats(),
        ]);

      setProfile(userProfile);
      setLifetimePebbles(pebbleCounts.lifetime);
      setMonthlyPebbles(pebbleCounts.monthly);
      setGemsBalance(gems);
      setUnlockedAchievements(
        countUnlockedAchievements(buildAchievements(achievementStats)),
      );
      setLoadError(false);
    } catch (err) {
      console.warn("Failed to load profile data", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData]),
  );

  useEffect(() => {
    const unsubscribeProfile = addStateListener("profile_changed", () => {
      loadProfileData();
    });
    const unsubscribePebbles = addStateListener("pebbles_changed", () => {
      loadProfileData();
    });
    return () => {
      unsubscribeProfile();
      unsubscribePebbles();
    };
  }, [loadProfileData]);

  const handleSelectAvatar = async (newAvatar: string) => {
    if (!profile || savingAvatar || profile.avatar === newAvatar) return;

    const previous = profile.avatar;
    setAvatarError(null);
    setSavingAvatar(true);
    // Optimistic selection so the sheet reflects the choice immediately.
    setProfile({ ...profile, avatar: newAvatar });

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await saveProfile({ ...profile, avatar: newAvatar });
      emitStateChange("profile_changed");
    } catch (err) {
      console.warn("Failed to save avatar", err);
      setProfile({ ...profile, avatar: previous });
      setAvatarError("Couldn't save that choice. Please try again.");
    } finally {
      setSavingAvatar(false);
    }
  };

  const openDetailsEditor = () => {
    if (!profile) return;
    setName(profile.name);
    setEmail(profile.email);
    setDetailsError(null);
    setShowDetailsEditor(true);
  };

  const saveProfileDetails = async () => {
    if (!profile || savingDetails) return;
    setSavingDetails(true);
    setDetailsError(null);
    try {
      const updatedProfile: UserProfile = {
        ...profile,
        name: name.trim() || profile.name,
        email: email.trim() || profile.email,
      };
      await saveProfile(updatedProfile);
      setProfile(updatedProfile);
      emitStateChange("profile_changed");
      setShowDetailsEditor(false);
    } catch (err) {
      console.warn("Failed to save profile details", err);
      setDetailsError("Couldn't save your details. Please try again.");
    } finally {
      setSavingDetails(false);
    }
  };

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

  if (loadError || !profile) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderColor: colors.border }]}>
          <Pressable
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Profile
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.headerButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            onPress={() => router.push("/settings")}
          >
            <Feather name="settings" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.centeredState}>
          <Text style={[styles.stateTitle, { color: colors.text }]}>
            Something went wrong.
          </Text>
          <Text style={[styles.stateBody, { color: colors.textMuted }]}>
            We couldn&apos;t load your profile just now.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => {
              setLoading(true);
              loadProfileData();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const milestone = getMilestoneInfo(lifetimePebbles);
  const isEmptySanctuary = lifetimePebbles <= 0;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header: seamless, integrated back & settings ──────────── */}
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
          Profile
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
          accessibilityLabel="Settings"
          hitSlop={10}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            router.push("/settings");
          }}
        >
          <Feather name="settings" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity — open canvas personal anchor ───────────────── */}
        <Animated.View entering={enteringAnim(0, 400)} style={styles.identity}>
          <View
            style={[
              styles.avatarHalo,
              {
                borderColor:
                  colorScheme === "dark"
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(0, 0, 0, 0.06)",
                backgroundColor:
                  colorScheme === "dark"
                    ? "rgba(99, 102, 241, 0.08)"
                    : "rgba(79, 70, 229, 0.05)",
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.avatarButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.cardLight,
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Change your avatar"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                setAvatarError(null);
                setShowAvatarPicker(true);
              }}
            >
              <RenderAvatar avatar={profile.avatar} size={92} />
              <View
                style={[
                  styles.avatarEditBadge,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.background,
                    ...Shadows.soft,
                  },
                ]}
              >
                <Feather name="camera" size={12} color={colors.primary} />
              </View>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.identityRow,
              {
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit profile details"
            hitSlop={8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              openDetailsEditor();
            }}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.nameText, { color: colors.text }]}>
                {profile.name}
              </Text>
              <View
                style={[
                  styles.nameEditIconBadge,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(99, 102, 241, 0.12)"
                        : "rgba(79, 70, 229, 0.08)",
                  },
                ]}
              >
                <Feather name="edit-2" size={11} color={colors.primary} />
              </View>
            </View>
            <Text style={[styles.emailText, { color: colors.textMuted }]}>
              {profile.email}
            </Text>
          </Pressable>
        </Animated.View>

        {/* ── Pebble Sanctuary — signature centerpiece plaque ───────── */}
        <Animated.View entering={enteringAnim(60, 480)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Pebble Sanctuary"
            style={({ pressed }) => [
              styles.sanctuary,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                transform: [{ scale: pressed ? 0.985 : 1 }],
                opacity: pressed ? 0.92 : 1,
                ...Shadows.soft,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              router.push("/sanctuary");
            }}
          >
            {/* Sanctuary Top Row: Label & Next Unlock */}
            <View style={styles.sanctuaryHeaderRow}>
              <View style={styles.sanctuaryHeaderTag}>
                <Feather name="shield" size={11} color={colors.primary} />
                <Text
                  style={[styles.sanctuaryLabel, { color: colors.textMuted }]}
                >
                  PEBBLE SANCTUARY
                </Text>
              </View>
              <View style={styles.sanctuaryHeaderRight}>
                {milestone.nextUnlock ? (
                  <View
                    style={[
                      styles.nextUnlockTag,
                      {
                        backgroundColor:
                          colorScheme === "dark"
                            ? "rgba(245, 158, 11, 0.12)"
                            : "rgba(217, 119, 6, 0.08)",
                      },
                    ]}
                  >
                    <Feather name="star" size={10} color={colors.warning} />
                    <Text
                      style={[styles.nextUnlockText, { color: colors.warning }]}
                    >
                      Next: {milestone.nextUnlock}
                    </Text>
                  </View>
                ) : null}
                <Feather
                  name="chevron-right"
                  size={14}
                  color={colors.textMuted}
                  style={{ marginLeft: 4 }}
                />
              </View>
            </View>

            {isEmptySanctuary ? (
              <View style={styles.sanctuaryEmpty}>
                <Text
                  style={[styles.sanctuaryEmptyTitle, { color: colors.text }]}
                >
                  Your sanctuary is empty.
                </Text>
                <Text
                  style={[
                    styles.sanctuaryEmptyBody,
                    { color: colors.textMuted },
                  ]}
                >
                  Finish something to earn your first Pebble.
                </Text>
              </View>
            ) : (
              <>
                {/* Main Row: Lifetime Pebbles on Left, Stage Capsule on Right */}
                <View style={styles.sanctuaryMainRow}>
                  <View style={styles.pebbleCountGroup}>
                    <Text
                      style={[
                        styles.pebbleValue,
                        { color: colors.text },
                      ]}
                    >
                      {lifetimePebbles}
                    </Text>
                    <Text
                      style={[
                        styles.pebbleUnit,
                        { color: colors.textMuted },
                      ]}
                    >
                      PEBBLES
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.stageCapsule,
                      {
                        backgroundColor:
                          colorScheme === "dark"
                            ? "rgba(99, 102, 241, 0.12)"
                            : "rgba(79, 70, 229, 0.08)",
                        borderColor:
                          colorScheme === "dark"
                            ? "rgba(99, 102, 241, 0.22)"
                            : "rgba(79, 70, 229, 0.16)",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.stageLine, { color: colors.primary }]}
                      numberOfLines={1}
                    >
                      {milestone.isPrelude
                        ? "Next up · Chapter 1"
                        : `Chapter ${milestone.stage} — ${milestone.name}`}
                    </Text>
                  </View>
                </View>

                {/* Progress Track & Remaining caption */}
                {!milestone.isMaxStage ? (
                  <View style={styles.progressContainer}>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: colors.cardLight },
                      ]}
                      accessibilityRole="progressbar"
                      accessibilityLabel={
                        milestone.isPrelude
                          ? "Progress toward chapter 1"
                          : `Progress to chapter ${milestone.nextStage}`
                      }
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
                      style={[
                        styles.progressCaption,
                        { color: colors.textMuted },
                      ]}
                    >
                      {milestone.remaining} pebble
                      {milestone.remaining === 1 ? "" : "s"} to{" "}
                      {milestone.isPrelude
                        ? "Chapter 1"
                        : `Chapter ${milestone.nextStage}`}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.progressCaption,
                      { color: colors.textMuted },
                    ]}
                  >
                    You&apos;ve reached the final chapter.
                  </Text>
                )}

                {/* Hairline divider */}
                <View
                  style={[
                    styles.metaDivider,
                    { backgroundColor: colors.border },
                  ]}
                />

                {/* Footer Meta Chips: This Month & Gems */}
                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.metaChip,
                      {
                        backgroundColor:
                          colorScheme === "dark"
                            ? "rgba(255, 255, 255, 0.04)"
                            : "rgba(0, 0, 0, 0.03)",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather name="calendar" size={11} color={colors.textMuted} />
                    <Text
                      style={[styles.metaLabel, { color: colors.textMuted }]}
                    >
                      This month
                    </Text>
                    <Text
                      style={[styles.metaValue, { color: colors.text }]}
                    >
                      {monthlyPebbles}
                    </Text>
                  </View>

                  {gemsBalance > 0 ? (
                    <View
                      style={[
                        styles.metaChip,
                        {
                          backgroundColor:
                            colorScheme === "dark"
                              ? "rgba(99, 102, 241, 0.08)"
                              : "rgba(79, 70, 229, 0.05)",
                          borderColor:
                            colorScheme === "dark"
                              ? "rgba(99, 102, 241, 0.2)"
                              : "rgba(79, 70, 229, 0.12)",
                        },
                      ]}
                    >
                      <Feather name="disc" size={11} color={colors.primary} />
                      <Text
                        style={[styles.metaLabel, { color: colors.textMuted }]}
                      >
                        Gems
                      </Text>
                      <Text
                        style={[styles.metaValue, { color: colors.text }]}
                      >
                        {gemsBalance}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* ── Your Progress — two compact destination tiles ─────────── */}
        <View style={styles.progressSection}>
          <Text style={[styles.progressEyebrow, { color: colors.textMuted }]}>
            YOUR PROGRESS
          </Text>
          <View style={styles.gatewayRow}>
            <Pressable
              style={({ pressed }) => [
                styles.gatewayTile,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                  ...Shadows.soft,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open Stats & insights"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                router.push("/profile/stats");
              }}
            >
              <View style={styles.gatewayTileTop}>
                <View
                  style={[
                    styles.gatewayIconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(99, 102, 241, 0.14)"
                          : "rgba(79, 70, 229, 0.09)",
                    },
                  ]}
                >
                  <Feather
                    name="bar-chart-2"
                    size={14}
                    color={colors.primary}
                  />
                </View>
                <Feather
                  name="chevron-right"
                  size={14}
                  color={colors.textMuted}
                />
              </View>
              <View style={styles.gatewayTileBottom}>
                <Text
                  style={[styles.gatewayTileText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Stats &amp; insights
                </Text>
                <Text
                  style={[styles.gatewayTileCaption, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  Trends &amp; streaks
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.gatewayTile,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                  ...Shadows.soft,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open Achievements"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                router.push("/profile/achievements");
              }}
            >
              <View style={styles.gatewayTileTop}>
                <View
                  style={[
                    styles.gatewayIconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(245, 158, 11, 0.14)"
                          : "rgba(217, 119, 6, 0.09)",
                    },
                  ]}
                >
                  <Feather name="award" size={14} color={colors.warning} />
                </View>
                <View
                  style={[
                    styles.gatewayCountChip,
                    {
                      backgroundColor: colors.cardLight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.gatewayCountText,
                      { color: colors.primary },
                    ]}
                  >
                    {`${unlockedAchievements} / ${TOTAL_ACHIEVEMENTS}`}
                  </Text>
                </View>
              </View>
              <View style={styles.gatewayTileBottom}>
                <Text
                  style={[styles.gatewayTileText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Achievements
                </Text>
                <Text
                  style={[styles.gatewayTileCaption, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  Milestone badges
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* ── Avatar picker ──────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={showAvatarPicker}
        onRequestClose={() => setShowAvatarPicker(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close avatar picker"
            onPress={() => setShowAvatarPicker(false)}
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sheetHandleTrack}>
              <View
                style={[styles.sheetHandle, { backgroundColor: colors.border }]}
              />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Choose your avatar
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close avatar picker"
                hitSlop={10}
                onPress={() => setShowAvatarPicker(false)}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            {avatarError ? (
              <Text style={[styles.inlineError, { color: colors.error }]}>
                {avatarError}
              </Text>
            ) : (
              <Text style={[styles.sheetCaption, { color: colors.textMuted }]}>
                Changes save right away.
              </Text>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[styles.sheetSectionLabel, { color: colors.textMuted }]}
              >
                MASCOTS
              </Text>
              <View style={styles.mascotGrid}>
                {AVATAR_OPTIONS.map((opt) => {
                  const selected = profile.avatar === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt.label}
                      onPress={() => handleSelectAvatar(opt.id)}
                      style={[
                        styles.mascotItem,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected
                            ? colors.cardLight
                            : "transparent",
                        },
                      ]}
                    >
                      <RenderAvatar avatar={opt.id} size={44} />
                      <Text
                        style={[styles.mascotLabel, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text
                style={[styles.sheetSectionLabel, { color: colors.textMuted }]}
              >
                EMOJIS
              </Text>
              <View style={styles.emojiGrid}>
                {EMOJI_OPTIONS.map((emoji) => {
                  const selected = profile.avatar === emoji;
                  return (
                    <Pressable
                      key={emoji}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Emoji avatar ${emoji}`}
                      onPress={() => handleSelectAvatar(emoji)}
                      style={[
                        styles.emojiItem,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected
                            ? colors.cardLight
                            : "transparent",
                        },
                      ]}
                    >
                      <Text style={styles.emojiGlyph}>{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Profile details editor ─────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={showDetailsEditor}
        onRequestClose={() => setShowDetailsEditor(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close profile details"
            onPress={() => setShowDetailsEditor(false)}
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Edit profile
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close profile details"
                hitSlop={10}
                onPress={() => setShowDetailsEditor(false)}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                Name
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.cardLight,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="Enter name"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                Email
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.cardLight,
                  },
                ]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                accessibilityLabel="Email"
              />
            </View>

            {detailsError ? (
              <Text style={[styles.inlineError, { color: colors.error }]}>
                {detailsError}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save profile details"
              disabled={savingDetails}
              onPress={saveProfileDetails}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  opacity: savingDetails ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {savingDetails ? (
                <ActivityIndicator size="small" color={Palette.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
    paddingTop: 12,
    paddingBottom: 80,
    gap: 18,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  stateTitle: { fontSize: 17, fontWeight: "700" },
  stateBody: { fontSize: 13, textAlign: "center", lineHeight: 18 },

  // Identity — open canvas personal anchor
  identity: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  avatarHalo: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    padding: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  avatarButton: {
    width: 92,
    height: 92,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  identityRow: {
    alignItems: "center",
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nameText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  nameEditIconBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  emailText: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },

  // Pebble Sanctuary — signature centerpiece plaque
  sanctuary: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  sanctuaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sanctuaryHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  sanctuaryHeaderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sanctuaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  nextUnlockTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  nextUnlockText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sanctuaryMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pebbleCountGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  pebbleValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  pebbleUnit: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  stageCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  stageLine: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  progressContainer: {
    gap: 6,
  },
  progressTrack: {
    width: "100%",
    height: 5,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: Radius.pill },
  progressCaption: { fontSize: 11, fontWeight: "500" },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  sanctuaryEmpty: { alignItems: "center", gap: 4, paddingVertical: 8 },
  sanctuaryEmptyTitle: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  sanctuaryEmptyBody: { fontSize: 12, lineHeight: 16, textAlign: "center" },

  // Your Progress — compact destination tiles
  progressSection: { gap: 8 },
  progressEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    paddingHorizontal: 2,
  },
  gatewayRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  gatewayTile: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 13,
    minHeight: 96,
    justifyContent: "space-between",
  },
  gatewayTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gatewayIconBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  gatewayTileBottom: {
    gap: 2,
  },
  gatewayTileText: {
    fontSize: 14,
    fontWeight: "700",
  },
  gatewayTileCaption: {
    fontSize: 11,
    fontWeight: "500",
  },
  gatewayCountChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  gatewayCountText: { fontSize: 11, fontWeight: "700" },

  // Sheets
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    width: "100%",
    maxHeight: "85%",
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  sheetHandleTrack: { alignItems: "center", paddingVertical: 6 },
  sheetHandle: { width: 40, height: 4, borderRadius: Radius.pill },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontSize: 17, fontWeight: "800" },
  sheetCaption: { fontSize: 12 },
  inlineError: { fontSize: 12, lineHeight: 16 },
  sheetSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  mascotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  mascotItem: {
    width: "31%",
    minHeight: 92,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  mascotLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  emojiItem: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiGlyph: { fontSize: 24 },

  // Inputs / buttons
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 11, fontWeight: "700" },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: Palette.white, fontSize: 14, fontWeight: "700" },
});
