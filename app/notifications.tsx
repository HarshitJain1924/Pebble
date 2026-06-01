import { AppCard } from "@/components/AppCard";
import PressableScale from "@/components/ui/PressableScale";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    addNotificationLog,
    clearNotificationLogs,
    getNotificationLogs,
    markNotificationLogsAsRead,
    type NotificationLogEntry,
} from "@/services/notificationsLog";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "@/services/storage";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";
// NOTE: avoid importing `expo-notifications` at module top-level because
// it auto-registers push token listeners which will error/warn in Expo Go.
// Use dynamic import inside async functions instead.
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator,
    Alert,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    
    View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, { FadeInDown } from "react-native-reanimated";

type FutureReminder = {
  id: string;
  title: string;
  timeLabel: string;
  kind: "todo" | "habit";
};

export default function NotificationsCenter() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [permissionStatus, setPermissionStatus] =
    useState<string>("undetermined");
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [futureReminders, setFutureReminders] = useState<FutureReminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);

  // 1. Fetch system permission status
  const checkPermissions = useCallback(async () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && "Notification" in window) {
        setPermissionStatus(Notification.permission);
      } else {
        setPermissionStatus("unsupported");
      }
      return;
    }

    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
    } catch {
      setPermissionStatus("undetermined");
    }
  }, []);

  // 2. Request notification permissions
  const requestPermissions = async () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && "Notification" in window) {
        const status = await Notification.requestPermission();
        setPermissionStatus(status);
        if (status === "granted") {
          Alert.alert("Success", "Browser notifications enabled!");
        }
      }
      return;
    }

    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      if (status === "granted") {
        Alert.alert("Granted", "Notifications are active on your device!");
      }
    } catch {
      Alert.alert("Error", "Could not request notifications permission.");
    }
  };

  // 3. Load all logs and future reminders
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load Triggered Log Inbox
      const inAppLogs = await getNotificationLogs();
      setLogs(inAppLogs);
      await markNotificationLogsAsRead();

      // Compiling Future reminders
      const upcomingList: FutureReminder[] = [];

      // A. Query Native Scheduled Alarms (If Native)
      if (Platform.OS !== "web") {
        try {
          const Notifications = await import("expo-notifications");
          const nativeAlarms =
            await Notifications.getAllScheduledNotificationsAsync();
          // We can match these against stored titles or list them
          nativeAlarms.forEach((alarm) => {
            const trigger: any = alarm.trigger;
            let timeLabel = "Scheduled";

            if (trigger) {
              if (trigger.date) {
                const dateObj = new Date(trigger.date);
                timeLabel = dateObj.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              } else if (
                trigger.hour !== undefined &&
                trigger.minute !== undefined
              ) {
                const hourStr = String(trigger.hour).padStart(2, "0");
                const minStr = String(trigger.minute).padStart(2, "0");
                timeLabel = `Daily at ${hourStr}:${minStr}`;
              }
            }
            upcomingList.push({
              id: alarm.identifier,
              title: alarm.content.title || "Scheduled Reminder",
              timeLabel,
              kind: "todo",
            });
          });
        } catch {
          // ignore native scheduled query failures
        }
      }

      // B. Query Local AsyncStorage Tasks for future schedules
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];

        allTodos.forEach((t) => {
          if (!t.completed && t.alarmTime && t.alarmTime > Date.now()) {
            // Only add if not already in native list
            if (!upcomingList.some((u) => u.title.includes(t.title))) {
              const alarmDate = new Date(t.alarmTime);
              const label = alarmDate.toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              upcomingList.push({
                id: t.id,
                title: t.title,
                timeLabel: label,
                kind: "todo",
              });
            }
          }
        });
      }

      // C. Query Local Habits for active alarm times
      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const allHabits = (parsed.dailyHabits || []) as any[];

        allHabits.forEach((h) => {
          if (h.reminderHour !== undefined && h.reminderMinute !== undefined) {
            const hourStr = String(h.reminderHour).padStart(2, "0");
            const minStr = String(h.reminderMinute).padStart(2, "0");
            upcomingList.push({
              id: h.id,
              title: `Habit: ${h.title}`,
              timeLabel: `Daily at ${hourStr}:${minStr}`,
              kind: "habit",
            });
          }
        });
      }

      // Sort and keep top 10 future reminders
      setFutureReminders(upcomingList.slice(0, 10));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPermissions();
      loadData();
    }, [checkPermissions, loadData]),
  );

  // 4. Send Test Notification (interactive validation)
  const sendTestNotification = async () => {
    setTesting(true);
    const title = "🎯 Level Up Focus!";
    const body =
      "Your focus streak is strong. Check out your achievements today!";

    try {
      // Save to logs database immediately
      await addNotificationLog(title, body, "test-alert");

      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            setTimeout(() => {
              new Notification(title, { body });
            }, 3000);
            Alert.alert(
              "Scheduled",
              "A test notification will trigger in 3 seconds!",
            );
          } else {
            // Fallback in-app modal immediately
            setTimeout(() => {
              Alert.alert(title, body);
            }, 3000);
            Alert.alert(
              "Notice",
              "Notification blocked. Showing test alert as in-app popup in 3 seconds.",
            );
          }
        } else {
          Alert.alert(title, body);
        }
      } else {
        // Native
        const Notifications = await import("expo-notifications");
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              sound: true,
              data: { type: "test", itemId: "test" },
            },
            trigger: { seconds: 3 } as any,
          });
          Alert.alert("Scheduled", "Alert will trigger in 3 seconds!");
        } else {
          setTimeout(() => {
            Alert.alert(title, body);
          }, 3000);
          Alert.alert(
            "Granted",
            "Notifications disabled. Showing test alert in-app in 3 seconds.",
          );
        }
      }
    } catch {
      Alert.alert("Error", "Could not send test notification.");
    } finally {
      // Reload logs after scheduling/writing
      setTimeout(() => {
        loadData();
        setTesting(false);
      }, 500);
    }
  };

  // 5. Clear Inbox
  const clearInbox = async () => {
    Alert.alert(
      "Clear Inbox",
      "Are you sure you want to clear your notifications history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearNotificationLogs();
            setLogs([]);
          },
        },
      ],
    );
  };

  // 6. Open Special Android Alarms and Reminders Settings
  const openSpecialAlarmSettings = async () => {
    if (Platform.OS === "android") {
      try {
        const packageName =
          Constants.expoConfig?.android?.package || "com.augstun.pebble";
        await IntentLauncher.startActivityAsync(
          "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
          { data: `package:${packageName}` },
        );
      } catch (e) {
        Alert.alert(
          "Error",
          "Could not open Alarms & Reminders settings directly. Please search 'Special App Access' in your phone's settings and look for 'Alarms & Reminders'.",
        );
      }
    } else {
      Alert.alert(
        "Not Supported",
        "Alarms & Reminders settings are only configurable on Android devices.",
      );
    }
  };

  // 7. Open General App settings (Notifications, Battery optimizations)
  const openGeneralSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert("Error", "Could not open settings page.");
    }
  };

  const getRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* Immersive Glassmorphic Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <PressableScale
          onPress={() => router.back()}
          haptic
          contentStyle={{ alignItems: "center", justifyContent: "center" }}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </PressableScale>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Alerts Center
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission Advisory Banner */}
        {permissionStatus !== "granted" && (
          <Animated.View entering={FadeInDown.duration(400)}>
            <AppCard
              style={[styles.alertBanner, { borderColor: colors.warning }]}
            >
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: `${colors.warning}18` },
                ]}
              >
                <Feather
                  name="alert-triangle"
                  size={18}
                  color={colors.warning}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: colors.text }]}>
                  Notifications Paused
                </Text>
                <Text style={[styles.bannerText, { color: colors.textMuted }]}>
                  Alarms and reminders will fall back to in-app alerts if
                  permissions are inactive.
                </Text>
                <PressableScale
                  haptic
                  onPress={requestPermissions}
                  contentStyle={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                  }}
                  style={[
                    styles.bannerButton,
                    { backgroundColor: colors.warning },
                  ]}
                >
                  <Text style={styles.bannerButtonText}>Enable Alerts</Text>
                </PressableScale>
              </View>
            </AppCard>
          </Animated.View>
        )}

        {/* Action Controls Card */}
        <Animated.View entering={FadeInDown.delay(100).duration(450)}>
          <AppCard style={styles.controlsCard}>
            <View style={styles.controlHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                System Diagnostics
              </Text>
              <Text
                style={[
                  styles.permissionIndicator,
                  {
                    color:
                      permissionStatus === "granted"
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                {permissionStatus === "granted"
                  ? "🔔 Connected"
                  : "🔕 In-App Only"}
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <PressableScale
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: `${colors.primary}12`,
                    borderColor: colors.primary,
                  },
                ]}
                contentStyle={{
                  height: 42,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={sendTestNotification}
                haptic
                disabled={testing}
              >
                {testing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Feather name="zap" size={15} color={colors.primary} />
                    <Text
                      style={[
                        styles.actionButtonText,
                        { color: colors.primary },
                      ]}
                    >
                      Test Alert (3s)
                    </Text>
                  </>
                )}
              </PressableScale>

              {logs.length > 0 && (
                <PressableScale
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: `${colors.error}12`,
                      borderColor: colors.error,
                    },
                  ]}
                  contentStyle={{
                    height: 42,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onPress={clearInbox}
                  haptic
                >
                  <Feather name="trash-2" size={15} color={colors.error} />
                  <Text
                    style={[styles.actionButtonText, { color: colors.error }]}
                  >
                    Clear Inbox
                  </Text>
                </PressableScale>
              )}
            </View>
          </AppCard>
        </Animated.View>

        {/* Troubleshooter Card */}
        <Animated.View entering={FadeInDown.delay(150).duration(450)}>
          <AppCard style={styles.troubleshootCard}>
            <View style={styles.troubleshootHeader}>
              <Feather name="help-circle" size={16} color={colors.warning} />
              <Text style={[styles.troubleshootTitle, { color: colors.text }]}>
                Trouble receiving alerts?
              </Text>
            </View>
            <Text
              style={[styles.troubleshootDesc, { color: colors.textMuted }]}
            >
              Modern mobile devices require special permissions and power
              exemptions to deliver timely background notifications.
            </Text>
            <View style={styles.troubleshootButtons}>
              {Platform.OS === "android" && (
                <PressableScale
                  style={[
                    styles.troubleshootButton,
                    {
                      backgroundColor: `${colors.warning}12`,
                      borderColor: colors.warning,
                    },
                  ]}
                  contentStyle={{
                    height: 38,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onPress={openSpecialAlarmSettings}
                  haptic
                >
                  <Feather name="clock" size={14} color={colors.warning} />
                  <Text
                    style={[
                      styles.troubleshootButtonText,
                      { color: colors.warning },
                    ]}
                  >
                    Alarms Permission
                  </Text>
                </PressableScale>
              )}
              <PressableScale
                style={[
                  styles.troubleshootButton,
                  {
                    backgroundColor: `${colors.primary}12`,
                    borderColor: colors.primary,
                  },
                ]}
                contentStyle={{
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={openGeneralSettings}
                haptic
              >
                <Feather name="settings" size={14} color={colors.primary} />
                <Text
                  style={[
                    styles.troubleshootButtonText,
                    { color: colors.primary },
                  ]}
                >
                  App Settings
                </Text>
              </PressableScale>
            </View>
          </AppCard>
        </Animated.View>

        {/* Chronological Notification Logs (Inbox) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              INBOX HISTORY ({logs.length})
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginVertical: 20 }}
            />
          ) : logs.length === 0 ? (
            <AppCard style={styles.emptyCard}>
              <View
                style={[
                  styles.emptyIconWrap,
                  { backgroundColor: `${colors.textMuted}10` },
                ]}
              >
                <Feather name="inbox" size={24} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Your inbox is clean
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                Alert logs and system events will appear here when triggered.
              </Text>
            </AppCard>
          ) : (
            <View style={styles.logList}>
              {logs.map((log, idx) => (
                <Animated.View
                  key={log.id}
                  entering={FadeInDown.delay(150 + idx * 50).duration(400)}
                >
                  <AppCard
                    style={[
                      styles.logCard,
                      {
                        borderLeftColor:
                          log.type === "test-alert"
                            ? colors.primary
                            : colors.success,
                      },
                    ]}
                  >
                    <View style={styles.logMetaRow}>
                      <View style={styles.logBadgeRow}>
                        <View
                          style={[
                            styles.logDot,
                            {
                              backgroundColor:
                                log.type === "test-alert"
                                  ? colors.primary
                                  : colors.success,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.logCategory,
                            { color: colors.textMuted },
                          ]}
                        >
                          {log.type === "test-alert" ? "SYSTEM" : "REMINDER"}
                        </Text>
                      </View>
                      <Text
                        style={[styles.logTime, { color: colors.textMuted }]}
                      >
                        {getRelativeTime(log.timestamp)}
                      </Text>
                    </View>
                    <Text style={[styles.logTitle, { color: colors.text }]}>
                      {log.title}
                    </Text>
                    <Text style={[styles.logBody, { color: colors.textMuted }]}>
                      {log.body}
                    </Text>
                  </AppCard>
                </Animated.View>
              ))}
            </View>
          )}
        </View>

        {/* Future Alarms Queue */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            FUTURE REMINDERS QUEUE ({futureReminders.length})
          </Text>
          {futureReminders.length === 0 ? (
            <AppCard style={styles.emptyCard}>
              <View
                style={[
                  styles.emptyIconWrap,
                  { backgroundColor: `${colors.textMuted}10` },
                ]}
              >
                <Feather name="clock" size={24} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No scheduled alarms
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                Add custom alarm times to your Planner todos or Habits to queue
                reminder triggers.
              </Text>
            </AppCard>
          ) : (
            <View style={styles.logList}>
              {futureReminders.map((alarm, idx) => (
                <Animated.View
                  key={alarm.id}
                  entering={FadeInDown.delay(300 + idx * 50).duration(400)}
                >
                  <AppCard style={styles.alarmCard}>
                    <View
                      style={[
                        styles.alarmIconWrap,
                        {
                          backgroundColor:
                            alarm.kind === "habit"
                              ? `${colors.warning}18`
                              : `${colors.primary}18`,
                        },
                      ]}
                    >
                      <Feather
                        name={alarm.kind === "habit" ? "repeat" : "calendar"}
                        size={16}
                        color={
                          alarm.kind === "habit"
                            ? colors.warning
                            : colors.primary
                        }
                      />
                    </View>
                    <View style={styles.alarmInfo}>
                      <Text
                        style={[styles.alarmTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {alarm.title}
                      </Text>
                      <Text
                        style={[
                          styles.alarmTimeLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        {alarm.timeLabel}
                      </Text>
                    </View>
                    <Feather
                      name="bell"
                      size={14}
                      color={colors.textMuted}
                      style={{ marginLeft: 8 }}
                    />
                  </AppCard>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContainer: {
    padding: 16,
    gap: 20,
    paddingBottom: 80,
  },
  alertBanner: {
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    flexDirection: "row",
    gap: 12,
    backgroundColor: "rgba(245, 158, 11, 0.03)",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  bannerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  bannerButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  controlsCard: {
    padding: 16,
    gap: 14,
  },
  controlHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  permissionIndicator: {
    fontSize: 12,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderStyle: "dashed",
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  logList: {
    gap: 8,
  },
  logCard: {
    padding: 14,
    borderLeftWidth: 4,
    gap: 4,
  },
  logMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logCategory: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  logTime: {
    fontSize: 11,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  logBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  alarmCard: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  alarmIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alarmInfo: {
    flex: 1,
    gap: 2,
  },
  alarmTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  alarmTimeLabel: {
    fontSize: 12,
  },
  troubleshootCard: {
    padding: 16,
    gap: 10,
  },
  troubleshootHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  troubleshootTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  troubleshootDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  troubleshootButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  troubleshootButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  troubleshootButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
