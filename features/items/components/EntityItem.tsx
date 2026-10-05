import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useId, useMemo } from "react";
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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

  // Unique gradient ID per component instance
  const reactId = useId();
  const gradientId = useMemo(
    () => explicitGradientId || `entity-cat-wash-${reactId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    [explicitGradientId, reactId],
  );

  // Category atmosphere resolution
  const resolvedCategory = useMemo<EntityCategoryPresentation | null>(() => {
    if (!category) return null;
    if (typeof category === "object" && category.color) {
      return category;
    }
    const categoryKey = typeof category === "string" ? category : undefined;
    return resolveEntityCategoryPresentation(
      {
        categoryId: categoryKey,
        title: categoryContext?.title,
        type: categoryContext?.type,
        priority: categoryContext?.priority,
      },
      isDark,
    );
  }, [category, categoryContext?.title, categoryContext?.type, categoryContext?.priority, isDark]);

  const categoryColor = resolvedCategory?.color ?? null;

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

  // Render Title Node
  const renderTitle = () => {
    if (!title) return null;
    if (typeof title !== "string") {
      return title;
    }
    return (
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
          borderColor: categoryColor
            ? (isDark ? `${categoryColor}36` : `${categoryColor}2C`)
            : (isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"),
          marginVertical: 2,
          opacity: dimmed || isCompleted ? 0.6 : 1,
        },
        style,
      ]}
    >
      {/* 1. Category Atmosphere: Subtle Ambient Background Wash */}
      {categoryColor ? (
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
          testID={`${testIDPrefix}-ambient-wash`}
        >
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop
                offset="0%"
                stopColor={categoryColor}
                stopOpacity={isDark ? 0.18 : 0.14}
              />
              <Stop
                offset="50%"
                stopColor={categoryColor}
                stopOpacity={isDark ? 0.08 : 0.06}
              />
              <Stop
                offset="100%"
                stopColor={categoryColor}
                stopOpacity={isDark ? 0.02 : 0.01}
              />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}

      {/* 1. Category Atmosphere: Subtle Ambient Icon Watermark */}
      {resolvedCategory?.icon ? (
        <View
          style={[
            styles.ambientIconWrapper,
            {
              opacity: isDark ? 0.14 : 0.11,
            },
          ]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
          testID={`${testIDPrefix}-ambient-icon`}
        >
          {resolvedCategory.iconFamily === "ionicons" ? (
            <Ionicons
              name={resolvedCategory.icon as any}
              size={42}
              color={resolvedCategory.color}
            />
          ) : (
            <Feather
              name={resolvedCategory.icon as any}
              size={42}
              color={resolvedCategory.color}
            />
          )}
        </View>
      ) : null}

      {/* 2. Liquid Glass surface placeholder (future material layer) */}
      {glassSurface ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {glassSurface}
        </View>
      ) : null}

      {/* 3. Priority Edge Strip */}
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

      {/* 4. Common Layout: Main Row */}
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
      {parts.map((part, idx) => (
        <React.Fragment key={part.key || idx}>
          {idx > 0 && (
            <Text style={[styles.metaDot, { color: dotColor || colors.textMuted }]}>
              ·
            </Text>
          )}
          <View
            style={[
              styles.metaPartItem,
              idx === parts.length - 1 ? styles.metaPartLast : undefined,
              part.itemStyle,
            ]}
          >
            {part.icon && (
              <Feather
                name={part.icon as any}
                size={11}
                color={part.color || colors.textMuted}
                style={styles.metaIcon}
              />
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
          </View>
        </React.Fragment>
      ))}
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
  ambientIconWrapper: {
    position: "absolute",
    right: 24,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
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
    gap: 6,
    marginBottom: 2,
    minWidth: 0,
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
