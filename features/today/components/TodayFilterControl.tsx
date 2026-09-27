import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";

import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { Palette, type ThemeColors } from "@/shared/constants/theme";
import type { Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { TodaySearchControl } from "@/features/today/components/TodaySearchControl";
import {
  DEFAULT_TODAY_FILTERS,
  getActiveFilterPills,
  getTodayCategoryLabel,
  getTodayFilterCount,
  removeTodayFilter,
  type TodayFilterPriority,
  type TodayFilterSchedule,
  type TodayFilterSort,
  type TodayFilterState,
  type TodayFilterStatus,
  type TodayFilterType,
} from "@/features/today/utils/todayFilters";

export interface TodayFilterControlProps {
  value: TodayFilterState;
  folders: Workspace[];
  categoryIds: string[];
  colors: ThemeColors;
  onApply: (next: TodayFilterState) => void | Promise<void>;
  searchQuery: string;
  isSearchActive: boolean;
  onSearchOpen: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchExit: () => void;
}

interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
  iconFamily?: "feather" | "ionicons";
}

const TYPE_OPTIONS: FilterOption<TodayFilterType>[] = [
  { value: "all", label: "All", icon: "grid", iconFamily: "feather" },
  { value: "tasks", label: "Tasks", icon: "check-circle", iconFamily: "feather" },
  { value: "habits", label: "Habits", icon: "leaf-outline", iconFamily: "ionicons" },
  { value: "checklists", label: "Checklists", icon: "list", iconFamily: "feather" },
];

const PRIORITY_OPTIONS: FilterOption<TodayFilterPriority>[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SCHEDULE_OPTIONS: FilterOption<TodayFilterSchedule>[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "unscheduled", label: "Unscheduled" },
];

