import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Insets,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { TaskListPriorityColors } from "@/shared/constants/categoryColors";
import { Radius } from "@/shared/constants/radii";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { type TaskPriority } from "@/shared/types/domain.types";
import {
  EntityCategoryPresentation,
  resolveEntityCategoryPresentation,
} from "../utils/entity-category";

export interface EntityItemProps {
  /**
   * Category atmosphere presentation.
   * Can be pre-resolved or passed as a categoryId string.
   */
  category?: EntityCategoryPresentation | string | null;

  /**
   * Optional context for category resolution if category is passed as string or inferred.
   */
  categoryContext?: {
    title?: string;
    type?: "task" | "habit" | "checklist" | "resource";
    priority?: string;
  };

  /**
   * Priority edge strip indicator (optional).
   */
  priority?: TaskPriority | "none" | null;

  /**
   * Whether to explicitly show or hide the priority edge strip.
   * If unspecified, renders whenever `priority` is provided.
   */
  showPriorityStrip?: boolean;

  /**
   * Dimmed state (e.g. for completed items, opacity: 0.6).
   */
  dimmed?: boolean;

  /**
   * Explicit theme override. If omitted, uses current colorScheme hook.
   */
  colorScheme?: "light" | "dark" | null;

  /**
   * Leading control slot (e.g. Circular Checkbox, ProgressRing, etc.)
   */
  leadingControl?: React.ReactNode;

  /**
   * Vertical alignment of the leading control in the row.
   * Defaults to "center".
   */
  alignLeading?: "center" | "flex-start";

  /**
   * Title content: can be a string or a custom ReactNode.
   */
  title?: React.ReactNode;

  /**
   * Whether the title should have completed strike-through and muted text.
   */
  isCompleted?: boolean;

  /**
   * Max lines for string title (default: 1).
   */
  titleNumberOfLines?: number;

  /**
   * Style override for the title text.
   */
  titleStyle?: StyleProp<TextStyle>;

  /**
   * Single-line metadata or custom metadata row slot below the title.
   */
  metadata?: React.ReactNode;

  /**
   * Arbitrary custom content in the center column.
   */
  centerContent?: React.ReactNode;

  /**
   * Press handler for the center title/metadata area.
   */
  onPressContent?: () => void;

  /**
   * Long press handler for the center title/metadata area.
   */
  onLongPressContent?: () => void;

  /**
   * Accessibility label for the center content pressable.
   */
  contentAccessibilityLabel?: string;

  /**
   * Accessibility role for the center content pressable.
   */
  contentAccessibilityRole?: "button" | "checkbox";

  /**
   * Trailing resource slot (e.g. compact resource badge).
   */
  resources?: React.ReactNode;

  /**
   * Trailing action controls (e.g. overflow menu button, expand chevron).
   */
  trailingActions?: React.ReactNode;

  /**
   * Trailing area container style override.
   */
  trailingAreaStyle?: StyleProp<ViewStyle>;

  /**
   * Future Liquid Glass material surface layer placeholder.
   */
  glassSurface?: React.ReactNode;

  /**
   * Additional drawer or accordion content rendered inside the card below the row.
   */
  children?: React.ReactNode;

  /**
   * Root layout event callback.
   */
  onLayout?: (event: LayoutChangeEvent) => void;

  /**
   * Root container style override.
   */
  style?: StyleProp<ViewStyle>;

  /**
   * Main row style override.
   */
  mainRowStyle?: StyleProp<ViewStyle>;

  /**
   * Text container column style override.
   */
  textContainerStyle?: StyleProp<ViewStyle>;

  /**
   * Custom gradient ID for SVG wash.
   */
  gradientId?: string;

  /**
   * Prefix for test IDs (defaults to "task-category" for compatibility).
   */
  testIDPrefix?: string;

  /**
   * Root testID.
   */
  testID?: string;
}

