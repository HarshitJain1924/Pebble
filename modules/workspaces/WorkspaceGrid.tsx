import React from "react";
import {
  View,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type TaskList, type Todo } from "../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

interface WorkspaceGridProps {
  lists: TaskList[];
  todos: Record<string, Todo[]>;
  searchQuery: string;
  onSelectWorkspace: (id: string) => void;
  onEditWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
}

export function WorkspaceGrid({
  lists,
  todos,
  searchQuery,
  onSelectWorkspace,
  onEditWorkspace,
  onCreateWorkspace,
}: WorkspaceGridProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  const filteredLists =
    searchQuery.trim() === ""
      ? lists
      : lists.filter((l) =>
          l.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  return (
    <View style={{ flex: 1, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {filteredLists.map((folder) => {
          const folderColor = folder.color || "#6366F1";
          const folderTasks = todos[folder.id] ?? [];
          const activeCount = folderTasks.filter((t) => !t.completed).length;
          const todayStr = getDateKey();
          const dueTodayCount = folderTasks.filter(
            (t) => !t.completed && t.scheduledDate === todayStr,
          ).length;

          // Derive a slightly darker shade for depth
          const darkerShade = folderColor + "CC";

          return (
            <TouchableOpacity
              key={folder.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSelectWorkspace(folder.id);
              }}
              delayPressIn={80}
              activeOpacity={0.88}
              style={gridStyles.workspaceGridCard}
            >
              {/* ── Folder tab (small nub top-left) ── */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "55%",
                  height: 10,
                  backgroundColor: darkerShade,
                  borderTopLeftRadius: 18,
                  borderTopRightRadius: 14,
                  zIndex: 2,
                }}
              />

              {/* ── Folder body (top colored section) ── */}
              <View
                style={{
                  backgroundColor: folderColor,
                  paddingTop: 18,
                  paddingBottom: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  minHeight: 88,
                }}
              >
                {/* Emoji / icon */}
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: "rgba(255,255,255,0.22)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {folder.iconType === "icon" && folder.icon ? (
                    <Feather name={folder.icon as any} size={24} color="#fff" />
                  ) : (
                    <Text style={{ fontSize: 26 }}>{folder.emoji || "📁"}</Text>
                  )}
                </View>
              </View>

              {/* ── Footer (name + count) ── */}
              <View
                style={{
                  backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  gap: 2,
                }}
              >
                <Text
                  style={[
                    gridStyles.workspaceName,
                    { color: isDark ? "#FFFFFF" : "#111111" },
                  ]}
                  numberOfLines={1}
                >
                  {folder.name}
                </Text>
                {dueTodayCount > 0 ? (
                  <Text style={[gridStyles.workspaceCount, { color: "#EF4444" }]}>
                    {dueTodayCount} due today
                  </Text>
                ) : (
                  <Text
                    style={[
                      gridStyles.workspaceCount,
                      {
                        color: isDark
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(0,0,0,0.4)",
                      },
                    ]}
                  >
                    {activeCount} task{activeCount !== 1 ? "s" : ""}
                  </Text>
                )}
              </View>

              {/* Edit button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onEditWorkspace(folder.id);
                }}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 12,
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.25)",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10,
                }}
                hitSlop={10}
              >
                <Feather name="edit-3" size={13} color="#fff" />
              </Pressable>
            </TouchableOpacity>
          );
        })}

        {/* Add New Workspace */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onCreateWorkspace();
          }}
          delayPressIn={80}
          activeOpacity={0.9}
          style={gridStyles.workspaceGridCard}
        >
          {/* Tab nub placeholder */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "55%",
              height: 10,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 14,
            }}
          />
          {/* Dashed folder body */}
          <View
            style={{
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: isDark
                ? "rgba(255,255,255,0.15)"
                : "rgba(0,0,0,0.15)",
              borderRadius: 16,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 28,
              gap: 10,
              marginTop: 8,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: `${colors.primary}18`,
                borderWidth: 1.5,
                borderColor: colors.primary,
                borderStyle: "dashed",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="plus" size={22} color={colors.primary} />
            </View>
            <Text
              style={{
                color: colors.primary,
                fontWeight: "800",
                fontSize: 13,
                letterSpacing: -0.2,
              }}
            >
              New Folder
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  workspaceGridCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    minHeight: 140,
  },
  workspaceName: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  workspaceCount: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
