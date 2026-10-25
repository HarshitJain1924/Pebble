import React from "react";
import {
  PebbleFilterModal,
  FilterSectionConfig,
} from "@/features/workspaces/components/PebbleFilterModal";

export type ChecklistStatusFilter = "all" | "in_progress" | "completed";
export type ChecklistItemsFilter = "all" | "has_items" | "empty";
export type ChecklistResourcesFilter = "all" | "has_resources" | "no_resources";

export interface ChecklistFilterModalProps {
  visible: boolean;
  onClose: () => void;
  statusFilter: ChecklistStatusFilter;
  onSelectStatus: (status: ChecklistStatusFilter) => void;
  itemsFilter: ChecklistItemsFilter;
  onSelectItems: (items: ChecklistItemsFilter) => void;
  resourcesFilter: ChecklistResourcesFilter;
  onSelectResources: (res: ChecklistResourcesFilter) => void;
  activeFilterCount: number;
  onResetFilters: () => void;
  colors?: any;
  isDark?: boolean;
}

export function ChecklistFilterModal({
  visible,
  onClose,
  statusFilter,
  onSelectStatus,
  itemsFilter,
  onSelectItems,
  resourcesFilter,
  onSelectResources,
  activeFilterCount,
  onResetFilters,
  colors,
  isDark,
}: ChecklistFilterModalProps) {
  const sections: FilterSectionConfig<any>[] = [
    {
      id: "status",
      label: "STATUS",
      options: [
        { key: "all", label: "All" },
        { key: "in_progress", label: "In Progress" },
        { key: "completed", label: "Completed" },
      ],
      selectedValue: statusFilter,
      onSelect: onSelectStatus,
    },
    {
      id: "items",
      label: "ITEMS",
      options: [
        { key: "all", label: "All" },
        { key: "has_items", label: "Has items" },
        { key: "empty", label: "Empty" },
      ],
      selectedValue: itemsFilter,
      onSelect: onSelectItems,
    },
    {
      id: "resources",
      label: "LINKED RESOURCES",
      options: [
        { key: "all", label: "All" },
        { key: "has_resources", label: "Has resources" },
        { key: "no_resources", label: "No resources" },
      ],
      selectedValue: resourcesFilter,
      onSelect: onSelectResources,
    },
  ];

  return (
    <PebbleFilterModal
      visible={visible}
      onClose={onClose}
      title="Filter Checklists"
      activeFilterCount={activeFilterCount}
      onResetFilters={onResetFilters}
      sections={sections}
      colors={colors}
      isDark={isDark}
      testID="checklist-filter-modal"
    />
  );
}