export const EntityItem: React.FC<EntityItemProps> = ({
  category,
  categoryContext,
  priority,
  showPriorityStrip,
  dimmed = false,
  colorScheme: explicitScheme,
  leadingControl,
  alignLeading = "center",
  title,
  isCompleted = false,
  titleNumberOfLines = 1,
  titleStyle,
  metadata,
  centerContent,
  onPressContent,
  onLongPressContent,
  contentAccessibilityLabel,
  contentAccessibilityRole = "button",
  resources,
  trailingActions,
  trailingAreaStyle,
  glassSurface,
  children,
  onLayout,
  style,
  mainRowStyle,
  textContainerStyle,
  gradientId: explicitGradientId,
  testIDPrefix = "task-category",
  testID,
}) => {
  const systemScheme = useColorScheme();
  const effectiveScheme = explicitScheme ?? systemScheme;
  const isLight = effectiveScheme === "light";
  const isDark = !isLight;
  const colors = Colors[effectiveScheme ?? "dark"];

  // Category atmosphere resolution
  const resolvedCategory = useMemo<EntityCategoryPresentation | null>(() => {
    if (category === null) return null;
    if (typeof category === "object" && category?.color) {
      return category;
    }
    const categoryKey = typeof category === "string" ? category : undefined;
    const titleStr = typeof title === "string" ? title : undefined;
    const titleForResolution = categoryContext?.title ?? titleStr;

    if (!categoryKey && !categoryContext && !titleForResolution) {
      return null;
    }

    return resolveEntityCategoryPresentation(
      {
        categoryId: categoryKey,
        title: titleForResolution,
        type: categoryContext?.type,
        priority: categoryContext?.priority,
      },
      isDark,
    );
  }, [category, categoryContext, title, isDark]);

  // Priority edge stripe color
  const hasActivePriority =
    priority !== undefined && priority !== null && priority !== "none";
  const shouldRenderPriority =
    showPriorityStrip !== undefined ? showPriorityStrip : hasActivePriority;

  const priorityStripeColor = useMemo(() => {
    if (!shouldRenderPriority) return null;
    const prio = priority || "none";
    if (prio === "high") return TaskListPriorityColors.high.dark;
    if (prio === "medium") return TaskListPriorityColors.medium.dark;
    if (prio === "low") return TaskListPriorityColors.low.dark;
    return isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)";
  }, [shouldRenderPriority, priority, isDark]);

  // Render Title Node with Inline Category Icon
  const renderTitle = () => {
    if (!title) return null;

    const categoryIconNode = resolvedCategory?.icon ? (
      resolvedCategory.iconFamily === "ionicons" ? (
        <Ionicons
          name={resolvedCategory.icon as any}
          size={16}
          color={isCompleted ? colors.textMuted : resolvedCategory.color}
          style={styles.titleCategoryIcon}
          testID={`${testIDPrefix}-category-icon`}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <Feather
          name={resolvedCategory.icon as any}
          size={16}
          color={isCompleted ? colors.textMuted : resolvedCategory.color}
          style={styles.titleCategoryIcon}
          testID={`${testIDPrefix}-category-icon`}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )
    ) : null;

    if (typeof title !== "string") {
      if (categoryIconNode) {
        return (
          <View style={styles.titleRow}>
            {categoryIconNode}
            {title}
          </View>
        );
      }
      return title;
    }

    return (
      <View style={styles.titleRow}>
        {categoryIconNode}
        <Text
          style={[
            styles.titleText,
            {
              fontSize: ROW_SPEC.type.title,
              fontWeight: ROW_SPEC.type.titleWeight,
              color: isCompleted ? colors.textMuted : colors.text,
              textDecorationLine: isCompleted ? "line-through" : "none",
            },
            titleStyle,
          ]}
          numberOfLines={titleNumberOfLines}
        >
          {title}
        </Text>
      </View>
    );
  };

  // Render Center Content Container (Title, Metadata, Custom Content)
  const centerBody = (
    <>
      {renderTitle()}
      {metadata}
      {centerContent}
    </>
  );

  return (
    <View
      onLayout={onLayout}
      testID={testID || "entity-item-container"}
      style={[
        styles.rowContainer,
        {
          backgroundColor: isLight ? Palette.white : colors.card,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
          marginVertical: 2,
          opacity: dimmed || isCompleted ? 0.6 : 1,
        },
        style,
      ]}
    >
      {/* 1. Liquid Glass surface placeholder (future material layer) */}
      {glassSurface ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {glassSurface}
        </View>
      ) : null}

      {/* 2. Priority Edge Strip */}
      {shouldRenderPriority && priorityStripeColor ? (
        <View
          testID={`${testIDPrefix}-priority-edge-strip`}
          style={[
            styles.priorityEdgeStrip,
            {
              backgroundColor: priorityStripeColor,
            },
          ]}
        />
      ) : null}

      {/* 3. Common Layout: Main Row */}
      <View
        style={[
          styles.mainRow,
          {
            alignItems: alignLeading,
          },
          mainRowStyle,
        ]}
      >
        {/* Leading Control (e.g. Checkbox, ProgressRing) */}
        {leadingControl}

        {/* Center Title + Metadata */}
        {onPressContent ? (
          <PressableScale
            onPress={onPressContent}
            onLongPress={onLongPressContent}
            haptic
            style={[styles.textContainer, textContainerStyle]}
            accessibilityRole={contentAccessibilityRole}
            accessibilityLabel={contentAccessibilityLabel}
          >
            {centerBody}
          </PressableScale>
        ) : (
          <View style={[styles.textContainer, textContainerStyle]}>
            {centerBody}
          </View>
        )}

        {/* Trailing Area: Resources & Actions */}
        {(resources || trailingActions) ? (
          <View style={[styles.trailingArea, trailingAreaStyle]}>
            {resources}
            {trailingActions}
          </View>
        ) : null}
      </View>

      {/* 5. Additional Nested Content (Checklist items, Habit resources, Modals) */}
      {children}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Shared Primitives: EntityMetaRow & EntityResourceIndicator
// ---------------------------------------------------------------------------

export interface EntityMetaPart {
  key?: string;
  text: string;
  icon?: string;
  iconFamily?: "feather" | "ionicons";
  color?: string;
  isBold?: boolean;
  itemStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onPress?: (event?: any) => void;
  onLongPress?: (event?: any) => void;
  accessibilityRole?: "button" | "link" | "checkbox" | "none";
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean; [key: string]: any };
  testID?: string;
  hitSlop?: Insets | number;
}

