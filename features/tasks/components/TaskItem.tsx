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
import { getCategoryColors, TaskListPriorityColors } from "@/shared/constants/categoryColors";
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
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { getTaskCategoryMeta, normalizeTaskCategory } from "@/features/tasks/services/task-categories";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { formatRelativeTaskDate, formatTimeRange } from "@/features/tasks/utils/task-formatting";
import { resolveItemCategorySymbol } from "@/features/today/utils/item-presentation";
import {
  getStreamResourcePalette,
  resolveResourceVisual,
} from "@/features/today/utils/resource-presentation";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isTaskCompleted, getTaskOccurrenceState } from "@/shared/utils/domain-selectors";
import { getTodayDateKey } from "@/shared/utils/date-key";

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
}

type MetaPart = {
  key: "category" | "priority" | "date" | "duration" | "reminder" | "recurrence" | "overdue";
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
}: TodoItemProps) {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLight = colorScheme === "light";
  const isDark = colorScheme !== "light";
  const categoryColors = getCategoryColors(isDark);
  const streamColors = getStreamResourcePalette(isDark);

  // Independent disclosures — the row itself never becomes a giant card.
  const [resourcesExpanded, setResourcesExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  const priorityStripeColor = useMemo(() => {
    const prio = item.priority || "none";
    if (prio === "high") return TaskListPriorityColors.high.dark;
    if (prio === "medium") return TaskListPriorityColors.medium.dark;
    if (prio === "low") return TaskListPriorityColors.low.dark;
    return isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)";
  }, [item.priority, isDark]);

  // Context-aware metadata formatting
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

    // 1b. Priority — text cue so priority is not communicated by the edge
    // strip's color alone.
    const priority = item.priority || "none";
    if (priority !== "none") {
      parts.push({
        key: "priority",
        text:
          priority === "high" ? "High" : priority === "medium" ? "Medium" : "Low",
        icon: "flag",
        color: TaskListPriorityColors[priority].dark,
      });
    }

    // 2. Schedule and Reminder Context
    const scheduleDate = item.schedule?.date;
    const isInboxTask = !scheduleDate || scheduleDate === "inbox";
    const timeRange = formatTimeRange(
      item.schedule?.startTime,
      item.schedule?.endTime,
      durationMinutes
    );

    let reminderText = "";
    if (item.reminder && item.reminder.enabled && item.reminder.triggerAt) {
      const d = new Date(item.reminder.triggerAt);
      reminderText = formatReminderTime(d.getHours(), d.getMinutes()) || "";
    }

    const referenceDate = selectedDate || item.schedule?.date || getTodayDateKey();
    const occState = getTaskOccurrenceState(item, referenceDate);
    const isTaskOverdue = overdue || (occState.isOverdue && !isCompleted);

    // 2. Overdue label
    if (isTaskOverdue && !omitOverdueLabel) {
      parts.push({
        key: "overdue",
        text: "Overdue",
        icon: "alert-circle",
        color: colors.error,
      });
    }

    // 3. Date & Time context
    if (isInboxTask) {
      parts.push({
        key: "date",
        text: "No schedule",
        color: colors.textMuted,
      });
    } else if (occState.occurs) {
      // Occurs on selected date
      if (timeRange) {
        parts.push({
          key: "date",
          text: timeRange,
          color: colors.textMuted,
        });
      }
    } else {
      // Relative date (Earlier / Tomorrow / Upcoming)
      const relDate = formatRelativeTaskDate(scheduleDate, referenceDate);
      const dateLabel = relDate?.label || scheduleDate;
      const displayText = timeRange ? `${dateLabel} · ${timeRange}` : (dateLabel || "No date");
      parts.push({
        key: "date",
        text: displayText,
        color: isTaskOverdue && !omitOverdueLabel ? colors.error : colors.textMuted,
      });
    }

    // 4. Reminder (strictly independent from schedule)
    if (reminderText) {
      parts.push({
        key: "reminder",
        text: reminderText,
        icon: "bell",
        color: colors.textMuted,
      });
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

    // 4. Duration (if duration exists and not already captured in timeRange)
    if (durationMinutes && !item.schedule?.startTime) {
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
    item.priority,
    omitOverdueLabel,
    item.schedule?.date,
    item.schedule?.startTime,
    item.schedule?.endTime,
    selectedDate,
    isCompleted,
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
          borderColor: isDark ? colors.background : Palette.white,
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
          borderColor: isDark ? colors.background : Palette.white,
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
      disabled={isSelectionMode}
    >
      <View
        onLayout={onLayout}
        style={[
          styles.rowContainer,
          { backgroundColor: "transparent" },
          {
            opacity: isCompleted ? 0.6 : 1,
          },
        ]}
      >
        {/* Visual Priority Edge Strip */}
        <View
          style={[
            styles.priorityEdgeStrip,
            {
              backgroundColor: priorityStripeColor,
            },
          ]}
        />

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

          {/* Title & Metadata (tap opens the existing Task Details flow) */}
          <PressableScale
            onPress={isSelectionMode ? onSelect : () => onEditTodo?.()}
            haptic
            style={styles.textContainer}
            accessibilityRole="button"
            accessibilityLabel={
              isSelectionMode
                ? `Select task ${item.title}`
                : `Open task details: ${item.title}`
            }
          >
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.titleText,
                  {
                    fontSize: ROW_SPEC.type.title,
                    fontWeight: ROW_SPEC.type.titleWeight,
                    color: isCompleted ? colors.textMuted : colors.text,
                    textDecorationLine: isCompleted ? "line-through" : "none",
                  },
                ]}
                numberOfLines={1}
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

          {/* Trailing Resource Stack & Overflow */}
          <View style={styles.trailingArea}>
            {totalResources > 0 && (
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setResourcesExpanded((prev) => !prev);
                }}
                scaleTo={0.93}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`${totalResources} linked resources for ${item.title}`}
                accessibilityState={{ expanded: resourcesExpanded }}
                style={styles.resourceStackPressable}
              >
                <View style={styles.stackRow}>
                  {visibleTiles.map((res: any, index: number) => renderStackTile(res, index))}
                  {hasPlusChip && renderPlusChip(plusChipCount)}
                </View>
              </PressableScale>
            )}

            {!isSelectionMode && (
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setIsMenuOpen(true);
                }}
                scaleTo={0.9}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`More options for ${item.title}`}
                style={styles.overflowButton}
              >
                <Feather name="more-vertical" size={18} color={colors.textMuted} />
              </PressableScale>
            )}
          </View>
        </View>

        {/* INLINE RESOURCE DISCLOSURE (independent from the task row) */}
        {resourcesExpanded && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            exiting={reducedMotion ? undefined : FadeOut.duration(160)}
            layout={reducedMotion ? undefined : LinearTransition.duration(240)}
            style={styles.resourcesSection}
          >
            <View style={styles.resourcesHeaderRow}>
              <PressableScale
                onPress={() => setResourcesExpanded(false)}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`Collapse resources for ${item.title}`}
                style={styles.resourcesHeaderLeft}
              >
                <Text style={[styles.resourcesHeaderTitle, { color: colors.text }]}>
                  {`Resources (${totalResources})`}
                </Text>
                <Feather name="chevron-down" size={15} color={colors.textMuted} />
              </PressableScale>
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
          </Animated.View>
        )}

        {/* COMPACT TASK ACTIONS (bottom action sheet) */}
        <AnimatedOverlay
          visible={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          type="bottom-sheet"
        >
          {(close) => (
            <View
              style={[
                styles.actionSheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.actionSheetTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  close();
                  (onSchedule || onEditTodo)?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Schedule task"
                style={styles.actionSheetRow}
              >
                <Feather name="calendar" size={17} color={colors.textMuted} />
                <Text style={[styles.actionSheetRowLabel, { color: colors.text }]}>
                  Schedule
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  close();
                  (onSetAlarm || onEditTodo)?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Set reminder"
                style={styles.actionSheetRow}
              >
                <Feather name="bell" size={17} color={colors.textMuted} />
                <Text style={[styles.actionSheetRowLabel, { color: colors.text }]}>
                  Reminder
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  close();
                  onEditTodo?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Open task details"
                style={styles.actionSheetRow}
              >
                <Feather name="edit-3" size={17} color={colors.textMuted} />
                <Text style={[styles.actionSheetRowLabel, { color: colors.text }]}>
                  Open details
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  close();
                  onDeleteTodo();
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete task"
                style={styles.actionSheetRow}
              >
                <Feather name="trash-2" size={17} color={colors.error} />
                <Text style={[styles.actionSheetRowLabel, { color: colors.error }]}>
                  Delete
                </Text>
              </TouchableOpacity>

              <View style={[styles.actionSheetDivider, { backgroundColor: colors.border }]} />

              <TouchableOpacity
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={[
                  styles.actionSheetCancel,
                  { backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : Palette.slate100 },
                ]}
              >
                <Text style={[styles.actionSheetCancelText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </AnimatedOverlay>

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
  priorityEdgeStrip: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3.5,
    borderRadius: 2,
    zIndex: 2,
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
  overflowButton: {
    width: 32,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Inline resource disclosure styles
  resourcesSection: {
    gap: 10,
    paddingLeft: ROW_SPEC.row.paddingLeft,
    paddingRight: ROW_SPEC.row.paddingRight,
    paddingBottom: 14,
  },
  resourcesHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  // Task action sheet (secondary actions)
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 2,
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  actionSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  actionSheetRowLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  actionSheetDivider: {
    height: 1.5,
    marginVertical: 8,
  },
  actionSheetCancel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionSheetCancelText: {
    fontSize: 15,
    fontWeight: "700",
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
