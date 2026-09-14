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
import { Colors } from "@/shared/constants/theme";
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
            We couldn't load your profile just now.
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

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
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
          hitSlop={8}
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
              styles.avatarRingOuter,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.avatarButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.cardLight,
                  opacity: pressed ? 0.85 : 1,
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
                    borderColor: colors.border,
                    ...Shadows.soft,
                  },
                ]}
              >
                <Feather name="camera" size={12} color={colors.primary} />
              </View>
            </Pressable>
          </View>

          <View style={styles.identityTextGroup}>
            <Text style={[styles.nameText, { color: colors.text }]}>
              {profile.name}
            </Text>
            <Text style={[styles.emailText, { color: colors.textMuted }]}>
              {profile.email}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.editLink,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
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
            <Feather name="edit-2" size={13} color={colors.primary} />
            <Text style={[styles.editLinkText, { color: colors.primary }]}>
              Edit profile
            </Text>
          </Pressable>
        </Animated.View>

        {/* ── Pebble Sanctuary — compact signature snapshot hero ─────── */}
        <Animated.View entering={enteringAnim(60, 480)}>
          <View
            style={[
              styles.sanctuary,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                ...Shadows.soft,
              },
            ]}
          >
            {/* Sanctuary Top Row: Label & Next Unlock */}
            <View style={styles.sanctuaryHeaderRow}>
              <View style={styles.sanctuaryHeaderTag}>
                <Feather name="shield" size={12} color={colors.primary} />
                <Text
                  style={[styles.sanctuaryLabel, { color: colors.textMuted }]}
                >
                  PEBBLE SANCTUARY
                </Text>
              </View>
              {milestone.nextUnlock ? (
                <View
                  style={[
                    styles.nextUnlockChip,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(245, 158, 11, 0.12)"
                          : "rgba(217, 119, 6, 0.1)",
                    },
                  ]}
                >
                  <Feather name="star" size={11} color={colors.warning} />
                  <Text
                    style={[styles.nextUnlockText, { color: colors.warning }]}
                  >
                    Next: {milestone.nextUnlock}
                  </Text>
                </View>
              ) : null}
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
                {/* Main Snapshot Row: Lifetime Pebbles on Left, Stage on Right */}
                <View style={styles.sanctuaryMainRow}>
                  <View style={styles.pebbleCountBlock}>
                    <View
                      style={[
                        styles.pebbleGlyphContainer,
                        { backgroundColor: colors.cardLight },
                      ]}
                    >
                      <Feather name="disc" size={16} color={colors.primary} />
                    </View>
                    <View style={styles.pebbleNumberGroup}>
                      <Text
                        style={[
                          styles.pebbleHeroValue,
                          { color: colors.text },
                        ]}
                      >
                        {lifetimePebbles}
                      </Text>
                      <Text
                        style={[
                          styles.pebbleHeroUnit,
                          { color: colors.textMuted },
                        ]}
                      >
                        PEBBLES
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.stageBlock,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.cardLight,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.stageLine, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      Stage {milestone.stage} · {milestone.name}
                    </Text>
                  </View>
                </View>

                {/* Progress Track & Remaining caption */}
                {!milestone.isMaxStage ? (
                  <View style={styles.progressContainer}>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: colors.border },
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
                      style={[
                        styles.progressCaption,
                        { color: colors.textMuted },
                      ]}
                    >
                      {milestone.remaining} pebble
                      {milestone.remaining === 1 ? "" : "s"} to Stage{" "}
                      {milestone.nextStage}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.progressCaption,
                      { color: colors.textMuted },
                    ]}
                  >
                    You've reached the final stage.
                  </Text>
                )}

                {/* Hairline divider */}
                <View
                  style={[
                    styles.metaDivider,
                    { backgroundColor: colors.border },
                  ]}
                />

                {/* Footer Meta Row: This Month & Gems */}
                <View style={styles.metaRow}>
                  <View style={styles.metaInlineItem}>
                    <Text
                      style={[styles.metaLabel, { color: colors.textMuted }]}
                    >
                      This month
                    </Text>
                    <Text
                      style={[styles.metaDot, { color: colors.textMuted }]}
                    >
                      ·
                    </Text>
                    <Text
                      style={[styles.metaValue, { color: colors.text }]}
                    >
                      {monthlyPebbles}
                    </Text>
                  </View>

                  {gemsBalance > 0 ? (
                    <View style={styles.metaInlineItem}>
                      <Feather name="disc" size={11} color={colors.primary} />
                      <Text
                        style={[styles.metaLabel, { color: colors.textMuted }]}
                      >
                        Gems
                      </Text>
                      <Text
                        style={[styles.metaDot, { color: colors.textMuted }]}
                      >
                        ·
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
          </View>
        </Animated.View>

        {/* ── Your Progress — two compact gateway tiles ──────────────── */}
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
                          ? "rgba(99, 102, 241, 0.15)"
                          : "rgba(79, 70, 229, 0.1)",
                    },
                  ]}
                >
                  <Feather
                    name="bar-chart-2"
                    size={18}
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
                          ? "rgba(245, 158, 11, 0.15)"
                          : "rgba(217, 119, 6, 0.1)",
                    },
                  ]}
                >
                  <Feather name="award" size={18} color={colors.warning} />
                </View>
                <View
                  style={[
                    styles.gatewayCountChip,
                    {
                      backgroundColor: colors.cardLight,
                      borderColor: colors.border,
                      borderWidth: 1,
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
                <ActivityIndicator size="small" color="#FFFFFF" />
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
    gap: 20,
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
    gap: 10,
    paddingVertical: 6,
  },
  avatarRingOuter: {
    position: "relative",
    padding: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  avatarButton: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  identityTextGroup: {
    alignItems: "center",
    gap: 3,
  },
  nameText: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  emailText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: 2,
  },
  editLinkText: { fontSize: 13, fontWeight: "700" },

  // Pebble Sanctuary — compact snapshot hero
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
  sanctuaryHeaderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sanctuaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  nextUnlockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
    paddingTop: 2,
  },
  pebbleCountBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pebbleGlyphContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pebbleNumberGroup: {
    gap: 0,
  },
  pebbleHeroValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 30,
  },
  pebbleHeroUnit: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  stageBlock: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stageLine: {
    fontSize: 12,
    fontWeight: "700",
  },
  progressContainer: {
    gap: 6,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: Radius.pill },
  progressCaption: { fontSize: 12 },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  metaInlineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  metaDot: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  sanctuaryEmpty: { alignItems: "center", gap: 6, paddingVertical: 12 },
  sanctuaryEmptyTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  sanctuaryEmptyBody: { fontSize: 13, lineHeight: 18, textAlign: "center" },

  // Your Progress — compact navigation tiles
  progressSection: { gap: 10 },
  progressEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    paddingHorizontal: 4,
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
    padding: 14,
    minHeight: 96,
    justifyContent: "space-between",
  },
  gatewayTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gatewayIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  gatewayTileBottom: {
    marginTop: 8,
  },
  gatewayTileText: {
    fontSize: 14,
    fontWeight: "700",
  },
  gatewayCountChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  gatewayCountText: { fontSize: 12, fontWeight: "700" },

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
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
