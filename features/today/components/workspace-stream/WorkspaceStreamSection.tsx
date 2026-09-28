import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { type Router } from "expo-router";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import { Radius } from "@/shared/constants/radii";
import { Palette, type ThemeColors } from "@/shared/constants/theme";
import type { Checklist, Habit, Task } from "@/shared/types/domain.types";
import type {
  WorkspaceStreamSection as WorkspaceStreamSectionModel,
  WorkspaceStreamStateTone,
} from "@/features/today/hooks/useWorkspaceStream";
import { getStreamResourcePalette } from "@/features/today/utils/resource-presentation";
import {
  getCheckboxAction,
  getRowContentAction,
} from "@/features/today/utils/today-interactions";
import { WorkspaceItemRow } from "./WorkspaceItemRow";

export interface WorkspaceStreamSectionProps {
  section: WorkspaceStreamSectionModel;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  hasTabs: boolean;
  isCollapsed: boolean;
  onToggleCollapse: (workspaceId: string) => void;
  onOpenWorkspace: (workspaceId: string, segment?: string) => void;
  onOpenAllWork: () => void;
  router: Router;
  expandedChecklistIds: Record<string, boolean>;
  setExpandedChecklistIds: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  completeTodoFromDashboard: (
    todoId: string,
    event?: any,
    workspaceId?: string,
  ) => Promise<void>;
  completeHabitFromDashboard: (
    habitId: string,
    event?: any,
    workspaceId?: string,
  ) => Promise<void>;
  toggleChecklistItemFromDashboard: (
    checklistId: string,
    itemId: string,
    workspaceId: string,
  ) => Promise<void>;
}

/**
 * One workspace drawer of the Today stream: identity header, point-of-view
 * state line, completion ring, prepared item rows, resource strip and the
 * "+N more" preview gateway.
 *
 * It renders the prepared `WorkspaceStreamSection` model and owns only the
 * interactions that are local to a drawer (collapse, checklist expansion).
 */
