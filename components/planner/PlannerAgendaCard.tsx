import React from "react";
import { StyleSheet, View } from "react-native";
import { TimelineTaskCard } from "./TimelineTaskCard";
import { EmptyState } from "../ui/EmptyState";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AgendaItem = {
  id: string;
  title: string;
  timeLabel: string;
  completed: boolean;
  type: "task" | "habit" | "focus";
  category?: string;
  streak?: number;
  priority?: "low" | "medium" | "high";
};

type PlannerAgendaCardProps = {
  items: AgendaItem[];
  onPressCard?: (item: AgendaItem) => void;
};

export const PlannerAgendaCard: React.FC<PlannerAgendaCardProps> = ({
  items,
  onPressCard,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  if (items.length === 0) {
    return (
      <EmptyState
        graphic={<Feather name="bell-off" size={24} color={colors.textMuted} style={{ opacity: 0.6 }} />}
        title="Your schedule is clear"
        description="Add alarm reminder times to tasks or habits to schedule them on this agenda."
      />
    );
  }

  return (
    <View style={styles.container}>
      {items.map((item, idx) => (
        <TimelineTaskCard
          key={item.id || idx}
          time={item.timeLabel}
          title={item.title}
          category={item.category}
          priority={item.priority}
          completed={item.completed}
          type={item.type}
          streak={item.streak}
          onPressCard={() => onPressCard?.(item)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
});
