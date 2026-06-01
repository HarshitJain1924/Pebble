import React, { useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  View,
  TouchableOpacity,
} from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/AppCard";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "@/constants/taskStyles";
import { type Todo } from "../types";

interface AlarmModalProps {
  visible: boolean;
  todoId: string | null;
  todos: Record<string, Todo[]>;
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

export function AlarmModal({
  visible,
  todoId,
  todos,
  selectedList,
  onClose,
  onScheduleAlarm,
  onScheduleAlarmWithDays,
}: AlarmModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [alarmCustomVisible, setAlarmCustomVisible] = useState(false);
  const [alarmCustomHour, setAlarmCustomHour] = useState<number>(9);
  const [alarmCustomMinute, setAlarmCustomMinute] = useState<number>(0);
  const [alarmCustomDays, setAlarmCustomDays] = useState<number[]>([]);

  // Initialize values when modal opens or todoId changes
  useEffect(() => {
    if (visible && todoId) {
      const todoList = todos[selectedList] ?? [];
      const todo = todoList.find((t) => t.id === todoId);
      setAlarmCustomHour(todo?.reminderHour ?? 9);
      setAlarmCustomMinute(todo?.reminderMinute ?? 0);
      setAlarmCustomDays(todo?.reminderDays ?? []);
      setAlarmCustomVisible(false);
    } else {
      setAlarmCustomVisible(false);
    }
  }, [visible, todoId, todos, selectedList]);

  if (!todoId) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <AppCard
          style={styles.centeredAlarmCard}
          onPress={() => {}} /* Prevent backdrop press dismiss inside card */
        >
          <View style={styles.modalHeaderRow}>
            <Text style={[styles.modalTitleText, { color: colors.text }]}>
              Set Reminder
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.modalSubtitleText, { color: colors.textMuted }]}>
            Select a quick duration countdown or configure a custom scheduled time below:
          </Text>

          <View style={styles.alarmOptionsGrid}>
            {[
              { label: "5 min", mins: 5 },
              { label: "30 min", mins: 30 },
              { label: "1 hour", mins: 60 },
            ].map(({ label, mins }) => (
              <TouchableOpacity
                key={label}
                activeOpacity={0.8}
                onPress={() => {
                  onScheduleAlarm(todoId, mins);
                  onClose();
                }}
                style={[
                  styles.premiumAlarmBtn,
                  { backgroundColor: colors.cardLight },
                ]}
              >
                <Feather
                  name="clock"
                  size={12}
                  color={colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setAlarmCustomVisible((s) => !s)}
            style={[
              styles.customToggleBtn,
              {
                backgroundColor: alarmCustomVisible
                  ? `${colors.primary}18`
                  : "rgba(255,255,255,0.015)",
                borderColor: alarmCustomVisible
                  ? colors.primary
                  : colors.border,
              },
            ]}
          >
            <Feather name="sliders" size={13} color={colors.primary} />
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              Configure Custom Time
            </Text>
            <Feather
              name={alarmCustomVisible ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textMuted}
              style={{ marginLeft: "auto" }}
            />
          </TouchableOpacity>

          {alarmCustomVisible && (
            <View style={{ marginTop: 6 }}>
              <TimeSelectorDial
                initialHour={alarmCustomHour}
                initialMinute={alarmCustomMinute}
                initialDays={alarmCustomDays}
                colors={colors}
                onSave={(hour, minute, days) => {
                  onScheduleAlarmWithDays(todoId, hour, minute, days);
                  onClose();
                }}
              />
            </View>
          )}
        </AppCard>
      </Pressable>
    </Modal>
  );
}
