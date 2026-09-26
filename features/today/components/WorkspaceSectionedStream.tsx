import React from "react";
import { View, StyleSheet, ScrollView, Dimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { type Router } from "expo-router";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import { Radius } from "@/shared/constants/radii";
import {
  StreakColors,
  getCategoryColors,
  getStreamResourceStyle,
  resolveColor,
} from "@/shared/constants/categoryColors";
import { Palette, type ThemeColors } from "@/shared/constants/theme";
import { type Checklist, type Habit, type Task, type Workspace } from "@/shared/types/domain.types";
import {
  isTaskCompleted,
  isHabitCompletedToday,
  getHabitCurrentStreak,
  getTaskOccurrenceState,
} from "@/shared/utils/domain-selectors";
import { getDateKey, getTodoDateKey } from "@/features/tasks/utils/task-formatting";
import {
  getTaskCategoryMeta,
  isTaskCategory,
} from "@/features/tasks/services/task-categories";
import {
  getCheckboxAction,
  getRowContentAction,
} from "@/features/today/utils/today-interactions";

/**
 * Relative age of an overdue item, expressed as a single human token.
 * `null` when the date is today or in the future (i.e. not actually overdue).
 */
const getDaysOverdue = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const todayStr = getDateKey();
  if (dateStr === todayStr) return null;
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const taskDate = new Date(dy, dm - 1, dd);
  const diffTime = todayDate.getTime() - taskDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : null;
};

const getOverdueLabel = (daysOverdue: number | null) => {
  if (daysOverdue === null) return "Overdue";
  if (daysOverdue === 1) return "Yesterday";
  return `${daysOverdue} days ago`;
};

const formatTime = (triggerAt: number) => {
  const d = new Date(triggerAt);
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const displayHour = d.getHours() % 12 || 12;
  const displayMinute = String(d.getMinutes()).padStart(2, "0");
  return `${displayHour}:${displayMinute} ${ampm}`;
};

const formatFrequency = (frequency?: string) => {
  if (!frequency) return null;
  const freq = String(frequency).toLowerCase();
  if (freq === "daily") return "Every day";
  if (freq === "weekly") return "Every week";
  if (freq === "monthly") return "Every month";
  return `Every ${freq}`;
};

export type ResourceCategory = "image" | "pdf" | "link" | "note";

export interface ResourceVisualInfo {
  category: ResourceCategory;
  label: string;
  thumbnailUri?: string;
  attachmentCount?: number;
}

/**
 * Robust resource category and thumbnail resolver
 * Identifies images (by MIME or extension), PDFs, links, and notes.
 * Extracts image thumbnail URI from attachments, direct URI, or content.
 */
export function resolveResourceVisual(res: any): ResourceVisualInfo {
  const attachments = Array.isArray(res.attachments) ? res.attachments : [];
  const attachment = attachments[0];
  const name = (attachment?.name || res.title || "").toLowerCase();
  const mime = (attachment?.mimeType || res.mimeType || "").toLowerCase();
  const uri =
    attachment?.uri ||
    res.uri ||
    (typeof res.content === "string" &&
    (res.content.startsWith("file://") ||
      res.content.startsWith("http://") ||
      res.content.startsWith("https://") ||
      res.content.startsWith("data:image/"))
      ? res.content
      : undefined);

  // 1. Image detection
  const isImageMime = mime.startsWith("image/");
  const isImageExt =
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(name) ||
    (uri ? /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(uri) : false);

  if (isImageMime || isImageExt) {
    return {
      category: "image",
      label: "Image",
      thumbnailUri: uri,
      attachmentCount: attachments.length,
    };
  }

  // 2. PDF detection
  const isPdfMime = mime.includes("pdf");
  const isPdfExt =
    /\.pdf(\?.*)?$/i.test(name) ||
    (uri ? /\.pdf(\?.*)?$/i.test(uri) : false);

  if (isPdfMime || isPdfExt) {
    return {
      category: "pdf",
      label: "PDF",
      attachmentCount: attachments.length,
    };
  }

  // 3. Link detection
  const isLink =
    res.type === "link" ||
    /^(https?:\/\/|www\.)/i.test(res.title || "") ||
    /^(https?:\/\/|www\.)/i.test(res.content || "") ||
    /^(https?:\/\/|www\.)/i.test(res.body || "");

  if (isLink) {
    return {
      category: "link",
      label: "Link",
      attachmentCount: attachments.length,
    };
  }

  // 4. Note / Idea fallback
  return {
    category: "note",
    label: res.type === "idea" ? "Idea" : "Note",
    attachmentCount: attachments.length,
  };
}

export type WorkspaceItemType = "task" | "habit" | "checklist" | "resource";

export interface ItemMetaPart {
  text: string;
  icon?: string;
  color?: string;
}

export interface ItemCategorySymbol {
  icon: string;
  color: string;
  tint: string;
  label?: string;
}

/**
 * Resolves category visual presentation (icon, color, soft background tint)
 * giving items visual depth across tasks, habits, and checklists.
 */
export function resolveItemCategorySymbol(
  item: {
    type: WorkspaceItemType;
    categoryId?: string;
    original?: any;
  },
  isDark: boolean,
): ItemCategorySymbol {
  const original = item.original || {};
  const rawCategory =
    item.categoryId ||
    original.categoryId ||
    original.category;

  if (rawCategory && isTaskCategory(rawCategory)) {
    const meta = getTaskCategoryMeta(rawCategory);
    return {
      icon: meta.icon,
      color: meta.color,
      tint: isDark ? `${meta.color}28` : `${meta.color}16`,
      label: meta.label,
    };
  }

  if (item.type === "habit") {
    return {
      icon: "activity",
      color: Palette.emerald500,
      tint: isDark ? "rgba(16, 185, 129, 0.22)" : "rgba(16, 185, 129, 0.14)",
      label: "Habit",
    };
  }

  if (item.type === "checklist") {
    return {
      icon: "check-square",
      color: Palette.indigo500,
      tint: isDark ? "rgba(99, 102, 241, 0.22)" : "rgba(99, 102, 241, 0.14)",
      label: "Checklist",
    };
  }

  if (item.type === "resource") {
    return {
      icon: "file-text",
      color: Palette.sky500,
      tint: isDark ? "rgba(14, 165, 233, 0.22)" : "rgba(14, 165, 233, 0.14)",
      label: "Resource",
    };
  }

  // Default task category: work
  const defaultMeta = getTaskCategoryMeta("work");
  return {
    icon: defaultMeta.icon,
    color: defaultMeta.color,
    tint: isDark ? `${defaultMeta.color}28` : `${defaultMeta.color}16`,
    label: defaultMeta.label,
  };
}

