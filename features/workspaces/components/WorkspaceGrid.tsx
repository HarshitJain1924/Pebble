import React from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Workspace, Task, type Checklist } from "@/shared/types/domain.types";
import { TactileFolderCard } from "./TactileFolderCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 44) / 2;

interface WorkspaceGridProps {
  workspaces: Workspace[];
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
  workspaces,
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

  const activeWorkspaces = workspaces.filter((w) => !w.archivedAt);
  const filteredWorkspaces =
    searchQuery.trim() === ""
      ? activeWorkspaces
      : activeWorkspaces.filter((w) =>
          w.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  if (!isHydrated && workspaces.length === 0) {
    const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const borderCol = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

    return (
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {[1, 2, 3].map((key) => (
            <View
              key={key}
              style={{
                width: CARD_WIDTH,
                height: 185,
                marginTop: 18,
                position: "relative",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  top: -11,
                  left: 14,
                  width: "48%",
                  height: 14,
                  backgroundColor: borderCol,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  zIndex: 1,
                }}
              />
              <View
                style={[
                  gridStyles.cardContainer,
                  {
                    width: "100%",
                    height: "100%",
                    borderColor: borderCol,
                    backgroundColor: cardBg,
                    opacity: 0.7,
                    borderRadius: 22,
                  },
                ]}
              >
                <View style={gridStyles.topRow}>
                  <View
                    style={[
                      gridStyles.iconWrapper,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.05)",
                      },
                    ]}
                  />
                </View>
                <View style={gridStyles.detailsBlock}>
                  <View
                    style={{
                      width: "60%",
                      height: 14,
                      borderRadius: 4,
                      backgroundColor: borderCol,
                      marginBottom: 8,
                    }}
                  />
                  <View
                    style={{
                      width: "80%",
                      height: 11,
                      borderRadius: 4,
                      backgroundColor: borderCol,
                    }}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingVertical: 10 }}>
      {/* Workspaces Section Header */}
      <View style={gridStyles.headerBar}>
        <Text style={[gridStyles.sectionLabel, { color: colors.textMuted }]}>
          {filteredWorkspaces.length}{" "}
          {filteredWorkspaces.length === 1 ? "WORKSPACE" : "WORKSPACES"}
        </Text>
      </View>

      {/* 2-Column Workspaces Grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {filteredWorkspaces.map((workspace) => {
          const workspaceTasks = todos[workspace.id] ?? [];
          const workspaceHabits = habits
            ? habits.filter((h) => h.workspaceId === workspace.id)
            : [];
          const workspaceCollections = collections
            ? collections[workspace.id] || []
            : [];
          const resourceCount = workspaceCollections.reduce(
            (sum: number, col: any) =>
              sum + (col.items ? col.items.filter((i: any) => !i.archivedAt).length : 0),
            0
          );
          const workspaceChecklists = checklists
            ? checklists[workspace.id] || []
            : [];
          const checklistCount = workspaceChecklists.filter((c) => !c.archivedAt).length;

          return (
            <TactileFolderCard
              key={workspace.id}
              workspace={workspace}
              tasks={workspaceTasks}
              habitCount={workspaceHabits.length}
              checklistCount={checklistCount}
              resourceCount={resourceCount}
              onSelectWorkspace={onSelectWorkspace}
              onEditWorkspace={onEditWorkspace}
            />
          );
        })}

        {/* Add New Workspace Card */}
        <View style={[gridStyles.newWorkspaceWrapper, { width: CARD_WIDTH }]}>
          {/* Nub */}
          <View
            style={{
              position: "absolute",
              top: -11,
              left: 14,
              width: "48%",
              height: 14,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.03)",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderWidth: 1.5,
              borderColor: isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.08)",
              borderBottomWidth: 0,
              borderStyle: "dashed",
              zIndex: 1,
            }}
          />
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onCreateWorkspace();
            }}
            haptic={true}
            style={{ width: "100%", height: "100%" }}
            contentStyle={[
              gridStyles.cardContainer,
              {
                width: "100%",
                height: "100%",
                borderColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)",
                borderStyle: "dashed",
                borderWidth: 1.5,
                backgroundColor: "transparent",
                justifyContent: "center",
                alignItems: "center",
                padding: 16,
                borderRadius: 22,
              },
            ]}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: `${colors.primary}18`,
                borderWidth: 1.5,
                borderColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Feather name="plus" size={20} color={colors.primary} />
            </View>
            <Text
              style={{
                color: colors.primary,
                fontWeight: "800",
                fontSize: 13,
                letterSpacing: -0.2,
                marginBottom: 2,
              }}
            >
              New Folder
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "500",
                textAlign: "center",
                lineHeight: 14,
                paddingHorizontal: 4,
              }}
              numberOfLines={2}
            >
              Create workspace
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  headerBar: {
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  newWorkspaceWrapper: {
    height: 185,
    marginTop: 18,
    position: "relative",
  },
  cardContainer: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    width: "100%",
    padding: 14,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  detailsBlock: {
    marginTop: 14,
    flex: 1,
    justifyContent: "center",
  },
});
