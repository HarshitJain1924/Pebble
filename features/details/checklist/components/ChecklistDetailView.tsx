import React from "react";
import {
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Palette } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import type {
  Checklist,
  ChecklistItem,
  Resource,
} from "@/shared/types/domain.types";
import { getChecklistItemCompletedForDate } from "@/shared/utils/domain-selectors";
import { getWorkspaceIconName } from "@/shared/utils/workspace-icon";
import { CATEGORY_OPTIONS } from "@/features/details/options";
import { DetailActions } from "@/features/details";
import { ConnectedResourcesView } from "@/features/details/resources";
import { getChecklistColor } from "@/features/checklists/utils/checklist-colors";
import { LiquidGlassSurface } from "@/shared/components/ui/LiquidGlassSurface";
import { ChecklistMetaGrid } from "./ChecklistMetaGrid";
import { ChecklistProgressBar } from "./ChecklistProgressBar";

export interface ChecklistDetailViewProps {
  item: Checklist;
  items: ChecklistItem[];
  effectiveOccurrenceDate?: string;
  completedCount: number;
  totalCount: number;
  currentWorkspace: { name: string; icon?: string; color?: string };
  linkedResources: Resource[];
  isLight: boolean;
  colors: any;
  createdDate: string;
  scheduleDisplay: string;
  quickItemText: string;
  setQuickItemText: (text: string) => void;
  onQuickAddItem: () => void;
  onToggleItem: (itemId: string) => void;
  onOpenLinkPicker: () => void;
  onToggleResource: (resId: string) => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  accentColor?: string;
  paused?: boolean;
}

