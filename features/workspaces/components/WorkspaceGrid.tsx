import React from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Pressable,
} from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Workspace, Task, type Checklist } from "@/shared/types/domain.types";
import { isTaskCompleted, isHabitCompletedToday } from "@/shared/utils/domain-selectors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface WorkspaceGridProps {
  lists: Workspace[];
  todos: Record<string, Task[]>;
  habits: any[];
  collections?: Record<string, any[]>;
  checklists?: Record<string, Checklist[]>;
  searchQuery: string;
  isHydrated?: boolean;
  onSelectWorkspace: (id: string) => void;
  onEditWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
}

export function WorkspaceGrid({
  lists,
  todos,
  habits,
  collections,
  checklists,
  searchQuery,
  isHydrated = true,
  onSelectWorkspace,
  onEditWorkspace,
  onCreateWorkspace,
}: WorkspaceGridProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  if (!isHydrated && lists.length === 0) {
    const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const borderCol = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    return (
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {[1, 2, 3].map((key) => (
            <View key={key} style={gridStyles.workspaceGridCard}>
              <View
                style={{
                  position: "absolute",
                  top: -11,
                  left: 16,
                  width: "45%",
                  height: 12,
                  backgroundColor: borderCol,
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  zIndex: 2,
                }}
              />
              <View
                style={[
                  gridStyles.cardContainer,
                  {
                    borderColor: borderCol,
                    backgroundColor: cardBg,
                    opacity: 0.7,
                  },
                ]}
              >
                <View style={gridStyles.topRow}>
                  <View style={[gridStyles.iconWrapper, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]} />
                </View>
                <View style={gridStyles.detailsBlock}>
                  <View style={{ width: "60%", height: 16, borderRadius: 4, backgroundColor: borderCol, marginBottom: 8 }} />
                  <View style={{ width: "85%", height: 12, borderRadius: 4, backgroundColor: borderCol }} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const showInbox = searchQuery.trim() === "" || "inbox".includes(searchQuery.toLowerCase());
  
  // Counts for Inbox
  const inboxCollections = collections ? (collections["unassigned"] || []) : [];
  const inboxRefsCount = inboxCollections.reduce(
    (sum: number, c: any) => sum + (c.items ? c.items.filter((i: any) => !i.archived).length : 0),
    0
  );
  const inboxTasks = todos["unassigned"] ?? [];
  const inboxActiveTasksCount = inboxTasks.filter((t) => !isTaskCompleted(t)).length;
  const inboxHabits = habits ? habits.filter((h) => h.workspaceId === "unassigned") : [];
  const inboxActiveHabitsCount = inboxHabits.filter((h) => !isHabitCompletedToday(h)).length;
  const inboxChecklists = checklists ? (checklists["unassigned"] || []) : [];
  const inboxChecklistsCount = inboxChecklists.filter((c) => !c.archivedAt).length;

  const activeLists = lists.filter((l) => !(l as any).archived);
  const filteredLists =
    searchQuery.trim() === ""
      ? activeLists
      : activeLists.filter((l) =>
          l.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  const getCardBgColor = (baseColor: string) => {
    if (isDark) {
      return `${baseColor}22`; // ~13% opacity of folder color over dark background
    } else {
      return `${baseColor}0C`; // ~5% opacity of folder color over light background
    }
  };

  const getBorderColor = (baseColor: string) => {
    if (isDark) {
      return `${baseColor}44`; // ~27% opacity for clean visible borders in dark mode
    } else {
      return `${baseColor}22`; // ~13% opacity in light mode
    }
  };

  const renderCountBadge = (iconName: string, count: number, activeColor: string, showLabel: boolean, label: string) => {
    if (count === 0) return null;
    return (
      <View 
        style={[
          gridStyles.countBadge, 
          { 
            borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", 
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)" 
          }
        ]}
      >
        <Feather name={iconName as any} size={11} color={activeColor} />
        <Text style={[gridStyles.countText, { color: isDark ? "#FFFFFF" : "#333333" }]}>
          {count}
          {showLabel ? ` ${count === 1 ? label : label + "s"}` : ""}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {showInbox && (
          <View style={gridStyles.workspaceGridCard}>
            {/* Nub */}
            <View
              style={{
                position: "absolute",
                top: -11,
                left: 16,
                width: "45%",
                height: 12,
                backgroundColor: colors.primary,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                zIndex: 2,
              }}
            />
            {/* Card Content Container */}
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSelectWorkspace("unassigned");
              }}
              haptic={true}
              style={gridStyles.cardPressable}
              contentStyle={[
                gridStyles.cardContainer, 
                { 
                  borderColor: getBorderColor(colors.primary), 
                  backgroundColor: isDark ? "#12131A" : "#FFFFFF" 
                }
              ]}
            >
              {/* Solid Background Color Overlay */}
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: getCardBgColor(colors.primary) }]} />

              {/* Top Row: Icon container (no absolute child edit button) */}
              <View style={gridStyles.topRow}>
                <View style={[gridStyles.iconWrapper, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.03)" }]}>
                  <Text style={{ fontSize: 24 }}>📥</Text>
                </View>
              </View>

              {/* Middle Row: Title & Description */}
              <View style={gridStyles.detailsBlock}>
                <Text style={[gridStyles.workspaceName, { color: isDark ? "#FFFFFF" : "#111111" }]} numberOfLines={1}>
                  Inbox
                </Text>
                <Text style={[gridStyles.workspaceDescription, { color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }]} numberOfLines={2}>
                  Quick capture of tasks and ideas.
                </Text>
              </View>

              {/* Bottom Row: Badge Counts */}
              <View style={gridStyles.countBadgeRow}>
                {renderCountBadge(
                  "check-square",
                  inboxActiveTasksCount,
                  colors.primary,
                  inboxActiveTasksCount > 0 && (inboxActiveHabitsCount === 0 && inboxChecklistsCount === 0 && inboxRefsCount === 0),
                  "task"
                )}
                {renderCountBadge("refresh-cw", inboxActiveHabitsCount, "#F59E0B", false, "habit")}
                {renderCountBadge("list", inboxChecklistsCount, "#10B981", false, "checklist")}
                {renderCountBadge("folder", inboxRefsCount, "#A855F7", false, "resource")}
              </View>
            </PressableScale>

            {/* Absolute Sibling Edit Menu Trigger */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onEditWorkspace("unassigned");
              }}
              style={gridStyles.moreButtonAbsolute}
              hitSlop={15}
            >
              <Feather name="more-horizontal" size={20} color={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.4)"} />
            </Pressable>
          </View>
        )}

        {filteredLists.map((folder) => {
          const folderColor = folder.color || "#6366F1";
          const folderTasks = todos[folder.id] ?? [];
          const activeCount = folderTasks.filter((t) => !isTaskCompleted(t)).length;
          
          const folderHabits = habits ? habits.filter((h) => h.workspaceId === folder.id) : [];
          const habitCount = folderHabits.filter((h) => !isHabitCompletedToday(h)).length;

          const folderCollections = collections ? (collections[folder.id] || []) : [];
          const resourceCount = folderCollections.reduce(
            (sum: number, col: any) => sum + (col.items ? col.items.filter((i: any) => !i.archivedAt).length : 0),
            0
          );

          const folderChecklists = checklists ? (checklists[folder.id] || []) : [];
          const checklistCount = folderChecklists.filter((c) => !c.archivedAt).length;

          // Compute if we should show badge labels
          const totalActiveBadges = (activeCount > 0 ? 1 : 0) + (habitCount > 0 ? 1 : 0) + (checklistCount > 0 ? 1 : 0) + (resourceCount > 0 ? 1 : 0);
          const showLabel = totalActiveBadges <= 1;

          // Default descriptions mapping to match the mock
          const defaultDescription = folder.name.toLowerCase() === "my pebbles" 
            ? "Your main workspace for getting things done." 
            : folder.name.toLowerCase() === "devops" 
              ? "Tasks and notes for devops activities." 
              : `Tasks and notes for ${folder.name.toLowerCase()} activities.`;

          const descriptionText = folder.description || defaultDescription;

          return (
            <View key={folder.id} style={gridStyles.workspaceGridCard}>
              {/* Nub */}
              <View
                style={{
                  position: "absolute",
                  top: -11,
                  left: 16,
                  width: "45%",
                  height: 12,
                  backgroundColor: folderColor,
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  zIndex: 2,
                }}
              />
              {/* Card Content Container */}
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onSelectWorkspace(folder.id);
                }}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  onEditWorkspace(folder.id);
                }}
                haptic={true}
                style={gridStyles.cardPressable}
                contentStyle={[
                  gridStyles.cardContainer, 
                  { 
                    borderColor: getBorderColor(folderColor), 
                    backgroundColor: isDark ? "#12131A" : "#FFFFFF" 
                  }
                ]}
              >
                {/* Solid Background Color Overlay */}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: getCardBgColor(folderColor) }]} />

                {/* Top Row: Icon on left */}
                <View style={gridStyles.topRow}>
                  <View style={[gridStyles.iconWrapper, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.03)" }]}>
                    <Text style={{ fontSize: 24 }}>{folder.emoji || "📁"}</Text>
                  </View>
                </View>

                {/* Middle Row: Title & Description */}
                <View style={gridStyles.detailsBlock}>
                  <Text style={[gridStyles.workspaceName, { color: isDark ? "#FFFFFF" : "#111111" }]} numberOfLines={1}>
                    {folder.name}
                  </Text>
                  <Text style={[gridStyles.workspaceDescription, { color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }]} numberOfLines={2}>
                    {descriptionText}
                  </Text>
                </View>

                {/* Bottom Row: Badge Counts */}
                <View style={gridStyles.countBadgeRow}>
                  {renderCountBadge("check-square", activeCount, folderColor, showLabel, "task")}
                  {renderCountBadge("refresh-cw", habitCount, "#F59E0B", showLabel, "habit")}
                  {renderCountBadge("list", checklistCount, "#10B981", showLabel, "checklist")}
                  {renderCountBadge("folder", resourceCount, "#A855F7", showLabel, "resource")}
                </View>
              </PressableScale>

              {/* Absolute Sibling Edit Menu Trigger */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onEditWorkspace(folder.id);
                }}
                style={gridStyles.moreButtonAbsolute}
                hitSlop={15}
              >
                <Feather name="more-horizontal" size={20} color={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.4)"} />
              </Pressable>
            </View>
          );
        })}

        {/* Add New Workspace */}
        <PressableScale
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onCreateWorkspace();
          }}
          haptic={true}
          style={gridStyles.workspaceGridCard}
        >
          {/* Nub */}
          <View
            style={{
              position: "absolute",
              top: -11,
              left: 16,
              width: "45%",
              height: 12,
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
              borderBottomWidth: 0,
              zIndex: 2,
            }}
          />
          {/* Card Content Container */}
          <View
            style={[
              gridStyles.cardContainer,
              {
                borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                borderStyle: "dashed",
                backgroundColor: "transparent",
                justifyContent: "center",
                alignItems: "center",
                padding: 16,
                minHeight: 180,
              },
            ]}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: `${colors.primary}18`,
                borderWidth: 1.5,
                borderColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Feather name="plus" size={22} color={colors.primary} />
            </View>
            <Text
              style={{
                color: colors.primary,
                fontWeight: "800",
                fontSize: 14,
                letterSpacing: -0.2,
                marginBottom: 4,
              }}
            >
              New Workspace
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: "500",
                textAlign: "center",
                lineHeight: 15,
                paddingHorizontal: 8,
              }}
              numberOfLines={2}
            >
              Create a new folder to organize better.
            </Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  workspaceGridCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    marginTop: 18,
    position: "relative",
  },
  cardPressable: {
    width: "100%",
  },
  cardContainer: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: "hidden",
    width: "100%",
    minHeight: 180,
    padding: 14,
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
      }
    }),
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  moreButtonAbsolute: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  detailsBlock: {
    marginTop: 14,
    flex: 1,
    justifyContent: "center",
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  workspaceDescription: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  countBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 12,
    alignItems: "center",
    width: "100%",
  },
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
