import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
import { getCategoryColors } from "@/shared/constants/categoryColors";
import { Palette } from "@/shared/constants/theme";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/shared/components/ui/AppText";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";
import { SwipeableCard } from "@/shared/components/ui/SwipeableCard";
import { Typography } from "@/shared/constants/typography";
import { getTaskCategoryMeta, normalizeTaskCategory } from "@/features/tasks/services/task-categories";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { formatRelativeTaskDate } from "@/features/tasks/utils/task-formatting";
import { resolveItemCategorySymbol } from "@/features/today/utils/item-presentation";
import {
  getStreamResourcePalette,
  resolveResourceVisual,
} from "@/features/today/utils/resource-presentation";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";

interface TodoItemProps {
  item: Task;
  colors: any;
  colorScheme: "light" | "dark" | null | undefined;
  isOverdue: boolean;
  omitOverdueLabel?: boolean;
  selectedDate?: string;
  lists: Workspace[];
  selectedWorkspaceId?: string;
  showWorkspaceBadge?: boolean;
  onToggleTodo: () => void;
  onDeleteTodo: () => void;
  onEditTodo?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  allResources?: any[];
  onToggleLinkResource?: (itemId: string, itemType: "task", resourceId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

type MetaPart = {
  key: "category" | "date" | "duration" | "reminder" | "recurrence" | "overdue";
  text: string;
  icon?: string;
  color?: string;
};

export function TodoItem({
  item,
  colors,
  colorScheme,
  isOverdue: overdue,
  omitOverdueLabel = false,
  selectedDate,
  lists,
  selectedWorkspaceId,
  showWorkspaceBadge,
  onToggleTodo,
  onDeleteTodo,
  onEditTodo,
  onLayout,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  allResources = [],
  onToggleLinkResource,
  isExpanded: isExpandedProp,
  onToggleExpand,
}: TodoItemProps) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const category = getTaskCategoryMeta(normalizeTaskCategory(item.categoryId));
  const isLight = colorScheme === "light";
  const isDark = colorScheme !== "light";
  const categoryColors = getCategoryColors(isDark);
  const streamColors = getStreamResourcePalette(isDark);

  // Context Linkage States
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : localExpanded;
  const setIsExpanded = onToggleExpand !== undefined ? onToggleExpand : setLocalExpanded;
  const [showLinkSelector, setShowLinkSelector] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);

  const linkedResourceIds = item.resourceIds;
  const linkedCount = linkedResourceIds?.length ?? 0;

  // Automatically collapse when no resources are left
  React.useEffect(() => {
    if (linkedCount === 0 && isExpanded) {
      if (onToggleExpand) {
        onToggleExpand();
      } else {
        setLocalExpanded(false);
      }
    }
  }, [linkedCount, isExpanded, onToggleExpand]);

  // Reset showAllResources state when drawer is collapsed
  React.useEffect(() => {
    if (!isExpanded) {
      setShowAllResources(false);
    }
  }, [isExpanded]);

  const linkedResources = useMemo(() => {
    if (!linkedResourceIds || linkedResourceIds.length === 0) return [];
    return linkedResourceIds
      .map((id) => allResources.find((r) => r.id === id))
      .filter(Boolean);
  }, [linkedResourceIds, allResources]);

  const hasHiddenResources = linkedResources.length > 3;
  const displayedResources = useMemo(() => {
    if (hasHiddenResources && !showAllResources) {
      return linkedResources.slice(0, 2);
    }
    return linkedResources;
  }, [linkedResources, hasHiddenResources, showAllResources]);

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  const isCompleted = isTaskCompleted(item);

  // Priority stripe carries information only: rendered for high priority only.
  // Uses canonical priority tokens distinct from warning/overdue.
  const priorityColor = item.priority === "high" ? categoryColors.priority.high : "transparent";

