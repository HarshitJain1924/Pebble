import { AppCard } from "@/components/AppCard";
import { Colors } from "@/constants/theme";
import { emitThemeChange, useColorScheme } from "@/hooks/use-color-scheme";
import {
  AppSettings,
  getProfile,
  getSettings,
  saveProfile,
  saveSettings,
  UserProfile,
} from "@/services/settingsService";
import {
  DAILY_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  TODOS_STORAGE_KEY,
} from "@/services/storage";
import { Feather } from "@expo/vector-icons";
import { emitStateChange } from "@/services/stateEvents";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Editing profile details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("👨‍💻");

  // Modals for import/export
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [exportDataString, setExportDataString] = useState("");
  const [importDataString, setImportDataString] = useState("");

  const loadSettingsData = useCallback(async () => {
    try {
      const currentSettings = await getSettings();
      const currentProfile = await getProfile();

      setSettings(currentSettings);
      setProfile(currentProfile);

      setName(currentProfile.name);
      setEmail(currentProfile.email);
      setAvatar(currentProfile.avatar);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettingsData();
    }, [loadSettingsData]),
  );

  const saveProfileDetails = async () => {
    if (!profile) return;
    try {
      const updatedProfile: UserProfile = {
        ...profile,
        name: name.trim() || profile.name,
        email: email.trim() || profile.email,
        avatar: avatar,
      };
      await saveProfile(updatedProfile);
      setProfile(updatedProfile);
      Alert.alert("Success", "Profile updated successfully!");
    } catch {
      Alert.alert("Error", "Could not save profile details.");
    }
  };

  const updateQuietHoursToggle = async (enabled: boolean) => {
    if (!settings) return;
    const next = {
      ...settings,
      quietHours: {
        ...settings.quietHours,
        enabled,
      },
    };
    await saveSettings(next);
    setSettings(next);
  };

  const updateQuietHoursTimes = async (startHour: number, endHour: number) => {
    if (!settings) return;
    const next = {
      ...settings,
      quietHours: {
        ...settings.quietHours,
        startHour,
        endHour,
      },
    };
    await saveSettings(next);
    setSettings(next);
  };

  const updateCategoryToggle = async (catKey: string, val: boolean) => {
    if (!settings) return;
    const next = {
      ...settings,
      categories: {
        ...settings.categories,
        [catKey]: val,
      },
    };
    await saveSettings(next);
    setSettings(next);
  };

  const updateTheme = async (themeVal: "dark" | "light" | "system") => {
    if (!settings) return;
    const next = {
      ...settings,
      theme: themeVal,
    };
    await saveSettings(next);
    setSettings(next);
    emitThemeChange(themeVal);
    Alert.alert("Theme Set", `App theme is configured to ${themeVal}.`);
  };

  const updateEscalation = async (enabled: boolean) => {
    if (!settings) return;
    const next = {
      ...settings,
      escalationEnabled: enabled,
    };
    await saveSettings(next);
    setSettings(next);
  };

  // --- DATA CONSOLE UTILITIES ---

  // A. Load Demo Data
  const loadDemoData = async () => {
    Alert.alert(
      "Load Demo Data",
      "This will overwrite your current lists, tasks, habits, and history logs with high-fidelity simulated achievements. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Load",
          onPress: async () => {
            setLoading(true);
            try {
              // 1. Create dummy todos
              const demoTodos = {
                lists: [
                  { id: "default", name: "📋 My Pebbles" },
                  { id: "work", name: "💼 Work Pebbles" },
                  { id: "learning", name: "🎓 Learning Pebbles" },
                ],
                selectedList: "default",
                todos: {
                  default: [
                    {
                      id: "t1",
                      title: "Complete design audit of mobile UI",
                      completed: true,
                      category: "creative",
                      folderId: "default",
                    },
                    {
                      id: "t2",
                      title: "Schedule alignment session with team",
                      completed: false,
                      category: "work",
                      alarmTime: Date.now() + 7200000,
                      folderId: "default",
                    },
                    {
                      id: "t3",
                      title: "Buy fresh groceries & organic tea",
                      completed: false,
                      category: "health",
                      folderId: "default",
                    },
                  ],
                  work: [
                    {
                      id: "tw1",
                      title: "Deploy initial production bundle to cloud",
                      completed: true,
                      category: "work",
                      folderId: "work",
                    },
                    {
                      id: "tw2",
                      title: "Write technical API routing docs",
                      completed: false,
                      category: "work",
                      alarmTime: Date.now() + 18000000,
                      folderId: "work",
                    },
                  ],
                  learning: [
                    {
                      id: "tl1",
                      title: "Read Chapter 4 on Advanced React Design Patterns",
                      completed: true,
                      category: "learning",
                      folderId: "learning",
                    },
                    {
                      id: "tl2",
                      title: "Practice Rust macro syntax exercises",
                      completed: false,
                      category: "learning",
                      folderId: "learning",
                    },
                  ],
                },
              };

              // 2. Create dummy habits
              const demoHabits = {
                dailyHabits: [
                  {
                    id: "h1",
                    title: "Drink 3L Alkaline Water",
                    completedToday: true,
                    streak: 8,
                    bestStreak: 12,
                    reminderHour: 9,
                    reminderMinute: 0,
                  },
                  {
                    id: "h2",
                    title: "15-Minute Deep Focus Meditation",
                    completedToday: true,
                    streak: 5,
                    bestStreak: 8,
                    reminderHour: 8,
                    reminderMinute: 0,
                  },
                  {
                    id: "h3",
                    title: "Write 100 lines of Rust/C++ code",
                    completedToday: false,
                    streak: 3,
                    bestStreak: 5,
                    reminderHour: 20,
                    reminderMinute: 30,
                  },
                ],
              };

              // 3. Create simulated history log (to make heatmap look awesome)
              const demoHistory = [
                {
                  date: "2026-05-27",
                  completedHabits: 2,
                  totalHabits: 3,
                  completedTodos: 3,
                  totalTodos: 5,
                  score: 62,
                  completedHabitTitles: ["Drink 3L Water"],
                  completedTodoTitles: ["UI Audit"],
                },
                {
                  date: "2026-05-26",
                  completedHabits: 3,
                  totalHabits: 3,
                  completedTodos: 4,
                  totalTodos: 4,
                  score: 100,
                  completedHabitTitles: ["Water", "Meditation", "Code"],
                  completedTodoTitles: ["Deploy API"],
                },
                {
                  date: "2026-05-25",
                  completedHabits: 1,
                  totalHabits: 3,
                  completedTodos: 2,
                  totalTodos: 4,
                  score: 42,
                  completedHabitTitles: ["Meditation"],
                  completedTodoTitles: ["Groceries"],
                },
                {
                  date: "2026-05-24",
                  completedHabits: 3,
                  totalHabits: 3,
                  completedTodos: 5,
                  totalTodos: 5,
                  score: 100,
                  completedHabitTitles: ["Water", "Meditation", "Code"],
                  completedTodoTitles: ["Write tests"],
                },
              ];

              // 4. Create premium Profile with high level/XP
              const demoProfile: UserProfile = {
                name: "Test User",
                email: "test@user",
                avatar: "🚀",
                level: 5,
                xp: 1450, // Lvl 5, progress: 450 / 500 XP
              };

              await Promise.all([
                AsyncStorage.setItem(
                  TODOS_STORAGE_KEY,
                  JSON.stringify(demoTodos),
                ),
                AsyncStorage.setItem(
                  DAILY_STORAGE_KEY,
                  JSON.stringify(demoHabits),
                ),
                AsyncStorage.setItem(
                  HISTORY_STORAGE_KEY,
                  JSON.stringify(demoHistory),
                ),
                AsyncStorage.setItem(
                  PROFILE_STORAGE_KEY,
                  JSON.stringify(demoProfile),
                ),
              ]);

              emitStateChange("tasks_changed");
              emitStateChange("habits_changed");

              await loadSettingsData();
              Alert.alert(
                "Success",
                "Simulated environments and gamified profile achievements loaded successfully! Visit other tabs to explore.",
              );
            } catch {
              Alert.alert("Error", "Could not populate demo environment.");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // B. Clear All Data
  const clearAllData = async () => {
    Alert.alert(
      "⚠️ Dangerous Action",
      "You are about to wipe your profile, task lists, subtasks, habit streaks, and productivity history. This cannot be undone. Clear all data?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Everything",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await Promise.all([
                AsyncStorage.removeItem(TODOS_STORAGE_KEY),
                AsyncStorage.removeItem(DAILY_STORAGE_KEY),
                AsyncStorage.removeItem(HISTORY_STORAGE_KEY),
                AsyncStorage.removeItem(PROFILE_STORAGE_KEY),
                AsyncStorage.removeItem(SETTINGS_STORAGE_KEY),
                AsyncStorage.removeItem("todoapp:onboarding_completed"),
                AsyncStorage.removeItem("todoapp:workspace:history:v1"),
                AsyncStorage.removeItem("PEBBLE_CAPTURE_CREATION_HISTORY"),
                AsyncStorage.removeItem("PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS"),
              ]);
              emitStateChange("tasks_changed");
              emitStateChange("habits_changed");
              await loadSettingsData();
              Alert.alert(
                "Storage Wiped",
                "All storage keys successfully cleared. App reset to default empty canvas.",
                [
                  {
                    text: "OK",
                    onPress: () => {
                      router.replace("/onboarding");
                    },
                  },
                ],
              );
            } catch {
              Alert.alert("Error", "Could not clear storage.");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // C. Export Backup
  const exportBackup = async () => {
    try {
      const keys = [
        TODOS_STORAGE_KEY,
        DAILY_STORAGE_KEY,
        HISTORY_STORAGE_KEY,
        PROFILE_STORAGE_KEY,
        SETTINGS_STORAGE_KEY,
      ];
      const items = await AsyncStorage.multiGet(keys);
      const backup: Record<string, string | null> = {};
      items.forEach(([key, val]) => {
        backup[key] = val;
      });
      setExportDataString(JSON.stringify(backup, null, 2));
      setExportModalVisible(true);
    } catch {
      Alert.alert("Error", "Could not compile data backup.");
    }
  };

  // D. Import Backup
  const importBackup = async () => {
    if (!importDataString.trim()) {
      Alert.alert("Error", "Backup payload is empty.");
      return;
    }
    try {
      const parsed = JSON.parse(importDataString);
      const keyValPairs: [string, string][] = [];

      Object.entries(parsed).forEach(([key, val]) => {
        if (typeof val === "string") {
          keyValPairs.push([key, val]);
        } else if (val) {
          keyValPairs.push([key, JSON.stringify(val)]);
        }
      });

      if (keyValPairs.length === 0) {
        throw new Error("No valid keys found.");
      }

      await AsyncStorage.multiSet(keyValPairs);
      setImportModalVisible(false);
      setImportDataString("");
      await loadSettingsData();
      Alert.alert(
        "Success",
        "Backup restored successfully! All lists and parameters are up to date.",
      );
    } catch (err) {
      Alert.alert(
        "Restore Failed",
        "Could not parse or write backup string. Verify formatting.",
      );
    }
  };

  if (loading || !settings || !profile) {
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

  const quietHoursTimes = [
    { label: "18:00 (6 PM)", val: 18 },
    { label: "19:00 (7 PM)", val: 19 },
    { label: "20:00 (8 PM)", val: 20 },
    { label: "21:00 (9 PM)", val: 21 },
    { label: "22:00 (10 PM)", val: 22 },
    { label: "23:00 (11 PM)", val: 23 },
    { label: "00:00 (Midnight)", val: 0 },
    { label: "05:00 (5 AM)", val: 5 },
    { label: "06:00 (6 AM)", val: 6 },
    { label: "07:00 (7 AM)", val: 7 },
    { label: "08:00 (8 AM)", val: 8 },
    { label: "09:00 (9 AM)", val: 9 },
    { label: "10:00 (10 AM)", val: 10 },
  ];

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Title */}
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: colors.primary }]}>
            PREMIUM CONTROLS
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Settings Console
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Configure quiet schedules, customize your workspace level, and
            engineer back-ups.
          </Text>
        </View>

        {/* 1. Interactive Profile Section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <AppCard style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Profile Settings
            </Text>

            <View style={styles.profileInputsRow}>
              {/* Avatar Selector emoji options */}
              <View style={styles.avatarRow}>
                {["👨‍💻", "🚀", "🎨", "🎮", "🧘", "💼"].map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => setAvatar(emoji)}
                    style={[
                      styles.avatarBox,
                      {
                        backgroundColor:
                          avatar === emoji
                            ? `${colors.primary}18`
                            : "rgba(255,255,255,0.02)",
                        borderColor:
                          avatar === emoji ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 18 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Name
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: "rgba(255,255,255,0.02)",
                    },
                  ]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter name"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Email
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: "rgba(255,255,255,0.02)",
                    },
                  ]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter email"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
                onPress={saveProfileDetails}
              >
                <Feather name="save" size={14} color="#FFFFFF" />
                <Text style={styles.buttonText}>Save Profile</Text>
              </Pressable>
            </View>
          </AppCard>
        </Animated.View>

        {/* 2. Theme Customization */}
        <Animated.View entering={FadeInDown.delay(100).duration(450)}>
          <AppCard style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Visual Theme
            </Text>
            <View style={styles.themeSelectorRow}>
              {(["dark", "light", "system"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => updateTheme(t)}
                  style={[
                    styles.themeButton,
                    {
                      backgroundColor:
                        settings.theme === t
                          ? `${colors.primary}18`
                          : "rgba(255,255,255,0.02)",
                      borderColor:
                        settings.theme === t ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Feather
                    name={
                      t === "dark"
                        ? "moon"
                        : t === "light"
                          ? "sun"
                          : "smartphone"
                    }
                    size={16}
                    color={
                      settings.theme === t ? colors.primary : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.themeBtnText,
                      {
                        color:
                          settings.theme === t ? colors.primary : colors.text,
                        textTransform: "capitalize",
                      },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </AppCard>
        </Animated.View>

        {/* Task & Habit Archive */}
        <Animated.View entering={FadeInDown.delay(120).duration(450)}>
          <AppCard style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Task & Habit Archive
            </Text>
            <Text style={[styles.toggleDesc, { color: colors.textMuted, marginBottom: 12, fontSize: 13, lineHeight: 18 }]}>
              View, restore, or permanently delete items you have archived.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.cardLight,
                  borderColor: colors.border,
                  borderWidth: 1,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              onPress={() => router.push("/archive")}
            >
              <Feather name="archive" size={14} color={colors.primary} />
              <Text style={[styles.buttonText, { color: colors.text, marginLeft: 6 }]}>View Archived Items</Text>
            </Pressable>
          </AppCard>
        </Animated.View>

        {/* 3. Notifications, Escalation, Quiet Hours */}
        <Animated.View entering={FadeInDown.delay(150).duration(450)}>
          <AppCard style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Notification Parameters
            </Text>

            {/* Toggle escalation */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleTitle, { color: colors.text }]}>
                  Escalation Reminders
                </Text>
                <Text style={[styles.toggleDesc, { color: colors.textMuted }]}>
                  Schedule secondary warnings (e.g. 2h later) if objectives
                  remain pending.
                </Text>
              </View>
              <Pressable
                onPress={() => updateEscalation(!settings.escalationEnabled)}
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor: settings.escalationEnabled
                      ? colors.success
                      : "rgba(255,255,255,0.08)",
                    alignItems: settings.escalationEnabled
                      ? "flex-end"
                      : "flex-start",
                  },
                ]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* Toggle quiet hours */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleTitle, { color: colors.text }]}>
                  Enable Quiet Hours
                </Text>
                <Text style={[styles.toggleDesc, { color: colors.textMuted }]}>
                  Mute all scheduled reminders during specified hours (e.g.,
                  while sleeping).
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  updateQuietHoursToggle(!settings.quietHours.enabled)
                }
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor: settings.quietHours.enabled
                      ? colors.success
                      : "rgba(255,255,255,0.08)",
                    alignItems: settings.quietHours.enabled
                      ? "flex-end"
                      : "flex-start",
                  },
                ]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>

            {/* Quiet Hours Times selector */}
            {settings.quietHours.enabled && (
              <View style={styles.quietTimesBlock}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: colors.textMuted, marginBottom: 8 },
                  ]}
                >
                  Configure Time Window
                </Text>
                <View style={styles.timeSelectorInputsRow}>
                  {/* Start selector */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.subInputLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Mute from:
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.hourPillsContainer}
                    >
                      {quietHoursTimes.map((item) => (
                        <Pressable
                          key={`start-${item.val}`}
                          onPress={() =>
                            updateQuietHoursTimes(
                              item.val,
                              settings.quietHours.endHour,
                            )
                          }
                          style={[
                            styles.hourPill,
                            {
                              backgroundColor:
                                settings.quietHours.startHour === item.val
                                  ? `${colors.warning}18`
                                  : "rgba(255,255,255,0.02)",
                              borderColor:
                                settings.quietHours.startHour === item.val
                                  ? colors.warning
                                  : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.hourPillText,
                              {
                                color:
                                  settings.quietHours.startHour === item.val
                                    ? colors.warning
                                    : colors.text,
                              },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  {/* End selector */}
                  <View style={{ flex: 1, marginTop: 10 }}>
                    <Text
                      style={[
                        styles.subInputLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Unmute at:
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.hourPillsContainer}
                    >
                      {quietHoursTimes.map((item) => (
                        <Pressable
                          key={`end-${item.val}`}
                          onPress={() =>
                            updateQuietHoursTimes(
                              settings.quietHours.startHour,
                              item.val,
                            )
                          }
                          style={[
                            styles.hourPill,
                            {
                              backgroundColor:
                                settings.quietHours.endHour === item.val
                                  ? `${colors.success}18`
                                  : "rgba(255,255,255,0.02)",
                              borderColor:
                                settings.quietHours.endHour === item.val
                                  ? colors.success
                                  : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.hourPillText,
                              {
                                color:
                                  settings.quietHours.endHour === item.val
                                    ? colors.success
                                    : colors.text,
                              },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.divider} />

            {/* Category Reminders Filter */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.toggleTitle, { color: colors.text }]}>
                Category Subscriptions
              </Text>
              <Text
                style={[
                  styles.toggleDesc,
                  { color: colors.textMuted, marginBottom: 8 },
                ]}
              >
                Select which categories trigger reminders. Deselected categories
                will not fire push alerts.
              </Text>
              <View style={styles.categoriesSelectGrid}>
                {Object.entries(settings.categories).map(([catName, val]) => (
                  <Pressable
                    key={catName}
                    onPress={() => updateCategoryToggle(catName, !val)}
                    style={[
                      styles.categoryCheckboxCard,
                      {
                        backgroundColor: val
                          ? `${colors.primary}12`
                          : "rgba(255,255,255,0.01)",
                        borderColor: val ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name={val ? "check-square" : "square"}
                      size={15}
                      color={val ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.categoryCheckboxText,
                        { color: val ? colors.text : colors.textMuted },
                      ]}
                    >
                      {catName.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </AppCard>
        </Animated.View>

        {/* 4. Data Engineering Console */}
        <Animated.View entering={FadeInDown.delay(200).duration(450)}>
          <AppCard style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Storage & Data Engineering
            </Text>
            <Text
              style={[
                styles.toggleDesc,
                { color: colors.textMuted, marginBottom: 12 },
              ]}
            >
              Manage underlying JSON datastores, backup archives, or load
              pre-populated achievements.
            </Text>

            <View style={styles.dataButtonsGrid}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={loadDemoData}
              >
                <Feather name="database" size={14} color={colors.primary} />
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: colors.primary },
                  ]}
                >
                  Load Demo Data
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.text, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={exportBackup}
              >
                <Feather name="share-2" size={14} color={colors.text} />
                <Text
                  style={[styles.secondaryButtonText, { color: colors.text }]}
                >
                  Export Backup
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.text, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => setImportModalVisible(true)}
              >
                <Feather name="download" size={14} color={colors.text} />
                <Text
                  style={[styles.secondaryButtonText, { color: colors.text }]}
                >
                  Restore Backup
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.error, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={clearAllData}
              >
                <Feather name="alert-triangle" size={14} color={colors.error} />
                <Text
                  style={[styles.secondaryButtonText, { color: colors.error }]}
                >
                  Clear All Data
                </Text>
              </Pressable>
            </View>
          </AppCard>
        </Animated.View>

        {/* --- BACKUP MODALS --- */}

        {/* Export Data Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={exportModalVisible}
          onRequestClose={() => setExportModalVisible(false)}
        >
          <View style={styles.modalCenteredView}>
            <View
              style={[
                styles.modalView,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  JSON Backup Archive
                </Text>
                <Pressable
                  onPress={() => setExportModalVisible(false)}
                  hitSlop={10}
                >
                  <Feather name="x" size={20} color={colors.text} />
                </Pressable>
              </View>
              <Text
                style={[
                  styles.toggleDesc,
                  { color: colors.textMuted, marginBottom: 12 },
                ]}
              >
                Copy the text payload below to backup your complete local-first
                states.
              </Text>
              <ScrollView
                style={[styles.modalScrollView, { backgroundColor: "#000000" }]}
              >
                <Text style={[styles.codeText, { color: colors.success }]}>
                  {exportDataString}
                </Text>
              </ScrollView>
              <Pressable
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary, marginTop: 12 },
                ]}
                onPress={() => setExportModalVisible(false)}
              >
                <Text style={styles.buttonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Import Data Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={importModalVisible}
          onRequestClose={() => setImportModalVisible(false)}
        >
          <View style={styles.modalCenteredView}>
            <View
              style={[
                styles.modalView,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Restore Backup
                </Text>
                <Pressable
                  onPress={() => setImportModalVisible(false)}
                  hitSlop={10}
                >
                  <Feather name="x" size={20} color={colors.text} />
                </Pressable>
              </View>
              <Text
                style={[
                  styles.toggleDesc,
                  { color: colors.textMuted, marginBottom: 12 },
                ]}
              >
                Paste your backup JSON archive string below. Restoring will
                overwrite all current data lists.
              </Text>

              <TextInput
                style={[
                  styles.modalTextInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: "#000000",
                  },
                ]}
                multiline={true}
                value={importDataString}
                onChangeText={setImportDataString}
                placeholder="Paste backup JSON string here..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: "rgba(255,255,255,0.06)",
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setImportModalVisible(false)}
                >
                  <Text style={[styles.buttonText, { color: colors.text }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.success, flex: 1 },
                  ]}
                  onPress={importBackup}
                >
                  <Text style={styles.buttonText}>Restore</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 18,
  },
  header: {
    gap: 6,
    marginBottom: 4,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  profileInputsRow: {
    gap: 12,
  },
  avatarRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 4,
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  subInputLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  textInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  primaryButton: {
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  themeSelectorRow: {
    flexDirection: "row",
    gap: 10,
  },
  themeButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  themeBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleInfo: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  toggleDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  quietTimesBlock: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  timeSelectorInputsRow: {
    gap: 4,
  },
  hourPillsContainer: {
    gap: 6,
    paddingVertical: 4,
  },
  hourPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  hourPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  categoriesSelectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryCheckboxCard: {
    width: "48%", // 2 columns approx
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryCheckboxText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  dataButtonsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryButton: {
    width: "48%",
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.01)",
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalView: {
    width: "90%",
    maxHeight: "80%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalScrollView: {
    borderRadius: 10,
    padding: 10,
    maxHeight: 300,
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11,
  },
  modalTextInput: {
    height: 200,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 11,
    textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
