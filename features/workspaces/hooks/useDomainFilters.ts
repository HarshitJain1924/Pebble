import { useState, useMemo } from "react";
import { Habit, Checklist, Resource } from "@/shared/types/domain.types";
import { isHabitCompletedToday } from "@/shared/utils/domain-selectors";
import {
  HabitStatusFilter,
  HabitPriorityFilter,
  HabitFrequencyFilter,
  HabitReminderFilter,
} from "@/features/habits/components/HabitFilterModal";
import {
  ChecklistStatusFilter,
  ChecklistItemsFilter,
  ChecklistResourcesFilter,
} from "@/features/checklists/components/ChecklistFilterModal";
import {
  ResourceTypeFilter,
  ResourceLinkageFilter,
  ResourceStatusFilter,
} from "@/features/resources/components/ResourceFilterModal";

export interface HabitFiltersState {
  status: HabitStatusFilter;
  priority: HabitPriorityFilter;
  frequency: HabitFrequencyFilter;
  reminder: HabitReminderFilter;
}

export interface ChecklistFiltersState {
  status: ChecklistStatusFilter;
  items: ChecklistItemsFilter;
  resources: ChecklistResourcesFilter;
}

export interface ResourceFiltersState {
  type: ResourceTypeFilter;
  linkage: ResourceLinkageFilter;
  status: ResourceStatusFilter;
}

/**
 * Filter functions for Habits
 */
export function applyHabitFilters(
  habits: Habit[],
  selectedDateKey: string,
  filters: HabitFiltersState,
): Habit[] {
  return habits.filter((h) => {
    // 1. Status Filter
    if (filters.status === "active" && isHabitCompletedToday(h, selectedDateKey)) {
      return false;
    }
    if (filters.status === "completed" && !isHabitCompletedToday(h, selectedDateKey)) {
      return false;
    }

    // 2. Priority Filter
    if (filters.priority !== "all") {
      const p = h.priority ?? "medium";
      if (p !== filters.priority) return false;
    }

    // 3. Frequency Filter
    if (filters.frequency !== "all") {
      const freq = h.recurrence?.frequency;
      if (freq !== filters.frequency) return false;
    }

    // 4. Reminder Filter
    const hasReminder = Boolean(h.reminder?.enabled && h.reminder?.triggerAt);
    if (filters.reminder === "has_reminder" && !hasReminder) return false;
    if (filters.reminder === "no_reminder" && hasReminder) return false;

    return true;
  });
}

/**
 * Filter functions for Checklists
 */
export function applyChecklistFilters(
  checklists: Checklist[],
  filters: ChecklistFiltersState,
): Checklist[] {
  return checklists.filter((c) => {
    // 1. Status Filter
    const isCompleted = c.items.length > 0 && c.items.every((i) => i.completed);
    if (filters.status === "in_progress" && isCompleted) return false;
    if (filters.status === "completed" && !isCompleted) return false;

    // 2. Items Filter
    if (filters.items === "has_items" && c.items.length === 0) return false;
    if (filters.items === "empty" && c.items.length > 0) return false;

    // 3. Resources Filter
    const hasResources = Boolean(c.resourceIds && c.resourceIds.length > 0);
    if (filters.resources === "has_resources" && !hasResources) return false;
    if (filters.resources === "no_resources" && hasResources) return false;

    return true;
  });
}

/**
 * Filter functions for Resources
 */
export function applyResourceFilters(
  resources: Resource[],
  linkedResourceIds: Set<string>,
  filters: ResourceFiltersState,
): Resource[] {
  return resources.filter((r) => {
    // 1. Status Filter
    const isArchived = Boolean(r.archivedAt);
    if (filters.status === "active" && isArchived) return false;
    if (filters.status === "archived" && !isArchived) return false;

    // 2. Type Filter
    if (filters.type === "note") {
      if (r.type !== "note" || (r.attachments && r.attachments.length > 0)) return false;
    } else if (filters.type === "link") {
      if (r.type !== "link") return false;
    } else if (filters.type === "media") {
      if (!r.attachments || r.attachments.length === 0) return false;
    } else if (filters.type === "idea") {
      if (r.type !== "idea") return false;
    }

    // 3. Linkage Filter
    const isLinked = linkedResourceIds.has(r.id);
    if (filters.linkage === "linked" && !isLinked) return false;
    if (filters.linkage === "unlinked" && isLinked) return false;

    return true;
  });
}