  // Category badge: neutral badge in task list unless categoryId is set explicitly
  const categorySymbol = useMemo(() => {
    if (item.categoryId) {
      return resolveItemCategorySymbol(
        {
          type: "task",
          title: item.title,
          categoryId: item.categoryId,
          priority: item.priority,
        },
        isDark,
      );
    }
    return {
      icon: "clipboard",
      iconFamily: "feather" as const,
      color: colors.textMuted,
      tint: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
      label: "Task",
    };
  }, [item.title, item.categoryId, item.priority, isDark, colors.textMuted]);

  const currentWorkspace = useMemo(() => {
    const wsId = item.workspaceId || selectedWorkspaceId;
    return lists.find((w) => w.id === wsId);
  }, [lists, item.workspaceId, selectedWorkspaceId]);

  const folderName = currentWorkspace?.name || "Work";
  const isInbox = currentWorkspace?.id === INBOX_WORKSPACE_ID || folderName.toLowerCase() === "inbox";

  const durationMinutes = (item.schedule as any)?.durationMinutes;

  // Contextual folder/workspace badge:
  // Rendered in global/all-workspaces stream; hidden when inside an open workspace
  const shouldShowWorkspace =
    showWorkspaceBadge !== undefined
      ? showWorkspaceBadge
      : (!selectedWorkspaceId || selectedWorkspaceId === "all");

  const metaParts = useMemo<MetaPart[]>(() => {
    const parts: MetaPart[] = [];

    // 1. Folder badge (contextual)
    if (shouldShowWorkspace) {
      parts.push({
        key: "category",
        text: folderName,
        icon: isInbox ? "inbox" : "folder",
        color: colors.textMuted,
      });
    }

    // 2. Overdue & Relative Date formatting
    let reminderText = "";
    if (item.reminder && item.reminder.enabled && item.reminder.triggerAt) {
      const d = new Date(item.reminder.triggerAt);
      reminderText = formatReminderTime(d.getHours(), d.getMinutes()) || "";
    }

    if (omitOverdueLabel) {
      // Earlier section: drop "Overdue" text, show relative date (Yesterday, 3d ago, Mon 28)
      if (item.schedule?.date) {
        const relativeDate = formatRelativeTaskDate(item.schedule.date, selectedDate);
        if (relativeDate) {
          const displayText = reminderText
            ? `${relativeDate.label} · ${reminderText}`
            : relativeDate.label;
          parts.push({
            key: "date",
            text: displayText,
            icon: item.reminder?.enabled ? "bell" : "calendar",
            color: relativeDate.isWarning ? colors.warning : colors.textMuted,
          });
        }
      } else if (reminderText) {
        parts.push({
          key: "reminder",
          text: reminderText,
          icon: "bell",
          color: colors.textMuted,
        });
      }
    } else {
      // Outside Earlier (e.g. Today): keep standard overdue behavior with semantic theme token
      if (overdue) {
        parts.push({
          key: "overdue",
          text: "Overdue",
          icon: "alert-circle",
          color: colors.error,
        });
      }
      if (reminderText) {
        parts.push({
          key: "reminder",
          text: reminderText,
          icon: "bell",
          color: colors.textMuted,
        });
      }
    }

    // 3. Recurrence
    if (item.recurrence) {
      const label = getRecurrenceLabel(item.recurrence);
      if (label) {
        const cleanLabel = label.replace(/[↻↻↻]/g, "").trim();
        parts.push({
          key: "recurrence",
          text: cleanLabel,
          icon: "repeat",
          color: colors.textMuted,
        });
      }
    }

    // 4. Duration
    if (durationMinutes) {
      const mins = durationMinutes;
      let text = "";
      if (mins < 60) {
        text = `${mins}m`;
      } else {
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        text = rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
      }
      parts.push({
        key: "duration",
        text,
        icon: "clock",
        color: colors.textMuted,
      });
    }

    return parts;
  }, [
    shouldShowWorkspace,
    folderName,
    isInbox,
    omitOverdueLabel,
    item.schedule?.date,
    selectedDate,
    overdue,
    item.reminder,
    item.recurrence,
    durationMinutes,
    colors.textMuted,
    colors.warning,
    colors.error,
  ]);

