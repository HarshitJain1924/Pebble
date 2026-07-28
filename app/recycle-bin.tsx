import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { emitStateChange } from "@/services/events/state-events";
import { cancelReminderIds } from "@/services/scheduling/reminders.service";
import {
  getRecycleBinItems,
  restoreRecycleBinItems,
  saveRecycleBinItems,
} from "@/services/storage/storage.service";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  type RecycleBinItem
} from "@/shared/types/domain.types";

// ─── Snapshot Helpers ──────────────────────────────────────────────────────
// snapshot is a JSON-stringified copy of the original entity.
// Must parse before reading fields.

function parseSnapshot(snapshot: string): Record<string, any> {
  try {
    return JSON.parse(snapshot);
  } catch {
    return {};
  }
}

function getItemTitle(item: RecycleBinItem): string {
  const snap = parseSnapshot(item.snapshot);
  if (item.entityType === "workspace") {
    // Workspace stores title in `name`
    return snap.name || snap.title || "Unknown Workspace";
  }
  // Task, Habit, Checklist, Resource all use `title`
  return snap.title || snap.name || "Untitled";
}

function getItemWorkspaceName(item: RecycleBinItem): string {
  const snap = parseSnapshot(item.snapshot);
  // Use workspaceId as-is (it's an internal ID, not a display name)
  return snap.workspaceId || "Inbox";
}

function getItemMetaBadges(
  item: RecycleBinItem,
): string[] {
  const snap = parseSnapshot(item.snapshot);
  const badges: string[] = [];

  switch (item.entityType) {
    case "task": {
      if (snap.priority) {
        badges.push(snap.priority.toUpperCase());
      }
      if (snap.schedule?.date) {
        badges.push(`📅 ${snap.schedule.date}`);
      }
      break;
    }
    case "habit": {
      if (snap.recurrence?.frequency) {
        badges.push(`🔄 ${snap.recurrence.frequency}`);
      }
      break;
    }
    case "checklist": {
      const count = snap.items?.length || 0;
      badges.push(`📋 ${count} ${count === 1 ? "item" : "items"}`);
      break;
    }
    case "resource": {
      const typeLabel =
        snap.type === "link" ? "🔗 Link" :
        snap.type === "idea" ? "💡 Idea" :
        snap.type === "note" ? "📝 Note" :
        "📦 Resource";
      badges.push(typeLabel);
      break;
    }
  }

  return badges;
}

