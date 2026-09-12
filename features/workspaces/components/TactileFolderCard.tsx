import React from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  Dimensions,
} from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Workspace, Task } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
export const FOLDER_CARD_WIDTH = (SCREEN_WIDTH - 44) / 2;
export const FOLDER_CARD_HEIGHT = 185;
export const FOLDER_POCKET_HEIGHT = 92;

interface TactileFolderCardProps {
  workspace: Workspace;
  tasks: Task[];
  habitCount?: number;
  checklistCount?: number;
  resourceCount?: number;
  onSelectWorkspace: (id: string) => void;
  onEditWorkspace: (id: string) => void;
}

interface InventoryEntry {
  key: string;
  label: string;
  count: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

export const TactileFolderCard: React.FC<TactileFolderCardProps> = ({
  workspace,
  tasks,
  habitCount = 0,
  checklistCount = 0,
  resourceCount = 0,
  onSelectWorkspace,
  onEditWorkspace,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = Colors[colorScheme ?? "dark"];

  const workspaceColor = workspace.color || "#4F46E5";

  // Item computations
  const pendingTasks = tasks.filter((t) => !isTaskCompleted(t));
  const activeCount = pendingTasks.length;
  const totalItemCount = activeCount + habitCount + checklistCount + resourceCount;

  // Build the breakdown of inventory contained in this folder
  const inventoryItems: InventoryEntry[] = React.useMemo(() => {
    const list: InventoryEntry[] = [];
    if (activeCount > 0) {
      list.push({
        key: "tasks",
        label: activeCount === 1 ? "Task" : "Tasks",
        count: activeCount,
        icon: "check-square",
        color: workspaceColor,
      });
    }
    if (habitCount > 0) {
      list.push({
        key: "habits",
        label: habitCount === 1 ? "Habit" : "Habits",
        count: habitCount,
        icon: "repeat",
        color: "#F59E0B",
      });
    }
    if (checklistCount > 0) {
      list.push({
        key: "checklists",
        label: checklistCount === 1 ? "List" : "Lists",
        count: checklistCount,
        icon: "list",
        color: "#10B981",
      });
    }
    if (resourceCount > 0) {
      list.push({
        key: "resources",
        label: resourceCount === 1 ? "Doc" : "Docs",
        count: resourceCount,
        icon: "paperclip",
        color: "#A855F7",
      });
    }
    return list;
  }, [activeCount, habitCount, checklistCount, resourceCount, workspaceColor]);

  // Subtitle text for front pocket
  const subtitle = React.useMemo(() => {
    if (totalItemCount === 0) return "0 items";
    return `${totalItemCount} ${totalItemCount === 1 ? "item" : "items"}`;
  }, [totalItemCount]);

  return (
    <View style={styles.wrapper}>
      {/* ─── LAYER 1: BACK FLAP FOLDER TAB (TOP-LEFT) ─── */}
      <View
        style={[
          styles.folderTab,
          {
            backgroundColor: workspaceColor,
          },
        ]}
      />

      {/* ─── MAIN TOUCHABLE ASSEMBLY (EXPLICIT DIMENSIONS FOR ANIMATED.VIEW) ─── */}
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onSelectWorkspace(workspace.id);
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onEditWorkspace(workspace.id);
        }}
        haptic={true}
        scaleTo={0.97}
        style={styles.pressableContainer}
        contentStyle={styles.contentContainer}
        accessibilityRole="button"
        accessibilityLabel={`Workspace ${workspace.name}, ${subtitle}`}
      >
        {/* ─── LAYER 1: BACK FLAP FULL BODY ─── */}
        <View
          style={[
            styles.backFlapBody,
            {
              backgroundColor: workspaceColor,
            },
          ]}
        >
          <View style={[StyleSheet.absoluteFillObject, styles.backFlapInnerShade]} />
        </View>

        {/* ─── LAYER 2: SLIP-IN NOTE CARD (PEEKING FROM POCKET) ─── */}
        <View
          style={[
            styles.slipCard,
            {
              backgroundColor: isDark ? "#171922" : "#FFFFFF",
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          {/* Header row on card */}
          <View style={styles.paperHeaderRow}>
            <Text
              style={[
                styles.paperHeaderLabel,
                { color: isDark ? "rgba(255,255,255,0.5)" : "#6B7280" },
              ]}
            >
              CONTENTS
            </Text>
            <View
              style={[
                styles.totalBadge,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <Text
                style={[
                  styles.totalBadgeText,
                  { color: isDark ? "#FFFFFF" : "#374151" },
                ]}
              >
                {totalItemCount}
              </Text>
            </View>
          </View>

          {/* Item Quantities Breakdown (Tasks, Habits, Checklists, Resources) */}
          {inventoryItems.length > 0 ? (
            <View style={styles.inventoryGrid}>
              {inventoryItems.map((item) => (
                <View
                  key={item.key}
                  style={[
                    styles.inventoryChip,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(0,0,0,0.03)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.05)",
                    },
                  ]}
                >
                  <Feather name={item.icon} size={10} color={item.color} />
                  <Text
                    style={[
                      styles.inventoryChipText,
                      { color: isDark ? "rgba(255,255,255,0.9)" : "#334155" },
                    ]}
                    numberOfLines={1}
                  >
                    {item.count} {item.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather
                name="inbox"
                size={14}
                color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
              />
              <Text
                style={[
                  styles.emptyText,
                  { color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" },
                ]}
              >
                Empty folder
              </Text>
            </View>
          )}
        </View>

        {/* ─── LAYER 3: FRONT POCKET FLAP (BOTTOM HALF POCKET) ─── */}
        <View
          style={[
            styles.frontPocket,
            {
              backgroundColor: workspaceColor,
            },
          ]}
        >
          {/* Subtle top bevel rim highlight */}
          <View style={styles.pocketTopRimHighlight} />
          <View style={styles.pocketInnerShading} />

          {/* Front Pocket Content */}
          <View style={styles.frontPocketContent}>
            <View style={styles.titleColumn}>
              <View style={styles.nameRow}>
                {workspace.emoji ? (
                  <Text style={styles.workspaceEmoji}>{workspace.emoji}</Text>
                ) : null}
                <Text style={styles.workspaceTitle} numberOfLines={1}>
                  {workspace.name}
                </Text>
              </View>
              <Text style={styles.workspaceSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
        </View>
      </PressableScale>

      {/* ─── QUICK ACTION SETTINGS BUTTON (SIBLING FOR UNBLOCKED TOUCH) ─── */}
      <View style={styles.actionButtonContainer}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onEditWorkspace(workspace.id);
          }}
          style={styles.actionIconButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Workspace settings"
        >
          <Feather name="settings" size={14} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: FOLDER_CARD_WIDTH,
    height: FOLDER_CARD_HEIGHT,
    marginTop: 18,
    position: "relative",
  },
  folderTab: {
    position: "absolute",
    top: -11,
    left: 14,
    width: "48%",
    height: 14,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    zIndex: 1,
  },
  pressableContainer: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  backFlapBody: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
    overflow: "hidden",
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
      },
    }),
  },
  backFlapInnerShade: {
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  slipCard: {
    position: "absolute",
    top: 6,
    left: 8,
    right: 8,
    height: 125,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
      },
    }),
  },
  paperHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  paperHeaderLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  totalBadge: {
    paddingHorizontal: 5.5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  totalBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  inventoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "space-between",
  },
  inventoryChip: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
    paddingHorizontal: 5,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  inventoryChipText: {
    fontSize: 9.5,
    fontWeight: "600",
    flex: 1,
  },
  emptyContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 14,
  },
  emptyText: {
    fontSize: 10,
    fontWeight: "500",
    fontStyle: "italic",
  },
  frontPocket: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FOLDER_POCKET_HEIGHT,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    zIndex: 3,
    overflow: "hidden",
    justifyContent: "flex-end",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.16,
        shadowRadius: 5,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 -3px 8px rgba(0,0,0,0.14)",
      },
    }),
  },
  pocketTopRimHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  pocketInnerShading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  frontPocketContent: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 8,
  },
  titleColumn: {
    paddingRight: 32,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  workspaceEmoji: {
    fontSize: 15,
  },
  workspaceTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  workspaceSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.74)",
  },
  actionButtonContainer: {
    position: "absolute",
    bottom: 12,
    right: 12,
    zIndex: 10,
  },
  actionIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
});
