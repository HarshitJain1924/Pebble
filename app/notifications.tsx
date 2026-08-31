import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";

import { AppCard } from "@/shared/components/ui/AppCard";
import PressableScale from "@/shared/components/ui/PressableScale";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  AlertCenterService,
} from "@/services/notifications/AlertCenterService";
import {
  AlertCenterGroups,
  AlertCenterItem,
} from "@/services/notifications/notification.types";
import {
  addNotificationLog,
  clearNotificationLogs,
  getNotificationLogs,
  markNotificationLogsAsRead,
  type NotificationLogEntry,
} from "@/services/scheduling/notifications-log";

export default function AlertCenterScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [permissionStatus, setPermissionStatus] = useState<string>("undetermined");
  const [alertGroups, setAlertGroups] = useState<AlertCenterGroups>({
    needsAttention: [],
    upNext: [],
    later: [],
    all: [],
  });
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

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

  // 3. Load all canonical Alert Center data + history logs
  const loadData = useCallback(async () => {
    try {
      const [groups, inAppLogs] = await Promise.all([
        AlertCenterService.getAlertCenterData(),
        getNotificationLogs(),
      ]);

      setAlertGroups(groups);
      setLogs(inAppLogs);
      await markNotificationLogsAsRead();
    } catch (e) {
      console.warn("[AlertCenter] Failed to load alert center data:", e);
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

  // 4. Send Test Notification (Diagnostics only)
  const sendTestNotification = async () => {
    setTesting(true);
    const title = "🎯 Test Notification";
    const body = "Pebble alert system verification check.";

    try {
      await addNotificationLog(title, body, "test-alert");

      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            setTimeout(() => {
              new Notification(title, { body });
            }, 3000);
            Alert.alert("Scheduled", "A test notification will trigger in 3 seconds!");
          } else {
            setTimeout(() => {
              Alert.alert(title, body);
            }, 3000);
            Alert.alert("Notice", "Notifications blocked. Showing test alert as in-app popup in 3 seconds.");
          }
        } else {
          Alert.alert(title, body);
        }
      } else {
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
            trigger: {
              seconds: 3,
              channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
            } as any,
          });
          Alert.alert("Scheduled", "Alert will trigger in 3 seconds!");
        } else {
          setTimeout(() => {
            Alert.alert(title, body);
          }, 3000);
          Alert.alert("Notice", "Notifications disabled in OS. Showing test alert in-app in 3 seconds.");
        }
      }
    } catch {
      Alert.alert("Error", "Could not send test notification.");
    } finally {
      setTimeout(() => {
        loadData();
        setTesting(false);
      }, 500);
    }
  };

  // 5. Clear History
  const clearHistory = async () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to clear your alerts history?",
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
      } catch {
        Alert.alert(
          "Error",
          "Could not open Alarms & Reminders settings directly. Please search 'Special App Access' in your phone's settings.",
        );
      }
    } else {
      Alert.alert("Not Supported", "Alarms & Reminders settings are only configurable on Android devices.");
    }
  };

  const openGeneralSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert("Error", "Could not open settings page.");
    }
  };

  // Navigation handlers
  const handleItemPress = (item: AlertCenterItem) => {
    if (item.entityType === "checklist") {
      router.push({
        pathname: "/checklist-details",
        params: { id: item.entityId, workspaceId: item.workspaceId },
      });
    } else {
      router.push({
        pathname: "/task-details",
        params: {
          id: item.entityId,
          type: item.entityType === "habit" ? "habit" : "task",
          workspaceId: item.workspaceId,
        },
      });
    }
  };

  const handleCompleteTask = async (item: AlertCenterItem) => {
    try {
      await AlertCenterService.completeTask(item.entityId, item.workspaceId);
      await loadData();
    } catch (e) {
      console.warn("[AlertCenter] Failed to complete task:", e);
    }
  };

  const handleCompleteHabit = async (item: AlertCenterItem) => {
    try {
      await AlertCenterService.completeHabit(item.entityId, item.workspaceId);
      await loadData();
    } catch (e) {
      console.warn("[AlertCenter] Failed to complete habit:", e);
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

  const getEntityColor = (entityType: string) => {
    switch (entityType) {
      case "habit":
        return "#10B981"; // Emerald green
      case "checklist":
        return "#3B82F6"; // Electric blue
      case "task":
      case "todo":
      default:
        return "#F59E0B"; // Warm amber
    }
  };

  const getEntityIcon = (entityType: string): keyof typeof Feather.glyphMap => {
    switch (entityType) {
      case "habit":
        return "repeat";
      case "checklist":
        return "check-square";
      case "task":
      case "todo":
      default:
        return "calendar";
    }
  };

  const getEntityTypeName = (entityType: string) => {
    switch (entityType) {
      case "habit":
        return "Habit";
      case "checklist":
        return "Checklist";
      case "task":
      case "todo":
      default:
        return "Task";
    }
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <PressableScale
          onPress={() => router.back()}
          haptic
          contentStyle={{ alignItems: "center", justifyContent: "center" }}
          style={styles.headerButton}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </PressableScale>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Alert Center
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
            <AppCard style={[styles.alertBanner, { borderColor: colors.warning }]}>
              <View style={[styles.iconBox, { backgroundColor: `${colors.warning}18` }]}>
                <Feather name="alert-triangle" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: colors.text }]}>
                  Notifications Inactive
                </Text>
                <Text style={[styles.bannerText, { color: colors.textMuted }]}>
                  {Platform.OS === "web"
                    ? "Browser notification permissions are not granted. Alerts will display in-app."
                    : "OS notification permissions are disabled. Enable alerts to receive alarms on time."}
                </Text>
                <PressableScale
                  haptic
                  onPress={requestPermissions}
                  contentStyle={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                  }}
                  style={[styles.bannerButton, { backgroundColor: colors.warning }]}
                >
                  <Text style={styles.bannerButtonText}>Enable Alerts</Text>
                </PressableScale>
              </View>
            </AppCard>
          </Animated.View>
        )}

        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginVertical: 32 }}
          />
        ) : (
          <>
            {/* 1. NEEDS ATTENTION SECTION */}
            {alertGroups.needsAttention.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="alert-circle" size={14} color={colors.error} />
                  <Text style={[styles.sectionTitleOverdue, { color: colors.error }]}>
                    NEEDS ATTENTION ({alertGroups.needsAttention.length})
                  </Text>
                </View>

                <View style={styles.itemList}>
                  {alertGroups.needsAttention.map((item, idx) => {
                    const entityColor = getEntityColor(item.entityType);
                    const iconName = getEntityIcon(item.entityType);

                    return (
                      <Animated.View
                        key={item.id}
                        entering={FadeInDown.delay(idx * 40).duration(300)}
                      >
                        <AppCard style={[styles.overdueCard, { borderLeftColor: colors.error }]}>
                          <View style={styles.rowMain}>
                            <View
                              style={[
                                styles.entityIconBox,
                                { backgroundColor: `${entityColor}18` },
                              ]}
                            >
                              <Feather name={iconName} size={15} color={entityColor} />
                            </View>

                            <View style={styles.infoCol}>
                              <Text
                                style={[styles.itemTitle, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {item.title}
                              </Text>

                              <View style={styles.metaRow}>
                                <Text style={[styles.entityTag, { color: entityColor }]}>
                                  {getEntityTypeName(item.entityType)}
                                </Text>
                                <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                                <Text style={[styles.overdueText, { color: colors.error }]}>
                                  {item.meta?.relativeLabel || "Overdue"}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Action Buttons */}
                          <View style={styles.actionRow}>
                            <PressableScale
                              haptic
                              onPress={() => handleItemPress(item)}
                              style={[styles.smallButton, { backgroundColor: `${colors.textMuted}14` }]}
                              contentStyle={styles.smallButtonContent}
                            >
                              <Text style={[styles.smallButtonText, { color: colors.text }]}>Open</Text>
                            </PressableScale>

                            {(item.entityType === "task" || item.entityType === "todo") && (
                              <PressableScale
                                haptic
                                onPress={() => handleCompleteTask(item)}
                                style={[styles.smallButton, { backgroundColor: `${colors.success}18` }]}
                                contentStyle={styles.smallButtonContent}
                              >
                                <Feather name="check" size={13} color={colors.success} />
                                <Text style={[styles.smallButtonText, { color: colors.success }]}>Done</Text>
                              </PressableScale>
                            )}

                            {item.entityType === "habit" && (
                              <PressableScale
                                haptic
                                onPress={() => handleCompleteHabit(item)}
                                style={[styles.smallButton, { backgroundColor: `${colors.success}18` }]}
                                contentStyle={styles.smallButtonContent}
                              >
                                <Feather name="check" size={13} color={colors.success} />
                                <Text style={[styles.smallButtonText, { color: colors.success }]}>Check in</Text>
                              </PressableScale>
                            )}
                          </View>
                        </AppCard>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 2. UP NEXT SECTION */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                  UP NEXT ({alertGroups.upNext.length})
                </Text>
              </View>

              {alertGroups.upNext.length === 0 ? (
                <AppCard style={styles.emptyCard}>
                  <Feather name="clock" size={20} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    No upcoming alerts
                  </Text>
                  <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                    Reminders scheduled for the next 24 hours will appear here.
                  </Text>
                </AppCard>
              ) : (
                <View style={styles.itemList}>
                  {alertGroups.upNext.map((item, idx) => {
                    const entityColor = getEntityColor(item.entityType);
                    const iconName = getEntityIcon(item.entityType);

                    return (
                      <Animated.View
                        key={item.id}
                        entering={FadeInDown.delay(idx * 30).duration(300)}
                      >
                        <PressableScale
                          haptic
                          onPress={() => handleItemPress(item)}
                          contentStyle={{ flex: 1 }}
                        >
                          <AppCard style={[styles.alertCard, { borderLeftColor: entityColor }]}>
                            <View style={styles.rowMain}>
                              <View
                                style={[
                                  styles.entityIconBox,
                                  { backgroundColor: `${entityColor}18` },
                                ]}
                              >
                                <Feather name={iconName} size={15} color={entityColor} />
                              </View>

                              <View style={styles.infoCol}>
                                <View style={styles.topMetaRow}>
                                  <Text style={[styles.timeHeader, { color: colors.text }]}>
                                    {item.meta?.timeLabel || "Scheduled"}
                                  </Text>
                                  {item.meta?.relativeLabel ? (
                                    <Text style={[styles.relativePill, { color: colors.textMuted }]}>
                                      {item.meta.relativeLabel}
                                    </Text>
                                  ) : null}
                                </View>

                                <Text
                                  style={[styles.itemTitle, { color: colors.text }]}
                                  numberOfLines={1}
                                >
                                  {item.title}
                                </Text>

                                <View style={styles.metaRow}>
                                  <Text style={[styles.entityTag, { color: entityColor }]}>
                                    {getEntityTypeName(item.entityType)}
                                  </Text>

                                  {item.entityType === "checklist" &&
                                    item.meta?.totalCount !== undefined &&
                                    item.meta.totalCount > 0 && (
                                      <>
                                        <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                                        <Text style={[styles.checklistProgressText, { color: colors.textMuted }]}>
                                          {item.meta.completedCount || 0}/{item.meta.totalCount} completed
                                        </Text>
                                      </>
                                    )}

                                  {item.entityType === "habit" && (
                                    <>
                                      <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                                      <Text style={[styles.habitStreakText, { color: colors.textMuted }]}>
                                        {item.meta?.streak ? `🔥 ${item.meta.streak}d streak` : item.meta?.recurrenceLabel || "Daily"}
                                      </Text>
                                    </>
                                  )}

                                  {(item.entityType === "task" || item.entityType === "todo") && item.meta?.recurrenceLabel && (
                                    <>
                                      <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                                      <Text style={[styles.recurrenceText, { color: colors.textMuted }]}>
                                        {item.meta.recurrenceLabel}
                                      </Text>
                                    </>
                                  )}
                                </View>
                              </View>
                            </View>
                          </AppCard>
                        </PressableScale>
                      </Animated.View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 3. LATER SECTION */}
            {alertGroups.later.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                    LATER ({alertGroups.later.length})
                  </Text>
                </View>

                <View style={styles.itemList}>
                  {alertGroups.later.map((item, idx) => {
                    const entityColor = getEntityColor(item.entityType);
                    const iconName = getEntityIcon(item.entityType);

                    return (
                      <Animated.View
                        key={item.id}
                        entering={FadeInDown.delay(idx * 30).duration(300)}
                      >
                        <PressableScale
                          haptic
                          onPress={() => handleItemPress(item)}
                          contentStyle={{ flex: 1 }}
                        >
                          <AppCard style={[styles.alertCard, { borderLeftColor: entityColor }]}>
                            <View style={styles.rowMain}>
                              <View
                                style={[
                                  styles.entityIconBox,
                                  { backgroundColor: `${entityColor}18` },
                                ]}
                              >
                                <Feather name={iconName} size={15} color={entityColor} />
                              </View>

                              <View style={styles.infoCol}>
                                <Text style={[styles.timeHeader, { color: colors.text }]}>
                                  {item.meta?.timeLabel || "Scheduled"}
                                </Text>

                                <Text
                                  style={[styles.itemTitle, { color: colors.text }]}
                                  numberOfLines={1}
                                >
                                  {item.title}
                                </Text>

                                <View style={styles.metaRow}>
                                  <Text style={[styles.entityTag, { color: entityColor }]}>
                                    {getEntityTypeName(item.entityType)}
                                  </Text>
                                  {item.meta?.relativeLabel ? (
                                    <>
                                      <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                                      <Text style={[styles.relativePill, { color: colors.textMuted }]}>
                                        {item.meta.relativeLabel}
                                      </Text>
                                    </>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                          </AppCard>
                        </PressableScale>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 4. HISTORY LOGS SECTION */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderBetween}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                  HISTORY ({logs.length})
                </Text>
                {logs.length > 0 && (
                  <PressableScale
                    haptic
                    onPress={clearHistory}
                    contentStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={[styles.clearLinkText, { color: colors.error }]}>Clear</Text>
                  </PressableScale>
                )}
              </View>

              {logs.length === 0 ? (
                <AppCard style={styles.emptyCard}>
                  <Feather name="inbox" size={20} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    No alerts yet
                  </Text>
                  <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                    Received notifications will be logged here.
                  </Text>
                </AppCard>
              ) : (
                <View style={styles.itemList}>
                  {logs.slice(0, 20).map((log, idx) => (
                    <Animated.View
                      key={log.id}
                      entering={FadeInDown.delay(idx * 25).duration(300)}
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
                            <Text style={[styles.logCategory, { color: colors.textMuted }]}>
                              {log.type === "test-alert" ? "SYSTEM" : "REMINDER"}
                            </Text>
                          </View>
                          <Text style={[styles.logTime, { color: colors.textMuted }]}>
                            {getRelativeTime(log.timestamp)}
                          </Text>
                        </View>
                        <Text style={[styles.logTitle, { color: colors.text }]}>
                          {log.title}
                        </Text>
                        {log.body ? (
                          <Text style={[styles.logBody, { color: colors.textMuted }]}>
                            {log.body}
                          </Text>
                        ) : null}
                      </AppCard>
                    </Animated.View>
                  ))}
                </View>
              )}
            </View>

            {/* 5. SECONDARY TROUBLESHOOTING & DIAGNOSTICS */}
            <View style={styles.section}>
              <PressableScale
                haptic
                onPress={() => setShowDiagnostics(!showDiagnostics)}
                contentStyle={styles.diagToggleContent}
                style={[styles.diagToggle, { borderColor: colors.border }]}
              >
                <View style={styles.diagHeaderLeft}>
                  <Feather name="shield" size={14} color={colors.textMuted} />
                  <Text style={[styles.diagToggleText, { color: colors.textMuted }]}>
                    System Diagnostics & Settings
                  </Text>
                </View>
                <Feather
                  name={showDiagnostics ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.textMuted}
                />
              </PressableScale>

              {showDiagnostics && (
                <Animated.View entering={FadeInDown.duration(300)}>
                  <AppCard style={styles.troubleshootCard}>
                    <View style={styles.troubleshootHeader}>
                      <Feather name="help-circle" size={15} color={colors.warning} />
                      <Text style={[styles.troubleshootTitle, { color: colors.text }]}>
                        Notification Reliability
                      </Text>
                    </View>
                    <Text style={[styles.troubleshootDesc, { color: colors.textMuted }]}>
                      Mobile devices may require special permissions and battery exemptions to deliver background notifications precisely on time.
                    </Text>

                    <View style={styles.troubleshootButtons}>
                      <PressableScale
                        style={[
                          styles.diagActionBtn,
                          { backgroundColor: `${colors.primary}12`, borderColor: colors.primary },
                        ]}
                        contentStyle={styles.diagActionContent}
                        onPress={sendTestNotification}
                        haptic
                        disabled={testing}
                      >
                        {testing ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Feather name="zap" size={13} color={colors.primary} />
                            <Text style={[styles.diagActionText, { color: colors.primary }]}>
                              Test Alert (3s)
                            </Text>
                          </>
                        )}
                      </PressableScale>

                      {Platform.OS === "android" && (
                        <PressableScale
                          style={[
                            styles.diagActionBtn,
                            { backgroundColor: `${colors.warning}12`, borderColor: colors.warning },
                          ]}
                          contentStyle={styles.diagActionContent}
                          onPress={openSpecialAlarmSettings}
                          haptic
                        >
                          <Feather name="clock" size={13} color={colors.warning} />
                          <Text style={[styles.diagActionText, { color: colors.warning }]}>
                            Alarms Permission
                          </Text>
                        </PressableScale>
                      )}

                      <PressableScale
                        style={[
                          styles.diagActionBtn,
                          { backgroundColor: `${colors.textMuted}12`, borderColor: colors.border },
                        ]}
                        contentStyle={styles.diagActionContent}
                        onPress={openGeneralSettings}
                        haptic
                      >
                        <Feather name="settings" size={13} color={colors.text} />
                        <Text style={[styles.diagActionText, { color: colors.text }]}>
                          App Settings
                        </Text>
                      </PressableScale>
                    </View>
                  </AppCard>
                </Animated.View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    letterSpacing: -0.3,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  alertBanner: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
    alignItems: "flex-start",
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontSize: 15,
    fontFamily: "Outfit_600SemiBold",
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    fontFamily: "Outfit_400Regular",
  },
  bannerButton: {
    alignSelf: "flex-start",
  },
  bannerButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHeaderBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 0.8,
  },
  sectionTitleOverdue: {
    fontSize: 12,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 0.8,
  },
  clearLinkText: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
  },
  itemList: {
    gap: 10,
  },
  alertCard: {
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
  },
  overdueCard: {
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    gap: 12,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  entityIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
  },
  topMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  timeHeader: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
  },
  relativePill: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  entityTag: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
  },
  metaDot: {
    fontSize: 12,
  },
  overdueText: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
  },
  checklistProgressText: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
  },
  habitStreakText: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
  },
  recurrenceText: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 4,
  },
  smallButton: {
    borderRadius: 8,
  },
  smallButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  smallButtonText: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
  },
  emptyCard: {
    padding: 20,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
  },
  emptyDesc: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
  logCard: {
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    marginBottom: 2,
  },
  logMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
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
    fontSize: 11,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 0.5,
  },
  logTime: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
  },
  logTitle: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
    marginBottom: 2,
  },
  logBody: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Outfit_400Regular",
  },
  diagToggle: {
    borderWidth: 1,
    borderRadius: 12,
  },
  diagToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  diagHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  diagToggleText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
  },
  troubleshootCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  troubleshootHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  troubleshootTitle: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
  },
  troubleshootDesc: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Outfit_400Regular",
  },
  troubleshootButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  diagActionBtn: {
    borderWidth: 1,
    borderRadius: 8,
  },
  diagActionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  diagActionText: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
  },
});
