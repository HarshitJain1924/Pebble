import { AppText as Text } from "@/shared/components/ui/AppText";
import { Radius } from "@/shared/constants/radii";
import { Colors } from "@/shared/constants/theme";
import { emitThemeChange, useColorScheme } from "@/shared/hooks/useColorScheme";
import { exportBackupFile } from "@/features/settings/services/export.service";
import {
  AppSettings,
  getSettings,
  saveSettings,
} from "@/features/settings/services/settings.service";
import { emitStateChange } from "@/services/events/state-events";
import { BackupService } from "@/services/storage/backup.service";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

const THEME_OPTIONS = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  work: "Work",
  personal: "Personal",
  health: "Health",
  learning: "Learning",
  creative: "Creative",
  focus: "Focus",
  habit: "Habit",
};

function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [showRestoreSheet, setShowRestoreSheet] = useState(false);
  const [importDataString, setImportDataString] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showCategoriesSheet, setShowCategoriesSheet] = useState(false);
  const [hourPicker, setHourPicker] = useState<"start" | "end" | null>(null);

  const loadSettingsData = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch {
      Alert.alert("Couldn't load settings", "Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettingsData();
    }, [loadSettingsData]),
  );

  /**
   * Persist a settings change. Notifies the rest of the app on success and
   * surfaces real failures instead of swallowing them.
   */
  const persistSettings = async (
    next: AppSettings,
    { silent = false }: { silent?: boolean } = {},
  ) => {
    const previous = settings;
    setSettings(next);
    try {
      await saveSettings(next);
      emitStateChange("settings_changed");
      return true;
    } catch {
      if (previous) setSettings(previous);
      if (!silent) {
        Alert.alert("Couldn't save", "That change wasn't saved. Please try again.");
      }
      return false;
    }
  };

  const updateTheme = async (themeVal: "dark" | "light" | "system") => {
    if (!settings || settings.theme === themeVal) return;
    const ok = await persistSettings({ ...settings, theme: themeVal });
    if (ok) emitThemeChange(themeVal);
  };

  const updateQuietHoursToggle = async (enabled: boolean) => {
    if (!settings) return;
    await persistSettings({
      ...settings,
      quietHours: { ...settings.quietHours, enabled },
    });
  };

  const updateQuietHoursHour = async (bound: "start" | "end", hour: number) => {
    if (!settings) return;
    await persistSettings({
      ...settings,
      quietHours: {
        ...settings.quietHours,
        [bound === "start" ? "startHour" : "endHour"]: hour,
      },
    });
  };

  const updateCategoryToggle = async (catKey: string, val: boolean) => {
    if (!settings) return;
    await persistSettings({
      ...settings,
      categories: { ...settings.categories, [catKey]: val },
    });
  };

  const updateEscalation = async (enabled: boolean) => {
    if (!settings) return;
    await persistSettings({ ...settings, escalationEnabled: enabled });
  };

  const updateMascotToggle = async (enabled: boolean) => {
    if (!settings) return;
    await persistSettings({ ...settings, showMascot: enabled });
  };

  const exportBackup = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportBackupFile();
      // The native share sheet communicates the destination on success.
    } catch (e: any) {
      console.warn("Export failed:", e);
      Alert.alert(
        "Couldn't export",
        e?.message || "We couldn't create your backup. Please try again.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const clearAllData = () => {
    Alert.alert(
      "Clear all data?",
      "This deletes your tasks, habits, checklists, focus history and progress on this device. It can't be undone.",
      [
        { text: "Keep my data", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await BackupService.clearAllData();
              await loadSettingsData();
              Alert.alert("Your data was cleared.", undefined, [
                {
                  text: "OK",
                  onPress: () => router.replace("/onboarding"),
                },
              ]);
            } catch {
              Alert.alert(
                "Couldn't clear your data",
                "Nothing was deleted. Please try again.",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const importBackup = async () => {
    if (!importDataString.trim()) {
      setRestoreError("Paste a backup first.");
      return;
    }
    setRestoreError(null);
    try {
      setLoading(true);
      await BackupService.restoreStructuredBackup(importDataString);
      setShowRestoreSheet(false);
      setImportDataString("");
      await loadSettingsData();
      Alert.alert("Backup restored", "Your data has been replaced.");
    } catch (err: any) {
      console.warn(err);
      setRestoreError(
        `Couldn't restore that backup: ${err?.message || "check the file and try again."}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePress = (action: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    action();
  };

  if (loading || !settings) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: colors.background, justifyContent: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const sheetColors = {
    backgroundColor: colors.card,
    borderColor: colors.border,
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* ── Header: seamless, integrated back ─────────────────────── */}
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
          Settings
        </Text>
        <View style={styles.headerButtonPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Experience ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            EXPERIENCE
          </Text>
          <View
            style={[
              styles.group,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <View style={styles.appearanceRow}>
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
                  <Feather name="moon" size={14} color={colors.primary} />
                </View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  Appearance
                </Text>
              </View>
              <View
                style={[
                  styles.themeSegment,
                  { borderColor: colors.border, backgroundColor: colors.cardLight },
                ]}
                accessibilityRole="tablist"
              >
                {THEME_OPTIONS.map((option) => {
                  const active = settings.theme === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={option.label}
                      onPress={() => updateTheme(option.key)}
                      style={[
                        styles.themeOption,
                        {
                          backgroundColor: active ? colors.primary : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.themeOptionText,
                          { color: active ? "#FFFFFF" : colors.textMuted },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.toggleRow}>
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
                  <Feather name="feather" size={14} color={colors.warning} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Companion
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Show the crow on the edge of your screen.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Companion"
                accessibilityState={{ checked: !!settings.showMascot }}
                hitSlop={8}
                onPress={() => updateMascotToggle(!settings.showMascot)}
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor: settings.showMascot
                      ? colors.success
                      : colors.border,
                    alignItems: settings.showMascot ? "flex-end" : "flex-start",
                  },
                ]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ── Notifications ────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            NOTIFICATIONS
          </Text>
          <View
            style={[
              styles.group,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <View style={styles.toggleRow}>
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
                  <Feather name="bell" size={14} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Reminders
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Send a second reminder if something is still unfinished.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Reminders"
                accessibilityState={{ checked: !!settings.escalationEnabled }}
                hitSlop={8}
                onPress={() => updateEscalation(!settings.escalationEnabled)}
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor: settings.escalationEnabled
                      ? colors.success
                      : colors.border,
                    alignItems: settings.escalationEnabled
                      ? "flex-end"
                      : "flex-start",
                  },
                ]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.toggleRow}>
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(161, 161, 170, 0.12)"
                          : "rgba(100, 116, 139, 0.09)",
                    },
                  ]}
                >
                  <Feather name="clock" size={14} color={colors.textMuted} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Quiet hours
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Mute reminders while you sleep.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Quiet hours"
                accessibilityState={{ checked: !!settings.quietHours.enabled }}
                hitSlop={8}
                onPress={() =>
                  updateQuietHoursToggle(!settings.quietHours.enabled)
                }
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor: settings.quietHours.enabled
                      ? colors.success
                      : colors.border,
                    alignItems: settings.quietHours.enabled
                      ? "flex-end"
                      : "flex-start",
                  },
                ]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>

            {settings.quietHours.enabled && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mute from ${formatHour(settings.quietHours.startHour)}`}
                  onPress={handlePress(() => setHourPicker("start"))}
                  style={({ pressed }) => [
                    styles.subRow,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.subRowLabel, { color: colors.text }]}>
                    Mute from
                  </Text>
                  <View style={styles.detailValueWrap}>
                    <Text
                      style={[styles.detailValue, { color: colors.textMuted }]}
                    >
                      {formatHour(settings.quietHours.startHour)}
                    </Text>
                    <Feather
                      name="chevron-right"
                      size={14}
                      color={colors.textMuted}
                    />
                  </View>
                </Pressable>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Resume at ${formatHour(settings.quietHours.endHour)}`}
                  onPress={handlePress(() => setHourPicker("end"))}
                  style={({ pressed }) => [
                    styles.subRow,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.subRowLabel, { color: colors.text }]}>
                    Resume at
                  </Text>
                  <View style={styles.detailValueWrap}>
                    <Text
                      style={[styles.detailValue, { color: colors.textMuted }]}
                    >
                      {formatHour(settings.quietHours.endHour)}
                    </Text>
                    <Feather
                      name="chevron-right"
                      size={14}
                      color={colors.textMuted}
                    />
                  </View>
                </Pressable>
              </>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Category reminders"
              onPress={handlePress(() => setShowCategoriesSheet(true))}
              style={({ pressed }) => [
                styles.navRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(161, 161, 170, 0.12)"
                          : "rgba(100, 116, 139, 0.09)",
                    },
                  ]}
                >
                  <Feather name="grid" size={14} color={colors.textMuted} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Category reminders
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Choose which categories can send reminders.
                  </Text>
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Data ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            DATA
          </Text>
          <View
            style={[
              styles.group,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Archived items"
              onPress={handlePress(() => router.push("/archive"))}
              style={({ pressed }) => [
                styles.navRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(161, 161, 170, 0.12)"
                          : "rgba(100, 116, 139, 0.09)",
                    },
                  ]}
                >
                  <Feather name="archive" size={14} color={colors.textMuted} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Archived items
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Restore or permanently delete archived items.
                  </Text>
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.textMuted}
              />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export data"
              accessibilityState={{ disabled: isExporting, busy: isExporting }}
              disabled={isExporting}
              onPress={exportBackup}
              style={({ pressed }) => [
                styles.navRow,
                { opacity: isExporting ? 0.6 : pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(161, 161, 170, 0.12)"
                          : "rgba(100, 116, 139, 0.09)",
                    },
                  ]}
                >
                  <Feather name="share-2" size={14} color={colors.textMuted} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Export data
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Save a copy of your Pebble data.
                  </Text>
                </View>
              </View>
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Feather
                  name="chevron-right"
                  size={16}
                  color={colors.textMuted}
                />
              )}
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore data"
              onPress={handlePress(() => {
                setRestoreError(null);
                setShowRestoreSheet(true);
              })}
              style={({ pressed }) => [
                styles.navRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(161, 161, 170, 0.12)"
                          : "rgba(100, 116, 139, 0.09)",
                    },
                  ]}
                >
                  <Feather name="rotate-ccw" size={14} color={colors.textMuted} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Restore data
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Replace your data with a backup.
                  </Text>
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(180).duration(350)}>
          <Text style={[styles.sectionLabel, { color: colors.error }]}>
            DANGER ZONE
          </Text>
          <View
            style={[
              styles.group,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all data"
              onPress={handlePress(clearAllData)}
              style={({ pressed }) => [
                styles.navRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.rowLead}>
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor:
                        colorScheme === "dark"
                          ? "rgba(239, 68, 68, 0.14)"
                          : "rgba(220, 38, 38, 0.09)",
                    },
                  ]}
                >
                  <Feather name="trash-2" size={14} color={colors.error} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.error }]}>
                    Clear all data
                  </Text>
                  <Text style={[styles.rowCaption, { color: colors.textMuted }]}>
                    Delete everything on this device. This can&apos;t be undone.
                  </Text>
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.error}
              />
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Category reminders ─────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={showCategoriesSheet}
        onRequestClose={() => setShowCategoriesSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close category reminders"
            onPress={() => setShowCategoriesSheet(false)}
          />
          <View style={[styles.sheet, sheetColors]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Category reminders
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close category reminders"
                hitSlop={10}
                onPress={() => setShowCategoriesSheet(false)}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.sheetCaption, { color: colors.textMuted }]}>
              Choose which categories can send reminders.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(settings.categories).map(([catKey, val]) => (
                <View
                  key={catKey}
                  style={[styles.sheetRow, { borderColor: colors.border }]}
                >
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {CATEGORY_LABELS[catKey] ?? catKey}
                  </Text>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityLabel={CATEGORY_LABELS[catKey] ?? catKey}
                    accessibilityState={{ checked: val }}
                    hitSlop={8}
                    onPress={() => updateCategoryToggle(catKey, !val)}
                    style={[
                      styles.switchTrack,
                      {
                        backgroundColor: val ? colors.success : colors.border,
                        alignItems: val ? "flex-end" : "flex-start",
                      },
                    ]}
                  >
                    <View style={styles.switchThumb} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Hour picker ───────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={hourPicker !== null}
        onRequestClose={() => setHourPicker(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close time picker"
            onPress={() => setHourPicker(null)}
          />
          <View style={[styles.sheet, sheetColors]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {hourPicker === "end" ? "Resume at" : "Mute from"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close time picker"
                hitSlop={10}
                onPress={() => setHourPicker(null)}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => {
                const active =
                  hourPicker === "end"
                    ? settings.quietHours.endHour === hour
                    : settings.quietHours.startHour === hour;
                return (
                  <Pressable
                    key={hour}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={formatHour(hour)}
                    onPress={() => {
                      const bound = hourPicker;
                      setHourPicker(null);
                      if (bound) updateQuietHoursHour(bound, hour);
                    }}
                    style={[styles.sheetRow, { borderColor: colors.border }]}
                  >
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: active ? colors.primary : colors.text },
                      ]}
                    >
                      {formatHour(hour)}
                    </Text>
                    {active && (
                      <Feather name="check" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Restore ───────────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={showRestoreSheet}
        onRequestClose={() => setShowRestoreSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close restore"
            onPress={() => setShowRestoreSheet(false)}
          />
          <View style={[styles.sheet, sheetColors]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Restore data
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close restore"
                hitSlop={10}
                onPress={() => setShowRestoreSheet(false)}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.sheetCaption, { color: colors.textMuted }]}>
              Paste your backup below. This replaces your current data.
            </Text>

            <TextInput
              style={[
                styles.restoreInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.cardLight,
                },
              ]}
              multiline
              value={importDataString}
              onChangeText={setImportDataString}
              placeholder="Paste backup here…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Backup contents"
            />

            {restoreError ? (
              <Text style={[styles.inlineError, { color: colors.error }]}>
                {restoreError}
              </Text>
            ) : null}

            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setShowRestoreSheet(false)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restore data"
                onPress={importBackup}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.primaryButtonText}>Restore</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
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
  headerButtonPlaceholder: {
    width: 44,
    height: 44,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 80,
    gap: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  appearanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  themeSegment: {
    flexDirection: "row",
    gap: 2,
    padding: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
  themeOption: {
    paddingHorizontal: 11,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  themeOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: 8,
    paddingLeft: 56,
    paddingRight: 16,
  },
  subRowLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: Radius.pill,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
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
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontSize: 17, fontWeight: "800" },
  sheetCaption: { fontSize: 12, lineHeight: 16 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  restoreInput: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 12,
    textAlignVertical: "top",
  },
  inlineError: { fontSize: 12, lineHeight: 16 },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
});
