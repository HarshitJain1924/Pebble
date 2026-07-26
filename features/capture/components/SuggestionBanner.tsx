import React from "react";
import { View, TouchableOpacity, Alert } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { resolveSuggestion, type SmartSuggestion } from "@/features/capture/services/suggestions.service";
import { Task, type Habit, Workspace } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { emitStateChange } from "@/services/events/state-events";
import { TaskRepository, HabitRepository, UiStateRepository } from "@/repositories";

interface SuggestionBannerProps {
  activeSuggestions: SmartSuggestion[];
  loadSuggestions: () => Promise<void> | void;
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits: (nextHabits: Habit[]) => Promise<void> | void;
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>;
  persistState: (
    lists: Workspace[],
    selected: string,
    todos: Record<string, Task[]>,
  ) => Promise<void> | void;
  lists: Workspace[];
  selectedList: string;
  openedFolderId: string | null;
  getDateKey: (date?: Date) => string;
}

export function SuggestionBanner({
  activeSuggestions,
  loadSuggestions,
  setHabits,
  persistHabits,
  setTodos,
  persistState,
  lists,
  selectedList,
  openedFolderId,
  getDateKey,
}: SuggestionBannerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  if (activeSuggestions.length === 0) return null;

  const bannerBg = isDark
    ? "rgba(99, 102, 241, 0.15)"
    : "rgba(99, 102, 241, 0.08)";
  const borderColor = isDark
    ? "rgba(99, 102, 241, 0.3)"
    : "rgba(99, 102, 241, 0.2)";

  return (
    <View style={{ gap: 8, marginVertical: 8, paddingHorizontal: 4 }}>
      {activeSuggestions.map((suggestion) => (
        <Animated.View
          entering={FadeInDown}
          key={suggestion.id}
          style={{
            backgroundColor: bannerBg,
            borderWidth: 1.5,
            borderColor: borderColor,
            borderRadius: 16,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Feather name="zap" size={18} color="#6366F1" />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Smart Suggestion
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: "500",
                  marginTop: 2,
                }}
              >
                {suggestion.message}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                const uiState = await UiStateRepository.getUiState();
                const activeWorkspace = uiState.activeWorkspaceId || "default";
                if (suggestion.type === "convert_habit") {
                  const newHabit: Habit = {
                    id: `habit-${Date.now()}`,
                    workspaceId: activeWorkspace,
                    title: suggestion.title,
                    categoryId: "learning",
                    recurrence: { frequency: "daily", interval: 1 },
                    completionHistory: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  
                  // Load active workspace current habits
                  const habitsMap = await HabitRepository.getHabits(activeWorkspace);
                  const currentHabits: Habit[] = Object.values(habitsMap);

                  const updated = [newHabit, ...currentHabits];
                  await persistHabits(updated);
                  setHabits(updated);
                  emitStateChange("habits_changed");
                  Alert.alert(
                    "Success",
                    `"${suggestion.title}" has been converted to a recurring daily habit!`,
                  );
                } else {
                  const listId = openedFolderId || selectedList || "default";
                  const newTodo: Task = {
                    id: String(Date.now()),
                    workspaceId: listId,
                    title: `Study schedule: ${suggestion.title}`,
                    status: "todo",
                    categoryId: "learning",
                    priority: "high",
                    schedule: { date: getDateKey() },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  
                  // Load active workspace current tasks
                  const tasksMap = await TaskRepository.getTasks(listId);
                  const listTodos: Task[] = Object.values(tasksMap);

                  const updatedList = [newTodo, ...listTodos];
                  const updated = {
                    [listId]: updatedList,
                  };
                  await persistState(lists, listId, updated);
                  setTodos(updated);
                  emitStateChange("tasks_changed");
                  Alert.alert(
                    "Success",
                    `Created recurring study schedule task for "${suggestion.title}"!`,
                  );
                }
                await resolveSuggestion(suggestion.id);
                await loadSuggestions();
              }}
              style={{
                backgroundColor: "#6366F1",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}
              >
                Accept
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                await resolveSuggestion(suggestion.id);
                await loadSuggestions();
              }}
              style={{
                backgroundColor: isDark
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(0, 0, 0, 0.05)",
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                Dismiss
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