/**
 * Hook to manage filter states for Habits, Checklists, and Resources
 */
export function useDomainFilters() {
  // Habit Filters State
  const [habitStatusFilter, setHabitStatusFilter] = useState<HabitStatusFilter>("all");
  const [habitPriorityFilter, setHabitPriorityFilter] = useState<HabitPriorityFilter>("all");
  const [habitFrequencyFilter, setHabitFrequencyFilter] = useState<HabitFrequencyFilter>("all");
  const [habitReminderFilter, setHabitReminderFilter] = useState<HabitReminderFilter>("all");

  const habitActiveFilterCount = useMemo(() => {
    let count = 0;
    if (habitStatusFilter !== "all") count++;
    if (habitPriorityFilter !== "all") count++;
    if (habitFrequencyFilter !== "all") count++;
    if (habitReminderFilter !== "all") count++;
    return count;
  }, [habitStatusFilter, habitPriorityFilter, habitFrequencyFilter, habitReminderFilter]);

  const resetHabitFilters = () => {
    setHabitStatusFilter("all");
    setHabitPriorityFilter("all");
    setHabitFrequencyFilter("all");
    setHabitReminderFilter("all");
  };

  // Checklist Filters State
  const [checklistStatusFilter, setChecklistStatusFilter] = useState<ChecklistStatusFilter>("all");
  const [checklistItemsFilter, setChecklistItemsFilter] = useState<ChecklistItemsFilter>("all");
  const [checklistResourcesFilter, setChecklistResourcesFilter] = useState<ChecklistResourcesFilter>("all");

  const checklistActiveFilterCount = useMemo(() => {
    let count = 0;
    if (checklistStatusFilter !== "all") count++;
    if (checklistItemsFilter !== "all") count++;
    if (checklistResourcesFilter !== "all") count++;
    return count;
  }, [checklistStatusFilter, checklistItemsFilter, checklistResourcesFilter]);

  const resetChecklistFilters = () => {
    setChecklistStatusFilter("all");
    setChecklistItemsFilter("all");
    setChecklistResourcesFilter("all");
  };

  // Resource Filters State
  const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceTypeFilter>("all");
  const [resourceLinkageFilter, setResourceLinkageFilter] = useState<ResourceLinkageFilter>("all");
  const [resourceStatusFilter, setResourceStatusFilter] = useState<ResourceStatusFilter>("all");

  const resourceActiveFilterCount = useMemo(() => {
    let count = 0;
    if (resourceTypeFilter !== "all") count++;
    if (resourceLinkageFilter !== "all") count++;
    if (resourceStatusFilter !== "all") count++;
    return count;
  }, [resourceTypeFilter, resourceLinkageFilter, resourceStatusFilter]);

  const resetResourceFilters = () => {
    setResourceTypeFilter("all");
    setResourceLinkageFilter("all");
    setResourceStatusFilter("all");
  };

  return {
    // Habit
    habitStatusFilter,
    setHabitStatusFilter,
    habitPriorityFilter,
    setHabitPriorityFilter,
    habitFrequencyFilter,
    setHabitFrequencyFilter,
    habitReminderFilter,
    setHabitReminderFilter,
    habitActiveFilterCount,
    resetHabitFilters,

    // Checklist
    checklistStatusFilter,
    setChecklistStatusFilter,
    checklistItemsFilter,
    setChecklistItemsFilter,
    checklistResourcesFilter,
    setChecklistResourcesFilter,
    checklistActiveFilterCount,
    resetChecklistFilters,

    // Resource
    resourceTypeFilter,
    setResourceTypeFilter,
    resourceLinkageFilter,
    setResourceLinkageFilter,
    resourceStatusFilter,
    setResourceStatusFilter,
    resourceActiveFilterCount,
    resetResourceFilters,
  };
}
