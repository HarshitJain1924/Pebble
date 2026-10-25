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

import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { emitStateChange } from "@/services/events/state-events";
import { getDateKey } from "@/services/scheduling/recurrence.service";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Radius } from "@/shared/constants/radii";
import { Shadows } from "@/shared/constants/shadows";
import { Spacing } from "@/shared/constants/spacing";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  type Checklist,
  type Habit,
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
  type Resource,
  type Task,
  type Workspace,
} from "@/shared/types/domain.types";
import { getHabitCurrentStreak } from "@/shared/utils/domain-selectors";

export type ArchiveCategory =
  | "task"
  | "habit"
  | "checklist"
  | "workspace"
  | "resource";

type SortOrder = "newest" | "oldest" | "title";

interface CategoryMeta {
  key: ArchiveCategory;
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

function formatDate(timestamp?: number | string): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEntityVisual(
  type: ArchiveCategory,
  isDark: boolean,
): {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  bgColor: string;
} {
  switch (type) {
    case "task":
      return {
        icon: "check-square",
        iconColor: isDark ? Palette.amber400 : Palette.amber600,
        bgColor: isDark ? "rgba(251, 191, 36, 0.16)" : Palette.amber100,
      };
    case "habit":
      return {
        icon: "clock",
        iconColor: isDark ? Palette.emerald400 : Palette.emerald600,
        bgColor: isDark ? "rgba(52, 211, 153, 0.16)" : Palette.emerald100,
      };
    case "checklist":
      return {
        icon: "list",
        iconColor: isDark ? Palette.teal500 : Palette.teal500,
        bgColor: isDark
          ? "rgba(20, 184, 166, 0.16)"
          : "rgba(20, 184, 166, 0.12)",
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

function getItemMetaBadges(
  item: any,
  type: ArchiveCategory,
  workspaces: Record<string, string>,
): MetaBadge[] {
  const badges: MetaBadge[] = [];

  // 1. Archived date
  if (item.archivedAt) {
    badges.push({
      label: `Archived ${formatDate(item.archivedAt)}`,
      icon: "calendar",
    });
  }

  // 2. Workspace name for non-workspace items
  if (type !== "workspace") {
    const wsName = workspaces[item.workspaceId || ""] || "Inbox";
    badges.push({
      label: wsName,
      icon: "folder",
    });
  }

  // 3. Domain badge
  switch (type) {
    case "task": {
      if (item.priority && item.priority !== "none") {
        const pKey = String(item.priority).toLowerCase();
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
      } else if (item.category) {
        const cat = String(item.category);
        badges.push({
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          icon: "tag",
          color: Palette.violet400,
        });
      }
      break;
    }
    case "habit": {
      const streak = getHabitCurrentStreak(item);
      if (streak > 0) {
        badges.push({
          label: `${streak} streak`,
          icon: "zap",
          color: Palette.amber500,
        });
      } else if (item.recurrence?.frequency) {
        const freq = String(item.recurrence.frequency);
        badges.push({
          label: freq.charAt(0).toUpperCase() + freq.slice(1),
          icon: "repeat",
        });
      }
      break;
    }
    case "checklist": {
      const count = Array.isArray(item.items) ? item.items.length : 0;
      badges.push({
        label: `${count} ${count === 1 ? "item" : "items"}`,
        icon: "check-circle",
        color: Palette.teal500,
      });
      break;
    }
    case "resource": {
      const typeLabel =
        item.type === "link"
          ? "Link"
          : item.type === "idea"
            ? "Idea"
            : item.type === "note"
              ? "Note"
              : "Resource";
      const icon: keyof typeof Feather.glyphMap =
        item.type === "link"
          ? "link"
          : item.type === "idea"
            ? "zap"
            : item.type === "note"
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

interface ArchivedData {
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  workspaces: Workspace[];
  resources: Resource[];
  workspaceNames: Record<string, string>;
}

async function fetchArchivedData(): Promise<ArchivedData> {
  const folderList = await WorkspaceRepository.getWorkspaces();
  const folderIds = Array.from(
    new Set([
      INBOX_WORKSPACE_ID,
      MY_PEBBLES_WORKSPACE_ID,
      ...folderList.map((f) => f.id),
    ]),
  );

  const workspaceNames: Record<string, string> = {};
  const archWorkspaces: Workspace[] = [];
  folderList.forEach((f) => {
    workspaceNames[f.id] = f.name;
    if (f.archivedAt) {
      archWorkspaces.push(f);
    }
  });
  workspaceNames[INBOX_WORKSPACE_ID] = "Inbox";
  workspaceNames[MY_PEBBLES_WORKSPACE_ID] = "My Pebbles";

  const tasks: Task[] = [];
  const habits: Habit[] = [];
  const checklists: Checklist[] = [];
  const resources: Resource[] = [];
  const seenTaskIds = new Set<string>();
  const seenHabitIds = new Set<string>();
  const seenChecklistIds = new Set<string>();
  const seenResourceIds = new Set<string>();

  for (const fId of folderIds) {
    const tasksMap = await TaskRepository.getTasks(fId);
    Object.values(tasksMap).forEach((t) => {
      if (t.archivedAt && !seenTaskIds.has(t.id)) {
        seenTaskIds.add(t.id);
        tasks.push(t);
      }
    });

    const habitsMap = await HabitRepository.getHabits(fId);
    Object.values(habitsMap).forEach((h) => {
      if (h.archivedAt && !seenHabitIds.has(h.id)) {
        seenHabitIds.add(h.id);
        habits.push(h);
      }
    });

    const checklistsMap = await ChecklistRepository.getChecklists(fId);
    Object.values(checklistsMap).forEach((c) => {
      if (c.archivedAt && !seenChecklistIds.has(c.id)) {
        seenChecklistIds.add(c.id);
        checklists.push(c);
      }
    });

    const resourcesMap = await ResourceRepository.getResources(fId);
    Object.values(resourcesMap).forEach((r) => {
      if (r.archivedAt && !seenResourceIds.has(r.id)) {
        seenResourceIds.add(r.id);
        resources.push(r);
      }
    });
  }

  return {
    tasks,
    habits,
    checklists,
    workspaces: archWorkspaces,
    resources,
    workspaceNames,
  };
}

export default function ArchiveScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const isDark = !isLight;
  const { showToast } = useUndo();

  const [loading, setLoading] = useState(true);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [archivedChecklists, setArchivedChecklists] = useState<Checklist[]>([]);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<Workspace[]>([]);
  const [archivedResources, setArchivedResources] = useState<Resource[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({});

  const [activeTab, setActiveTab] = useState<ArchiveCategory>("task");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const applyData = (data: ArchivedData) => {
    setWorkspaces(data.workspaceNames);
    setArchivedTasks(data.tasks);
    setArchivedHabits(data.habits);
    setArchivedChecklists(data.checklists);
    setArchivedWorkspaces(data.workspaces);
    setArchivedResources(data.resources);
  };

  const loadArchivedData = async () => {
    try {
      const data = await fetchArchivedData();
      applyData(data);
    } catch (e) {
      console.warn("Failed to load archived items", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchArchivedData()
      .then((data) => {
        if (isMounted) {
          applyData(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.warn("Failed to load archived items", e);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRestore = async (
    item: any,
    type: ArchiveCategory,
  ) => {
    try {
      const wsId = item.workspaceId || INBOX_WORKSPACE_ID;
      if (type === "workspace") {
        await EntityCommandService.restoreWorkspaceArchive(item.id);
      } else {
        const isTask = type === "task";
        const updatedItem = {
          ...item,
          archivedAt: undefined,
          lastUpdated: getDateKey(),
        };

        if (isTask) {
          delete updatedItem.scheduledDate;
          delete updatedItem.dueDate;
        }

        delete updatedItem.reminderHour;
        delete updatedItem.reminderMinute;
        delete updatedItem.reminderDays;

        if (type === "task") {
          await EntityCommandService.updateTask(updatedItem.id, wsId, updatedItem);
        } else if (type === "habit") {
          await EntityCommandService.updateHabit(updatedItem.id, wsId, updatedItem);
        } else if (type === "checklist") {
          await EntityCommandService.updateChecklist(updatedItem.id, wsId, updatedItem);
        } else if (type === "resource") {
          await EntityCommandService.updateResource(updatedItem.id, wsId, updatedItem);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      showToast(`Restored "${item.title || item.name}"`);
      loadArchivedData();
    } catch (e) {
      console.warn("Failed to restore item", e);
    }
  };

  const handleDeletePermanently = (
    item: any,
    type: ArchiveCategory,
  ) => {
    const itemTitle = item.title || item.name || "Item";
    const typeLabel =
      type === "task"
        ? "Task"
        : type === "habit"
          ? "Habit"
          : type === "checklist"
            ? "Checklist"
            : type === "workspace"
              ? "Workspace"
              : "Resource";

    Alert.alert(
      "Delete Permanently",
      `Are you sure you want to permanently delete this ${typeLabel}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const wsId = item.workspaceId || INBOX_WORKSPACE_ID;

              if (type === "task") {
                await EntityCommandService.permanentlyDeleteTask(item.id, wsId, {
                  skipEvents: true,
                  skipAnalytics: true,
                });
              } else if (type === "habit") {
                await EntityCommandService.permanentlyDeleteHabit(item.id, wsId, {
                  skipEvents: true,
                  skipAnalytics: true,
                });
              } else if (type === "checklist") {
                await EntityCommandService.permanentlyDeleteChecklist(item.id, wsId, {
                  skipEvents: true,
                  skipAnalytics: true,
                });
              } else if (type === "resource") {
                await EntityCommandService.permanentlyDeleteResource(item.id, wsId, {
                  skipEvents: true,
                  skipAnalytics: true,
                });
              } else if (type === "workspace") {
                await EntityCommandService.permanentlyDeleteWorkspace(item.id, {
                  skipEvents: true,
                  skipAnalytics: true,
                });
              }

              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              ).catch(() => {});

              if (type === "task") emitStateChange("tasks_changed");
              else if (type === "habit") emitStateChange("habits_changed");
              else if (type === "checklist") emitStateChange("checklists_changed");
              else if (type === "resource") emitStateChange("resources_changed");
              else if (type === "workspace") emitStateChange("workspace_changed");

              showToast(`Permanently deleted "${itemTitle}"`);
              loadArchivedData();
            } catch (e) {
              console.warn("Failed to delete item permanently", e);
            }
          },
        },
      ],
    );
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    return {
      task: archivedTasks.length,
      habit: archivedHabits.length,
      checklist: archivedChecklists.length,
      workspace: archivedWorkspaces.length,
      resource: archivedResources.length,
    };
  }, [
    archivedTasks.length,
    archivedHabits.length,
    archivedChecklists.length,
    archivedWorkspaces.length,
    archivedResources.length,
  ]);

  const totalItems = useMemo(() => {
    return Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  }, [categoryCounts]);

  const activeCategoryCount = useMemo(() => {
    return Object.values(categoryCounts).filter((c) => c > 0).length;
  }, [categoryCounts]);

  const currentCategoryMeta = CATEGORIES.find((c) => c.key === activeTab);

  const subtitleText = useMemo(() => {
    if (totalItems === 0) {
      return "0 items archived";
    }
    if (totalItems === 1) {
      const activeEntry = Object.entries(categoryCounts).find(
        ([, count]) => count === 1,
      );
      const catKey = activeEntry ? activeEntry[0] : "item";
      const cat = CATEGORIES.find((c) => c.key === catKey);
      const catLabel = cat ? cat.label.slice(0, -1).toLowerCase() : "item";
      return `1 archived ${catLabel} in Archive`;
    }
    return `${totalItems} items across ${activeCategoryCount || 5} categories`;
  }, [totalItems, categoryCounts, activeCategoryCount]);

  // Current tab items with normalized type field
  const currentCategoryItems = useMemo(() => {
    switch (activeTab) {
      case "task":
        return archivedTasks.map((t) => ({ ...t, entityType: "task" as const }));
      case "habit":
        return archivedHabits.map((h) => ({ ...h, entityType: "habit" as const }));
      case "checklist":
        return archivedChecklists.map((c) => ({
          ...c,
          entityType: "checklist" as const,
        }));
      case "workspace":
        return archivedWorkspaces.map((w) => ({
          ...w,
          entityType: "workspace" as const,
        }));
      case "resource":
        return archivedResources.map((r) => ({
          ...r,
          entityType: "resource" as const,
        }));
    }
  }, [
    activeTab,
    archivedTasks,
    archivedHabits,
    archivedChecklists,
    archivedWorkspaces,
    archivedResources,
  ]);

  // Search filter
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return currentCategoryItems;
    const query = searchQuery.toLowerCase().trim();
    return currentCategoryItems.filter((i: any) => {
      const title = (i.title || i.name || "").toLowerCase();
      const notes = (i.notes || i.description || i.content || "").toLowerCase();
      return title.includes(query) || notes.includes(query);
    });
  }, [currentCategoryItems, searchQuery]);

  // Sorting
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortOrder === "newest") {
      return list.sort(
        (a: any, b: any) =>
          (Number(b.archivedAt) || 0) - (Number(a.archivedAt) || 0),
      );
    }
    if (sortOrder === "oldest") {
      return list.sort(
        (a: any, b: any) =>
          (Number(a.archivedAt) || 0) - (Number(b.archivedAt) || 0),
      );
    }
    if (sortOrder === "title") {
      return list.sort((a: any, b: any) => {
        const titleA = a.title || a.name || "";
        const titleB = b.title || b.name || "";
        return titleA.localeCompare(titleB);
      });
    }
    return list;
  }, [filteredItems, sortOrder]);

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

  const handleRestoreAll = () => {
    if (sortedItems.length === 0) return;
    const cat = CATEGORIES.find((c) => c.key === activeTab);
    const catName = cat?.label.toLowerCase() || "items";

    Alert.alert(
      "Restore All",
      `Are you sure you want to restore all ${sortedItems.length} ${catName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore All",
          onPress: async () => {
            try {
              for (const item of sortedItems) {
                await handleRestore(item, item.entityType);
              }
              showToast(`Restored ${sortedItems.length} ${catName}`);
            } catch (e) {
              console.warn("Failed to restore all", e);
            }
          },
        },
      ],
    );
  };

  const renderCategoryPill = (cat: CategoryMeta) => {
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
      {/* ─── 1. Fixed Top Action Row ───────────────────────────────────────── */}
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
      </View>

      {/* ─── Scrollable Content ───────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── 2. Prominent Heading & Summary ───────────────────────────────── */}
        <View style={styles.titleWrapper}>
          <Text
            accessibilityRole="header"
            style={[styles.screenTitle, { color: colors.text }]}
          >
            Archive
          </Text>
          <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
            {subtitleText}
          </Text>
        </View>

        {/* ─── 3. Search Bar ────────────────────────────────────────────────── */}
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
              placeholder="Search archived items..."
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search archived items"
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

        {/* ─── 4. Horizontal Category Filter Pills ─────────────────────────── */}
        <View style={styles.categoriesWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScrollContent}
            accessibilityRole="tablist"
          >
            {CATEGORIES.map((cat) => renderCategoryPill(cat))}
          </ScrollView>
        </View>

        {/* ─── 5. List Controls Row ─────────────────────────────────────────── */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={handleToggleSort}
            accessibilityRole="button"
            accessibilityLabel={`Sort order: ${
              sortOrder === "newest"
                ? "Newest"
                : sortOrder === "oldest"
                  ? "Oldest"
                  : "Title"
            }`}
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
              {`Archived: ${
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

          {sortedItems.length > 0 ? (
            <TouchableOpacity
              style={[
                styles.restoreAllBtn,
                {
                  backgroundColor: isDark
                    ? "rgba(53, 131, 102, 0.16)"
                    : "rgba(44, 108, 84, 0.12)",
                  borderColor: isDark
                    ? "rgba(68, 167, 130, 0.45)"
                    : colors.primary,
                },
              ]}
              onPress={handleRestoreAll}
              accessibilityRole="button"
              accessibilityLabel={`Restore all ${sortedItems.length} archived ${
                currentCategoryMeta?.label.toLowerCase() || "items"
              }`}
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
                Restore All ({sortedItems.length})
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.itemCountText, { color: colors.textMuted }]}>
              0 items
            </Text>
          )}
        </View>

        {/* ─── 6. Archived Items List / Empty State ─────────────────────────── */}
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
                  : currentCategoryMeta?.icon || "archive"
              }
              size={36}
              color={colors.textMuted}
              style={{ marginBottom: 12, opacity: 0.6 }}
            />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
              {searchQuery.trim()
                ? "No matching archived items"
                : totalItems === 0
                  ? "Archive is empty"
                  : `No archived ${
                      currentCategoryMeta?.label.toLowerCase() ||
                      activeTab + "s"
                    }`}
            </Text>
            <Text
              style={[styles.emptyStateSubtitle, { color: colors.textMuted }]}
            >
              {searchQuery.trim()
                ? `No archived items match "${searchQuery}". Try a different keyword.`
                : totalItems === 0
                  ? "Completed or archived items will appear here for long-term safe-keeping."
                  : `There are currently no archived ${
                      currentCategoryMeta?.label.toLowerCase() ||
                      activeTab + "s"
                    } in the archive.`}
            </Text>
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Clear search filter"
                style={[
                  styles.clearFilterBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.cardLight,
                  },
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
            {sortedItems.map((item: any) => {
              const itemTitle = item.title || item.name || "Untitled";
              const subtitle = item.description || item.notes || item.content;
              const badges = getItemMetaBadges(item, item.entityType, workspaces);
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
                      onPress={() => handleRestore(item, item.entityType)}
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
                      onPress={() =>
                        handleDeletePermanently(item, item.entityType)
                      }
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

        {/* ─── 7. Long-Term Retention Policy Card ───────────────────────────── */}
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
              Long-Term Archive Storage
            </Text>
          </View>
          <Text
            style={[styles.retentionDescription, { color: colors.textMuted }]}
          >
            Archived items are preserved indefinitely and kept out of your active day. You can restore them to your workspaces anytime or permanently delete them.
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