export const WorkspaceStreamSection: React.FC<WorkspaceStreamSectionProps> = ({
  section,
  colors,
  colorScheme,
  hasTabs,
  isCollapsed,
  onToggleCollapse,
  onOpenWorkspace,
  onOpenAllWork,
  router,
  expandedChecklistIds,
  setExpandedChecklistIds,
  completeTodoFromDashboard,
  completeHabitFromDashboard,
  toggleChecklistItemFromDashboard,
}) => {
  const isDark = colorScheme !== "light";
  const streamColors = React.useMemo(
    () => getStreamResourcePalette(isDark),
    [isDark],
  );

  const {
    workspace,
    displayName,
    isAggregate,
    workspaceColor,
    totalItems,
    completedItems,
    progress,
    stateText,
    stateTone,
    items,
    previewLimit,
    remainingCount,
    resources,
    resourcesTotal,
  } = section;

  const displayedItems = items.slice(0, previewLimit);
  const openCount = totalItems - completedItems;

  const toneColor = (tone: WorkspaceStreamStateTone) =>
    tone === "alert"
      ? colors.error
      : tone === "success"
        ? colors.success
        : colors.textMuted;

  const handleChecklistExpandToggle = (
    checklistId: string,
    isExpanded: boolean,
  ) => {
    setExpandedChecklistIds((prev) => ({
      ...prev,
      [checklistId]: !isExpanded,
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <View
      style={[
        styles.workspaceBody,
        hasTabs ? styles.workspaceBodyTabbed : styles.workspaceBodyStandalone,
        {
          // Must match the open tab's fill and stroke, or the seam shows.
          backgroundColor: isDark ? `${workspaceColor}0F` : `${workspaceColor}08`,
          borderColor: isDark ? `${workspaceColor}4A` : `${workspaceColor}30`,
        },
      ]}
    >
      {/* Header: identity, point of view, completion ring, one affordance */}
      <View
        style={[
          styles.cardHeaderRow,
          {
            borderBottomColor: isDark
              ? "rgba(255, 255, 255, 0.07)"
              : "rgba(0, 0, 0, 0.06)",
          },
        ]}
      >
        <PressableScale
          onPress={() => onOpenWorkspace(workspace.id)}
          haptic
          accessibilityRole="button"
          accessibilityLabel={`Open ${displayName}, ${completedItems} of ${totalItems} done. ${stateText}`}
          style={styles.headerMain}
          contentStyle={styles.headerMainContent}
        >
          <View
            style={[
              styles.headerSquircleBadge,
              {
                backgroundColor: isDark
                  ? `${workspaceColor}25`
                  : `${workspaceColor}16`,
                borderColor: isDark
                  ? `${workspaceColor}45`
                  : `${workspaceColor}2E`,
              },
            ]}
          >
            {isAggregate ? (
              <Feather name="layers" size={19} color={workspaceColor} />
            ) : workspace.iconType === "icon" ||
              (!workspace.emoji && workspace.icon) ? (
              <Feather
                name={(workspace.icon || "folder") as any}
                size={19}
                color={workspaceColor}
              />
            ) : (
              <Text style={styles.headerEmojiMark}>
                {workspace.emoji || "📁"}
              </Text>
            )}
          </View>

          <View style={styles.headerTextStack}>
            <Text
              style={[styles.workspaceNameText, { color: colors.text }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text
              style={[styles.stateText, { color: toneColor(stateTone) }]}
              numberOfLines={1}
            >
              {openCount > 0
                ? `${openCount} ${openCount === 1 ? "open item" : "open items"}`
                : stateText}
            </Text>
          </View>
        </PressableScale>

        {/* Progress ring carries completion in both states */}
        {totalItems > 0 && (
          <View style={styles.ringWrap}>
            <ProgressRing
              progress={progress}
              size={26}
              strokeWidth={2.5}
              showText={false}
              color={workspaceColor}
              trackColor={`${workspaceColor}26`}
            />
            {completedItems === totalItems && (
              <Feather
                name="check"
                size={11}
                color={workspaceColor}
                style={styles.ringCheck}
              />
            )}
          </View>
        )}

        <PressableScale
          onPress={() =>
            isAggregate ? onOpenAllWork() : onOpenWorkspace(workspace.id)
          }
          hitSlop={8}
          haptic
          accessibilityRole="button"
          accessibilityLabel={
            isAggregate ? "See all work" : `See all in ${workspace.name}`
          }
          style={styles.headerSeeAllBtn}
          contentStyle={styles.headerSeeAllContent}
        >
          <Text style={[styles.headerSeeAllText, { color: workspaceColor }]}>
            See all
          </Text>
          <Feather name="chevron-right" size={13} color={workspaceColor} />
        </PressableScale>

        <PressableScale
          onPress={() => onToggleCollapse(workspace.id)}
          hitSlop={10}
          haptic
          accessibilityRole="button"
          accessibilityLabel={
            isCollapsed
              ? `Expand ${workspace.name}`
              : `Collapse ${workspace.name}`
          }
          style={styles.headerChevronBtn}
        >
          <Feather
            name={isCollapsed ? "chevron-down" : "chevron-up"}
            size={16}
            color={colors.textMuted}
          />
        </PressableScale>
      </View>

      {!isCollapsed && (
        <View style={styles.sectionBody}>
          <View style={styles.itemsListWrap}>
            {displayedItems.map((item) => {
              if (item.type === "task") {
                const todo = item.original as Task;
                const checkboxAction = getCheckboxAction("task", item.completed);
                const contentAction = getRowContentAction("task", todo.id);

                return (
                  <WorkspaceItemRow
                    key={item.key}
                    type="task"
                    id={todo.id}
                    title={todo.title}
                    subtitle={item.subtitle}
                    workspaceName={isAggregate ? item.workspaceName : undefined}
                    workspaceId={item.workspaceId}
                    workspaceColor={item.workspaceColor}
                    timeText={item.timeText}
                    categorySymbol={item.categorySymbol}
                    isOverdue={item.isOverdue}
                    completed={item.completed}
                    priority={item.priority}
                    hasReminder={item.hasReminder}
                    accentColor={item.workspaceColor}
                    colors={colors}
                    colorScheme={colorScheme}
                    checkboxDisabled={checkboxAction === "locked"}
                    onToggleComplete={(e?: any) =>
                      completeTodoFromDashboard(todo.id, e, item.workspaceId)
                    }
                    onPressRow={() => {
                      if (contentAction.action === "open-details") {
                        router.push(contentAction.route);
                      }
                    }}
                  />
                );
              }

              if (item.type === "habit") {
                const habit = item.original as Habit;
                const checkboxAction = getCheckboxAction("habit", item.completed);
                const contentAction = getRowContentAction("habit", habit.id);

                return (
                  <WorkspaceItemRow
                    key={item.key}
                    type="habit"
                    id={habit.id}
                    title={habit.title}
                    subtitle={item.subtitle}
                    workspaceName={isAggregate ? item.workspaceName : undefined}
                    workspaceId={item.workspaceId}
                    workspaceColor={item.workspaceColor}
                    frequencyText={item.frequencyText}
                    categorySymbol={item.categorySymbol}
                    completed={item.completed}
                    streak={item.streak}
                    accentColor={item.workspaceColor}
                    colors={colors}
                    colorScheme={colorScheme}
                    checkboxDisabled={checkboxAction === "locked"}
                    onToggleComplete={(e?: any) =>
                      completeHabitFromDashboard(habit.id, e, item.workspaceId)
                    }
                    onPressRow={() => {
                      if (contentAction.action === "open-details") {
                        router.push(contentAction.route);
                      }
                    }}
                  />
                );
              }

              const checklist = item.original as Checklist;
              const isExpanded = !!expandedChecklistIds[checklist.id];
              const checkboxAction = getCheckboxAction(
                "checklist",
                item.completed,
              );
              const contentAction = getRowContentAction(
                "checklist",
                checklist.id,
              );

              const handleToggle = () =>
                handleChecklistExpandToggle(checklist.id, isExpanded);

              return (
                <WorkspaceItemRow
                  key={item.key}
                  type="checklist"
                  id={checklist.id}
                  title={checklist.title}
                  subtitle={item.subtitle}
                  workspaceName={isAggregate ? item.workspaceName : undefined}
                  workspaceId={item.workspaceId}
                  workspaceColor={item.workspaceColor}
                  categorySymbol={item.categorySymbol}
                  completed={item.completed}
                  checklistProgress={item.checklistProgress}
                  isExpanded={isExpanded}
                  accentColor={item.workspaceColor}
                  colors={colors}
                  colorScheme={colorScheme}
                  checkboxDisabled={checkboxAction === "locked"}
                  onToggleComplete={() => {
                    if (checkboxAction === "toggle-expand") {
                      handleToggle();
                    }
                  }}
                  onPressRow={() => {
                    if (contentAction.action === "toggle-expand") {
                      handleToggle();
                    }
                  }}
                >
                  {checklist.items && (
                    <View style={styles.subItemsWrapper}>
                      {checklist.items.map((subItem) => (
                        <View key={subItem.id} style={styles.subItemRow}>
                          <PressableScale
                            onPress={() =>
                              toggleChecklistItemFromDashboard(
                                checklist.id,
                                subItem.id,
                                item.workspaceId,
                              )
                            }
                            hitSlop={8}
                            haptic
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: subItem.completed }}
                            accessibilityLabel={`Checklist item ${subItem.title}`}
                            style={[
                              styles.subItemCheckbox,
                              {
                                borderColor: subItem.completed
                                  ? item.workspaceColor || workspaceColor
                                  : isDark
                                    ? "rgba(255,255,255,0.2)"
                                    : "rgba(0,0,0,0.2)",
                                backgroundColor: subItem.completed
                                  ? item.workspaceColor || workspaceColor
                                  : "transparent",
                              },
                            ]}
                          >
                            {subItem.completed && (
                              <Feather
                                name="check"
                                size={10}
                                color={Palette.white}
                              />
                            )}
                          </PressableScale>
                          <Text
                            style={[
                              styles.subItemTitle,
                              {
                                color: subItem.completed
                                  ? colors.textMuted
                                  : colors.text,
                                textDecorationLine: subItem.completed
                                  ? "line-through"
                                  : "none",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {subItem.title}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </WorkspaceItemRow>
              );
            })}
          </View>

          {/* Resource strip — content-forward tiles instead of a toggle pill */}
          {resources.length > 0 && (
            <View style={styles.resourceStrip}>
              <Text
                style={[styles.resourceStripLabel, { color: colors.textMuted }]}
              >
                Resources
              </Text>
              <View style={styles.resourceStripRow}>
                {resources.map((resource) => {
                  const stream =
                    streamColors[resource.visual.category] || streamColors.note;
                  return (
                    <PressableScale
                      key={`resource-${resource.id}`}
                      onPress={() =>
                        router.push({
                          pathname: "/tasks",
                          params: {
                            workspaceId: workspace.id,
                            segment: "resources",
                            resourceId: resource.id,
                          },
                        } as any)
                      }
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={`Resource ${resource.title}`}
                      style={[
                        styles.resourceTile,
                        {
                          borderColor: stream.borderColor,
                        },
                      ]}
                      contentStyle={styles.resourceTileContent}
                    >
                      {resource.visual.category === "image" &&
                      resource.visual.thumbnailUri ? (
                        <ExpoImage
                          source={{ uri: resource.visual.thumbnailUri }}
                          style={styles.resourceTileImage}
                          contentFit="cover"
                          transition={150}
                        />
                      ) : (
                        <View
                          style={[
                            styles.resourceTileInner,
                            { backgroundColor: stream.backgroundColor },
                          ]}
                        >
                          <Feather
                            name={
                              resource.visual.category === "pdf" ||
                              resource.visual.category === "note"
                                ? "file-text"
                                : "link"
                            }
                            size={16}
                            color={stream.accent}
                          />
                        </View>
                      )}
                    </PressableScale>
                  );
                })}

                {resourcesTotal > resources.length && (
                  <PressableScale
                    onPress={() => onOpenWorkspace(workspace.id, "resources")}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`View all ${resourcesTotal} resources in ${workspace.name}`}
                    style={[
                      styles.resourceTile,
                      styles.resourceMoreTile,
                      {
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.10)"
                          : "rgba(0, 0, 0, 0.08)",
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.05)"
                          : "rgba(0, 0, 0, 0.03)",
                      },
                    ]}
                    contentStyle={styles.resourceTileContent}
                  >
                    <Text
                      style={[
                        styles.resourceMoreText,
                        { color: colors.textMuted },
                      ]}
                    >
                      {`+${resourcesTotal - resources.length}`}
                    </Text>
                  </PressableScale>
                )}
              </View>
            </View>
          )}

          {/* Preview cap: view the rest of the workspace */}
          {remainingCount > 0 && (
            <PressableScale
              onPress={() =>
                isAggregate ? onOpenAllWork() : onOpenWorkspace(workspace.id)
              }
              haptic
              accessibilityRole="button"
              accessibilityLabel={`View all items in ${workspace.name}, ${remainingCount} more`}
              style={styles.previewGatewayBtn}
              contentStyle={styles.previewGatewayContent}
            >
              <Text style={[styles.previewGatewayText, { color: workspaceColor }]}>
                {`+${remainingCount} more in ${workspace.name}`}
              </Text>
              <Feather name="arrow-right" size={13} color={workspaceColor} />
            </PressableScale>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  workspaceBody: {
    borderWidth: 1,
    overflow: "hidden",
  },
  workspaceBodyTabbed: {
    // Square top edge: the tabs rise from it, the way they do on a real tab.
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  workspaceBodyStandalone: {
    borderRadius: Radius.lg,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerMain: {
    flex: 1,
  },
  headerMainContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerSquircleBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEmojiMark: {
    fontSize: 19,
  },
  headerTextStack: {
    flex: 1,
    gap: 2,
  },
  workspaceNameText: {
    fontSize: 16.5,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  stateText: {
    fontSize: 12.5,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  ringWrap: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCheck: {
    position: "absolute",
  },
  headerChevronBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSeeAllBtn: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerSeeAllContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  headerSeeAllText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  sectionBody: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingBottom: 10,
  },
  itemsListWrap: {
    gap: 1,
  },
  subItemsWrapper: {
    paddingLeft: 40,
    paddingTop: 2,
    paddingBottom: 8,
    gap: 4,
  },
  subItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    minHeight: 34,
  },
  subItemCheckbox: {
    width: 16,
    height: 16,
    borderRadius: Radius.sm / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  subItemTitle: {
    fontSize: 12,
    flex: 1,
  },
  resourceStrip: {
    marginTop: 10,
    gap: 8,
  },
  resourceStripLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    opacity: 0.7,
    paddingLeft: 12,
  },
  resourceStripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
  },
  resourceTile: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  resourceTileContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  resourceTileImage: {
    width: 48,
    height: 48,
  },
  resourceTileInner: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceMoreTile: {},
  resourceMoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
  previewGatewayBtn: {
    marginTop: 6,
    paddingLeft: 12,
    minHeight: 36,
    justifyContent: "center",
  },
  previewGatewayContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewGatewayText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
