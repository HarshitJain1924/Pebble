import React from "react";
import {
  PebbleFilterModal,
  FilterSectionConfig,
} from "@/features/workspaces/components/PebbleFilterModal";

export type ResourceTypeFilter = "all" | "note" | "link" | "media" | "idea";
export type ResourceLinkageFilter = "all" | "linked" | "unlinked";
export type ResourceStatusFilter = "all" | "active" | "archived";

export interface ResourceFilterModalProps {
  visible: boolean;
  onClose: () => void;
  typeFilter: ResourceTypeFilter;
  onSelectType: (type: ResourceTypeFilter) => void;
  linkageFilter: ResourceLinkageFilter;
  onSelectLinkage: (linkage: ResourceLinkageFilter) => void;
  statusFilter: ResourceStatusFilter;
  onSelectStatus: (status: ResourceStatusFilter) => void;
  activeFilterCount: number;
  onResetFilters: () => void;
  colors?: any;
  isDark?: boolean;
}

export function ResourceFilterModal({
  visible,
  onClose,
  typeFilter,
  onSelectType,
  linkageFilter,
  onSelectLinkage,
  statusFilter,
  onSelectStatus,
  activeFilterCount,
  onResetFilters,
  colors,
  isDark,
}: ResourceFilterModalProps) {
  const sections: FilterSectionConfig<any>[] = [
    {
      id: "type",
      label: "TYPE",
      options: [
        { key: "all", label: "All" },
        { key: "note", label: "Notes" },
        { key: "link", label: "Links" },
        { key: "media", label: "Media & Files" },
        { key: "idea", label: "Ideas" },
      ],
      selectedValue: typeFilter,
      onSelect: onSelectType,
    },
    {
      id: "linkage",
      label: "LINKAGE",
      options: [
        { key: "all", label: "All" },
        { key: "linked", label: "Linked to item" },
        { key: "unlinked", label: "Unlinked" },
      ],
      selectedValue: linkageFilter,
      onSelect: onSelectLinkage,
    },
    {
      id: "status",
      label: "STATUS",
      options: [
        { key: "all", label: "All" },
        { key: "active", label: "Active" },
        { key: "archived", label: "Archived" },
      ],
      selectedValue: statusFilter,
      onSelect: onSelectStatus,
    },
  ];

  return (
    <PebbleFilterModal
      visible={visible}
      onClose={onClose}
      title="Filter Resources"
      activeFilterCount={activeFilterCount}
      onResetFilters={onResetFilters}
      sections={sections}
      colors={colors}
      isDark={isDark}
      testID="resource-filter-modal"
    />
  );
}
