import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo, useEffect, useRef } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import {
  EntityItem,
  EntityMetaRow,
  type EntityMetaPart,
  resolveEntityCategoryPresentation,
} from "@/features/items";
import { Palette } from "@/shared/constants/theme";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import { Radius } from "@/shared/constants/radii";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import {
  LayoutChangeEvent,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/shared/components/ui/AppText";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";
import { SwipeableCard } from "@/shared/components/ui/SwipeableCard";
import { TaskQuickEditSheet } from "./TaskQuickEditSheet";
import { TaskDatePickerModal } from "./TaskDatePickerModal";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  getTaskMetadataParts,
  TaskMetadataPart,
  TaskSectionContext,
} from "@/features/tasks/utils/task-formatting";
import {
  getStreamResourcePalette,
  resolveResourceVisual,
} from "@/features/today/utils/resource-presentation";
import { openAttachmentFile } from "@/features/resources/utils/fileOpener";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { getTodayDateKey } from "@/shared/utils/date-key";

export function getResourcePresentation(res: any) {
  const visual = resolveResourceVisual(res);
  const isImage = visual.category === "image" && Boolean(visual.thumbnailUri || res.mediaUri);

  if (isImage) {
    return {
      visual,
      isImage: true as const,
      imageUri: visual.thumbnailUri || res.mediaUri,
      title: "",
      domain: null,
      badge: null,
    };
  }

  if (visual.category === "link") {
    const raw = res.url || res.content || res.title || "";
    let domain: string | null = null;
    try {
      const match = String(raw).match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
      if (match && match[1]) {
        domain = match[1];
      }
    } catch {
      // fallback
    }

    const rawTitle = res.title || "";
    const isTitleUrl =
      /^https?:\/\//i.test(rawTitle) ||
      /^www\./i.test(rawTitle) ||
      (domain && rawTitle.toLowerCase() === domain.toLowerCase());

    const displayTitle = isTitleUrl ? (domain || rawTitle || "Web Link") : rawTitle;

    return {
      visual,
      isImage: false as const,
      imageUri: null,
      title: displayTitle,
      domain: !isTitleUrl && domain ? domain : null,
      badge: null,
    };
  }

  if (visual.category === "pdf") {
    const rawTitle = (res.title || "Document").replace(/\.pdf$/i, "");
    return {
      visual,
      isImage: false as const,
      imageUri: null,
      title: rawTitle,
      domain: null,
      badge: "PDF",
    };
  }

  return {
    visual,
    isImage: false as const,
    imageUri: null,
    title: res.title || visual.label || "Note",
    domain: null,
    badge: null,
  };
}