export interface EntityMetaRowProps {
  parts: EntityMetaPart[];
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const EntityMetaRow: React.FC<EntityMetaRowProps> = ({
  parts,
  dotColor,
  style,
}) => {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? "dark"];

  if (!parts || parts.length === 0) return null;

  return (
    <View style={[styles.metaRow, style]}>
      {parts.map((part, idx) => {
        const isInteractive = Boolean(part.onPress || part.onLongPress);
        const isLast = idx === parts.length - 1;

        const content = (
          <>
            {part.icon && (
              part.iconFamily === "ionicons" ? (
                <Ionicons
                  name={part.icon as any}
                  size={11}
                  color={part.color || colors.textMuted}
                  style={styles.metaIcon}
                />
              ) : (
                <Feather
                  name={part.icon as any}
                  size={11}
                  color={part.color || colors.textMuted}
                  style={styles.metaIcon}
                />
              )
            )}
            <Text
              style={[
                styles.metaText,
                {
                  color: part.color || colors.textMuted,
                  fontWeight: part.isBold ? "700" : "500",
                },
                part.textStyle,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {part.text}
            </Text>
          </>
        );

        return (
          <React.Fragment key={part.key || idx}>
            {idx > 0 && (
              <Text style={[styles.metaDot, { color: dotColor || colors.textMuted }]}>
                ·
              </Text>
            )}
            {isInteractive ? (
              <PressableScale
                onPress={part.onPress}
                onLongPress={part.onLongPress}
                haptic
                scaleTo={0.92}
                hitSlop={part.hitSlop ?? { top: 8, bottom: 8, left: 6, right: 6 }}
                accessibilityRole={part.accessibilityRole ?? "button"}
                accessibilityLabel={part.accessibilityLabel}
                accessibilityState={part.accessibilityState}
                testID={part.testID}
                style={[
                  styles.metaPartItem,
                  styles.metaPartInteractive,
                  isLast ? styles.metaPartLast : undefined,
                  part.itemStyle,
                ]}
              >
                {content}
              </PressableScale>
            ) : (
              <View
                testID={part.testID}
                style={[
                  styles.metaPartItem,
                  isLast ? styles.metaPartLast : undefined,
                  part.itemStyle,
                ]}
              >
                {content}
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};

export interface EntityResourceIndicatorProps {
  count: number;
  iconName?: string;
  isExpanded?: boolean;
  allowZeroAdd?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const EntityResourceIndicator: React.FC<EntityResourceIndicatorProps> = ({
  count,
  iconName = "paperclip",
  isExpanded = false,
  allowZeroAdd = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityState,
  style,
  testID = "task-resource-indicator",
}) => {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const colors = Colors[scheme ?? "dark"];

  if (count <= 0 && !allowZeroAdd) return null;

  const isZeroAdd = count === 0 && allowZeroAdd;

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.93}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      haptic
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || `${count} linked resources`}
      accessibilityState={accessibilityState ?? { expanded: isExpanded }}

      style={[
        styles.compactResourceBadge,
        {
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 0, 0, 0.04)",
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.10)"
            : "rgba(0, 0, 0, 0.06)",
        },
        style,
      ]}
      testID={testID}
    >
      <Feather
        name={iconName as any}
        size={12}
        color={isExpanded ? colors.primary : colors.textMuted}
      />
      <Text
        style={[
          styles.compactResourceCount,
          {
            color: isExpanded ? colors.primary : colors.textMuted,
          },
        ]}
      >
        {isZeroAdd ? "+" : String(count)}
      </Text>
    </PressableScale>
  );
};

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
    paddingTop: ROW_SPEC.row.paddingTop,
    paddingBottom: ROW_SPEC.row.paddingBottom,
    paddingLeft: ROW_SPEC.row.paddingLeft,
    paddingRight: ROW_SPEC.row.paddingRight,
    gap: ROW_SPEC.row.gap,
    overflow: "hidden",
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    justifyContent: "center",
    marginRight: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5.5,
    marginBottom: 2,
    minWidth: 0,
  },
  titleCategoryIcon: {
    flexShrink: 0,
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
    minWidth: 0,
    maxWidth: "100%",
  },
  metaPartItem: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    minWidth: 0,
  },
  metaPartInteractive: {
    paddingVertical: 1,
    paddingHorizontal: 2,
    borderRadius: 4,
  },
  metaPartLast: {
    flexShrink: 1,
  },
  metaIcon: {
    marginRight: 3.5,
    flexShrink: 0,
  },
  metaDot: {
    fontSize: ROW_SPEC.type.meta,
    marginHorizontal: 4,
    opacity: 0.6,
    flexShrink: 0,
  },
  metaText: {
    fontSize: ROW_SPEC.type.meta,
    flexShrink: 1,
  },
  trailingArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    gap: 2,
  },
  compactResourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
    marginRight: 2,
    flexShrink: 0,
  },
  compactResourceCount: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
