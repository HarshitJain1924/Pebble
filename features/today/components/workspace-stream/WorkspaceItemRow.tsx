import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { Palette, type ThemeColors } from "@/shared/constants/theme";
import { StreakColors, getCategoryColors, resolveColor } from "@/shared/constants/categoryColors";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import {
  resolveItemCategorySymbol,
  type ItemCategorySymbol,
  type ItemMetaPart,
  type WorkspaceItemType,
} from "@/features/today/utils/item-presentation";
import {
  getStreamResourcePalette,
  type ResourceVisualInfo,
} from "@/features/today/utils/resource-presentation";

export type { ItemMetaPart, ItemCategorySymbol, WorkspaceItemType };

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
  onToggleComplete?: (event?: any) => void;
  onPressRow?: () => void;
  checkboxDisabled?: boolean;
  accessibilityLabel?: string;
  children?: React.ReactNode;
  workspaceName?: string;
  workspaceId?: string;
  workspaceColor?: string;
  timeText?: string;
  frequencyText?: string;
}

/**
 * Redesigned WorkspaceItemRow Component
 *
 * Implements the premium left-to-right item anatomy:
 *   [ Vertical Stripe ]  [ ○ Checkbox ]  [ Squircle Icon Badge ]  [ Title & Subtitle ]  [ Trailing ]  [ > ]
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
  workspaceName,
  workspaceId,
  workspaceColor,
  timeText,
  frequencyText,
}) => {
  const isDark = colorScheme !== "light";
  const categoryColors = getCategoryColors(isDark);
  const priorityColor = priority ? categoryColors.priority[priority] : undefined;
  const resolvedCategorySymbol =
    categorySymbol || resolveItemCategorySymbol({ type, title, priority }, isDark);
  const stripeColor = priorityColor || resolvedCategorySymbol.color || accentColor;
  const streamColors = getStreamResourcePalette(isDark);
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

    // Task, Habit, and Checklist: clean circular checkbox as shown in the redesign
    return (
      <PressableScale
        disabled={checkboxDisabled || !onToggleComplete}
        onPress={onToggleComplete}
        hitSlop={12}
        haptic
        scaleTo={0.88}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={
          accessibilityLabel ||
          `Mark ${type} ${title} as ${completed ? "incomplete" : "complete"}`
        }
        style={[
          styles.circularCheckbox,
          {
            borderColor: completed
              ? stripeColor
              : isDark
                ? "rgba(255, 255, 255, 0.28)"
                : Palette.slate300,
            backgroundColor: completed ? stripeColor : "transparent",
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
                    style={[styles.itemSubtitleText, { color: partColor }]}
                    numberOfLines={1}
                  >
                    {part.text}
                  </Text>
                </View>
                {!isLastPart && (
                  <Text
                    style={[styles.metaDotSeparator, { color: colors.textMuted }]}
                  >
                    {" • "}
                  </Text>
                )}
              </React.Fragment>
            );
          })}
        </View>
      );
    }

    const displayWorkspaceName = workspaceName;
    const isInbox =
      workspaceId === INBOX_WORKSPACE_ID ||
      displayWorkspaceName?.toLowerCase() === "inbox";
    const displayWorkspaceColor =
      workspaceColor || (isInbox ? Palette.blue500 : Palette.violet500);

    return (
      <View style={styles.metaLineRow}>
        {displayWorkspaceName ? (
          <View style={styles.metaPartItem}>
            <Feather
              name={isInbox ? "inbox" : "folder"}
              size={11}
              color={displayWorkspaceColor}
              style={styles.metaPartIcon}
            />
            <Text
              style={[
                styles.workspaceBadgeText,
                { color: displayWorkspaceColor },
              ]}
              numberOfLines={1}
            >
              {displayWorkspaceName}
            </Text>
            <Text style={[styles.metaDotSeparator, { color: colors.textMuted }]}>
              {" • "}
            </Text>
          </View>
        ) : null}

        {isOverdue && !completed ? (
          <View style={styles.metaPartItem}>
            <Feather
              name="alert-circle"
              size={11}
              color={colors.error}
              style={styles.metaPartIcon}
            />
            <Text style={[styles.itemSubtitleText, { color: colors.error }]}>
              {subtitle || "Overdue"}
            </Text>
          </View>
        ) : timeText ? (
          <View style={styles.metaPartItem}>
            <Feather
              name="clock"
              size={11}
              color={colors.textMuted}
              style={styles.metaPartIcon}
            />
            <Text style={[styles.itemSubtitleText, { color: colors.textMuted }]}>
              {timeText}
            </Text>
          </View>
        ) : frequencyText ? (
          <View style={styles.metaPartItem}>
            <Feather
              name="repeat"
              size={11}
              color={colors.textMuted}
              style={styles.metaPartIcon}
            />
            <Text style={[styles.itemSubtitleText, { color: colors.textMuted }]}>
              {frequencyText}
            </Text>
          </View>
        ) : subtitle ? (
          <View style={styles.metaPartItem}>
            <Text style={[styles.itemSubtitleText, { color: colors.textMuted }]}>
              {subtitle}
            </Text>
          </View>
        ) : null}
      </View>
    );
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
          <Text style={[styles.streakText, { color: streakColors.accent }]}>
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
          size={14}
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
      <View
        style={[
          styles.itemRow,
          {
            borderBottomColor: isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.05)",
          },
        ]}
      >
        {/* Priority stripe on the far left edge */}
        <View style={styles.priorityIndicatorContainer}>
          <View
            style={[
              styles.priorityBar,
              { backgroundColor: stripeColor },
            ]}
          />
        </View>

        {/* Completion Control or Resource Visual */}
        {renderControl()}

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
          {/* Squircle category/type icon badge */}
          {type !== "resource" && resolvedCategorySymbol && (
            <View
              style={[
                styles.squircleBadge,
                {
                  backgroundColor: resolvedCategorySymbol.tint,
                  borderColor: `${resolvedCategorySymbol.color}28`,
                  opacity: completed ? 0.6 : 1,
                },
              ]}
            >
              {resolvedCategorySymbol.iconFamily === "ionicons" ? (
                <Ionicons
                  name={resolvedCategorySymbol.icon as any}
                  size={19}
                  color={resolvedCategorySymbol.color}
                />
              ) : (
                <Feather
                  name={resolvedCategorySymbol.icon as any}
                  size={19}
                  color={resolvedCategorySymbol.color}
                />
              )}
            </View>
          )}

          {/* Two-line title + secondary context */}
          <View style={styles.rowTextContainer}>
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
            {renderSecondaryLine()}
          </View>

          {/* Right side: state and chevron */}
          <View style={styles.rowRightWrap}>
            {renderTrailingMeta()}

            {type === "checklist" ? (
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-right"}
                size={15}
                color={colors.textMuted}
                style={styles.rowChevron}
              />
            ) : (
              <Feather
                name="chevron-right"
                size={15}
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

const styles = StyleSheet.create({
  rowWrapper: {
    width: "100%",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 6,
  },
  priorityIndicatorContainer: {
    width: 3.5,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  priorityBar: {
    width: 3.5,
    height: 34,
    borderRadius: 2,
  },
  prioritySpacer: {
    width: 3.5,
    height: 34,
  },
  controlSpacer: {
    width: 10,
  },
  circularCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  squircleBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
    minHeight: 48,
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
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  workspaceBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  itemTitleText: {
    fontSize: 15.5,
    fontWeight: "600",
    letterSpacing: -0.25,
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
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  rowRightWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
  },
  rowChevron: {
    opacity: 0.45,
  },
  streakChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  streakText: {
    fontSize: 11,
    fontWeight: "700",
  },
  trailingCounterText: {
    fontSize: 13,
    fontWeight: "600",
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
});
