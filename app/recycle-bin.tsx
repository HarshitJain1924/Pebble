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

  // 1. Deletion date (always prioritized)
  badges.push({
    label: `Deleted ${formatDate(item.deletedAt)}`,
    icon: "calendar",
  });

  // 2. Workspace badge for non-workspace items (always prioritized)
  if (item.entityType !== "workspace") {
    badges.push({
      label: getItemWorkspaceName(item),
      icon: "folder",
    });
  }

  // 3. Single domain badge to avoid chip clutter
  switch (item.entityType) {
    case "task": {
      if (snap.priority && snap.priority !== "none") {
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
      } else if (snap.category) {
        const cat = String(snap.category);
        badges.push({
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          icon: "tag",
          color: Palette.violet400,
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
      } else if (snap.category) {
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

  // Subtitle text calculation
  const subtitleText = useMemo(() => {
    if (items.length === 0) return "No deleted items";
    if (items.length === 1) {
      const single = items[0];
      const cat = CATEGORIES.find((c) => c.key === single.entityType);
      const catLabel = cat ? cat.label.slice(0, -1).toLowerCase() : "item";
      return `1 deleted ${catLabel} in Recycle Bin`;
    }
    return `${items.length} items across ${activeCategoryCount || 5} categories`;
  }, [items, activeCategoryCount]);

  const renderCategoryTile = (cat: CategoryMeta) => {
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
          styles.categoryPill,
          {
            backgroundColor: isActive
              ? isDark
                ? "rgba(53, 131, 102, 0.2)"
                : "rgba(44, 108, 84, 0.12)"
              : colors.card,
            borderColor: isActive
              ? isDark
                ? "rgba(68, 167, 130, 0.6)"
                : colors.primary
              : colors.border,
            borderWidth: isActive ? 1.5 : 1,
          },
          isActive && Shadows.soft,
        ]}
      >
        <Feather
          name={cat.icon}
          size={15}
          color={
            isActive
              ? isDark
                ? Palette.pine300
                : colors.primary
              : colors.textMuted
          }
        />
        <Text
          numberOfLines={1}
          style={[
            styles.categoryLabel,
            {
              color: isActive
                ? isDark
                  ? Palette.white
                  : colors.primary
                : colors.textMuted,
              fontWeight: isActive ? "700" : "500",
            },
          ]}
        >
          {cat.label}
        </Text>
        <View
          style={[
            styles.countBadge,
            {
              backgroundColor: isActive
                ? isDark
                  ? "rgba(68, 167, 130, 0.3)"
                  : "rgba(44, 108, 84, 0.18)"
                : isDark
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(0, 0, 0, 0.06)",
            },
          ]}
        >
          <Text
            style={[
              styles.categoryCount,
              {
                color: isActive
                  ? isDark
                    ? Palette.pine200
                    : colors.primary
                  : colors.textMuted,
                fontWeight: isActive ? "700" : "600",
              },
            ]}
          >
            {count}
          </Text>
        </View>
      </PressableScale>
    );
  };

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* ─── 1. Fixed Top Action Row (Back + Empty Bin) ───────────────────── */}
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

      {/* ─── Scrollable Content ─────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── 2. Prominent Heading & Summary ─────────────────────────────── */}
        <View style={styles.titleWrapper}>
          <Text
            accessibilityRole="header"
            style={[styles.screenTitle, { color: colors.text }]}
          >
            Recycle Bin
          </Text>
          <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
            {subtitleText}
          </Text>
        </View>

        {/* ─── 3. Search Bar ──────────────────────────────────────────────── */}
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

        {/* ─── 4. Single-Row Horizontal Category Selector ─────────────────── */}
        <View style={styles.categoriesWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScrollContent}
            accessibilityRole="tablist"
          >
            {CATEGORIES.map((cat) => renderCategoryTile(cat))}
          </ScrollView>
        </View>

        {/* ─── 5. List Controls Row (Sorting & Restore All) ───────────────── */}
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
              size={13}
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

        {/* ─── 6. Deleted-Item List / Empty State ─────────────────────────── */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : sortedItems.length === 0 ? (
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
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
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
                accessibilityLabel="Clear search filter"
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
          <View style={styles.itemsList}>
            {sortedItems.map((item) => {
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
                      numberOfLines={2}
                      style={[styles.itemTitle, { color: colors.text }]}
                    >
                      {itemTitle}
                    </Text>

                    {subtitle && (
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.itemSubtitle,
                          { color: colors.textMuted },
                        ]}
                      >
                        {subtitle}
                      </Text>
                    )}

                    {/* Typographic Metadata Line */}
                    <View style={styles.metaRow}>
                      {badges.map((badge, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && (
                            <Text
                              style={[
                                styles.metaDot,
                                { color: colors.textMuted },
                              ]}
                            >
                              •
                            </Text>
                          )}
                          <View style={styles.metaItem}>
                            {badge.icon && (
                              <Feather
                                name={badge.icon}
                                size={12}
                                color={badge.color || colors.textMuted}
                                style={styles.metaIcon}
                              />
                            )}
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.metaText,
                                {
                                  color: badge.color || colors.textMuted,
                                },
                              ]}
                            >
                              {badge.label}
                            </Text>
                          </View>
                        </React.Fragment>
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
                        size={17}
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
                      <Feather name="trash-2" size={17} color={colors.error} />
                    </PressableScale>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ─── 7. Retention Policy Card ─────────────────────────────────── */}
        <View
          style={[
            styles.retentionCard,
            {
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.03)"
                : "rgba(0, 0, 0, 0.02)",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.06)"
                : colors.border,
            },
          ]}
        >
          <View style={styles.retentionHeader}>
            <View
              style={[
                styles.retentionIconCircle,
                {
                  backgroundColor: isDark
                    ? "rgba(53, 131, 102, 0.16)"
                    : "rgba(44, 108, 84, 0.1)",
                },
              ]}
            >
              <Feather
                name="shield"
                size={16}
                color={isDark ? Palette.pine400 : Palette.pine600}
              />
            </View>
            <Text style={[styles.retentionTitle, { color: colors.text }]}>
              30-Day Retention Protection
            </Text>
          </View>
          <Text
            style={[styles.retentionDescription, { color: colors.textMuted }]}
          >
            Items moved to the Recycle Bin are safely retained for 30 days. You can restore them to their original workspaces anytime or permanently purge them.
          </Text>
        </View>
      </ScrollView>
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBinBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  emptyBinText: {
    fontSize: 13,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.ux,
  },
  titleWrapper: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
    lineHeight: 20,
  },
  searchWrapper: {
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
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
    marginHorizontal: -Spacing.lg,
    marginBottom: Spacing.md,
  },
  categoriesScrollContent: {
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    alignItems: "center",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    gap: 7,
  },
  categoryLabel: {
    fontSize: 13,
    letterSpacing: -0.1,
  },
  countBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCount: {
    fontSize: 11,
    lineHeight: 14,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  sortText: {
    fontSize: 13,
    fontWeight: "600",
  },
  restoreAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  restoreAllText: {
    fontSize: 13,
    fontWeight: "700",
  },
  itemCountText: {
    fontSize: 13,
    fontWeight: "500",
  },
  loadingContainer: {
    paddingVertical: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  itemsList: {
    gap: Spacing.md,
  },
  emptyStateCard: {
    paddingVertical: 44,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xs,
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
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  itemSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 4,
    marginTop: 3,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaIcon: {
    marginRight: 4,
  },
  metaDot: {
    marginHorizontal: 6,
    fontSize: 11,
    opacity: 0.45,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
    flexShrink: 0,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  retentionCard: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  retentionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  retentionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  retentionTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  retentionDescription: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
