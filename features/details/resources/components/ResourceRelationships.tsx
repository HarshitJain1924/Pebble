import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { TaskRepository, HabitRepository, ChecklistRepository } from "@/repositories";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";

export interface ResourceRelationshipsProps {
  resourceId: string;
  workspaceId: string;
}

export const ResourceRelationships: React.FC<ResourceRelationshipsProps> = ({
  resourceId,
  workspaceId,
}) => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRelationships = useCallback(async () => {
    setLoading(true);
    try {
      const [allTasksMap, allHabitsMap, allChecklistsMap] = await Promise.all([
        TaskRepository.getTasks(workspaceId),
        HabitRepository.getHabits(workspaceId),
        ChecklistRepository.getChecklists(workspaceId),
      ]);

      const linkedTasks = Object.values(allTasksMap).filter(t => 
        !t.archivedAt && t.resourceIds?.includes(resourceId)
      );
      const linkedHabits = Object.values(allHabitsMap).filter(h => 
        !h.archivedAt && h.resourceIds?.includes(resourceId)
      );
      const linkedChecklists = Object.values(allChecklistsMap).filter(c => 
        !c.archivedAt && c.resourceIds?.includes(resourceId)
      );

      setTasks(linkedTasks);
      setHabits(linkedHabits);
      setChecklists(linkedChecklists);
    } catch (e) {
      console.warn("Failed to load resource relationships", e);
    } finally {
      setLoading(false);
    }
  }, [resourceId, workspaceId]);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  if (loading) return null;

  const linkedItems = [
    ...tasks.map(t => ({ ...t, type: "task" as const })),
    ...habits.map(h => ({ ...h, type: "habit" as const })),
    ...checklists.map(c => ({ ...c, type: "checklist" as const })),
  ];

  if (linkedItems.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "task": return "check-circle";
      case "habit": return "repeat";
      case "checklist": return "list";
      default: return "file";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
        USED IN
      </Text>
      
      <View style={styles.list}>
        {linkedItems.map((item) => (
          <View key={`${item.type}-${item.id}`} style={styles.itemRow}>
            <View style={[styles.iconWrapper, { backgroundColor: `${colors.primary}15` }]}>
              <Feather name={getIcon(item.type) as any} size={16} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemType}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
              <Text style={[styles.itemTitle, { color: colors.textMuted }]} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 48,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  list: {
    gap: Spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemType: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  itemTitle: {
    fontSize: 14,
  },
});