export default function RecycleBinScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [activeTab, setActiveTab] = useState<
    "task" | "habit" | "workspace" | "resource"
  >("task");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadRecycleBin();
  }, []);

  const loadRecycleBin = async () => {
    setLoading(true);
    try {
      const binItems = await getRecycleBinItems();
      setItems(binItems);
    } catch (e) {
      console.warn("Failed to load recycle bin items", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreItem = async (item: RecycleBinItem) => {
    try {
      setLoading(true);
      await restoreRecycleBinItems([item]);

      // Remove from Recycle Bin state
      const remaining = items.filter((i) => i.id !== item.id);
      setItems(remaining);

      // State events are already emitted by restoreRecycleBinItems,
      // but emit additional targeted events for immediate UI refresh
      if (item.entityType === "task" || item.entityType === "workspace") {
        emitStateChange("tasks_changed");
      }
      if (item.entityType === "habit" || item.entityType === "workspace") {
        emitStateChange("habits_changed");
      }
      if (item.entityType === "resource") {
        emitStateChange("resources_changed");
      }
      if (item.entityType === "workspace") {
        emitStateChange("workspace_mode_changed");
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      Alert.alert(
        "Restored",
        `"${getItemTitle(item)}" has been restored successfully!`,
      );
    } catch (e) {
      console.warn("Failed to restore item", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDelete = (item: RecycleBinItem) => {
    const isWorkspace = item.entityType === "workspace";
    const itemTitle = getItemTitle(item);
    const title = isWorkspace ? "Delete Workspace" : "Delete Permanently";
    const desc = isWorkspace
      ? `Are you sure you want to permanently delete the workspace "${itemTitle}" along with all its contained tasks and habits? This action cannot be undone.`
      : `Are you sure you want to permanently delete "${itemTitle}"? This action cannot be undone.`;

    Alert.alert(title, desc, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete Permanently",
        style: "destructive",
        onPress: async () => {
          try {
            if (item.entityType === "task" || item.entityType === "habit") {
              const snap = parseSnapshot(item.snapshot);
              const notifIds = snap?.reminder?.notificationIds || snap?.notificationIds || [];
              if (notifIds.length > 0) {
                await cancelReminderIds(notifIds);
              }
            }

            const remaining = items.filter((i) => i.id !== item.id);
            await saveRecycleBinItems(remaining);
            setItems(remaining);
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            ).catch(() => {});
          } catch (e) {
            console.warn("Failed to permanently delete item", e);
          }
        },
      },
    ]);
  };

  const handleRestoreAll = async () => {
    const tabItems = items.filter((i) => {
      if (activeTab === "resource") {
        return i.entityType === "resource";
      }
      return i.entityType === activeTab;
    });
    if (tabItems.length === 0) return;

    Alert.alert(
      "Restore All",
      `Are you sure you want to restore all ${tabItems.length} selected ${activeTab === "resource" ? "resource" : activeTab}(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore All",
          onPress: async () => {
            setLoading(true);
            try {
              await restoreRecycleBinItems(tabItems);

              // Update Recycle Bin state
              const tabItemIds = new Set(tabItems.map((i) => i.id));
              const remaining = items.filter((i) => !tabItemIds.has(i.id));
              setItems(remaining);

              if (activeTab === "task" || activeTab === "workspace") {
                emitStateChange("tasks_changed");
              }
              if (activeTab === "habit" || activeTab === "workspace") {
                emitStateChange("habits_changed");
              }
              if (activeTab === "resource") {
                emitStateChange("resources_changed");
              }
              if (activeTab === "workspace") {
                emitStateChange("workspace_mode_changed");
              }

              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
            } catch (e) {
              console.warn("Failed to restore all items", e);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleEmptyRecycleBin = () => {
    if (items.length === 0) return;

    Alert.alert(
      "Empty Recycle Bin",
      `Are you sure you want to permanently delete all ${items.length} item(s) currently in the Recycle Bin? This action is permanent and cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty Recycle Bin",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await saveRecycleBinItems([]);
              setItems([]);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              ).catch(() => {});
            } catch (e) {
              console.warn("Failed to empty recycle bin", e);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // Search filter — parse snapshot to search by title
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter((i) => getItemTitle(i).toLowerCase().includes(query));
  }, [items, searchQuery]);

  const activeTabItems = useMemo(() => {
    return filteredItems.filter((i) => {
      if (activeTab === "resource") {
        return i.entityType === "resource";
      }
      return i.entityType === activeTab;
    });
  }, [filteredItems, activeTab]);

  const formatDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "Recently";
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Recycle Bin
        </Text>
        <TouchableOpacity
          onPress={handleEmptyRecycleBin}
          disabled={items.length === 0}
          style={{ opacity: items.length === 0 ? 0.35 : 1 }}
          hitSlop={10}
        >
          <Text style={[styles.emptyBtnText, { color: colors.error }]}>
            Empty
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather
            name="search"
            size={16}
            color={colors.textMuted}
            style={{ marginRight: 8 }}
          />
          <TextInput
            placeholder="Search deleted items..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={10}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrapper}>
        <View
          style={[
            styles.tabsContainer,
            { backgroundColor: isLight ? "#E2E8F0" : "#27272A" },
          ]}
        >
          {(["task", "habit", "workspace", "resource"] as const).map((tab) => {
            const count = items.filter((i) => {
              if (tab === "resource") {
                return i.entityType === "resource";
              }
              return i.entityType === tab;
            }).length;
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  setActiveTab(tab);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                }}
                style={[
                  styles.tabButton,
                  isActive && {
                    backgroundColor: colors.background,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 3,
                    elevation: 3,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: isActive ? colors.text : colors.textMuted,
                      fontWeight: isActive ? "700" : "500",
                    },
                  ]}
                >
                  {tab === "task"
                    ? "Tasks"
                    : tab === "habit"
                      ? "Habits"
                      : tab === "workspace"
                        ? "Workspaces"
                        : "Resources"}
                  {count > 0 && ` (${count})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Bulk Restore Tab Actions */}
      {activeTabItems.length > 0 && (
        <View style={styles.bulkRow}>
          <Text style={[styles.tabSummary, { color: colors.textMuted }]}>
            Showing {activeTabItems.length} deleted{" "}
            {activeTab === "resource"
              ? "resource"
              : `${activeTab}s`}
          </Text>
          <TouchableOpacity
            style={[styles.restoreAllBtn, { borderColor: colors.primary }]}
            onPress={handleRestoreAll}
          >
            <Feather
              name="rotate-ccw"
              size={12}
              color={colors.primary}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.restoreAllText, { color: colors.primary }]}>
              Restore All
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTabItems.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Feather
                name="trash-2"
                size={40}
                color={colors.textMuted}
                style={{ marginBottom: 12, opacity: 0.6 }}
              />
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 15,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {searchQuery
                  ? "No matching items found"
                  : `No deleted ${activeTab === "resource" ? "resource" : activeTab}s`}
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {searchQuery
                  ? "Try a different search query"
                  : "Deleted items will show up here for 30 days."}
              </Text>
            </View>
          ) : (
            activeTabItems.map((item) => {
              const snap = parseSnapshot(item.snapshot);
              const metaBadges = getItemMetaBadges(item);
              return (
                <AppCard
                  key={item.id}
                  style={[styles.itemCard, { borderColor: colors.border }]}
                >
                  <View style={styles.itemInfo}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>
                        {getItemTitle(item)}
                      </Text>
                      {item.entityType === "workspace" && (
                        <View
                          style={[
                            styles.itemTypeBadge,
                            { backgroundColor: `${colors.primary}20` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.itemTypeBadgeText,
                              { color: colors.primary },
                            ]}
                          >
                            {snap.name || "Workspace"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: isLight
                              ? "#F1F5F9"
                              : "rgba(255,255,255,0.03)",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 10,
                            fontWeight: "600",
                          }}
                        >
                          📅 Deleted: {formatDate(item.deletedAt)}
                        </Text>
                      </View>
                      {item.entityType !== "workspace" && (
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isLight
                                ? "#F1F5F9"
                                : "rgba(255,255,255,0.03)",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 10,
                              fontWeight: "600",
                            }}
                          >
                            💼 From: {getItemWorkspaceName(item)}
                          </Text>
                        </View>
                      )}
                      {metaBadges.map((badge, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isLight
                                ? "#F1F5F9"
                                : "rgba(255,255,255,0.03)",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 10,
                              fontWeight: "600",
                            }}
                          >
                            {badge}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => handleRestoreItem(item)}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: `${colors.success}15` },
                      ]}
                      hitSlop={8}
                    >
                      <Feather
                        name="rotate-ccw"
                        size={16}
                        color={colors.success}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handlePermanentDelete(item)}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: `${colors.error}15` },
                      ]}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </AppCard>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "800" },
  emptyBtnText: { fontSize: 14, fontWeight: "700" },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 0,
  },
  tabsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabsContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    height: 40,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  tabButtonText: {
    fontSize: 13,
  },
  bulkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tabSummary: {
    fontSize: 12,
    fontWeight: "500",
  },
  restoreAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  restoreAllText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scrollContent: { padding: 16, paddingBottom: 60, gap: 12 },
  emptyCard: {
    padding: 40,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  itemInfo: { flex: 1, gap: 6 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  itemTitle: { fontSize: 15, fontWeight: "700" },
  itemTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  itemTypeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
