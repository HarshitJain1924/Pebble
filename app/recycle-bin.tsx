import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRecycleBinItems } from "@/services/storage/storage.service";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { Shadows } from "@/shared/constants/shadows";
import { Spacing } from "@/shared/constants/spacing";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { type RecycleBinItem } from "@/shared/types/domain.types";

export type BinCategory =
  | "task"
  | "habit"
  | "checklist"
  | "workspace"
  | "resource";

type SortOrder = "newest" | "oldest" | "title";

interface CategoryMeta {
  key: BinCategory;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}

const CATEGORIES: CategoryMeta[] = [
  { key: "task", label: "Tasks", icon: "check-square" },
  { key: "habit", label: "Habits", icon: "clock" },
  { key: "checklist", label: "Checklists", icon: "list" },
  { key: "workspace", label: "Workspaces", icon: "folder" },
  { key: "resource", label: "Resources", icon: "paperclip" },
];

// ─── Snapshot Helpers ──────────────────────────────────────────────────────

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
    return snap.name || snap.title || "Unknown Workspace";
  }
  return snap.title || snap.name || "Untitled";
}

function getItemWorkspaceName(item: RecycleBinItem): string {
  const snap = parseSnapshot(item.snapshot);
  if (snap.workspaceName) return snap.workspaceName;
  if (!snap.workspaceId || snap.workspaceId === "inbox") return "Inbox";
  return snap.workspaceId;
}

function getItemSubtitle(item: RecycleBinItem): string | null {
  const snap = parseSnapshot(item.snapshot);
  const text = snap.notes || snap.description || snap.summary || snap.url;
  if (typeof text === "string" && text.trim().length > 0) {
    return text.trim();
  }
  return null;
}

function formatDate(timestamp: number): string {
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
}

interface EntityVisual {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  bgColor: string;
}

function getEntityVisual(
  entityType: RecycleBinItem["entityType"],
  isDark: boolean,
): EntityVisual {
  switch (entityType) {
    case "task":
      return {
        icon: "file-text",
        iconColor: isDark ? Palette.indigo400 : Palette.indigo600,
        bgColor: isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.1)",
      };
    case "habit":
      return {
        icon: "clock",
        iconColor: isDark ? Palette.emerald400 : Palette.emerald600,
        bgColor: isDark ? "rgba(16, 185, 129, 0.16)" : Palette.emerald100,
      };
    case "checklist":
      return {
        icon: "list",
        iconColor: isDark ? Palette.teal500 : Palette.teal500,
        bgColor: isDark ? "rgba(20, 184, 166, 0.16)" : Palette.green50,
      };
    case "workspace":
      return {
        icon: "folder",
        iconColor: isDark ? Palette.violet400 : Palette.violet600,
        bgColor: isDark ? "rgba(168, 85, 247, 0.16)" : Palette.violet100,
      };
    case "resource":
      return {
        icon: "paperclip",
        iconColor: isDark ? Palette.sky400 : Palette.sky600,
        bgColor: isDark ? "rgba(14, 165, 233, 0.16)" : Palette.sky100,
      };
  }
}

interface MetaBadge {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  color?: string;
}

