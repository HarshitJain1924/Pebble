import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  ScrollView,
  Pressable,
} from "react-native";
import { AppTextInput as TextInput } from "@/components/ui/AppText";
import { AppText as Text } from "@/components/ui/AppText";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type TaskList = { id: string; name: string };

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

interface TaskEditorSheetProps {
  task: any | null;
  lists: TaskList[];
  mode?: "add" | "edit";
  onClose: () => void;
  onSave: (updatedTask: any) => void;
  onDelete?: (taskId: string) => void;
}

export function TaskEditorSheet({
  task,
  lists,
  mode = "edit",
  onClose,
  onSave,
  onDelete,
}: TaskEditorSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const snapPoints = useMemo(() => ["85%", "95%"], []);

  // Internal State
  const [editedTask, setEditedTask] = useState<any>(null);
  const [activePicker, setActivePicker] = useState<string | null>(null);

  // Sync incoming task to local state
  useEffect(() => {
    if (task) {
      setEditedTask({ ...task });
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
      const timer = setTimeout(() => {
        setEditedTask(null);
        setActivePicker(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [task]);

  const handleClose = () => {
    bottomSheetRef.current?.close();
    onClose();
  };

  const handleSave = () => {
    if (editedTask) {
      onSave(editedTask);
    }
    handleClose();
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <View style={editedTask ? StyleSheet.absoluteFill : { display: "none" }} pointerEvents={editedTask ? "auto" : "none"}>
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
      {editedTask ? (
        <>
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{mode === "add" ? "New Task" : "Edit Task"}</Text>
            <Pressable onPress={handleSave} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.primary, fontWeight: "700" }]}>Save</Text>
            </Pressable>
          </View>

          <BottomSheetScrollView contentContainerStyle={styles.content}>
            {/* Title Input */}
            <BottomSheetTextInput
              style={[
                styles.titleInput,
                { color: colors.text, backgroundColor: isLight ? "#F9FAFB" : "rgba(0,0,0,0.18)", borderColor: isLight ? colors.border : "rgba(255,255,255,0.08)" },
              ]}
              value={editedTask.title}
              onChangeText={(t) => setEditedTask({ ...editedTask, title: t })}
              placeholder="Task Name"
              placeholderTextColor={colors.textMuted}
              autoFocus={mode === "add"}
            />

            {/* Description Input */}
            <BottomSheetTextInput
              style={[
                styles.descInput,
                { color: colors.text, backgroundColor: isLight ? "#F9FAFB" : "rgba(0,0,0,0.18)", borderColor: isLight ? colors.border : "rgba(255,255,255,0.08)" },
              ]}
              value={editedTask.description || ""}
              onChangeText={(t) => setEditedTask({ ...editedTask, description: t })}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            {/* Date Picker */}
            <View style={styles.rowGroup}>
              <Pressable style={styles.row} onPress={() => setActivePicker(activePicker === "date" ? null : "date")}>
                <View style={styles.rowLeft}>
                  <Feather name="calendar" size={18} color={colors.primary} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Date</Text>
                </View>
                <Text style={[styles.rowValue, { color: colors.textMuted }]}>
                  {editedTask.scheduledDate === "inbox" ? "Inbox" : editedTask.scheduledDate || "None"}
                </Text>
              </Pressable>
              {activePicker === "date" && (
                <View style={{ padding: 12 }}>
                  <View style={styles.pickerContent}>
                    {[{ label: "Today", value: getDateKey() }, { label: "Tomorrow", value: getDateKey(new Date(Date.now() + 86400000)) }, { label: "Inbox", value: "inbox" }].map(opt => (
                      <Pressable
                        key={opt.label}
                        style={[styles.pill, { backgroundColor: editedTask.scheduledDate === opt.value ? `${colors.primary}22` : colors.cardLight, borderColor: editedTask.scheduledDate === opt.value ? colors.primary : colors.border }]}
                        onPress={() => { setEditedTask({ ...editedTask, scheduledDate: opt.value }); setActivePicker(null); }}
                      >
                        <Text style={{ color: editedTask.scheduledDate === opt.value ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>{opt.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                    <Calendar
                      current={editedTask.scheduledDate !== "inbox" ? editedTask.scheduledDate : undefined}
                      onDayPress={(day: any) => {
                        setEditedTask({ ...editedTask, scheduledDate: day.dateString });
                        setActivePicker(null);
                      }}
                      theme={{
                        backgroundColor: colors.card,
                        calendarBackground: colors.card,
                        textSectionTitleColor: colors.textMuted,
                        selectedDayBackgroundColor: colors.primary,
                        selectedDayTextColor: '#ffffff',
                        todayTextColor: colors.primary,
                        dayTextColor: colors.text,
                        textDisabledColor: colors.textMuted + '50',
                        monthTextColor: colors.text,
                        arrowColor: colors.primary,
                      }}
                      markedDates={
                        editedTask.scheduledDate && editedTask.scheduledDate !== "inbox"
                          ? { [editedTask.scheduledDate]: { selected: true, selectedColor: colors.primary } }
                          : {}
                      }
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Priority Picker */}
            <View style={styles.rowGroup}>
              <Pressable style={styles.row} onPress={() => setActivePicker(activePicker === "priority" ? null : "priority")}>
                <View style={styles.rowLeft}>
                  <Feather name="flag" size={18} color={editedTask.priority === "high" ? colors.error : editedTask.priority === "low" ? colors.success : colors.warning} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Priority</Text>
                </View>
                <Text style={[styles.rowValue, { color: colors.textMuted }]}>
                  {editedTask.priority ? editedTask.priority.toUpperCase() : "MEDIUM"}
                </Text>
              </Pressable>
              {activePicker === "priority" && (
                <View style={styles.pickerContent}>
                  {["low", "medium", "high"].map(p => (
                    <Pressable
                      key={p}
                      style={[styles.pill, { backgroundColor: editedTask.priority === p ? `${colors.primary}22` : colors.cardLight, borderColor: editedTask.priority === p ? colors.primary : colors.border }]}
                      onPress={() => { setEditedTask({ ...editedTask, priority: p }); setActivePicker(null); }}
                    >
                      <Text style={{ color: editedTask.priority === p ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>{p.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Workspace Picker */}
            <View style={styles.rowGroup}>
              <Pressable style={styles.row} onPress={() => setActivePicker(activePicker === "workspace" ? null : "workspace")}>
                <View style={styles.rowLeft}>
                  <Feather name="folder" size={18} color={colors.primary} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Workspace</Text>
                </View>
                <Text style={[styles.rowValue, { color: colors.textMuted }]}>
                  {lists.find(l => l.id === editedTask.folderId)?.name || "Default"}
                </Text>
              </Pressable>
              {activePicker === "workspace" && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerContent}>
                  {lists.map(l => (
                    <Pressable
                      key={l.id}
                      style={[styles.pill, { backgroundColor: editedTask.folderId === l.id ? `${colors.primary}22` : colors.cardLight, borderColor: editedTask.folderId === l.id ? colors.primary : colors.border }]}
                      onPress={() => { setEditedTask({ ...editedTask, folderId: l.id }); setActivePicker(null); }}
                    >
                      <Text style={{ color: editedTask.folderId === l.id ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>{l.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Delete Button */}
            {mode === "edit" && onDelete && (
              <Pressable
                style={[styles.deleteBtn, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}
                onPress={() => {
                  onDelete(editedTask.id);
                  handleClose();
                }}
              >
                <Feather name="trash-2" size={18} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Task</Text>
              </Pressable>
            )}
          </BottomSheetScrollView>
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.card }} />
      )}
    </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150,150,150,0.2)",
  },
  headerBtn: { padding: 4 },
  headerBtnText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  content: { padding: 16, gap: 16, paddingBottom: 60 },
  titleInput: {
    fontSize: 18,
    fontWeight: "600",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  descInput: {
    fontSize: 15,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 100,
    textAlignVertical: "top",
  },
  rowGroup: { gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLabel: { fontSize: 16, fontWeight: "500" },
  rowValue: { fontSize: 15 },
  pickerContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  deleteBtnText: { fontSize: 16, fontWeight: "600" },
});

