import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Image as ExpoImage } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { getCategoryColors } from "@/shared/constants/categoryColors";
import { Palette, colorWithAlpha } from "@/shared/constants/theme";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/shared/components/ui/AppText";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";
import { SwipeableCard } from "@/shared/components/ui/SwipeableCard";
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
  onSetAlarm?: () => void;
  onSchedule?: () => void;
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
  onSetAlarm,
  onSchedule,
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLight = colorScheme === "light";
  const isDark = colorScheme !== "light";
  const categoryColors = getCategoryColors(isDark);
  const streamColors = getStreamResourcePalette(isDark);

  // Expansion and fanning states
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : localExpanded;
  const toggleExpanded = onToggleExpand !== undefined ? onToggleExpand : () => setLocalExpanded(!localExpanded);

  const [showLinkSelector, setShowLinkSelector] = useState(false);
  const [isFanning, setIsFanning] = useState(false);

  const reducedMotion = useReducedMotion();

  // Completion animation
  const [isLocallyCompleting, setIsLocallyCompleting] = useState(false);
  const isCompleted = isTaskCompleted(item) || isLocallyCompleting;
  const checkboxScale = useSharedValue(1);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isTaskCompleted(item)) {
      setIsLocallyCompleting(false);
    }
  }, [item]);

  const animatedCheckboxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkboxScale.value }],
  }));

  const handleCheckboxPress = () => {
    if (isSelectionMode) {
      onSelect?.();
      return;
    }
    if (isLocallyCompleting) return;

    if (!isCompleted) {
      setIsLocallyCompleting(true);
      if (!reducedMotion) {
        checkboxScale.value = withSequence(
          withTiming(0.82, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(1.18, { duration: 130, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        );
      }
      completionTimerRef.current = setTimeout(() => {
        onToggleTodo();
      }, 380);
    } else {
      onToggleTodo();
    }
  };

  // Linked resources resolution
  const linkedResourceIds = item.resourceIds;
  const linkedResources = useMemo(() => {
    if (!linkedResourceIds || linkedResourceIds.length === 0) return [];
    return linkedResourceIds
      .map((id) => {
        const found = allResources.find((r) => r.id === id);
        if (found) return found;
        return { id, title: "Resource", type: "file" };
      })
      .filter(Boolean);
  }, [linkedResourceIds, allResources]);

  const totalResources = linkedResources.length;

  const visibleTiles = useMemo(() => {
    if (totalResources === 0) return [];
    if (totalResources <= 3) return linkedResources;
    return linkedResources.slice(0, 2);
  }, [linkedResources, totalResources]);

  const hasPlusChip = totalResources >= 4;
  const plusChipCount = totalResources - 2;

  // Resource Fanning Reanimated Progress
  const fanProgress = useSharedValue(0);

  useEffect(() => {
    if (isFanning) {
      fanProgress.value = reducedMotion
        ? 1
        : withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      fanProgress.value = 0;
    }
  }, [isFanning, reducedMotion, fanProgress]);

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  const handleOpenResource = (res: any) => {
    const visual = resolveResourceVisual(res);
    if (visual.category === "link" && (res.url || res.content)) {
      handleOpenUrl(res.url || res.content);
    } else {
      const targetWs =
        res.workspaceId || item.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      router.push(`/resource-details?id=${res.id}&workspaceId=${targetWs}`);
    }
  };

  // Category badge resolution
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

  const shouldShowWorkspace =
    showWorkspaceBadge !== undefined
      ? showWorkspaceBadge
      : (!selectedWorkspaceId || selectedWorkspaceId === "all");

  // Metadata formatting
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
      if (item.schedule?.date) {
        const relativeDate = formatRelativeTaskDate(item.schedule.date, selectedDate);
        if (relativeDate) {
          const displayText = reminderText
            ? `${relativeDate.label} · ${reminderText}`
            : relativeDate.label;
          parts.push({
            key: "date",
            text: displayText,
            color: colors.textMuted,
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
      if (overdue) {
        parts.push({
          key: "overdue",
          text: "Overdue",
          icon: "alert-circle",
          color: colors.error,
        });
      }
      if (item.schedule?.date) {
        const relativeDate = formatRelativeTaskDate(item.schedule.date, selectedDate);
        if (relativeDate) {
          const displayText = reminderText
            ? `${relativeDate.label} · ${reminderText}`
            : relativeDate.label;
          parts.push({
            key: "date",
            text: displayText,
            color: colors.textMuted,
          });
        }
      } else if (reminderText) {
        parts.push({
          key: "reminder",
          text: reminderText,
          icon: "bell",
          color: colors.textMuted,
        });
      } else {
        parts.push({
          key: "date",
          text: "No date",
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
    colors.error,
  ]);

  // Render a compact tile in the collapsed trailing stack
  const renderStackTile = (res: any, index: number) => {
    const visual = resolveResourceVisual(res);
    const stream = streamColors[visual.category] || streamColors.note;
    const isImageWithThumb = visual.category === "image" && (visual.thumbnailUri || res.mediaUri);

    return (
      <View
        key={res.id || `tile-${index}`}
        testID={`resource-stack-tile-${index}`}
        style={{
          width: ROW_SPEC.stack.tile,
          height: ROW_SPEC.stack.tile,
          borderRadius: ROW_SPEC.stack.tileRadius,
          borderWidth: ROW_SPEC.stack.ring,
          borderColor: isExpanded ? colors.card : (isDark ? colors.background : Palette.white),
          backgroundColor: stream.backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          marginLeft: index === 0 ? 0 : -ROW_SPEC.stack.overlap,
        }}
      >
        {isImageWithThumb ? (
          <ExpoImage
            source={{ uri: visual.thumbnailUri || res.mediaUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <Feather
            name={
              visual.category === "link"
                ? "link"
                : visual.category === "image"
                ? "image"
                : visual.category === "pdf"
                ? "file"
                : "file-text"
            }
            size={13}
            color={stream.accent}
          />
        )}
      </View>
    );
  };

  const renderPlusChip = (count: number) => {
    return (
      <View
        key="plus-chip"
        testID="resource-stack-plus-chip"
        style={{
          width: ROW_SPEC.stack.tile,
          height: ROW_SPEC.stack.tile,
          borderRadius: ROW_SPEC.stack.tileRadius,
          borderWidth: ROW_SPEC.stack.ring,
          borderColor: isExpanded ? colors.card : (isDark ? colors.background : Palette.white),
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: -ROW_SPEC.stack.overlap,
        }}
      >
        <Text
          style={{
            fontSize: ROW_SPEC.stack.chipFont,
            fontWeight: "700",
            color: colors.textMuted,
          }}
        >
          {`+${count}`}
        </Text>
      </View>
    );
  };

  // Trailing stack tap triggers fanning
  const handleOpenFanning = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsFanning(true);
  };

  return (
    <SwipeableCard
      onSwipeRight={handleCheckboxPress}
      onSwipeLeft={onDeleteTodo}
      disabled={isSelectionMode || isExpanded}
    >
      <View
        onLayout={onLayout}
        style={[
          styles.rowContainer,
          isExpanded
            ? [
                styles.expandedCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: Palette.black,
                  shadowOpacity: isDark ? 0.28 : 0.06,
                },
              ]
            : {
                backgroundColor: "transparent",
              },
          {
            opacity: isCompleted ? 0.6 : 1,
          },
        ]}
      >
        {/* Main Header / Collapsed Row */}
        <View style={styles.mainRow}>
          {/* Circular Checkbox with bounce */}
          <Animated.View style={animatedCheckboxStyle}>
            <PressableScale
              onPress={handleCheckboxPress}
              hitSlop={10}
              haptic
              scaleTo={0.88}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelectionMode ? isSelected : isCompleted }}
              accessibilityLabel={
                isSelectionMode
                  ? `Select task ${item.title}`
                  : `Mark task as ${isCompleted ? "incomplete" : "completed"}: ${item.title}`
              }
              style={[
                styles.checkbox,
                {
                  width: ROW_SPEC.checkbox.visual,
                  height: ROW_SPEC.checkbox.visual,
                  borderRadius: ROW_SPEC.checkbox.visual / 2,
                  borderWidth: ROW_SPEC.checkbox.ring,
                  borderColor: (isSelectionMode ? isSelected : isCompleted)
                    ? (isSelectionMode ? colors.primary : colors.success)
                    : (isLight ? Palette.slate300 : "rgba(255, 255, 255, 0.28)"),
                  backgroundColor: (isSelectionMode ? isSelected : isCompleted)
                    ? (isSelectionMode ? colors.primary : colors.success)
                    : "transparent",
                },
              ]}
            >
              {(isSelectionMode ? isSelected : isCompleted) && (
                <Feather name="check" size={13} color={Palette.white} />
              )}
            </PressableScale>
          </Animated.View>

          {/* Squircle Category Badge */}
          <View
            style={[
              styles.categoryBadge,
              {
                width: ROW_SPEC.badge.size,
                height: ROW_SPEC.badge.size,
                borderRadius: ROW_SPEC.badge.radius,
                backgroundColor: categorySymbol.tint,
                borderColor: `${categorySymbol.color}24`,
              },
            ]}
          >
            {categorySymbol.iconFamily === "ionicons" ? (
              <Ionicons
                name={categorySymbol.icon as any}
                size={ROW_SPEC.badge.icon}
                color={categorySymbol.color}
              />
            ) : (
              <Feather
                name={categorySymbol.icon as any}
                size={ROW_SPEC.badge.icon}
                color={categorySymbol.color}
              />
            )}
          </View>

          {/* Title & Metadata (Pressing triggers expansion or selection) */}
          <PressableScale
            onPress={isSelectionMode ? onSelect : toggleExpanded}
            haptic
            style={styles.textContainer}
            accessibilityRole="button"
            accessibilityLabel={
              isSelectionMode
                ? `Select task ${item.title}`
                : `${isExpanded ? "Collapse" : "Expand"} task ${item.title}`
            }
          >
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.titleText,
                  {
                    fontSize: isExpanded ? 17 : ROW_SPEC.type.title,
                    fontWeight: isExpanded ? "700" : ROW_SPEC.type.titleWeight,
                    color: isCompleted ? colors.textMuted : colors.text,
                    textDecorationLine: isCompleted ? "line-through" : "none",
                  },
                ]}
                numberOfLines={isExpanded ? 2 : 1}
              >
                {item.title}
              </Text>
            </View>

            {/* Single line metadata row with dot separators */}
            {metaParts.length > 0 && (
              <View style={styles.metaRow}>
                {metaParts.map((part, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && (
                      <Text style={[styles.metaDot, { color: colors.textMuted }]}>
                        ·
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.metaText,
                        {
                          color: part.color || colors.textMuted,
                          fontWeight: part.key === "overdue" ? "700" : "500",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {part.text}
                    </Text>
                  </React.Fragment>
                ))}
              </View>
            )}
          </PressableScale>

          {/* Trailing Priority Flag / Pinned icon in Expanded Mode */}
          {isExpanded && item.priority === "high" && (
            <View style={{ marginRight: 2 }}>
              <Feather name="bookmark" size={16} color={categoryColors.priority.high} />
            </View>
          )}

          {/* Trailing Resource Stack & Badges */}
          <View style={styles.trailingArea}>
            {totalResources > 0 ? (
              <PressableScale
                onPress={handleOpenFanning}
                scaleTo={0.93}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`${totalResources} linked resources for ${item.title}`}
                accessibilityState={{ expanded: isExpanded }}
                style={styles.resourceStackPressable}
              >
                <View style={styles.stackRow}>
                  {visibleTiles.map((res: any, index: number) => renderStackTile(res, index))}
                  {hasPlusChip && renderPlusChip(plusChipCount)}
                </View>
              </PressableScale>
            ) : item.recurrence ? (
              <Feather name="repeat" size={14} color={colors.textMuted} />
            ) : item.priority === "high" && !isExpanded ? (
              <Feather name="flag" size={14} color={categoryColors.priority.high} />
            ) : null}
          </View>
        </View>

        {/* INLINE EXPANDED CONTEXTUAL SURFACE (Phase 3) */}
        {isExpanded && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            exiting={reducedMotion ? undefined : FadeOut.duration(160)}
            layout={reducedMotion ? undefined : LinearTransition.duration(240)}
            style={styles.expandedBody}
          >
            {/* Task Description / Note (if present) */}
            {Boolean(item.description && item.description.trim().length > 0) && (
              <View style={styles.descriptionContainer}>
                <Text style={[styles.descriptionText, { color: colors.textMuted }]}>
                  {item.description}
                </Text>
              </View>
            )}

            {/* Linked Resources Section */}
            <View style={styles.resourcesSection}>
              <View style={styles.resourcesHeaderRow}>
                <Text style={[styles.resourcesHeaderTitle, { color: colors.text }]}>
                  {`Resources (${totalResources})`}
                </Text>
                {totalResources > 0 && (
                  <PressableScale
                    onPress={handleOpenFanning}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel="View fanned resources"
                  >
                    <Text style={[styles.viewAllText, { color: isDark ? colors.primaryLight : colors.primary }]}>
                      View all
                    </Text>
                  </PressableScale>
                )}
              </View>

              {/* Horizontal Scroll of Resource Preview Cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalResourceScroll}
              >
                {linkedResources.map((res: any) => {
                  const visual = resolveResourceVisual(res);
                  const stream = streamColors[visual.category] || streamColors.note;
                  const isImage = visual.category === "image" && (visual.thumbnailUri || res.mediaUri);

                  return (
                    <PressableScale
                      key={res.id}
                      onPress={() => handleOpenResource(res)}
                      haptic
                      scaleTo={0.96}
                      accessibilityRole="button"
                      accessibilityLabel={`${res.title}, ${visual.label}`}
                      style={[
                        styles.resourceCard,
                        {
                          backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : Palette.slate50,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {/* Top Preview Area */}
                      <View
                        style={[
                          styles.cardPreviewArea,
                          {
                            backgroundColor: stream.backgroundColor,
                          },
                        ]}
                      >
                        {isImage ? (
                          <ExpoImage
                            source={{ uri: visual.thumbnailUri || res.mediaUri }}
                            style={styles.cardImage}
                            contentFit="cover"
                          />
                        ) : (
                          <Feather
                            name={
                              visual.category === "link"
                                ? "link"
                                : visual.category === "image"
                                ? "image"
                                : visual.category === "pdf"
                                ? "file"
                                : "file-text"
                            }
                            size={20}
                            color={stream.accent}
                          />
                        )}
                      </View>

                      {/* Card Title & Type Label */}
                      <View style={styles.cardInfoArea}>
                        <Text
                          style={[styles.cardTitle, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {res.title || "Resource"}
                        </Text>
                        <Text style={[styles.cardType, { color: colors.textMuted }]}>
                          {visual.label}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}

                {/* "+ Add" Resource Card */}
                <PressableScale
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowLinkSelector(true);
                  }}
                  haptic
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel="Link a new resource to this task"
                  style={[
                    styles.addResourceCard,
                    {
                      borderColor: isDark ? "rgba(255, 255, 255, 0.16)" : colors.border,
                      backgroundColor: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.addIconCircle,
                      {
                        backgroundColor: colorWithAlpha(colors.primary, isDark ? 0.2 : 0.1),
                      },
                    ]}
                  >
                    <Feather name="plus" size={18} color={isDark ? colors.primaryLight : colors.primary} />
                  </View>
                  <Text
                    style={[
                      styles.addCardText,
                      {
                        color: colors.textMuted,
                      },
                    ]}
                  >
                    Add
                  </Text>
                </PressableScale>
              </ScrollView>
            </View>

            {/* Quick Action Pills Row (4 Buttons) */}
            <View style={styles.quickActionsRow}>
              {/* 1. Complete */}
              <PressableScale
                onPress={handleCheckboxPress}
                haptic
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel={isCompleted ? "Mark incomplete" : "Complete task"}
                style={[
                  styles.quickActionBtn,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : Palette.slate100,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIconCircle,
                    { backgroundColor: colorWithAlpha(colors.success, 0.16) },
                  ]}
                >
                  <Feather name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.text }]}>
                  {isCompleted ? "Completed" : "Complete"}
                </Text>
              </PressableScale>

              {/* 2. Schedule */}
              <PressableScale
                onPress={() => {
                  if (onSchedule) onSchedule();
                  else onEditTodo?.();
                }}
                haptic
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel="Schedule task"
                style={[
                  styles.quickActionBtn,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : Palette.slate100,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIconCircle,
                    { backgroundColor: colorWithAlpha(Palette.blue500, 0.16) },
                  ]}
                >
                  <Feather name="calendar" size={14} color={Palette.blue500} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.text }]}>
                  Schedule
                </Text>
              </PressableScale>

              {/* 3. Reminder */}
              <PressableScale
                onPress={() => {
                  if (onSetAlarm) onSetAlarm();
                  else onEditTodo?.();
                }}
                haptic
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel="Set reminder alarm"
                style={[
                  styles.quickActionBtn,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : Palette.slate100,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIconCircle,
                    { backgroundColor: colorWithAlpha(Palette.amber500, 0.16) },
                  ]}
                >
                  <Feather name="bell" size={14} color={Palette.amber500} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.text }]}>
                  Reminder
                </Text>
              </PressableScale>

              {/* 4. More */}
              <PressableScale
                onPress={onEditTodo}
                haptic
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel="Open full task details"
                style={[
                  styles.quickActionBtn,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : Palette.slate100,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIconCircle,
                    { backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)" },
                  ]}
                >
                  <Feather name="more-horizontal" size={14} color={colors.textMuted} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.text }]}>
                  More
                </Text>
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* RESOURCE FAN DECK MODAL (Phase 4) */}
        <Modal
          visible={isFanning}
          transparent
          animationType="fade"
          onRequestClose={() => setIsFanning(false)}
        >
          <View style={styles.fanModalBackdrop}>
            {/* Backdrop Tap to close */}
            <Pressable
              onPress={() => setIsFanning(false)}
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Dismiss fanned resources"
            />

            {/* Fanned Cards Deck */}
            <View style={styles.fanDeckContainer} pointerEvents="box-none">
              {linkedResources.map((res: any, idx: number) => {
                const visual = resolveResourceVisual(res);
                const stream = streamColors[visual.category] || streamColors.note;
                const isImage = visual.category === "image" && (visual.thumbnailUri || res.mediaUri);

                const count = linkedResources.length;
                // Calculate rotation and horizontal offset for fan arc
                const angleStep = count > 1 ? Math.min(10, 36 / (count - 1)) : 0;
                const startAngle = -(angleStep * (count - 1)) / 2;
                const targetAngle = startAngle + idx * angleStep;

                const targetX = (idx - (count - 1) / 2) * 36;
                const targetY = -Math.sin(((idx + 0.5) / count) * Math.PI) * 18;

                return (
                  <PressableScale
                    key={res.id || idx}
                    onPress={() => {
                      setIsFanning(false);
                      handleOpenResource(res);
                    }}
                    scaleTo={0.96}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`${res.title}, ${visual.label}`}
                    style={[
                      styles.fannedCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        transform: [
                          { translateX: targetX },
                          { translateY: targetY },
                          { rotate: reducedMotion ? "0deg" : `${targetAngle}deg` },
                        ],
                        zIndex: 10 + idx,
                        shadowColor: Palette.black,
                      },
                    ]}
                  >
                    {/* Top Preview Graphic */}
                    <View
                      style={[
                        styles.fannedCardPreview,
                        {
                          backgroundColor: stream.backgroundColor,
                        },
                      ]}
                    >
                      {isImage ? (
                        <ExpoImage
                          source={{ uri: visual.thumbnailUri || res.mediaUri }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{ alignItems: "center", justifyContent: "center" }}>
                          <Feather
                            name={
                              visual.category === "link"
                                ? "link"
                                : visual.category === "image"
                                ? "image"
                                : visual.category === "pdf"
                                ? "file"
                                : "file-text"
                            }
                            size={28}
                            color={stream.accent}
                          />
                        </View>
                      )}
                    </View>

                    {/* Bottom Metadata Info */}
                    <View style={styles.fannedCardMeta}>
                      <Text
                        style={[styles.fannedCardTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {res.title || "Resource"}
                      </Text>
                      <Text style={[styles.fannedCardType, { color: colors.textMuted }]}>
                        {visual.label}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* Floating (X) Dismiss Button at Bottom-Right */}
            <View style={styles.fanCloseContainer} pointerEvents="box-none">
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setIsFanning(false);
                }}
                scaleTo={0.92}
                haptic
                accessibilityRole="button"
                accessibilityLabel="Close resources fan"
                style={[
                  styles.fanCloseBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    shadowColor: Palette.black,
                  },
                ]}
              >
                <Feather name="x" size={20} color={colors.text} />
              </PressableScale>
            </View>
          </View>
        </Modal>

        {/* RESOURCE LINK SELECTOR MODAL */}
        <Modal
          visible={showLinkSelector}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLinkSelector(false)}
        >
          <View style={styles.selectorModalBackdrop}>
            <View
              style={[
                styles.selectorModalCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.selectorTitle, { color: colors.text }]}>
                Link Resources
              </Text>
              <Text style={[styles.selectorSubtitle, { color: colors.textMuted }]}>
                Select resources to link to this task:
              </Text>

              {allResources.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    No resources in this workspace.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={{ gap: 8 }}
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: screenHeight * 0.45 }}
                >
                  {allResources.map((res) => {
                    const isLinked = linkedResourceIds?.includes(res.id) ?? false;
                    return (
                      <TouchableOpacity
                        key={res.id}
                        onPress={() => onToggleLinkResource?.(item.id, "task", res.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isLinked }}
                        accessibilityLabel={`${res.title}, ${isLinked ? "linked" : "not linked"}`}
                        style={[
                          styles.resourcePickerRow,
                          {
                            borderColor: isLinked ? colors.primary : colors.border,
                            backgroundColor: isLinked
                              ? `${colors.primary}12`
                              : isLight
                              ? Palette.slate50
                              : "rgba(255, 255, 255, 0.03)",
                          },
                        ]}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                          <Feather
                            name={
                              res.type === "link"
                                ? "link"
                                : res.type === "image"
                                ? "image"
                                : "file-text"
                            }
                            size={15}
                            color={colors.textMuted}
                          />
                          <Text
                            style={{ fontSize: 13, fontWeight: "600", color: colors.text, flex: 1 }}
                            numberOfLines={1}
                          >
                            {res.title}
                          </Text>
                        </View>
                        <Feather
                          name={isLinked ? "check-circle" : "circle"}
                          size={18}
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
                accessibilityLabel="Done linking resources"
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    position: "relative",
    overflow: "hidden",
  },
  expandedCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginVertical: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 3,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: ROW_SPEC.row.paddingTop,
    paddingBottom: ROW_SPEC.row.paddingBottom,
    paddingLeft: ROW_SPEC.row.paddingLeft,
    paddingRight: ROW_SPEC.row.paddingRight,
    gap: ROW_SPEC.row.gap,
  },
  checkbox: {
    alignItems: "center",
    justifyContent: "center",
  },
  categoryBadge: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  titleText: {
    letterSpacing: -0.25,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  metaDot: {
    fontSize: ROW_SPEC.type.meta,
    marginHorizontal: 4,
  },
  metaText: {
    fontSize: ROW_SPEC.type.meta,
  },
  trailingArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 44,
  },
  resourceStackPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  stackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Expanded contextual section styles
  expandedBody: {
    marginTop: 6,
    gap: 14,
  },
  descriptionContainer: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  descriptionText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  resourcesSection: {
    gap: 10,
  },
  resourcesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resourcesHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
  },
  horizontalResourceScroll: {
    gap: 10,
    paddingRight: 4,
  },
  resourceCard: {
    width: 108,
    height: 108,
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    justifyContent: "space-between",
  },
  cardPreviewArea: {
    width: "100%",
    height: 54,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardInfoArea: {
    gap: 1,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardType: {
    fontSize: 10,
    fontWeight: "500",
  },
  addResourceCard: {
    width: 76,
    height: 108,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addCardText: {
    fontSize: 11,
    fontWeight: "600",
  },
  // Quick Actions 4-Pills Row
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  quickActionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  quickActionIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  // Fan Deck Modal
  fanModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    justifyContent: "center",
    alignItems: "center",
  },
  fanDeckContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 280,
  },
  fannedCard: {
    position: "absolute",
    width: 144,
    height: 190,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 10,
    justifyContent: "space-between",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  fannedCardPreview: {
    width: "100%",
    height: 114,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fannedCardMeta: {
    gap: 2,
    paddingHorizontal: 2,
  },
  fannedCardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  fannedCardType: {
    fontSize: 11,
    fontWeight: "500",
  },
  fanCloseContainer: {
    position: "absolute",
    bottom: 60,
    right: 32,
  },
  fanCloseBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Resource Selector Modal
  selectorModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  selectorModalCard: {
    width: "90%",
    maxHeight: "75%",
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 20,
    gap: 12,
  },
  selectorTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  selectorSubtitle: {
    fontSize: 12,
    marginTop: -4,
  },
  resourcePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  doneBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  doneBtnText: {
    color: Palette.white,
    fontWeight: "700",
    fontSize: 14,
  },
});
