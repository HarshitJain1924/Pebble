import React from "react";
import { ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { EmptyState, type MascotVariant } from "@/shared/components/ui/EmptyState";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Colors } from "@/shared/constants/theme";

export type WorkspaceContextType = "tasks" | "habits" | "checklists" | "resources";

export interface WorkspaceEmptyStateProps {
  context: WorkspaceContextType;
  searchQuery?: string;
  onClearSearch?: () => void;
  onCreateItem?: () => void;
  colors?: typeof Colors.dark;
  style?: ViewStyle | ViewStyle[];
}

interface ContextConfig {
  mascot: MascotVariant;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: keyof typeof Feather.glyphMap;
  searchTitle: string;
}

const CONTEXT_CONFIGS: Record<WorkspaceContextType, ContextConfig> = {
  tasks: {
    mascot: "idle",
    title: "No tasks yet",
    description: "Plan your day, set priorities, and get things done.",
    actionLabel: "New Task",
    actionIcon: "plus",
    searchTitle: "No matching tasks",
  },
  habits: {
    mascot: "focus",
    title: "No habits yet",
    description: "Build daily routines and track your progress over time.",
    actionLabel: "New Habit",
    actionIcon: "plus",
    searchTitle: "No matching habits",
  },
  checklists: {
    mascot: "chatting",
    title: "No checklists yet",
    description: "Break down routines, packing lists, or procedures step-by-step.",
    actionLabel: "New Checklist",
    actionIcon: "plus",
    searchTitle: "No matching checklists",
  },
  resources: {
    mascot: "peek",
    title: "No resources yet",
    description: "Save links, notes, images, and references for this workspace.",
    actionLabel: "Add Resource",
    actionIcon: "plus",
    searchTitle: "No matching resources",
  },
};

export const WorkspaceEmptyState: React.FC<WorkspaceEmptyStateProps> = ({
  context,
  searchQuery,
  onClearSearch,
  onCreateItem,
  colors: colorsProp,
  style,
}) => {
  const colorScheme = useColorScheme();
  const colors = colorsProp ?? Colors[colorScheme ?? "dark"] ?? Colors.dark;
  const config = CONTEXT_CONFIGS[context];

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);

  if (isSearching) {
    return (
      <EmptyState
        graphic={<Feather name="search" size={24} color={colors.textMuted} />}
        title={config.searchTitle}
        description="Try searching with a different term."
        action={
          onClearSearch
            ? {
                label: "Clear Search",
                icon: "x",
                onPress: onClearSearch,
                testID: "workspace-empty-clear-search",
              }
            : undefined
        }
        style={style}
        colors={colors}
        testID={`workspace-search-empty-${context}`}
      />
    );
  }

  return (
    <EmptyState
      mascot={config.mascot}
      title={config.title}
      description={config.description}
      action={
        onCreateItem
          ? {
              label: config.actionLabel,
              icon: config.actionIcon,
              onPress: onCreateItem,
              testID: `workspace-empty-create-${context}`,
            }
          : undefined
      }
      style={style}
      colors={colors}
      testID={`workspace-empty-${context}`}
    />
  );
};