  return (
    <SwipeableCard
      onSwipeRight={onToggleTodo}
      onSwipeLeft={onDeleteTodo}
      disabled={isSelectionMode}
    >
      <View
        onLayout={onLayout}
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "transparent",
          opacity: isCompleted ? 0.6 : 1,
        }}
      >
        {/* Thin vertical priority strip */}
        {priorityColor !== "transparent" && (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3.5,
              backgroundColor: priorityColor,
            }}
          />
        )}

        {/* Parent Task Main Info Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            paddingHorizontal: 12,
            paddingLeft: 12,
          }}
        >
          {/* Circular Checkbox */}
          <PressableScale
            onPress={isSelectionMode ? onSelect : onToggleTodo}
            hitSlop={12}
            haptic
            scaleTo={0.88}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelectionMode ? isSelected : isCompleted }}
            accessibilityLabel={
              isSelectionMode
                ? `Select task ${item.title}`
                : `Mark task as ${isCompleted ? "incomplete" : "completed"}: ${item.title}`
            }
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 1.5,
              borderColor: (isSelectionMode ? isSelected : isCompleted)
                ? (priorityColor !== "transparent" ? priorityColor : colors.primary)
                : (isLight ? Palette.slate300 : "rgba(255, 255, 255, 0.3)"),
              backgroundColor: (isSelectionMode ? isSelected : isCompleted)
                ? (priorityColor !== "transparent" ? priorityColor : colors.primary)
                : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            {(isSelectionMode ? isSelected : isCompleted) && (
              <Feather name="check" size={13} color={Palette.white} />
            )}
          </PressableScale>

          {/* Squircle Category Badge */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: categorySymbol.tint,
              borderWidth: 1,
              borderColor: `${categorySymbol.color}24`,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
              opacity: isCompleted ? 0.6 : 1,
            }}
          >
            {categorySymbol.iconFamily === "ionicons" ? (
              <Ionicons
                name={categorySymbol.icon as any}
                size={19}
                color={categorySymbol.color}
              />
            ) : (
              <Feather
                name={categorySymbol.icon as any}
                size={19}
                color={categorySymbol.color}
              />
            )}
          </View>

          {/* Title & Metadata Column */}
          <PressableScale
            onPress={isSelectionMode ? onSelect : onEditTodo}
            haptic
            style={{ flex: 1, justifyContent: "center" }}
            accessibilityRole="button"
            accessibilityLabel={isSelectionMode ? `Select task ${item.title}` : `Edit task ${item.title}`}
          >
            <Text
              style={{
                fontSize: 15.5,
                fontWeight: "600",
                color: isCompleted ? colors.textMuted : colors.text,
                textDecorationLine: isCompleted ? "line-through" : "none",
                letterSpacing: -0.25,
                marginBottom: 3,
              }}
              numberOfLines={1}
            >
              {item.title}
            </Text>

            {/* Single line metadata row with dot delimiters (only rendered if there is metadata) */}
            {metaParts.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "nowrap", overflow: "hidden" }}>
                {metaParts.map((part, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <Text style={{ color: colors.textMuted, fontSize: 12, marginHorizontal: 4 }}>•</Text>}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3.5 }}>
                      {part.icon && (
                        <Feather
                          name={part.icon as any}
                          size={11}
                          color={part.color || colors.textMuted}
                        />
                      )}
                      <Text
                        style={{
                          color: part.color || colors.textMuted,
                          fontSize: 12,
                          fontWeight: part.key === "overdue" || part.color === colors.warning ? "600" : "500",
                        }}
                        numberOfLines={1}
                      >
                        {part.text}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            )}
          </PressableScale>

          {/* Trailing Actions: Render paperclip only when resources are linked; trailing chevron removed */}
          {linkedCount > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 6 }}>
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setIsExpanded(!isExpanded);
                }}
                onLongPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  setIsPeeking(true);
                }}
                delayLongPress={350}
                hitSlop={8}
                haptic
                accessibilityRole="button"
                accessibilityLabel={
                  isExpanded
                    ? `Collapse ${linkedCount} linked resources for ${item.title}`
                    : `Expand ${linkedCount} linked resources for ${item.title}`
                }
                accessibilityState={{ expanded: isExpanded }}
                style={{
                  padding: 6,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Feather
                    name="paperclip"
                    size={12}
                    color={isExpanded ? colors.primary : colors.textMuted}
                  />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: isExpanded ? colors.primary : colors.textMuted }}>
                    {linkedCount}
                  </Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>

        {/* Expanded Flat Resource List inside the same card */}
        {isExpanded && linkedResources.length > 0 && (
          <View style={styles.expandedContent}>
            {/* Subtle divider before the resources section */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Flat List (Apple Notes attachment style) */}
            <View style={styles.resourcesList}>
              {displayedResources.map((res: any, idx: number) => {
                const visual = resolveResourceVisual(res);
                const stream = streamColors[visual.category] || streamColors.note;
                const isLink = visual.category === "link";

                return (
                  <View key={res.id}>
                    <TouchableOpacity
                      onPress={() => {
                        if (isLink) {
                          handleOpenUrl(res.url || res.content);
                        } else {
                          const targetWs =
                            res.workspaceId || item.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
                          router.push(`/resource-details?id=${res.id}&workspaceId=${targetWs}`);
                        }
                      }}
                      accessibilityRole={isLink ? "link" : "button"}
                      accessibilityLabel={`${res.title}, ${visual.label}`}
                      style={[styles.resourceRow, { minHeight: 44 }]}
                    >
                      {/* Icon or Thumbnail */}
                      <View style={[styles.thumbnailWrap, { backgroundColor: stream.backgroundColor, borderColor: stream.borderColor, borderWidth: 1 }]}>
                        {visual.category === "image" && (visual.thumbnailUri || res.mediaUri) ? (
                          <Image
                            source={{ uri: visual.thumbnailUri || res.mediaUri }}
                            style={{ width: "100%", height: "100%" }}
                          />
                        ) : (
                          <Feather
                            name={
                              visual.category === "link"
                                ? "link"
                                : visual.category === "image"
                                ? "image"
                                : "file-text"
                            }
                            size={14}
                            color={stream.accent}
                          />
                        )}
                      </View>

                      <View style={{ flex: 1, justifyContent: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                          {res.title}
                        </Text>
                        {isLink && (res.url || res.content) && (
                          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                            {(res.url || res.content).replace(/https?:\/\/(www\.)?/, "").split("/")[0]}
                          </Text>
                        )}
                        {visual.category === "note" && (res.content || res.body) && (
                          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                            {(res.content || res.body).trim().split("\n")[0]}
                          </Text>
                        )}
                        {visual.category === "image" && (
                          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                            Image attachment
                          </Text>
                        )}
                        {visual.category === "pdf" && (
                          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                            PDF document
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Inner row separator divider */}
                    {idx < displayedResources.length - 1 && (
                      <View style={[styles.innerDivider, { backgroundColor: colors.border + "40" }]} />
                    )}
                  </View>
                );
              })}

                {/* Show More/Less Gate */}
                {hasHiddenResources && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowAllResources(!showAllResources);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={showAllResources ? "Show fewer resources" : `Show ${linkedResources.length - 2} more resources`}
                    style={styles.showMoreBtn}
                  >
                    <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "600" }}>
                      {showAllResources ? "Show less" : `Show ${linkedResources.length - 2} more`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Flat Link Resource Action button (no dashed border) */}
                <TouchableOpacity
                  onPress={() => setShowLinkSelector(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Link resource to ${item.title}`}
                  style={styles.addResourceBtn}
                >
                  <Feather name="plus" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                    Link Resource
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        {/* Resource Link Selector Modal */}
        <Modal
          visible={showLinkSelector}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLinkSelector(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "90%",
                maxHeight: "70%",
                backgroundColor: colors.card,
                borderRadius: 24,
                borderColor: colors.border,
                borderWidth: 1.5,
                padding: 20,
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                Link Resources
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: -4 }}>
                Select resources to link to this task:
              </Text>

              {allResources.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>No resources in this workspace.</Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
                  {allResources.map((res) => {
                    const isLinked = linkedResourceIds?.includes(res.id) ?? false;
                    return (
                      <TouchableOpacity
                        key={res.id}
                        onPress={() => onToggleLinkResource?.(item.id, "task", res.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isLinked }}
                        accessibilityLabel={`${res.title}, ${isLinked ? "linked" : "not linked"}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isLinked ? colors.primary : colors.border,
                          backgroundColor: isLinked ? `${colors.primary}08` : (isLight ? Palette.slate50 : Palette.ink850),
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                          <Feather
                            name={res.type === "link" ? "link-2" : res.type === "image" ? "image" : "file-text"}
                            size={14}
                            color={colors.textMuted}
                          />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                            {res.title}
                          </Text>
                        </View>
                        <Feather
                          name={isLinked ? "check-circle" : "circle"}
                          size={16}
                          color={isLinked ? colors.primary : colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <TouchableOpacity
                onPress={() => setShowLinkSelector(false)}
                accessibilityRole="button"
                accessibilityLabel="Close resource linker"
                style={{
                  backgroundColor: colors.primary,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <Text style={{ color: Palette.white, fontWeight: "700", fontSize: 13 }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* iOS-style Long Press Peek Modal */}
        <Modal
          visible={isPeeking}
          transparent
          animationType="none"
          onRequestClose={() => setIsPeeking(false)}
        >
          <Pressable
            onPress={() => setIsPeeking(false)}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: screenWidth * 0.8,
                backgroundColor: colors.card,
                borderRadius: 20,
                borderColor: colors.border,
                borderWidth: 1.5,
                padding: 16,
                gap: 12,
                elevation: 10,
                shadowColor: Palette.black,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.25,
                shadowRadius: 15,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase" }}>
                Glance Resources
              </Text>
              <View style={{ gap: 10 }}>
                {linkedResources.map((res: any) => {
                  const visual = resolveResourceVisual(res);
                  const stream = streamColors[visual.category] || streamColors.note;

                  return (
                    <View
                      key={res.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          backgroundColor: stream.backgroundColor,
                          borderColor: stream.borderColor,
                          borderWidth: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {visual.category === "image" && (visual.thumbnailUri || res.mediaUri) ? (
                          <Image
                            source={{ uri: visual.thumbnailUri || res.mediaUri }}
                            style={{ width: "100%", height: "100%" }}
                          />
                        ) : (
                          <Feather
                            name={
                              visual.category === "link"
                                ? "link"
                                : visual.category === "image"
                                ? "image"
                                : "file-text"
                            }
                            size={12}
                            color={stream.accent}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                          {res.title}
                        </Text>
                        {visual.category === "link" && (res.url || res.content) && (
                          <Text style={{ fontSize: 9, color: colors.textMuted }} numberOfLines={1}>
                            {(res.url || res.content).replace(/https?:\/\/(www\.)?/, "").split("/")[0]}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Modal>
      </View>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  todoItemCard: {
    flexDirection: "column",
  },
  todoMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todoLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  todoTexts: {
    flex: 1,
    gap: 1,
  },
  todoTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
    flexWrap: "wrap",
  },
  tagBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  tagBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reminderText: {
    fontSize: 10,
    fontWeight: "600",
  },
  expandedContent: {
    marginTop: 10,
    paddingBottom: 4,
  },
  divider: {
    height: 1,
    width: "100%",
    marginBottom: 12,
    opacity: 0.5,
  },
  resourcesList: {
    paddingLeft: 26, // Align nicely with content text offset
    gap: 4,
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    minHeight: 44,
    gap: 12,
  },
  thumbnailWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  innerDivider: {
    height: 1,
    width: "100%",
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  addResourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 6,
  },
});