function getItemMetaBadges(item: RecycleBinItem): MetaBadge[] {
  const snap = parseSnapshot(item.snapshot);
  const badges: MetaBadge[] = [];

  // Deletion date
  badges.push({
    label: `Deleted ${formatDate(item.deletedAt)}`,
    icon: "calendar",
  });

  // Workspace badge for non-workspace items
  if (item.entityType !== "workspace") {
    badges.push({
      label: getItemWorkspaceName(item),
      icon: "folder",
    });
  }

  // Domain-specific badges
  switch (item.entityType) {
    case "task": {
      if (snap.priority) {
        const pKey = String(snap.priority).toLowerCase();
        badges.push({
          label: pKey.charAt(0).toUpperCase() + pKey.slice(1),
          icon: "flag",
          color:
            pKey === "high"
              ? Palette.red500
              : pKey === "medium"
                ? Palette.amber500
                : Palette.slate400,
        });
      }
      if (snap.category) {
        const cat = String(snap.category);
        badges.push({
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          icon: "tag",
          color: Palette.violet400,
        });
      }
      if (snap.schedule?.date) {
        badges.push({
          label: snap.schedule.date,
          icon: "clock",
        });
      }
      break;
    }
    case "habit": {
      if (snap.recurrence?.frequency) {
        const freq = String(snap.recurrence.frequency);
        badges.push({
          label: freq.charAt(0).toUpperCase() + freq.slice(1),
          icon: "repeat",
        });
      }
      if (snap.category) {
        const cat = String(snap.category);
        badges.push({
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          icon: "tag",
          color: Palette.violet400,
        });
      }
      break;
    }
    case "checklist": {
      const count = Array.isArray(snap.items) ? snap.items.length : 0;
      badges.push({
        label: `${count} ${count === 1 ? "item" : "items"}`,
        icon: "check-circle",
        color: Palette.teal500,
      });
      break;
    }
    case "resource": {
      const typeLabel =
        snap.type === "link"
          ? "Link"
          : snap.type === "idea"
            ? "Idea"
            : snap.type === "note"
              ? "Note"
              : "Resource";
      const icon: keyof typeof Feather.glyphMap =
        snap.type === "link"
          ? "link"
          : snap.type === "idea"
            ? "zap"
            : snap.type === "note"
              ? "file-text"
              : "box";
      badges.push({
        label: typeLabel,
        icon,
        color: Palette.sky500,
      });
      break;
    }
    case "workspace": {
      badges.push({
        label: "Workspace",
        icon: "layers",
        color: Palette.violet400,
      });
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
  const isDark = !isLight;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [activeTab, setActiveTab] = useState<BinCategory>("task");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const loadRecycleBin = async () => {
    try {
      const binItems = await getRecycleBinItems();
      setItems(binItems);
    } catch (e) {
      console.warn("Failed to load recycle bin items", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    getRecycleBinItems()
      .then((binItems) => {
        if (isMounted) {
          setItems(binItems);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.warn("Failed to load recycle bin items", e);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Permanently delete bin items through the canonical command path.
   */
  const purgeBinItems = async (
    targets: RecycleBinItem[],
  ): Promise<{ deleted: number; failed: number }> => {
    const { EntityCommandService } = await import(
      "@/services/command/EntityCommandService"
    );

    const result = await EntityCommandService.permanentlyDeleteRecycleBinItems(
      targets,
    );

    const deletedIds = new Set(result.deletedIds);
    if (deletedIds.size > 0) {
      setItems((prev) => prev.filter((i) => !deletedIds.has(i.id)));
    }

    if (result.failed.length > 0) {
      await loadRecycleBin();
      const details = result.failed
        .slice(0, 3)
        .map((f) => `• ${f.entityType}: ${f.message}`)
        .join("\n");
      Alert.alert(
        "Some items were not deleted",
        `${result.failed.length} item(s) are still in the Recycle Bin and can be retried.\n\n${details}`,
      );
    }

    return { deleted: deletedIds.size, failed: result.failed.length };
  };

  const handleRestoreItem = async (item: RecycleBinItem) => {
    try {
      setLoading(true);
      const { EntityCommandService } = await import(
        "@/services/command/EntityCommandService"
      );
      const result = await EntityCommandService.restoreRecycleBinItems([item]);

      if (result.restoredIds.length > 0) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        Alert.alert(
          "Restored",
          `"${getItemTitle(item)}" has been restored successfully!`,
        );
      } else {
        await loadRecycleBin();
        Alert.alert(
          "Restore failed",
          `"${getItemTitle(item)}" could not be restored and is still in the Recycle Bin.`,
        );
      }
    } catch (e) {
      console.warn("Failed to restore item", e);
      await loadRecycleBin();
      Alert.alert(
        "Restore failed",
        `"${getItemTitle(item)}" could not be restored and is still in the Recycle Bin.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDelete = (item: RecycleBinItem) => {
    const isWorkspace = item.entityType === "workspace";
    const itemTitle = getItemTitle(item);
    const title = isWorkspace ? "Delete Workspace" : "Delete Permanently";
    const desc = isWorkspace
      ? `Are you sure you want to permanently delete the workspace "${itemTitle}" along with all its contained tasks, habits, and checklists? This action cannot be undone.`
      : `Are you sure you want to permanently delete "${itemTitle}"? This action cannot be undone.`;

    Alert.alert(title, desc, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete Permanently",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            const { deleted } = await purgeBinItems([item]);
            if (deleted > 0) {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              ).catch(() => {});
            }
          } catch (e) {
            console.warn("Failed to permanently delete item", e);
            Alert.alert(
              "Delete failed",
              `"${itemTitle}" could not be permanently deleted. It is still in the Recycle Bin.`,
            );
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleRestoreAll = async () => {
    const tabItems = items.filter((i) => i.entityType === activeTab);
    if (tabItems.length === 0) return;

    const catMeta = CATEGORIES.find((c) => c.key === activeTab);
    const label = catMeta ? catMeta.label.toLowerCase() : `${activeTab}s`;

    Alert.alert(
      "Restore All",
      `Are you sure you want to restore all ${tabItems.length} deleted ${label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore All",
          onPress: async () => {
            setLoading(true);
            try {
              const { EntityCommandService } = await import(
                "@/services/command/EntityCommandService"
              );
              const result = await EntityCommandService.restoreRecycleBinItems(
                tabItems,
              );

              const restoredIds = new Set(result.restoredIds);
              if (restoredIds.size > 0) {
                setItems((prev) => prev.filter((i) => !restoredIds.has(i.id)));
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                ).catch(() => {});
              }

              if (result.failed.length > 0) {
                await loadRecycleBin();
                Alert.alert(
                  "Some items were not restored",
                  `${result.failed.length} item(s) are still in the Recycle Bin and can be retried.`,
                );
              }
            } catch (e) {
              console.warn("Failed to restore all items", e);
              await loadRecycleBin();
              Alert.alert(
                "Restore failed",
                "Some items could not be restored and remain in the Recycle Bin.",
              );
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
              const { deleted } = await purgeBinItems(items);
              if (deleted > 0) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Warning,
                ).catch(() => {});
              }
            } catch (e) {
              console.warn("Failed to empty recycle bin", e);
              Alert.alert(
                "Empty failed",
                "The Recycle Bin could not be emptied. Your items are still there.",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleToggleSort = () => {
    const next: SortOrder =
      sortOrder === "newest"
        ? "oldest"
        : sortOrder === "oldest"
          ? "title"
          : "newest";
    setSortOrder(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Search filter
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter((i) => {
      const titleMatch = getItemTitle(i).toLowerCase().includes(query);
      const snap = parseSnapshot(i.snapshot);
      const notes = (
        snap.notes ||
        snap.description ||
        snap.summary ||
        ""
      ).toLowerCase();
      return titleMatch || notes.includes(query);
    });
  }, [items, searchQuery]);

  // Tab filter
  const activeTabItems = useMemo(() => {
    return filteredItems.filter((i) => i.entityType === activeTab);
  }, [filteredItems, activeTab]);

  // Sorting
  const sortedItems = useMemo(() => {
    const list = [...activeTabItems];
    if (sortOrder === "newest") {
      return list.sort((a, b) => b.deletedAt - a.deletedAt);
    }
    if (sortOrder === "oldest") {
      return list.sort((a, b) => a.deletedAt - b.deletedAt);
    }
    if (sortOrder === "title") {
      return list.sort((a, b) =>
        getItemTitle(a).localeCompare(getItemTitle(b)),
      );
    }
    return list;
  }, [activeTabItems, sortOrder]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<BinCategory, number> = {
      task: 0,
      habit: 0,
      checklist: 0,
      workspace: 0,
      resource: 0,
    };
    for (const item of items) {
      if (item.entityType in counts) {
        counts[item.entityType]++;
      }
    }
    return counts;
  }, [items]);

  const activeCategoryCount = useMemo(() => {
    return Object.values(categoryCounts).filter((c) => c > 0).length;
  }, [categoryCounts]);

  const currentCategoryMeta = CATEGORIES.find((c) => c.key === activeTab);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* ─── Top Action Row ────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[
            styles.backBtn,
            {
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.06)"
                : Palette.slate100,
              borderColor: colors.border,
            },
          ]}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleEmptyRecycleBin}
          disabled={items.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Empty Recycle Bin"
          accessibilityState={{ disabled: items.length === 0 }}
          style={[
            styles.emptyBinBtn,
            {
              backgroundColor: isDark
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(239, 68, 68, 0.1)",
              borderColor: isDark
                ? "rgba(239, 68, 68, 0.35)"
                : "rgba(239, 68, 68, 0.25)",
              opacity: items.length === 0 ? 0.35 : 1,
            },
          ]}
          hitSlop={8}
        >
          <Feather
            name="trash-2"
            size={14}
            color={colors.error}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.emptyBinText, { color: colors.error }]}>
            Empty Bin
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Title & Subtitle ─────────────────────────────────────────── */}
      <View style={styles.titleWrapper}>
        <Text
          accessibilityRole="header"
          style={[styles.screenTitle, { color: colors.text }]}
        >
          Recycle Bin
        </Text>
        <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
          {items.length === 0
            ? "No deleted items"
            : `${items.length} ${items.length === 1 ? "item" : "items"} across ${activeCategoryCount || 5} categories`}
        </Text>
      </View>

      {/* ─── Search Bar ────────────────────────────────────────────────── */}
      <View style={styles.searchWrapper}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather
            name="search"
            size={18}
            color={colors.textMuted}
            style={{ marginRight: 10 }}
          />
          <TextInput
            placeholder="Search deleted items..."
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search deleted items"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search query"
              style={styles.clearSearchBtn}
            >
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Responsive Category Selector ─────────────────────────────── */}
      <View style={styles.categoriesWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
          accessibilityRole="tablist"
        >
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.key];
            const isActive = activeTab === cat.key;

            return (
              <PressableScale
                key={cat.key}
                onPress={() => {
                  setActiveTab(cat.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${cat.label} tab, ${count} items`}
                style={[
                  styles.categoryTab,
                  {
                    backgroundColor: isActive
                      ? isDark
                        ? "rgba(99, 102, 241, 0.2)"
                        : "rgba(99, 102, 241, 0.12)"
                      : colors.card,
                    borderColor: isActive
                      ? isDark
                        ? "rgba(129, 140, 248, 0.5)"
                        : Palette.indigo500
                      : colors.border,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
              >
                <Feather
                  name={cat.icon}
                  size={16}
                  color={
                    isActive
                      ? isDark
                        ? Palette.indigo300
                        : Palette.indigo600
                      : colors.textMuted
                  }
                  style={{ marginBottom: 4 }}
                />
                <Text
                  style={[
                    styles.categoryLabel,
                    {
                      color: isActive
                        ? isDark
                          ? Palette.white
                          : Palette.indigo900
                        : colors.textMuted,
                      fontWeight: isActive ? "700" : "500",
                    },
                  ]}
                >
                  {cat.label}
                </Text>
                <Text
                  style={[
                    styles.categoryCount,
                    {
                      color: isActive
                        ? isDark
                          ? Palette.indigo200
                          : Palette.indigo600
                        : colors.textMuted,
                      fontWeight: isActive ? "700" : "600",
                    },
                  ]}
                >
                  {count}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── List Controls Row (Sorting & Restore All) ──────────────────── */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={handleToggleSort}
          accessibilityRole="button"
          accessibilityLabel={`Sort order: ${sortOrder === "newest" ? "Newest" : sortOrder === "oldest" ? "Oldest" : "Title"}`}
          style={[
            styles.sortPill,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          hitSlop={6}
        >
          <Feather
            name="sliders"
            size={12}
            color={colors.textMuted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.sortText, { color: colors.text }]}>
            {`Deleted: ${
              sortOrder === "newest"
                ? "Newest"
                : sortOrder === "oldest"
                  ? "Oldest"
                  : "Title"
            }`}
          </Text>
          <Feather
            name="chevron-down"
            size={13}
            color={colors.textMuted}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        {activeTabItems.length > 0 ? (
          <TouchableOpacity
            style={[
              styles.restoreAllBtn,
              {
                backgroundColor: isDark
                  ? "rgba(53, 131, 102, 0.16)"
                  : "rgba(44, 108, 84, 0.12)",
                borderColor: isDark ? "rgba(68, 167, 130, 0.45)" : colors.primary,
              },
            ]}
            onPress={handleRestoreAll}
            accessibilityRole="button"
            accessibilityLabel={`Restore all ${activeTabItems.length} deleted ${currentCategoryMeta?.label.toLowerCase() || activeTab + "s"}`}
            hitSlop={6}
          >
            <Feather
              name="rotate-ccw"
              size={13}
              color={isDark ? Palette.pine400 : colors.primary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.restoreAllText,
                { color: isDark ? Palette.pine400 : colors.primary },
              ]}
            >
              Restore All ({activeTabItems.length})
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.itemCountText, { color: colors.textMuted }]}>
            0 items
          </Text>
        )}
      </View>

      {/* ─── Content Area ──────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sortedItems.length === 0 ? (
            <View
              style={[
                styles.emptyStateCard,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Feather
                name={
                  searchQuery.trim()
                    ? "search"
                    : currentCategoryMeta?.icon || "trash-2"
                }
                size={36}
                color={colors.textMuted}
                style={{ marginBottom: 12, opacity: 0.6 }}
              />
              <Text
                style={[
                  styles.emptyStateTitle,
                  { color: colors.text },
                ]}
              >
                {searchQuery.trim()
                  ? "No matching deleted items"
                  : items.length === 0
                    ? "Recycle Bin is empty"
                    : `No deleted ${currentCategoryMeta?.label.toLowerCase() || activeTab + "s"}`}
              </Text>
              <Text
                style={[
                  styles.emptyStateSubtitle,
                  { color: colors.textMuted },
                ]}
              >
                {searchQuery.trim()
                  ? `No deleted items match "${searchQuery.trim()}". Check your spelling or clear search.`
                  : items.length === 0
                    ? "Items you delete will show up here for 30 days before permanent deletion."
                    : `There are currently no deleted ${currentCategoryMeta?.label.toLowerCase() || activeTab + "s"} in the bin.`}
              </Text>
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search query"
                  style={[
                    styles.clearFilterBtn,
                    { borderColor: colors.border, backgroundColor: colors.cardLight },
                  ]}
                >
                  <Text style={[styles.clearFilterText, { color: colors.text }]}>
                    Clear Search
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            sortedItems.map((item) => {
              const itemTitle = getItemTitle(item);
              const subtitle = getItemSubtitle(item);
              const badges = getItemMetaBadges(item);
              const visual = getEntityVisual(item.entityType, isDark);

              return (
                <View
                  key={item.id}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                    Shadows.soft,
                  ]}
                >
                  {/* Leading Squircle Icon Badge */}
                  <View
                    style={[
                      styles.iconBadge,
                      { backgroundColor: visual.bgColor },
                    ]}
                  >
                    <Feather
                      name={visual.icon}
                      size={20}
                      color={visual.iconColor}
                    />
                  </View>

                  {/* Center Info Column */}
                  <View style={styles.itemInfo}>
                    <Text
                      numberOfLines={1}
                      style={[styles.itemTitle, { color: colors.text }]}
                    >
                      {itemTitle}
                    </Text>

                    {subtitle && (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.itemSubtitle,
                          { color: colors.textMuted },
                        ]}
                      >
                        {subtitle}
                      </Text>
                    )}

                    {/* Metadata Chips Row */}
                    <View style={styles.metaRow}>
                      {badges.map((badge, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isLight
                                ? Palette.slate100
                                : "rgba(255, 255, 255, 0.05)",
                            },
                          ]}
                        >
                          {badge.icon && (
                            <Feather
                              name={badge.icon}
                              size={11}
                              color={badge.color || colors.textMuted}
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.chipText,
                              {
                                color: badge.color || colors.textMuted,
                              },
                            ]}
                          >
                            {badge.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Trailing Action Buttons */}
                  <View style={styles.actions}>
                    <PressableScale
                      onPress={() => handleRestoreItem(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Restore ${itemTitle}`}
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isDark
                            ? "rgba(53, 131, 102, 0.18)"
                            : "rgba(44, 108, 84, 0.12)",
                          borderColor: isDark
                            ? "rgba(68, 167, 130, 0.4)"
                            : "rgba(44, 108, 84, 0.3)",
                        },
                      ]}
                      hitSlop={6}
                    >
                      <Feather
                        name="rotate-ccw"
                        size={18}
                        color={isDark ? Palette.pine400 : Palette.pine600}
                      />
                    </PressableScale>

                    <PressableScale
                      onPress={() => handlePermanentDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Permanently delete ${itemTitle}`}
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isDark
                            ? "rgba(239, 68, 68, 0.16)"
                            : "rgba(239, 68, 68, 0.1)",
                          borderColor: isDark
                            ? "rgba(239, 68, 68, 0.35)"
                            : "rgba(239, 68, 68, 0.25)",
                        },
                      ]}
                      hitSlop={6}
                    >
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </PressableScale>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBinBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  emptyBinText: {
    fontSize: 13,
    fontWeight: "700",
  },
  titleWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  searchWrapper: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  categoriesWrapper: {
    marginBottom: Spacing.md,
  },
  categoriesScroll: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  categoryTab: {
    minWidth: 80,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    fontSize: 13,
    letterSpacing: -0.1,
  },
  categoryCount: {
    fontSize: 12,
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  sortText: {
    fontSize: 12,
    fontWeight: "600",
  },
  restoreAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  restoreAllText: {
    fontSize: 12,
    fontWeight: "700",
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyStateCard: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyStateSubtitle: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  clearFilterBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: "600",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  itemSubtitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