interface TodoItemProps {
  item: Task;
  colors: any;
  colorScheme: "light" | "dark" | null | undefined;
  isOverdue: boolean;
  omitOverdueLabel?: boolean;
  selectedDate?: string;
  sectionContext?: TaskSectionContext;
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

export function TodoItem({
  item,
  colors,
  colorScheme,
  isOverdue: overdue,
  omitOverdueLabel = false,
  selectedDate,
  sectionContext,
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
  const isLight = colorScheme === "light";
  const isDark = colorScheme !== "light";
  const streamColors = getStreamResourcePalette(isDark);

  // Contextual Quick Edit sheet & Date picker modals
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

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

  const primaryResourceVisual = useMemo(() => {
    if (!linkedResources || linkedResources.length === 0) return null;
    return resolveResourceVisual(linkedResources[0]);
  }, [linkedResources]);

  const resourceIconName = useMemo(() => {
    if (!primaryResourceVisual) return "paperclip";
    switch (primaryResourceVisual.category) {
      case "link":
        return "link-2";
      case "image":
        return "image";
      case "pdf":
        return "file";
      case "note":
      default:
        return "file-text";
    }
  }, [primaryResourceVisual]);

  const handleOpenResource = (res: any) => {
    Haptics.selectionAsync().catch(() => {});
    const visual = resolveResourceVisual(res);
    const attachment = res.attachments?.[0];
    const imageUri =
      visual.category === "image"
        ? (visual.thumbnailUri || res.mediaUri || attachment?.uri)
        : null;
    const isPdf = Boolean(
      attachment?.mimeType?.includes("pdf") ||
      visual.category === "pdf" ||
      attachment?.name?.toLowerCase().endsWith(".pdf") ||
      res.title?.toLowerCase().endsWith(".pdf")
    );

    if (imageUri) {
      void openAttachmentFile(imageUri, {
        name: res.title || "Image",
        mimeType: attachment?.mimeType || "image/jpeg",
      });
    } else if (res.type === "link" || res.url || (res.content && /^https?:\/\//i.test(res.content))) {
      const url = attachment?.uri || res.url || res.content || res.title;
      const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      void openAttachmentFile(targetUrl, { name: res.title });
    } else if (attachment?.uri && isPdf) {
      void openAttachmentFile(attachment.uri, {
        name: attachment.name || res.title,
        mimeType: attachment.mimeType || "application/pdf",
      });
    } else {
      const targetWs =
        res.workspaceId || item.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      router.push(`/resource-details?id=${res.id}&workspaceId=${targetWs}`);
    }
  };

  // Category presentation (color and icon) for subtle ambient background blend and inline category icon
  const categoryPresentation = useMemo(() => {
    return resolveEntityCategoryPresentation(
      {
        categoryId: item.categoryId,
        title: item.title,
        type: "task",
        priority: item.priority,
      },
      isDark,
    );
  }, [item.title, item.categoryId, item.priority, isDark]);

  const gradientId = useMemo(
    () => `task-cat-wash-${String(item.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    [item.id],
  );

  const currentWorkspace = useMemo(() => {
    const wsId = item.workspaceId || selectedWorkspaceId;
    return lists.find((w) => w.id === wsId);
  }, [lists, item.workspaceId, selectedWorkspaceId]);

  const folderName =
    currentWorkspace?.name ||
    (item.workspaceId === INBOX_WORKSPACE_ID || item.workspaceId === "inbox"
      ? "Inbox"
      : "Work");

  const shouldShowWorkspace =
    showWorkspaceBadge !== undefined
      ? showWorkspaceBadge
      : (!selectedWorkspaceId || selectedWorkspaceId === "all");

  // Context-aware metadata formatting
  const metaParts = useMemo<TaskMetadataPart[]>(() => {
    return getTaskMetadataParts(item, {
      referenceDate: selectedDate || getTodayDateKey(),
      sectionContext,
      isCompleted,
      overdue,
      omitOverdueLabel,
      workspaceName: shouldShowWorkspace ? folderName : null,
      colors: {
        textMuted: colors.textMuted,
        error: colors.error,
      },
    });
  }, [
    item,
    selectedDate,
    sectionContext,
    isCompleted,
    overdue,
    omitOverdueLabel,
    shouldShowWorkspace,
    folderName,
    colors.textMuted,
    colors.error,
  ]);

  const entityMetaParts = useMemo<EntityMetaPart[]>(() => {
    const parts: EntityMetaPart[] = metaParts.map((part) => ({
      key: part.key,
      text: part.text,
      icon: part.icon,
      color: part.color,
      isBold: part.key === "overdue",
      itemStyle: [
        part.key === "category" ? styles.metaPartWorkspace : undefined,
        part.key === "recurrence" ? styles.metaPartRecurrence : undefined,
      ],
    }));

    if (totalResources > 0) {
      parts.push({
        key: "resources",
        text: String(totalResources),
        icon: resourceIconName,
        onPress: isSelectionMode
          ? onSelect
          : () => {
              setIsMenuOpen(true);
            },
        accessibilityRole: "button",
        accessibilityLabel: `${totalResources} linked resources for ${item.title}`,
        accessibilityState: { expanded: false },
        testID: "task-resource-indicator",
      });
    }

    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      last.itemStyle = [last.itemStyle, styles.metaPartLast];
    }

    return parts;
  }, [metaParts, totalResources, resourceIconName, isSelectionMode, onSelect, item.title]);

  return (
    <SwipeableCard
      onSwipeRight={handleCheckboxPress}
      onSwipeLeft={onDeleteTodo}
      disabled={isSelectionMode}
    >
      <EntityItem
        onLayout={onLayout}
        category={categoryPresentation}
        priority={item.priority}
        dimmed={isCompleted}
        colorScheme={colorScheme}
        testIDPrefix="task-category"
        gradientId={gradientId}
        leadingControl={
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
        }
        title={item.title}
        isCompleted={isCompleted}
        onPressContent={isSelectionMode ? onSelect : () => onEditTodo?.()}
        contentAccessibilityRole="button"
        contentAccessibilityLabel={
          isSelectionMode
            ? `Select task ${item.title}`
            : `Open task details: ${item.title}`
        }
        metadata={
          entityMetaParts.length > 0 ? (
            <EntityMetaRow parts={entityMetaParts} dotColor={colors.textMuted} />
          ) : null
        }
        trailingActions={
          !isSelectionMode ? (
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
          ) : null
        }
      >
        {/* TASK QUICK EDIT (compact bottom sheet) */}
        <TaskQuickEditSheet
          visible={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          item={item}
          colors={colors}
          isDark={isDark}
          isCompleted={isCompleted}
          onToggleComplete={handleCheckboxPress}
          onEditTodo={onEditTodo}
          onSetAlarm={onSetAlarm}
          onOpenDatePicker={() => setIsDatePickerOpen(true)}
          onDeleteTodo={onDeleteTodo}
          linkedResources={linkedResources}
          totalResources={totalResources}
          streamColors={streamColors}
          handleOpenResource={handleOpenResource}
          onOpenLinkSelector={() => {
            setIsMenuOpen(false);
            onEditTodo?.();
          }}
        />

        {/* TASK DATE PICKER MODAL (launched from Quick Edit Schedule) */}
        <TaskDatePickerModal
          visible={isDatePickerOpen}
          onClose={() => setIsDatePickerOpen(false)}
          selectedDate={item.schedule?.date || getTodayDateKey()}
          onSelectDate={async (dateKey) => {
            setIsDatePickerOpen(false);
            try {
              await EntityCommandService.updateTask(item.id, item.workspaceId, {
                schedule: {
                  ...item.schedule,
                  date: dateKey,
                },
              });
            } catch (e) {
              console.warn("[TaskItem] Failed to update task schedule date", e);
            }
          }}
          colors={colors}
          isDark={isDark}
        />
      </EntityItem>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: "center",
    justifyContent: "center",
  },
  metaPartWorkspace: {
    flexShrink: 1,
    maxWidth: 110,
  },
  metaPartRecurrence: {
    flexShrink: 1,
    maxWidth: 130,
  },
  metaPartLast: {
    flexShrink: 1,
  },
  overflowButton: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});

