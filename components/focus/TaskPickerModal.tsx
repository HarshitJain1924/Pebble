import React from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/components/ui/AppText";

interface TaskPickerModalProps {
  visible: boolean;
  onClose: () => void;
  todoList: any[];
  habitList: any[];
  focusedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  colors: any;
  insets: any;
}

export const TaskPickerModal: React.FC<TaskPickerModalProps> = ({
  visible,
  onClose,
  todoList,
  habitList,
  focusedTaskId,
  onSelectTask,
  colors,
  insets,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[
          styles.modalContent,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(24, insets.bottom),
          }
        ]}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Select Focus Target
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.divider} />
          
          <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
            {/* Tasks Section */}
            {todoList.length > 0 && (
              <View style={{ gap: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase", paddingLeft: 8 }}>
                  Tasks
                </Text>
                {todoList.map((todo) => (
                  <Pressable
                    key={todo.id}
                    onPress={() => {
                      onSelectTask(todo.id);
                      onClose();
                    }}
                    style={[
                      styles.taskItem,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: focusedTaskId === todo.id ? `${colors.primary}11` : "transparent"
                      }
                    ]}
                  >
                    <Feather
                      name={focusedTaskId === todo.id ? "check-circle" : "circle"}
                      size={18}
                      color={focusedTaskId === todo.id ? colors.primary : colors.textMuted}
                    />
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>
                      {todo.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Habits Section */}
            {habitList.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase", paddingLeft: 8 }}>
                  Habits
                </Text>
                {habitList.map((habit) => {
                  const isSelected = focusedTaskId === habit.id;
                  const hasBrokenStreak = !!habit.previousStreak && habit.previousStreak > 0;
                  return (
                    <Pressable
                      key={habit.id}
                      onPress={() => {
                        onSelectTask(habit.id);
                        onClose();
                      }}
                      style={[
                        styles.taskItem,
                        {
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected ? "rgba(245, 158, 11, 0.11)" : "transparent"
                        }
                      ]}
                    >
                      <Feather
                        name={isSelected ? "check-circle" : "activity"}
                        size={18}
                        color={isSelected ? "#F59E0B" : colors.textMuted}
                      />
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          {habit.title}
                        </Text>
                        {hasBrokenStreak && (
                          <View style={{ backgroundColor: `${colors.error}15`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ fontSize: 9, fontWeight: "800", color: colors.error }}>
                              💔 RECOVERY
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {todoList.length === 0 && habitList.length === 0 && (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No focus targets available today.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    gap: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignSelf: "center",
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
});
