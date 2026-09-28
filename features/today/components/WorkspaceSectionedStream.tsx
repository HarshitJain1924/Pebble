import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type Router } from "expo-router";

import { AppText as Text } from "@/shared/components/ui/AppText";
import type { ThemeColors } from "@/shared/constants/theme";
import type { Resource } from "@/shared/types/domain.types";
import type { TodayActiveContext } from "@/features/today/hooks/useTodaySelectors";
import { useWorkspaceStream } from "@/features/today/hooks/useWorkspaceStream";
import { WorkspaceStreamTabs } from "./workspace-stream/WorkspaceStreamTabs";
import { WorkspaceStreamSection } from "./workspace-stream/WorkspaceStreamSection";

/** Backwards-compatible alias for the grouped Today context shape. */
export type ActiveContextItem = TodayActiveContext;

export interface WorkspaceSectionedStreamProps {
  activeContexts: TodayActiveContext[];
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  allResources?: Record<string, Resource[]>;
  expandedChecklistIds: Record<string, boolean>;
  setExpandedChecklistIds: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  router: Router;
  completeTodoFromDashboard: (
    todoId: string,
    event?: any,
    workspaceId?: string,
  ) => Promise<void>;
  completeHabitFromDashboard: (
    habitId: string,
    event?: any,
    workspaceId?: string,
  ) => Promise<void>;
  toggleChecklistItemFromDashboard: (
    checklistId: string,
    itemId: string,
    workspaceId: string,
  ) => Promise<void>;
}

/**
 * Today's workspace-grouped execution stream.
 *
 * This is a presentation composition only: the workspace stream view model
 * (ranking, ordering, progress, state lines, resource previews, aggregate
 * "All" construction) is prepared by `useWorkspaceStream`, and the row/section/
 * tab anatomy lives in the `workspace-stream/` components. This component owns
 * nothing but the drawer collapse state and the delegated interactions.
 */
export const WorkspaceSectionedStream: React.FC<WorkspaceSectionedStreamProps> = ({
  activeContexts,
  colors,
  colorScheme,
  allResources = {},
  expandedChecklistIds,
  setExpandedChecklistIds,
  router,
  completeTodoFromDashboard,
  completeHabitFromDashboard,
  toggleChecklistItemFromDashboard,
}) => {
  const {
    openDrawerId,
    setSelectedWorkspaceId,
    displayedSections,
    tabs,
    hasTabs,
  } = useWorkspaceStream({
    activeContexts,
    allResources,
    primaryColor: colors.primary,
    colorScheme,
  });

  const [collapsedMap, setCollapsedMap] = React.useState<Record<string, boolean>>(
    {},
  );

  const toggleCollapse = (workspaceId: string) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [workspaceId]: !prev[workspaceId],
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const openWorkspace = (workspaceId: string, segment?: string) => {
    router.push({
      pathname: "/tasks",
      params: segment
        ? { workspaceId, segment }
        : { workspaceId },
    } as any);
  };

  const handleTabSelect = (tabId: string) => {
    setSelectedWorkspaceId(
      tabId === "all" ? "all" : openDrawerId === tabId ? "all" : tabId,
    );
  };

  const openAllWork = () => router.push({ pathname: "/tasks" } as any);

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

  return (
    <View style={styles.streamContainer}>
      {/* Workspace tabs. The open tab drops its bottom border and shares the
          body's fill and stroke, so it fuses with the drawer below instead of
          floating above a deck of cards. */}
      {hasTabs && (
        <WorkspaceStreamTabs
          tabs={tabs}
          openDrawerId={openDrawerId}
          colors={colors}
          colorScheme={colorScheme}
          onSelect={handleTabSelect}
        />
      )}

      {/* Workspace context drawers */}
      <View style={styles.deck}>
        {displayedSections.map((section) => (
          <WorkspaceStreamSection
            key={section.workspace.id}
            section={section}
            colors={colors}
            colorScheme={colorScheme}
            hasTabs={hasTabs}
            isCollapsed={!!collapsedMap[section.workspace.id]}
            onToggleCollapse={toggleCollapse}
            onOpenWorkspace={openWorkspace}
            onOpenAllWork={openAllWork}
            router={router}
            expandedChecklistIds={expandedChecklistIds}
            setExpandedChecklistIds={setExpandedChecklistIds}
            completeTodoFromDashboard={completeTodoFromDashboard}
            completeHabitFromDashboard={completeHabitFromDashboard}
            toggleChecklistItemFromDashboard={toggleChecklistItemFromDashboard}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  streamContainer: {
    // No gap: the open tab's fill must run straight into the drawer below.
    marginTop: 14,
    marginBottom: 12,
  },
  deck: {
    gap: 10,
    marginTop: -1,
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