export const ChecklistDetailView: React.FC<ChecklistDetailViewProps> = React.memo(({
  item,
  items,
  effectiveOccurrenceDate,
  completedCount,
  totalCount,
  currentWorkspace,
  linkedResources,
  isLight,
  colors,
  createdDate,
  scheduleDisplay,
  quickItemText,
  setQuickItemText,
  onQuickAddItem,
  onToggleItem,
  onOpenLinkPicker,
  onToggleResource,
  onDuplicate,
  onArchive,
  onDelete,
  accentColor,
  paused = false,
}) => {
  const activeAccentColor = accentColor || "#E07A5F";

  return (
    <View style={{ gap: Spacing.xl }}>
      {/* Prominent Title */}
      <Text
        style={[
          styles.detailTitle,
          { color: isLight ? colors.text : Palette.white },
        ]}
      >
        {item.title}
      </Text>

      {/* 2x2 Meta Cards Grid */}
      <ChecklistMetaGrid
        item={item}
        createdDate={createdDate}
        scheduleDisplay={scheduleDisplay}
        isLight={isLight}
        colors={colors}
        paused={paused}
      />

      {/* Progress Section with Slider Thumb Pill */}
      <ChecklistProgressBar
        completedCount={completedCount}
        totalCount={totalCount}
        isLight={isLight}
        colors={colors}
        accentColor={activeAccentColor}
      />

      {/* Description Section */}
      <View style={styles.sectionWrap}>
        <Text
          style={[
            styles.sectionLabel,
            { color: isLight ? colors.textMuted : "rgba(255,255,255,0.6)" },
          ]}
        >
          DESCRIPTION
        </Text>
        <Text
          style={[
            styles.descriptionText,
            { color: isLight ? colors.text : "rgba(255,255,255,0.85)" },
          ]}
        >
          {item.description || "No description provided."}
        </Text>
      </View>

      {/* Workspace, Category & Priority Row */}
      <View style={styles.metaRow}>
        <View style={styles.metaCol}>
          <Text
            style={[
              styles.sectionLabel,
              { color: isLight ? colors.textMuted : "rgba(255,255,255,0.6)" },
            ]}
          >
            WORKSPACE
          </Text>
          <View
            style={[
              styles.outlinePill,
              {
                borderColor: isLight
                  ? colors.border
                  : "rgba(255,255,255,0.35)",
              },
            ]}
          >
            <Feather
              name={getWorkspaceIconName(currentWorkspace)}
              size={13}
              color={
                currentWorkspace.color ||
                (isLight ? colors.text : Palette.white)
              }
            />
            <Text
              style={[
                styles.pillText,
                { color: isLight ? colors.text : Palette.white },
              ]}
            >
              {currentWorkspace.name}
            </Text>
          </View>
        </View>

        <View style={styles.metaCol}>
          <Text
            style={[
              styles.sectionLabel,
              { color: isLight ? colors.textMuted : "rgba(255,255,255,0.6)" },
            ]}
          >
            CATEGORY
          </Text>
          <View
            style={[
              styles.outlinePill,
              {
                borderColor: isLight
                  ? colors.border
                  : "rgba(255,255,255,0.35)",
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: isLight ? colors.text : Palette.white },
              ]}
            >
              {item.categoryId
                ? CATEGORY_OPTIONS.find((c) => c.key === item.categoryId)?.label ||
                  item.categoryId.charAt(0).toUpperCase() +
                    item.categoryId.slice(1)
                : "General"}
            </Text>
          </View>
        </View>

        <View style={styles.metaCol}>
          <Text
            style={[
              styles.sectionLabel,
              { color: isLight ? colors.textMuted : "rgba(255,255,255,0.6)" },
            ]}
          >
            PRIORITY
          </Text>
          <View
            style={[
              styles.outlinePill,
              {
                borderColor: isLight
                  ? colors.border
                  : "rgba(255,255,255,0.35)",
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: isLight ? colors.text : Palette.white },
              ]}
            >
              {item.priority && item.priority !== "none"
                ? item.priority.charAt(0).toUpperCase() +
                  item.priority.slice(1)
                : "Normal"}
            </Text>
          </View>
        </View>
      </View>

      {/* Checklist Items Section */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <Text
            style={[
              styles.sectionLabel,
              { color: isLight ? colors.textMuted : "rgba(255,255,255,0.6)" },
            ]}
          >
            CHECKLIST ITEMS
          </Text>
          <Text
            style={[
              styles.itemsBadge,
              {
                color: isLight
                  ? colors.textMuted
                  : "rgba(255,255,255,0.5)",
              },
            ]}
          >
            {completedCount}/{totalCount}
          </Text>
        </View>

        {items.length === 0 ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              fontStyle: "italic",
              textAlign: "center",
              paddingVertical: 12,
            }}
          >
            No items in this checklist.
          </Text>
        ) : (
          (items || []).map((cIt) => {
            if (!cIt) return null;
            const isCompleted =
              item.recurrence && effectiveOccurrenceDate
                ? getChecklistItemCompletedForDate(
                    item,
                    cIt.id,
                    effectiveOccurrenceDate,
                  )
                : !!cIt.completed;

            return (
              <PressableScale
                key={cIt.id}
                onPress={() => onToggleItem(cIt.id)}
                scaleTo={0.98}
                contentStyle={styles.checkItemRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isCompleted }}
                accessibilityLabel={`Toggle ${cIt.title}`}
              >
                <Feather
                  name={isCompleted ? "check-circle" : "circle"}
                  size={19}
                  color={
                    isCompleted
                      ? activeAccentColor
                      : isLight
                        ? colors.textMuted
                        : "rgba(255,255,255,0.4)"
                  }
                />
                <Text
                  style={[
                    styles.checkItemText,
                    {
                      fontSize: 14.5,
                      fontWeight: "500",
                      color: isCompleted
                        ? isLight
                          ? colors.textMuted
                          : "rgba(255,255,255,0.4)"
                        : isLight
                          ? colors.text
                          : Palette.white,
                      textDecorationLine: isCompleted
                        ? "line-through"
                        : "none",
                      flex: 1,
                    },
                  ]}
                >
                  {cIt.title}
                </Text>
              </PressableScale>
            );
          })
        )}

        {/* Quick Add Item Inline Input */}
        <LiquidGlassSurface
          borderRadius={16}
          isLight={isLight}
          style={styles.quickAddWrap}
          intensity={50}
          blurRadius={20}
          interactive={false}
          paused={paused}
        >
          <TextInput
            style={[
              styles.quickAddInput,
              { color: isLight ? colors.text : Palette.white },
            ]}
            placeholder="Add item..."
            placeholderTextColor={
              isLight ? colors.textMuted : "rgba(255,255,255,0.4)"
            }
            value={quickItemText}
            onChangeText={setQuickItemText}
            onSubmitEditing={onQuickAddItem}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={onQuickAddItem}
            style={[styles.quickAddBtn, { backgroundColor: activeAccentColor }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add checklist item"
          >
            <Feather name="plus" size={16} color={Palette.white} />
          </TouchableOpacity>
        </LiquidGlassSurface>
      </View>

      {/* Attached Resources Preview */}
      <View style={styles.sectionWrap}>
        <Text style={styles.srOnly}>LINKED RESOURCES</Text>
        <ConnectedResourcesView
          title="ATTACHMENTS"
          resources={linkedResources}
          onAttachPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            onOpenLinkPicker();
          }}
          onUnlink={onToggleResource}
          workspaceId={item.workspaceId}
        />
      </View>

      {/* Actions */}
      <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
        <DetailActions
          actions={[
            {
              key: "duplicate",
              label: "Duplicate Checklist",
              icon: <Feather name="copy" size={16} color={colors.text} />,
              onPress: onDuplicate,
            },
          ]}
        />
        <DetailActions
          actions={[
            {
              key: "archive",
              label: "Archive Checklist",
              icon: <Feather name="archive" size={16} color={colors.text} />,
              onPress: () => {
                Alert.alert(
                  "Archive Checklist",
                  "Archive this checklist?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Archive", onPress: onArchive },
                  ],
                );
              },
            },
            {
              key: "delete",
              label: "Delete Checklist",
              tone: "danger",
              icon: (
                <Feather name="trash-2" size={16} color={Palette.white} />
              ),
              onPress: () => {
                Alert.alert(
                  "Delete Checklist",
                  "Delete this checklist permanently?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: onDelete,
                    },
                  ],
                );
              },
            },
          ]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  detailTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  sectionWrap: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  descriptionText: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaCol: {
    flex: 1,
    minWidth: 95,
    gap: 8,
  },
  outlinePill: {
    borderWidth: 1.2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  itemsBadge: {
    fontSize: 12,
    fontWeight: "600",
  },
  checkItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  checkItemText: {
    fontSize: 14.5,
    fontWeight: "500",
    flex: 1,
  },
  quickAddWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 6,
    gap: 8,
  },
  quickAddInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  quickAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    opacity: 0,
  },
});
