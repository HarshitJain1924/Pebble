import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import type { ThemeColors } from "@/shared/constants/theme";
import type { Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import {
  DEFAULT_TODAY_FILTERS,
  getTodayCategoryLabel,
  getTodayFilterCount,
  getTodayFilterLabel,
  type TodayFilterPriority,
  type TodayFilterSchedule,
  type TodayFilterSort,
  type TodayFilterState,
  type TodayFilterStatus,
  type TodayFilterType,
} from "@/features/today/utils/todayFilters";

interface TodayFilterControlProps {
  value: TodayFilterState;
  folders: Workspace[];
  categoryIds: string[];
  colors: ThemeColors;
  onApply: (next: TodayFilterState) => void | Promise<void>;
}

type FilterSectionKey =
  | "type"
  | "workspaceId"
  | "categoryId"
  | "priority"
  | "schedule"
  | "status"
  | "sort";

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

const TYPE_OPTIONS: FilterOption<TodayFilterType>[] = [
  { value: "all", label: "All" },
  { value: "tasks", label: "Tasks" },
  { value: "habits", label: "Habits" },
  { value: "checklists", label: "Checklists" },
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

function FilterOptionRow<T extends string>({
  option,
  selected,
  colors,
  onSelect,
}: {
  option: FilterOption<T>;
  selected: boolean;
  colors: ThemeColors;
  onSelect: (value: T) => void;
}) {
  return (
    <PressableScale
      onPress={() => onSelect(option.value)}
      hitSlop={4}
      haptic
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      style={styles.optionPressable}
      contentStyle={[
        styles.optionContent,
        {
          backgroundColor: selected ? `${colors.primary}18` : "transparent",
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.optionText, { color: selected ? colors.primary : colors.text }]}>
        {option.label}
      </Text>
      {selected ? <Feather name="check" size={15} color={colors.primary} /> : null}
    </PressableScale>
  );
}

function FilterSection({
  title,
  summary,
  expanded,
  colors,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  colors: ThemeColors;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <PressableScale
        onPress={onToggle}
        haptic
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} filter, ${summary}`}
        style={styles.sectionHeaderPressable}
        contentStyle={styles.sectionHeaderContent}
      >
        <View style={styles.sectionTitleWrap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {!expanded ? (
            <Text style={[styles.sectionSummary, { color: colors.textMuted }]}>{summary}</Text>
          ) : null}
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textMuted}
        />
      </PressableScale>
      {expanded ? <View style={styles.options}>{children}</View> : null}
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
  const [expanded, setExpanded] = useState<Record<FilterSectionKey, boolean>>({
    type: true,
    workspaceId: false,
    categoryId: false,
    priority: false,
    schedule: false,
    status: false,
    sort: false,
  });

  useEffect(() => {
    if (visible) {
      setDraft(value);
      setExpanded((current) => ({ ...current, type: true }));
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

  const toggleSection = (section: FilterSectionKey) => {
    setExpanded((current) => ({ ...current, [section]: !current[section] }));
  };

  const setFilter = <K extends keyof TodayFilterState>(key: K, next: TodayFilterState[K]) => {
    setDraft((current) => ({ ...current, [key]: next }));
  };

  return (
    <AnimatedOverlay visible={visible} onClose={onClose} type="bottom-sheet">
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filter</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>Shape Available Work</Text>
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
            <FilterSection
              title="Type"
              summary={getTodayFilterLabel(draft.type)}
              expanded={expanded.type}
              colors={colors}
              onToggle={() => toggleSection("type")}
            >
              {TYPE_OPTIONS.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.type === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("type", value)}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Workspace"
              summary={workspaceOptions.find((option) => option.value === draft.workspaceId)?.label || "All"}
              expanded={expanded.workspaceId}
              colors={colors}
              onToggle={() => toggleSection("workspaceId")}
            >
              {workspaceOptions.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.workspaceId === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("workspaceId", value)}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Category"
              summary={categoryOptions.find((option) => option.value === draft.categoryId)?.label || "All"}
              expanded={expanded.categoryId}
              colors={colors}
              onToggle={() => toggleSection("categoryId")}
            >
              {categoryOptions.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.categoryId === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("categoryId", value)}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Priority"
              summary={getTodayFilterLabel(draft.priority)}
              expanded={expanded.priority}
              colors={colors}
              onToggle={() => toggleSection("priority")}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.priority === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("priority", value)}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Schedule"
              summary={getTodayFilterLabel(draft.schedule)}
              expanded={expanded.schedule}
              colors={colors}
              onToggle={() => toggleSection("schedule")}
            >
              {SCHEDULE_OPTIONS.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.schedule === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("schedule", value)}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Status"
              summary={getTodayFilterLabel(draft.status)}
              expanded={expanded.status}
              colors={colors}
              onToggle={() => toggleSection("status")}
            >
              {STATUS_OPTIONS.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.status === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("status", value)}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Sort"
              summary={getTodayFilterLabel(draft.sort)}
              expanded={expanded.sort}
              colors={colors}
              onToggle={() => toggleSection("sort")}
            >
              {SORT_OPTIONS.map((option) => (
                <FilterOptionRow
                  key={option.value}
                  option={option}
                  selected={draft.sort === option.value}
                  colors={colors}
                  onSelect={(value) => setFilter("sort", value)}
                />
              ))}
            </FilterSection>
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
              <Text style={[styles.clearButtonText, { color: colors.textMuted }]}>Clear all</Text>
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

  return (
    <>
      <View style={styles.controlWrap}>
        <Text style={[styles.availableWorkLabel, { color: props.colors.textMuted }]}>Available work</Text>
        <PressableScale
          onPress={() => setVisible(true)}
          haptic
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Open filters, ${count} active` : "Open filters"}
          style={[styles.filterButton, { backgroundColor: props.colors.card, borderColor: props.colors.border }]}
          contentStyle={styles.filterButtonContent}
        >
          <Feather name="sliders" size={15} color={props.colors.primary} />
          <Text style={[styles.filterButtonText, { color: props.colors.text }]}>Filter</Text>
          {count > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: `${props.colors.primary}20` }]}>
              <Text style={[styles.countText, { color: props.colors.primary }]}>{count}</Text>
            </View>
          ) : null}
        </PressableScale>
      </View>

      <TodayFilterSheet
        {...props}
        visible={visible}
        onClose={() => setVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  controlWrap: {
    marginTop: 20,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  availableWorkLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  filterButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  filterButtonContent: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    maxHeight: "88%",
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
  },
  section: {
    borderBottomWidth: 1,
  },
  sectionHeaderPressable: {
    minHeight: 52,
  },
  sectionHeaderContent: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingRight: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  sectionSummary: {
    fontSize: 12,
  },
  options: {
    gap: 8,
    paddingBottom: 12,
  },
  optionPressable: {
    minHeight: 44,
  },
  optionContent: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionText: {
    fontSize: 13,
    fontWeight: "600",
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
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