const STATUS_OPTIONS: FilterOption<TodayFilterStatus>[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

const SORT_OPTIONS: FilterOption<TodayFilterSort>[] = [
  { value: "default", label: "Default" },
  { value: "priority", label: "Priority" },
  { value: "alphabetical", label: "Alphabetical" },
];

function FilterChipGroup<T extends string>({
  label,
  options,
  selectedValue,
  colors,
  onSelect,
}: {
  label: string;
  options: FilterOption<T>[];
  selectedValue: T;
  colors: ThemeColors;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chipGroupSection}>
      <Text style={[styles.chipGroupLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.chipGroupRow}>
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <PressableScale
              key={option.value}
              onPress={() => onSelect(option.value)}
              hitSlop={4}
              haptic
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${label}: ${option.label}`}
              style={[
                styles.sheetChip,
                {
                  backgroundColor: isSelected ? `${colors.primary}18` : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              contentStyle={styles.sheetChipContent}
            >
              {isSelected ? (
                <Feather
                  name="check"
                  size={13}
                  color={colors.primary}
                  style={styles.sheetChipCheck}
                />
              ) : null}
              <Text
                style={[
                  styles.sheetChipText,
                  {
                    color: isSelected ? colors.primary : colors.text,
                    fontWeight: isSelected ? "700" : "500",
                  },
                ]}
              >
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function TodayFilterSheet({
  visible,
  value,
  folders,
  categoryIds,
  colors,
  onApply,
  onClose,
}: TodayFilterControlProps & { visible: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<TodayFilterState>(value);

  useEffect(() => {
    if (visible) {
      setDraft(value);
    }
  }, [visible, value]);

  const workspaceOptions = useMemo(() => {
    const inbox: Workspace = {
      id: INBOX_WORKSPACE_ID,
      name: "Inbox",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    };
    const options = folders.some((folder) => folder.id === INBOX_WORKSPACE_ID)
      ? folders
      : [inbox, ...folders];
    return [
      { value: "all", label: "All" },
      ...options.map((folder) => ({ value: folder.id, label: folder.name })),
    ];
  }, [folders]);

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...categoryIds.map((categoryId) => ({
        value: categoryId,
        label: getTodayCategoryLabel(categoryId),
      })),
    ],
    [categoryIds],
  );

  const setFilter = <K extends keyof TodayFilterState>(key: K, next: TodayFilterState[K]) => {
    setDraft((current) => ({ ...current, [key]: next }));
  };

  return (
    <AnimatedOverlay visible={visible} onClose={onClose} type="bottom-sheet">
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filters</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
                Shape Available Work
              </Text>
            </View>
            <PressableScale
              onPress={close}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              style={styles.closeButton}
              contentStyle={styles.closeButtonContent}
            >
              <Feather name="x" size={18} color={colors.textMuted} />
            </PressableScale>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
          >
            <FilterChipGroup
              label="Priority"
              options={PRIORITY_OPTIONS}
              selectedValue={draft.priority}
              colors={colors}
              onSelect={(val) => setFilter("priority", val)}
            />

            <FilterChipGroup
              label="Status"
              options={STATUS_OPTIONS}
              selectedValue={draft.status}
              colors={colors}
              onSelect={(val) => setFilter("status", val)}
            />

            <FilterChipGroup
              label="Schedule"
              options={SCHEDULE_OPTIONS}
              selectedValue={draft.schedule}
              colors={colors}
              onSelect={(val) => setFilter("schedule", val)}
            />

            <FilterChipGroup
              label="Sort by"
              options={SORT_OPTIONS}
              selectedValue={draft.sort}
              colors={colors}
              onSelect={(val) => setFilter("sort", val)}
            />

            {workspaceOptions.length > 1 ? (
              <FilterChipGroup
                label="Workspace"
                options={workspaceOptions}
                selectedValue={draft.workspaceId}
                colors={colors}
                onSelect={(val) => setFilter("workspaceId", val)}
              />
            ) : null}

            {categoryOptions.length > 1 ? (
              <FilterChipGroup
                label="Category"
                options={categoryOptions}
                selectedValue={draft.categoryId}
                colors={colors}
                onSelect={(val) => setFilter("categoryId", val)}
              />
            ) : null}
          </ScrollView>

          <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
            <PressableScale
              onPress={() => setDraft(DEFAULT_TODAY_FILTERS)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              style={styles.footerButton}
              contentStyle={styles.clearButtonContent}
            >
              <Text style={[styles.clearButtonText, { color: colors.textMuted }]}>Reset all</Text>
            </PressableScale>
            <PressableScale
              onPress={async () => {
                await onApply(draft);
                close();
              }}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
              style={styles.applyButton}
              contentStyle={[styles.applyButtonContent, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.applyButtonText}>Apply filters</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </AnimatedOverlay>
  );
}

export const TodayFilterControl: React.FC<TodayFilterControlProps> = (props) => {
  const [visible, setVisible] = useState(false);
  const count = getTodayFilterCount(props.value);
  const activePills = useMemo(
    () => getActiveFilterPills(props.value, props.folders),
    [props.value, props.folders],
  );

  return (
    <View style={styles.container}>
      {props.isSearchActive ? (
        <View style={styles.activeSearchWrap}>
          <TodaySearchControl
            query={props.searchQuery}
            active={props.isSearchActive}
            colors={props.colors}
            onOpen={props.onSearchOpen}
            onChangeText={props.onSearchQueryChange}
            onExit={props.onSearchExit}
          />
        </View>
      ) : (
        <View style={styles.controlBar}>
          <Text style={[styles.availableWorkLabel, { color: props.colors.text }]}>
            TODAY&apos;S WORK
          </Text>
          <View style={styles.controlActions}>
            <TodaySearchControl
              query={props.searchQuery}
              active={props.isSearchActive}
              colors={props.colors}
              onOpen={props.onSearchOpen}
              onChangeText={props.onSearchQueryChange}
              onExit={props.onSearchExit}
            />
            <PressableScale
              onPress={() => setVisible(true)}
              haptic
              accessibilityRole="button"
              accessibilityLabel={count > 0 ? `Open filters, ${count} active` : "Open filters"}
              style={[
                styles.filterButton,
                {
                  backgroundColor: props.colors.card,
                  borderColor: count > 0 ? props.colors.primary : props.colors.border,
                },
              ]}
              contentStyle={styles.filterButtonContent}
            >
              <Feather
                name="sliders"
                size={15}
                color={count > 0 ? props.colors.primary : props.colors.textMuted}
              />
              <Text style={[styles.filterButtonText, { color: props.colors.text }]}>Filter</Text>
              {count > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: `${props.colors.primary}20` }]}>
                  <Text style={[styles.countText, { color: props.colors.primary }]}>{count}</Text>
                </View>
              ) : null}
            </PressableScale>
          </View>
        </View>
      )}

      {/* Quick Type segmented pills */}
      <View style={styles.quickTypeRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickTypeScrollContent}
        >
          {TYPE_OPTIONS.map((option) => {
            const isSelected = props.value.type === option.value;
            const isDark = props.colors.background === "#0F172A" || (props.colors as any).isDark;
            const selectedBg = isDark ? "rgba(16, 185, 129, 0.18)" : "#EAF5EF";
            const selectedBorder = isDark ? "rgba(16, 185, 129, 0.35)" : "#C7E6D7";
            const selectedColor = isDark ? "#34D399" : "#1B5E3C";

            const unselectedBg = props.colors.card;
            const unselectedBorder = props.colors.border;
            const unselectedColor = props.colors.text;

            const iconColor = isSelected ? selectedColor : unselectedColor;
            const textColor = isSelected ? selectedColor : unselectedColor;

            return (
              <PressableScale
                key={option.value}
                onPress={() => {
                  props.onApply({
                    ...props.value,
                    type: option.value,
                  });
                }}
                haptic
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Filter by ${option.label}`}
                style={[
                  styles.quickTypePill,
                  {
                    backgroundColor: isSelected ? selectedBg : unselectedBg,
                    borderColor: isSelected ? selectedBorder : unselectedBorder,
                  },
                ]}
                contentStyle={styles.quickTypePillContent}
              >
                {option.iconFamily === "ionicons" ? (
                  <Ionicons
                    name={option.icon as any}
                    size={14}
                    color={iconColor}
                    style={styles.quickTypeIcon}
                  />
                ) : option.icon ? (
                  <Feather
                    name={option.icon as any}
                    size={14}
                    color={iconColor}
                    style={styles.quickTypeIcon}
                  />
                ) : null}
                <Text
                  style={[
                    styles.quickTypePillText,
                    {
                      color: textColor,
                      fontWeight: isSelected ? "700" : "600",
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      {/* Active Filter Chips (if any non-default filter active) */}
      {activePills.length > 0 ? (
        <View style={styles.activePillsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activePillsScrollContent}
          >
            {activePills.map((pill) => (
              <View
                key={pill.key}
                style={[
                  styles.activePill,
                  {
                    backgroundColor: `${props.colors.primary}14`,
                    borderColor: `${props.colors.primary}35`,
                  },
                ]}
              >
                <Text style={[styles.activePillText, { color: props.colors.primary }]}>
                  {pill.label}
                </Text>
                <PressableScale
                  onPress={() => props.onApply(removeTodayFilter(props.value, pill.key))}
                  haptic
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove filter ${pill.label}`}
                  style={styles.pillClearBtn}
                  contentStyle={styles.pillClearBtnContent}
                >
                  <Feather name="x" size={12} color={props.colors.primary} />
                </PressableScale>
              </View>
            ))}
            <PressableScale
              onPress={() => props.onApply(DEFAULT_TODAY_FILTERS)}
              haptic
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
              style={styles.resetAllBtn}
              contentStyle={styles.resetAllBtnContent}
            >
              <Text style={[styles.resetAllBtnText, { color: props.colors.textMuted }]}>
                Reset all
              </Text>
            </PressableScale>
          </ScrollView>
        </View>
      ) : null}

      <View
        style={[styles.divider, { backgroundColor: props.colors.border }]}
      />

      <TodayFilterSheet
        {...props}
        visible={visible}
        onClose={() => setVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 6,
  },
  controlBar: {
    marginHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 38,
  },
  activeSearchWrap: {
    marginHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 12,
    marginBottom: 2,
    marginHorizontal: 0,
    opacity: 0.6,
  },
  availableWorkLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  controlActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 1,
  },
  filterButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  filterButtonContent: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  countBadge: {
    minWidth: 19,
    height: 19,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
  },
  quickTypeRow: {
    marginTop: 12,
    marginHorizontal: 0,
  },
  quickTypeScrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 3,
  },
  quickTypePill: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  quickTypePillContent: {
    minHeight: 36,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickTypeIcon: {
    marginRight: 2,
  },
  quickTypePillText: {
    fontSize: 13,
    letterSpacing: -0.15,
  },
  activePillsRow: {
    marginTop: 8,
    marginHorizontal: 0,
  },
  activePillsScrollContent: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 2,
  },
  activePill: {
    minHeight: 28,
    borderWidth: 1,
    borderRadius: Radius.pill,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 4,
    gap: 4,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pillClearBtn: {
    minWidth: 22,
    minHeight: 22,
  },
  pillClearBtnContent: {
    minWidth: 22,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  resetAllBtn: {
    minHeight: 28,
  },
  resetAllBtnContent: {
    minHeight: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  resetAllBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    maxHeight: "85%",
  },
  sheetHeader: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  sheetSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
  },
  closeButtonContent: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  chipGroupSection: {
    paddingVertical: 8,
  },
  chipGroupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  chipGroupRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sheetChip: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  sheetChipContent: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetChipCheck: {
    marginRight: 4,
  },
  sheetChipText: {
    fontSize: 13,
  },
  sheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerButton: {
    minHeight: 44,
  },
  clearButtonContent: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  applyButton: {
    minHeight: 44,
    flex: 1,
    maxWidth: 190,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  applyButtonContent: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  applyButtonText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "800",
  },
});
