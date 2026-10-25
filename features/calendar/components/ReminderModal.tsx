import React, { useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  View,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { TimeSelectorDial } from "@/shared/components/ui/TimeSelectorDial";
import { type Task } from "@/shared/types/domain.types";

export interface ReminderModalProps {
  visible: boolean;
  todoId: string | null;
  todos: Record<string, Task[]>;
  selectedList: string;
  onClose: () => void;
  onScheduleAlarm: (todoId: string, minutes: number) => Promise<void> | void;
  onScheduleAlarmWithDays: (
    todoId: string,
    hour: number,
    minute: number,
    days?: number[],
  ) => Promise<void> | void;
}

export function ReminderModal({
  visible,
  todoId,
  todos,
  selectedList: selectedWorkspaceId,
  onClose,
  onScheduleAlarm,
  onScheduleAlarmWithDays,
}: ReminderModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [alarmCustomVisible, setAlarmCustomVisible] = useState(false);
  const [alarmCustomHour, setAlarmCustomHour] = useState<number>(9);
  const [alarmCustomMinute, setAlarmCustomMinute] = useState<number>(0);
  const [alarmCustomDays, setAlarmCustomDays] = useState<number[]>([]);

  useEffect(() => {
    if (visible && todoId) {
      const todoList = todos[selectedWorkspaceId] ?? Object.values(todos).flat();
      const todo = todoList.find((t) => t.id === todoId);
      const reminderDate = todo?.reminder?.triggerAt ? new Date(todo.reminder.triggerAt) : null;
      setAlarmCustomHour(reminderDate ? reminderDate.getHours() : 9);
      setAlarmCustomMinute(reminderDate ? reminderDate.getMinutes() : 0);
      setAlarmCustomDays(todo?.recurrence?.daysOfWeek ?? []);
      setAlarmCustomVisible(false);
    } else {
      setAlarmCustomVisible(false);
    }
  }, [visible, todoId, todos, selectedWorkspaceId]);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {alarmCustomVisible ? "Custom Time & Days" : "Set Reminder"}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!alarmCustomVisible ? (
            <View style={styles.alarmPresetContainer}>
              <TouchableOpacity
                style={[
                  styles.alarmPresetButton,
                  { backgroundColor: colors.cardLight },
                ]}
                onPress={() => {
                  if (todoId) onScheduleAlarm(todoId, 15);
                  onClose();
                }}
              >
                <Feather name="clock" size={18} color={colors.primary} />
                <Text style={[styles.alarmPresetText, { color: colors.text }]}>
                  In 15 minutes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.alarmPresetButton,
                  { backgroundColor: colors.cardLight },
                ]}
                onPress={() => {
                  if (todoId) onScheduleAlarm(todoId, 60);
                  onClose();
                }}
              >
                <Feather name="clock" size={18} color={colors.primary} />
                <Text style={[styles.alarmPresetText, { color: colors.text }]}>
                  In 1 hour
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.alarmPresetButton,
                  { backgroundColor: colors.cardLight },
                ]}
                onPress={() => {
                  if (todoId) onScheduleAlarm(todoId, 180);
                  onClose();
                }}
              >
                <Feather name="clock" size={18} color={colors.primary} />
                <Text style={[styles.alarmPresetText, { color: colors.text }]}>
                  In 3 hours
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.alarmPresetButton,
                  {
                    backgroundColor: colors.primaryLight + "20",
                    borderColor: colors.primary,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => setAlarmCustomVisible(true)}
              >
                <Feather name="calendar" size={18} color={colors.primary} />
                <Text
                  style={[
                    styles.alarmPresetText,
                    { color: colors.primary, fontWeight: "700" },
                  ]}
                >
                  Pick Time & Days...
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TimeSelectorDial
              initialHour={alarmCustomHour}
              initialMinute={alarmCustomMinute}
              colors={colors}
              saveLabel="Save Reminder"
              onSave={(h: number, m: number) => {
                if (todoId) {
                  onScheduleAlarmWithDays(
                    todoId,
                    h,
                    m,
                    alarmCustomDays.length > 0 ? alarmCustomDays : undefined,
                  );
                }
                onClose();
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  alarmPresetContainer: {
    gap: 10,
  },
  alarmPresetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
  },
  alarmPresetText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