export interface WorkspaceItemRowProps {
  type: WorkspaceItemType;
  id: string;
  title: string;
  subtitle?: string;
  metaParts?: ItemMetaPart[];
  categorySymbol?: ItemCategorySymbol;
  isOverdue?: boolean;
  completed?: boolean;
  priority?: "high" | "medium" | "low";
  hasReminder?: boolean;
  streak?: number;
  checklistProgress?: {
    completedCount: number;
    totalCount: number;
  };
  resourceVisual?: ResourceVisualInfo;
  isExpanded?: boolean;
  accentColor: string;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  onToggleComplete?: () => void;
  onPressRow?: () => void;
  checkboxDisabled?: boolean;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

/**
 * Consolidated WorkspaceItemRow Component
 *
 * Enforces a clean two-line typography hierarchy:
 *   TITLE
 *   secondary context
 *
 * Priority is communicated exclusively via the left vertical stripe.
 * The right column carries only state that is *not* already implied by the
 * title or the secondary line (streak, checklist progress, reminder bell).
 * Workspace identity is deliberately absent — it belongs to the section.
 */
export const WorkspaceItemRow: React.FC<WorkspaceItemRowProps> = ({
  type,
  id,
  title,
  subtitle,
  metaParts,
  categorySymbol,
  isOverdue = false,
  completed = false,
  priority,
  hasReminder = false,
  streak,
  checklistProgress,
  resourceVisual,
  isExpanded = false,
  accentColor,
  colors,
  colorScheme,
  onToggleComplete,
  onPressRow,
  checkboxDisabled = false,
  accessibilityLabel,
  children,
}) => {
  const isDark = colorScheme !== "light";
  // Priority stripe is resolved from the active scheme (was previously a
  // module-level constant pinned to the dark palette).
  const categoryColors = getCategoryColors(isDark);
  const priorityColor = priority ? categoryColors.priority[priority] : undefined;
  const resolvedCategorySymbol =
    categorySymbol || resolveItemCategorySymbol({ type }, isDark);
  const streamColors = {
    image: getStreamResourceStyle("image", isDark),
    pdf: getStreamResourceStyle("pdf", isDark),
    link: getStreamResourceStyle("link", isDark),
    note: getStreamResourceStyle("note", isDark),
  };
  const streakColors = {
    accent: resolveColor(StreakColors.accent, isDark),
    surface: resolveColor(StreakColors.surface, isDark),
  };

  const renderResourceVisual = () => {
    const visual = resourceVisual || { category: "note" as const, label: "Note" };

    if (visual.category === "image") {
      if (visual.thumbnailUri) {
        return (
          <View
            style={[
              styles.resourceThumbnailWrap,
              {
                borderColor: isDark
                  ? "rgba(255, 255, 255, 0.12)"
                  : "rgba(0, 0, 0, 0.08)",
              },
            ]}
          >
            <ExpoImage
              source={{ uri: visual.thumbnailUri }}
              style={styles.resourceThumbnail}
              contentFit="cover"
              transition={150}
            />
          </View>
        );
      }

      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: streamColors.image.backgroundColor,
              borderColor: streamColors.image.borderColor,
            },
          ]}
        >
          <Feather name="image" size={15} color={streamColors.image.accent} />
        </View>
      );
    }

    if (visual.category === "pdf") {
      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: streamColors.pdf.backgroundColor,
              borderColor: streamColors.pdf.borderColor,
            },
          ]}
        >
          <Feather name="file-text" size={15} color={streamColors.pdf.accent} />
        </View>
      );
    }

    if (visual.category === "link") {
      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: streamColors.link.backgroundColor,
              borderColor: streamColors.link.borderColor,
            },
          ]}
        >
          <Feather name="link" size={15} color={streamColors.link.accent} />
        </View>
      );
    }

    // Default Note / Document
    return (
      <View
        style={[
          styles.resourceIconBadge,
          {
            backgroundColor: streamColors.note.backgroundColor,
            borderColor: streamColors.note.borderColor,
          },
        ]}
      >
        <Feather name="file-text" size={15} color={streamColors.note.accent} />
      </View>
    );
  };

  const renderControl = () => {
    if (type === "resource") {
      return renderResourceVisual();
    }

    if (type === "checklist") {
      return (
        <PressableScale
          disabled={checkboxDisabled || !onToggleComplete}
          onPress={onToggleComplete}
          hitSlop={12}
          haptic
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={`Toggle checklist ${title}`}
          style={[
            styles.checklistSquare,
            {
              borderColor: completed
                ? accentColor
                : isDark
                ? "rgba(255,255,255,0.2)"
                : "rgba(0,0,0,0.2)",
              backgroundColor: completed ? accentColor : "transparent",
            },
          ]}
        >
          {completed && <Feather name="check" size={12} color={Palette.white} />}
        </PressableScale>
      );
    }

    // Task or Habit: circular checkbox
    const checkColor = type === "habit" ? categoryColors.calendarEntity.habit : accentColor;
    return (
      <PressableScale
        disabled={checkboxDisabled || !onToggleComplete}
        onPress={onToggleComplete}
        hitSlop={12}
        haptic
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Mark ${type} ${title} as ${completed ? "incomplete" : "complete"}`}
        style={[
          styles.checkboxBase,
          {
            borderColor: completed
              ? checkColor
              : isDark
              ? "rgba(255,255,255,0.2)"
              : "rgba(0,0,0,0.2)",
            backgroundColor: completed ? checkColor : "transparent",
          },
        ]}
      >
        {completed && <Feather name="check" size={12} color={Palette.white} />}
      </PressableScale>
    );
  };

  const renderSecondaryLine = () => {
    if (metaParts && metaParts.length > 0) {
      const parts = metaParts.slice(0, 3);
      return (
        <View style={styles.metaLineRow}>
          {parts.map((part, index) => {
            const isLastPart = index === parts.length - 1;
            const partColor =
              part.color ||
              (isOverdue && !completed ? colors.error : colors.textMuted);
            return (
              <React.Fragment key={`meta-${index}`}>
                <View style={styles.metaPartItem}>
                  {part.icon ? (
                    <Feather
                      name={part.icon as any}
                      size={10}
                      color={partColor}
                      style={styles.metaPartIcon}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.itemSubtitleText,
                      { color: partColor },
                    ]}
                    numberOfLines={1}
                  >
                    {part.text}
                  </Text>
                </View>
                {!isLastPart && (
                  <Text
                    style={[
                      styles.metaDotSeparator,
                      { color: colors.textMuted },
                    ]}
                  >
                    {" · "}
                  </Text>
                )}
              </React.Fragment>
            );
          })}
        </View>
      );
    }

    if (subtitle) {
      return (
        <Text
          style={[
            styles.itemSubtitleText,
            {
              color:
                isOverdue && !completed
                  ? colors.error
                  : colors.textMuted,
            },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      );
    }

    return null;
  };

  const renderTrailingMeta = () => {
    // Habit: Streak chip
    if (type === "habit" && typeof streak === "number") {
      return (
        <View
          style={[
            styles.streakChip,
            {
              backgroundColor: streakColors.surface,
            },
          ]}
        >
          <Text
            style={[
              styles.streakText,
              { color: streakColors.accent },
            ]}
          >
            {`🔥 ${streak}`}
          </Text>
        </View>
      );
    }

    // Checklist: Progress count (e.g. 0/2)
    if (type === "checklist" && checklistProgress) {
      return (
        <Text style={[styles.trailingCounterText, { color: colors.textMuted }]}>
          {`${checklistProgress.completedCount}/${checklistProgress.totalCount}`}
        </Text>
      );
    }

    // Task: Subtle bell icon if reminder scheduled
    if (type === "task" && hasReminder && !completed) {
      return (
        <Feather
          name="bell"
          size={12}
          color={colors.textMuted}
          style={styles.bellIcon}
        />
      );
    }

    // Resource: Attachment count if multiple
    if (
      type === "resource" &&
      resourceVisual?.attachmentCount &&
      resourceVisual.attachmentCount > 1
    ) {
      return (
        <View style={styles.resourceAttachmentCountWrap}>
          <Feather name="paperclip" size={11} color={colors.textMuted} />
          <Text
            style={[
              styles.resourceAttachmentCountText,
              { color: colors.textMuted },
            ]}
          >
            {resourceVisual.attachmentCount}
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.rowWrapper}>
      <View style={styles.itemRow}>
        {/* Priority cap on the left edge only */}
        <View style={styles.priorityIndicatorContainer}>
          {priorityColor ? (
            <View
              style={[
                styles.priorityBar,
                { backgroundColor: priorityColor },
              ]}
            />
          ) : (
            <View style={styles.prioritySpacer} />
          )}
        </View>

        {/* Completion Control or Resource Visual */}
        {renderControl()}

        <View style={styles.controlSpacer} />

        {/* Clickable Content Area */}
        <PressableScale
          onPress={onPressRow}
          disabled={!onPressRow}
          haptic
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || `${title}, ${subtitle || type}`}
          style={styles.flexOne}
          contentStyle={styles.rowContentStyle}
        >
          {/* Two-line title + secondary context */}
          <View style={styles.rowTextContainer}>
            <View style={styles.itemTitleRow}>
              {type !== "resource" && resolvedCategorySymbol && (
                <View
                  style={[
                    styles.categorySymbolBadge,
                    { backgroundColor: resolvedCategorySymbol.tint },
                  ]}
                >
                  <Feather
                    name={resolvedCategorySymbol.icon as any}
                    size={11}
                    color={resolvedCategorySymbol.color}
                  />
                </View>
              )}
              <Text
                style={[
                  styles.itemTitleText,
                  {
                    color: completed ? colors.textMuted : colors.text,
                    textDecorationLine: completed ? "line-through" : "none",
                  },
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
            {renderSecondaryLine()}
          </View>

          {/* Right side: state that the title does not already imply */}
          <View style={styles.rowRightWrap}>
            {renderTrailingMeta()}

            {type === "checklist" ? (
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
                style={styles.rowChevron}
              />
            ) : (
              <Feather
                name="chevron-right"
                size={14}
                color={colors.textMuted}
                style={styles.rowChevron}
              />
            )}
          </View>
        </PressableScale>
      </View>

      {/* Nested Children (e.g. Expanded Checklist Sub-Items) */}
      {isExpanded && children}
    </View>
  );
};

export interface ActiveContextItem {
  folder: Workspace;
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  totalCount: number;
}

export interface WorkspaceSectionedStreamProps {
  activeContexts: ActiveContextItem[];
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  allCollections?: Record<string, any[]>;
  expandedChecklistIds: Record<string, boolean>;
  setExpandedChecklistIds: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  router: Router;
  completeTodoFromDashboard: (todoId: string, event?: any, workspaceId?: string) => Promise<void>;
  completeHabitFromDashboard: (habitId: string, event?: any, workspaceId?: string) => Promise<void>;
  toggleChecklistItemFromDashboard: (
    checklistId: string,
    itemId: string,
    folderId: string,
  ) => Promise<void>;
}

/**
 * Relevance bands. Lower sorts first. The deck answers "what matters now",
 * so urgency and momentum outrank entity type.
 */
const RELEVANCE = {
  OVERDUE_TASK: 0,
  SCHEDULED_TASK: 1,
  ACTIVE_HABIT: 2,
  OPEN_CHECKLIST: 3,
  OPEN_TASK: 4,
  DONE: 100,
} as const;

const TYPE_ORDER: Record<StreamActionItem["type"], number> = {
  habit: 0,
  task: 1,
  checklist: 2,
};

const PREVIEW_LIMIT = 5;
const RESOURCE_PREVIEW_LIMIT = 3;
/** Global "All" drawer cap. Generous enough that most days never hit it. */
const AGGREGATE_PREVIEW_LIMIT = 12;
const AGGREGATE_KEY = "__all_workspaces__";

interface StreamActionItem {
  type: "task" | "habit" | "checklist";
  id: string;
  key: string;
  completed: boolean;
  title: string;
  subtitle: string;
  categorySymbol: ItemCategorySymbol;
  isOverdue?: boolean;
  hasReminder?: boolean;
  priority?: "high" | "medium" | "low";
  streak?: number;
  completedCount?: number;
  totalCount?: number;
  original: Task | Habit | Checklist;
  /** Owning workspace, carried so the All drawer can mark each row. */
  folderId: string;
  folderName: string;
  folderColor: string;
  relevance: number;
  tiebreak: number;
}

/**
 * Single ordering rule for both a workspace drawer and the All drawer, so
 * "All" is just a merge of the same relevance model.
 */
function compareStreamItems(a: StreamActionItem, b: StreamActionItem): number {
  return (
    a.relevance - b.relevance ||
    a.tiebreak - b.tiebreak ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  );
}

interface StreamResourceTile {
  id: string;
  title: string;
  visual: ResourceVisualInfo;
}

type StateTone = "alert" | "success" | "neutral";

interface StreamSection {
  folder: Workspace;
  folderColor: string;
  totalItems: number;
  completedItems: number;
  progress: number;
  stateText: string;
  stateTone: StateTone;
  items: StreamActionItem[];
  remainingCount: number;
  resources: StreamResourceTile[];
  resourcesTotal: number;
}

/**
 * The section header's single line of prose. This is the "point of view" the
 * old count-badge row never had: it names the thing that needs attention
 * rather than restating a total that appears three other places.
 */
function buildStateLine(input: {
  openCount: number;
  overdueCount: number;
  completedCount: number;
  bestStreakAtRisk: number;
}): { text: string; tone: StateTone } {
  const { openCount, overdueCount, completedCount, bestStreakAtRisk } = input;

  if (overdueCount > 0) {
    return {
      text:
        openCount > overdueCount
          ? `${overdueCount} overdue · ${openCount} open`
          : `${overdueCount} overdue`,
      tone: "alert",
    };
  }

  if (openCount === 0) {
    return {
      text: completedCount > 0 ? `All clear · ${completedCount} done` : "All clear",
      tone: "success",
    };
  }

  if (bestStreakAtRisk > 0) {
    return {
      text: `${openCount} open · keep a ${bestStreakAtRisk}-day streak`,
      tone: "neutral",
    };
  }

  if (completedCount > 0) {
    return { text: `${openCount} open · ${completedCount} done`, tone: "neutral" };
  }

  return { text: `${openCount} open`, tone: "neutral" };
}

/**
 * Horizontal offset that centres a tab in the strip viewport. Exported so the
 * scroll arithmetic can be verified without a real layout pass.
 */
export function getTabScrollTarget(
  tabX: number,
  tabWidth: number,
  windowWidth: number,
): number {
  return Math.max(0, tabX - windowWidth / 2 + tabWidth / 2);
}

export const WorkspaceSectionedStream: React.FC<WorkspaceSectionedStreamProps> = ({
  activeContexts,
  colors,
  colorScheme,
  allCollections = {},
  expandedChecklistIds,
  setExpandedChecklistIds,
  router,
  completeTodoFromDashboard,
  completeHabitFromDashboard,
  toggleChecklistItemFromDashboard,
}) => {
  const isDark = colorScheme !== "light";
  const streamColors = React.useMemo(
    () => ({
      image: getStreamResourceStyle("image", isDark),
      pdf: getStreamResourceStyle("pdf", isDark),
      link: getStreamResourceStyle("link", isDark),
      note: getStreamResourceStyle("note", isDark),
    }),
    [isDark],
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string>("all");
  const [collapsedMap, setCollapsedMap] = React.useState<Record<string, boolean>>({});

  const today = getDateKey();

  // Revert to "all" if selected workspace is no longer present
  React.useEffect(() => {
    if (selectedWorkspaceId !== "all") {
      const exists = activeContexts.some((c) => c.folder.id === selectedWorkspaceId);
      if (!exists) {
        setSelectedWorkspaceId("all");
      }
    }
  }, [activeContexts, selectedWorkspaceId]);

  const workspaceCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    activeContexts.forEach((ctx) => {
      const count =
        ctx.tasks.length +
        ctx.habits.length +
        ctx.checklists.reduce((sum, cl) => sum + cl.items.length, 0);
      counts[ctx.folder.id] = count;
      total += count;
    });
    return { counts, total };
  }, [activeContexts]);

  /**
   * A folder shows exactly one open drawer. If the open workspace disappears
   * (a filter removed it, say), fall back to the All drawer rather than
   * rendering several drawers at once.
   */
  const openDrawerId = React.useMemo(() => {
    if (selectedWorkspaceId === "all") return "all";
    const exists = activeContexts.some(
      (ctx) => ctx.folder.id === selectedWorkspaceId,
    );
    return exists ? selectedWorkspaceId : "all";
  }, [activeContexts, selectedWorkspaceId]);

  const displayedContexts = React.useMemo(() => {
    if (openDrawerId === "all") return activeContexts;
    const filtered = activeContexts.filter((c) => c.folder.id === openDrawerId);
    return filtered.length > 0 ? filtered : activeContexts;
  }, [activeContexts, openDrawerId]);

  const sections = React.useMemo<StreamSection[]>(() => {
    return displayedContexts.map((context) => {
      const { folder, tasks, habits, checklists } = context;
      const folderColor = folder.color || colors.primary;

      // --- Tasks -----------------------------------------------------------
      const taskItems: StreamActionItem[] = tasks.map((todo) => {
        const isCompleted = isTaskCompleted(todo);
        const daysOverdue = isCompleted
          ? null
          : (() => {
              const state = getTaskOccurrenceState(todo, today);
              return state.isOverdue ? getDaysOverdue(getTodoDateKey(todo)) : null;
            })();
        const isOverdue = daysOverdue !== null;
        const triggerAt = todo.reminder?.enabled
          ? todo.reminder?.triggerAt
          : undefined;
        const hasReminder = triggerAt !== undefined;
        const recurrenceLabel = todo.recurrence?.frequency
          ? formatFrequency(todo.recurrence.frequency)
          : null;

        let subtitle = "Today";
        if (isCompleted) {
          subtitle = "Completed";
        } else if (isOverdue) {
          subtitle = `Overdue · ${getOverdueLabel(daysOverdue)}`;
        } else if (hasReminder && triggerAt !== undefined) {
          subtitle = formatTime(triggerAt);
        } else if (recurrenceLabel) {
          subtitle = recurrenceLabel;
        }

        const relevance = isCompleted
          ? RELEVANCE.DONE
          : isOverdue
          ? RELEVANCE.OVERDUE_TASK
          : hasReminder
          ? RELEVANCE.SCHEDULED_TASK
          : RELEVANCE.OPEN_TASK;

        // Most overdue first; then earliest scheduled time.
        const tiebreak = isOverdue
          ? -(daysOverdue ?? 0)
          : hasReminder && triggerAt !== undefined
          ? triggerAt
          : 0;

        return {
          type: "task" as const,
          id: todo.id,
          key: `task-${todo.id}`,
          folderId: folder.id,
          folderName: folder.name,
          folderColor,
          completed: isCompleted,
          title: todo.title,
          subtitle,
          categorySymbol: resolveItemCategorySymbol(
            { type: "task", categoryId: todo.categoryId, original: todo },
            isDark,
          ),
          isOverdue,
          hasReminder,
          priority:
            todo.priority === "none"
              ? undefined
              : (todo.priority as "high" | "medium" | "low" | undefined),
          original: todo,
          relevance,
          tiebreak,
        };
      });

      // --- Habits ----------------------------------------------------------
      const habitItems: StreamActionItem[] = habits.map((habit) => {
        const isCompletedHabit = Boolean(
          habit.completionHistory && isHabitCompletedToday(habit),
        );
        const currentStreak = getHabitCurrentStreak(habit);
        const habitRecurrence = habit.recurrence?.frequency || (habit as any).frequency;
        const recurrenceLabel = formatFrequency(habitRecurrence);

        let subtitle = `Day ${currentStreak + 1}`;
        if (isCompletedHabit) {
          subtitle = "Completed";
        } else if (recurrenceLabel) {
          subtitle = recurrenceLabel;
        } else if (habit.description) {
          subtitle = habit.description;
        }

        return {
          type: "habit" as const,
          id: habit.id,
          key: `habit-${habit.id}`,
          folderId: folder.id,
          folderName: folder.name,
          folderColor,
          completed: isCompletedHabit,
          title: habit.title,
          subtitle,
          categorySymbol: resolveItemCategorySymbol(
            { type: "habit", categoryId: habit.categoryId, original: habit },
            isDark,
          ),
          streak: currentStreak,
          original: habit,
          relevance: isCompletedHabit
            ? RELEVANCE.DONE
            : currentStreak > 0
            ? RELEVANCE.ACTIVE_HABIT
            : RELEVANCE.OPEN_TASK,
          tiebreak: -currentStreak,
        };
      });

      // --- Checklists ------------------------------------------------------
      const checklistItems: StreamActionItem[] = checklists.map((checklist) => {
        const completedCount = checklist.items.filter((item) => item.completed).length;
        const totalCount = checklist.items.length;
        const remaining = totalCount - completedCount;
        const isCompleted = completedCount === totalCount && totalCount > 0;

        let subtitle = "No items yet";
        if (isCompleted) {
          subtitle = "All done";
        } else if (remaining === 1) {
          subtitle = "1 item left";
        } else if (remaining > 0) {
          subtitle = `${remaining} items left`;
        }

        return {
          type: "checklist" as const,
          id: checklist.id,
          key: `checklist-${checklist.id}`,
          folderId: folder.id,
          folderName: folder.name,
          folderColor,
          completed: isCompleted,
          title: checklist.title,
          subtitle,
          categorySymbol: resolveItemCategorySymbol(
            { type: "checklist", categoryId: checklist.categoryId, original: checklist },
            isDark,
          ),
          completedCount,
          totalCount,
          original: checklist,
          relevance: isCompleted ? RELEVANCE.DONE : RELEVANCE.OPEN_CHECKLIST,
          tiebreak: remaining,
        };
      });

      const sortedItems = [...habitItems, ...taskItems, ...checklistItems].sort(
        compareStreamItems,
      );

      const completedItems =
        tasks.filter((t) => isTaskCompleted(t)).length +
        habits.filter((h) => Boolean(h.completionHistory && isHabitCompletedToday(h)))
          .length +
        checklists.reduce(
          (sum, c) => sum + c.items.filter((i) => i.completed).length,
          0,
        );
      const totalItems =
        tasks.length +
        habits.length +
        checklists.reduce((sum, c) => sum + c.items.length, 0);
      const progress = totalItems > 0 ? completedItems / totalItems : 0;
      const openCount = Math.max(totalItems - completedItems, 0);
      const overdueCount = taskItems.filter(
        (item) => item.isOverdue && !item.completed,
      ).length;
      const bestStreakAtRisk = habitItems.reduce(
        (best, item) =>
          !item.completed && (item.streak ?? 0) > best ? item.streak ?? 0 : best,
        0,
      );

      const folderCollections = allCollections[folder.id] || [];
      const stateLine = buildStateLine({
        openCount,
        overdueCount,
        completedCount: completedItems,
        bestStreakAtRisk,
      });

      return {
        folder,
        folderColor,
        totalItems,
        completedItems,
        progress,
        stateText: stateLine.text,
        stateTone: stateLine.tone,
        items: sortedItems,
        remainingCount: Math.max(sortedItems.length - PREVIEW_LIMIT, 0),
        resources: folderCollections
          .slice(0, RESOURCE_PREVIEW_LIMIT)
          .map((res: any, index: number) => ({
            id: res.id || `res-${index}`,
            title: res.title || "Untitled Resource",
            visual: resolveResourceVisual(res),
          })),
        resourcesTotal: folderCollections.length,
      };
    });
  }, [displayedContexts, allCollections, colors.primary, isDark, today]);

  const tabScrollRef = React.useRef<ScrollView>(null);
  const tabLayouts = React.useRef<Record<string, { x: number; width: number }>>({});
  const [tabsMeasured, setTabsMeasured] = React.useState(false);
  const windowWidth = Dimensions.get("window").width;

  // A 20-folder strip is unusable if the open tab can scroll out of sight.
  React.useEffect(() => {
    if (!tabsMeasured) return;
    const layout = tabLayouts.current[openDrawerId];
    if (!layout) return;
    tabScrollRef.current?.scrollTo({
      x: getTabScrollTarget(layout.x, layout.width, windowWidth),
      animated: true,
    });
  }, [openDrawerId, tabsMeasured, windowWidth]);

  /**
   * The All drawer merges every workspace's items under one relevance
   * ordering, so its length scales with today's work rather than with how many
   * workspaces the user has created.
   */
  const aggregateSection = React.useMemo<StreamSection | null>(() => {
    if (openDrawerId !== "all" || activeContexts.length < 2) return null;

    const items = sections
      .flatMap((section) => section.items)
      .sort(compareStreamItems);
    const totalItems = sections.reduce((sum, section) => sum + section.totalItems, 0);
    const completedItems = sections.reduce(
      (sum, section) => sum + section.completedItems,
      0,
    );
    const openCount = Math.max(totalItems - completedItems, 0);
    const overdueCount = items.filter(
      (item) => item.isOverdue && !item.completed,
    ).length;
    const bestStreakAtRisk = items.reduce(
      (best, item) =>
        !item.completed && (item.streak ?? 0) > best ? item.streak ?? 0 : best,
      0,
    );
    const stateLine = buildStateLine({
      openCount,
      overdueCount,
      completedCount: completedItems,
      bestStreakAtRisk,
    });

    return {
      folder: {
        id: AGGREGATE_KEY,
        name: "All",
        icon: "layers",
        iconType: "icon",
        color: colors.primary,
        order: 0,
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 0,
        updatedAt: 0,
      },
      folderColor: colors.primary,
      totalItems,
      completedItems,
      progress: totalItems > 0 ? completedItems / totalItems : 0,
      stateText: stateLine.text,
      stateTone: stateLine.tone,
      items,
      remainingCount: Math.max(items.length - AGGREGATE_PREVIEW_LIMIT, 0),
      resources: [],
      resourcesTotal: 0,
    };
  }, [sections, openDrawerId, activeContexts.length, colors.primary]);

  // A folder holds one open drawer: either the All drawer or a single workspace.
  const renderSections = aggregateSection ? [aggregateSection] : sections.slice(0, 1);
  const hasTabs = activeContexts.length > 1;

  const tabs: {
    id: string;
    name: string;
    color: string;
    itemCount: number;
    folder?: Workspace;
  }[] = [
    {
      id: "all",
      name: "All",
      color: colors.primary,
      itemCount: workspaceCounts.total,
    },
    ...activeContexts.map((ctx) => ({
      id: ctx.folder.id,
      name: ctx.folder.name,
      color: ctx.folder.color || colors.primary,
      itemCount: workspaceCounts.counts[ctx.folder.id] ?? 0,
      folder: ctx.folder,
    })),
  ];

  const toggleCollapse = (folderId: string) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const openWorkspace = (folderId: string, segment?: string) => {
    router.push({
      pathname: "/tasks",
      params: segment
        ? { workspaceId: folderId, segment }
        : { workspaceId: folderId },
    } as any);
  };

  if (activeContexts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View
          style={[
            styles.emptyIconWrap,
            { backgroundColor: `${colors.primary}15` },
          ]}
        >
          <Feather name="check" size={24} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          All clear for today!
        </Text>
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>
          No active tasks, habits, or checklists matching your selection.
        </Text>
      </View>
    );
  }

  const toneColor = (tone: StateTone) =>
    tone === "alert"
      ? colors.error
      : tone === "success"
      ? colors.success
      : colors.textMuted;

  return (
    <View style={styles.streamContainer}>
      {/* Folder tabs. The open tab drops its bottom border and shares the
          body's fill and stroke, so it fuses with the drawer below instead of
          floating above a deck of cards. */}
      {hasTabs && (
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabStrip}
          onContentSizeChange={() => setTabsMeasured(true)}
        >
          {tabs.map((tab) => {
            const isSelected = openDrawerId === tab.id;
            const openFill = isDark ? `${tab.color}0F` : `${tab.color}08`;
            const openStroke = isDark ? `${tab.color}4A` : `${tab.color}30`;
            const idleStroke = isDark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(0, 0, 0, 0.06)";

            return (
              <View
                key={`tab-${tab.id}`}
                style={styles.tabSlot}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  tabLayouts.current[tab.id] = { x, width };
                }}
              >
                <PressableScale
                  onPress={() =>
                    setSelectedWorkspaceId(
                      tab.id === "all"
                        ? "all"
                        : openDrawerId === tab.id
                        ? "all"
                        : tab.id,
                    )
                  }
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={
                    tab.id === "all"
                      ? `All workspaces, ${tab.itemCount} items`
                      : `Filter by ${tab.name}, ${tab.itemCount} items`
                  }
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.tab,
                    isSelected ? styles.tabOpen : styles.tabClosed,
                    isSelected
                      ? { backgroundColor: openFill, borderColor: openStroke }
                      : {
                          backgroundColor: isDark
                            ? "rgba(255, 255, 255, 0.03)"
                            : "rgba(0, 0, 0, 0.02)",
                          borderColor: idleStroke,
                        },
                  ]}
                  contentStyle={styles.tabContent}
                >
                  {tab.folder &&
                  (tab.folder.iconType === "icon" ||
                    (!tab.folder.emoji && tab.folder.icon)) ? (
                    <Feather
                      name={(tab.folder.icon || "folder") as any}
                      size={13}
                      color={isSelected ? tab.color : colors.textMuted}
                    />
                  ) : tab.folder ? (
                    <Text style={styles.tabEmoji}>
                      {tab.folder.emoji || "📁"}
                    </Text>
                  ) : (
                    <Feather
                      name="layers"
                      size={13}
                      color={isSelected ? tab.color : colors.textMuted}
                    />
                  )}
                  <Text
                    style={[
                      styles.tabName,
                      {
                        color: isSelected ? colors.text : colors.textMuted,
                        fontWeight: isSelected ? "700" : "600",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.name}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Workspace context cards */}
      <View style={styles.deck}>
        {renderSections.map((section) => {
          const {
            folder,
            folderColor,
            totalItems,
            completedItems,
            progress,
            stateText,
            stateTone,
            items,
            remainingCount,
            resources,
            resourcesTotal,
          } = section;
          const isCollapsed = !!collapsedMap[folder.id];
          const isAggregate = folder.id === AGGREGATE_KEY;
          // The All drawer gets its own, larger budget than a single workspace.
          const displayedItems = items.slice(
            0,
            isAggregate ? AGGREGATE_PREVIEW_LIMIT : PREVIEW_LIMIT,
          );

          return (
            <View
              key={folder.id}
              style={[
                styles.folderBody,
                hasTabs ? styles.folderBodyTabbed : styles.folderBodyStandalone,
                {
                  // Must match the open tab's fill and stroke, or the seam shows.
                  backgroundColor: isDark ? `${folderColor}0F` : `${folderColor}08`,
                  borderColor: isDark ? `${folderColor}4A` : `${folderColor}30`,
                },
              ]}
            >
              {/* Header: identity, point of view, completion ring, one affordance */}
              <View style={styles.cardHeaderRow}>
                <PressableScale
                  onPress={() => openWorkspace(folder.id)}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${folder.name}, ${completedItems} of ${totalItems} done. ${stateText}`}
                  style={styles.headerMain}
                  contentStyle={styles.headerMainContent}
                >
                  <View style={styles.headerTitleRow}>
                    {folder.iconType === "icon" || (!folder.emoji && folder.icon) ? (
                      <Feather
                        name={(folder.icon || "folder") as any}
                        size={15}
                        color={folderColor}
                      />
                    ) : (
                      <Text style={styles.folderMarkText}>{folder.emoji || "📁"}</Text>
                    )}
                    <Text
                      style={[styles.folderNameText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {folder.name}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.stateText,
                      { color: toneColor(stateTone) },
                    ]}
                    numberOfLines={1}
                  >
                    {stateText}
                  </Text>
                </PressableScale>

                {/* Progress ring carries completion in both states, so the card
                    never grows a full-width bar when its body collapses. */}
                {totalItems > 0 && (
                  <View style={styles.ringWrap}>
                    <ProgressRing
                      progress={progress}
                      size={26}
                      strokeWidth={3}
                      showText={false}
                      color={folderColor}
                      trackColor={`${folderColor}26`}
                    />
                    {completedItems === totalItems && (
                      <Feather
                        name="check"
                        size={11}
                        color={folderColor}
                        style={styles.ringCheck}
                      />
                    )}
                  </View>
                )}

                <PressableScale
                  onPress={() => toggleCollapse(folder.id)}
                  hitSlop={10}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={
                    isCollapsed
                      ? `Expand ${folder.name}`
                      : `Collapse ${folder.name}`
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
                            metaParts={
                              isAggregate
                                ? [
                                    {
                                      text: item.folderName,
                                      icon: "folder",
                                      color: item.folderColor,
                                    },
                                    {
                                      text: item.subtitle,
                                      color:
                                        item.isOverdue && !item.completed
                                          ? colors.error
                                          : undefined,
                                    },
                                  ]
                                : undefined
                            }
                            categorySymbol={item.categorySymbol}
                            isOverdue={item.isOverdue}
                            completed={item.completed}
                            priority={item.priority}
                            hasReminder={item.hasReminder}
                            accentColor={item.folderColor}
                            colors={colors}
                            colorScheme={colorScheme}
                            checkboxDisabled={checkboxAction === "locked"}
                            onToggleComplete={(e?: any) =>
                              completeTodoFromDashboard(todo.id, e, item.folderId)
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
                            metaParts={
                              isAggregate
                                ? [
                                    {
                                      text: item.folderName,
                                      icon: "folder",
                                      color: item.folderColor,
                                    },
                                    {
                                      text: item.subtitle,
                                      color:
                                        item.isOverdue && !item.completed
                                          ? colors.error
                                          : undefined,
                                    },
                                  ]
                                : undefined
                            }
                            categorySymbol={item.categorySymbol}
                            completed={item.completed}
                            streak={item.streak}
                            accentColor={item.folderColor}
                            colors={colors}
                            colorScheme={colorScheme}
                            checkboxDisabled={checkboxAction === "locked"}
                            onToggleComplete={(e?: any) =>
                              completeHabitFromDashboard(habit.id, e, item.folderId)
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
                      const checkboxAction = getCheckboxAction("checklist", item.completed);
                      const contentAction = getRowContentAction("checklist", checklist.id);

                      const handleChecklistExpandToggle = () => {
                        setExpandedChecklistIds((prev) => ({
                          ...prev,
                          [checklist.id]: !isExpanded,
                        }));
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light,
                        ).catch(() => {});
                      };

                      return (
                        <WorkspaceItemRow
                          key={item.key}
                          type="checklist"
                          id={checklist.id}
                          title={checklist.title}
                          subtitle={item.subtitle}
                          metaParts={
                            isAggregate
                              ? [
                                  {
                                    text: item.folderName,
                                    icon: "folder",
                                    color: item.folderColor,
                                  },
                                  {
                                    text: item.subtitle,
                                    color:
                                      item.isOverdue && !item.completed
                                        ? colors.error
                                        : undefined,
                                  },
                                ]
                              : undefined
                          }
                          categorySymbol={item.categorySymbol}
                          completed={item.completed}
                          checklistProgress={{
                            completedCount: item.completedCount ?? 0,
                            totalCount: item.totalCount ?? 0,
                          }}
                          isExpanded={isExpanded}
                          accentColor={item.folderColor}
                          colors={colors}
                          colorScheme={colorScheme}
                          checkboxDisabled={checkboxAction === "locked"}
                          onToggleComplete={() => {
                            if (checkboxAction === "toggle-expand") {
                              handleChecklistExpandToggle();
                            }
                          }}
                          onPressRow={() => {
                            if (contentAction.action === "toggle-expand") {
                              handleChecklistExpandToggle();
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
                                        item.folderId,
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
                                          ? item.folderColor || folderColor
                                          : isDark
                                          ? "rgba(255,255,255,0.2)"
                                          : "rgba(0,0,0,0.2)",
                                        backgroundColor: subItem.completed
                                          ? item.folderColor || folderColor
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
                            streamColors[resource.visual.category] ||
                            streamColors.note;
                          return (
                            <PressableScale
                              key={`resource-${resource.id}`}
                              onPress={() =>
                                router.push({
                                  pathname: "/tasks",
                                  params: {
                                    workspaceId: folder.id,
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

                        {resourcesTotal > RESOURCE_PREVIEW_LIMIT && (
                          <PressableScale
                            onPress={() => openWorkspace(folder.id, "resources")}
                            haptic
                            accessibilityRole="button"
                            accessibilityLabel={`View all ${resourcesTotal} resources in ${folder.name}`}
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
                              {`+${resourcesTotal - RESOURCE_PREVIEW_LIMIT}`}
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
                        isAggregate
                          ? router.push({ pathname: "/tasks" } as any)
                          : openWorkspace(folder.id)
                      }
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={`View all items in ${folder.name}, ${remainingCount} more`}
                      style={styles.previewGatewayBtn}
                      contentStyle={styles.previewGatewayContent}
                    >
                      <Text
                        style={[styles.previewGatewayText, { color: folderColor }]}
                      >
                        {`+${remainingCount} more in ${folder.name}`}
                      </Text>
                      <Feather name="arrow-right" size={13} color={folderColor} />
                    </PressableScale>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  streamContainer: {
    // No gap: the open tab's fill must run straight into the drawer below.
    marginTop: 14,
  },
  tabStrip: {
    flexDirection: "row",
    // Closed tabs sit lower, so every tab bottom meets the drawer's top edge.
    alignItems: "flex-end",
    gap: 3,
    paddingRight: 24,
  },
  tabSlot: {},
  tab: {
    borderWidth: 1,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  tabOpen: {
    // No bottom border and no bottom radius: the fill runs into the drawer.
    borderBottomWidth: 0,
    paddingTop: 11,
    paddingBottom: 8,
    paddingHorizontal: 13,
  },
  tabClosed: {
    borderBottomWidth: 1,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 13,
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabEmoji: {
    fontSize: 12,
  },
  tabName: {
    fontSize: 12,
    letterSpacing: -0.15,
  },
  deck: {
    gap: 10,
  },
  folderBody: {
    borderWidth: 1,
    overflow: "hidden",
  },
  folderBodyTabbed: {
    // Square top edge: the tabs rise from it, the way they do on a real folder.
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  folderBodyStandalone: {
    borderRadius: Radius.lg,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 11,
    gap: 8,
  },
  headerMain: {
    flex: 1,
  },
  headerMainContent: {
    gap: 3,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  folderMarkText: {
    fontSize: 14,
  },
  folderNameText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    flex: 1,
  },
  stateText: {
    fontSize: 12,
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
  sectionBody: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingBottom: 10,
  },
  itemsListWrap: {
    gap: 1,
  },
  rowWrapper: {
    width: "100%",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    minHeight: 44,
  },
  priorityIndicatorContainer: {
    width: 3,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 9,
  },
  priorityBar: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
  },
  prioritySpacer: {
    width: 3,
    height: 20,
  },
  controlSpacer: {
    width: 10,
  },
  checkboxBase: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistSquare: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm - 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceThumbnailWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  resourceThumbnail: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
  },
  resourceIconBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: {
    flex: 1,
  },
  rowContentStyle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  rowTextContainer: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categorySymbolBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  itemTitleText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
    flex: 1,
  },
  metaLineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    flexWrap: "nowrap",
  },
  metaPartItem: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  metaPartIcon: {
    marginRight: 3,
  },
  metaDotSeparator: {
    fontSize: 11,
    opacity: 0.5,
  },
  itemSubtitleText: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 1,
    letterSpacing: -0.1,
  },
  rowRightWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
  },
  rowChevron: {
    opacity: 0.28,
  },
  streakChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  streakText: {
    fontSize: 11,
    fontWeight: "700",
  },
  trailingCounterText: {
    fontSize: 12,
    fontWeight: "500",
  },
  bellIcon: {
    marginRight: 2,
  },
  resourceAttachmentCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  resourceAttachmentCountText: {
    fontSize: 11,
    fontWeight: "500",
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 18,
  },
});
