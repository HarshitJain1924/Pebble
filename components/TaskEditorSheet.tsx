import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  TouchableOpacity,
} from "react-native";
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
import { useUndo } from "@/components/ui/UndoContext";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";

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
  itemType?: "task" | "habit";
}

export function TaskEditorSheet({
  task,
  lists,
  mode = "edit",
  onClose,
  onSave,
  onDelete,
  itemType = "task",
}: TaskEditorSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const { showToast } = useUndo();

  const snapPoints = useMemo(() => ["85%", "95%"], []);

  // Internal State
  const [editedTask, setEditedTask] = useState<any>(null);
  const [activePicker, setActivePicker] = useState<string | null>(null);

  // Time & Recurrence pickers state
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [reminderHour, setReminderHour] = useState<number | undefined>(undefined);
  const [reminderMinute, setReminderMinute] = useState<number | undefined>(undefined);
  const [reminderDays, setReminderDays] = useState<number[]>([]);
  const [recurrenceType, setRecurrenceType] = useState<string>("none");
  const [intervalVal, setIntervalVal] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<"hours" | "days">("days");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState<number>(1);

  const hasChanges = useMemo(() => {
    if (!task || !editedTask) return false;
    if (mode === "add") return true;

    const titleDiff = (editedTask.title || "").trim() !== (task.title || "").trim();
    const descDiff = (editedTask.description || "").trim() !== (task.description || "").trim();
    const dateDiff = itemType === "task" && editedTask.scheduledDate !== task.scheduledDate;
    const priorityDiff = editedTask.priority !== task.priority;
    const folderDiff = editedTask.folderId !== task.folderId;
    
    // Compare reminders
    const reminderHourDiff = reminderHour !== task.reminderHour;
    const reminderMinuteDiff = reminderMinute !== task.reminderMinute;
    const reminderDaysDiff = JSON.stringify(reminderDays) !== JSON.stringify(task.reminderDays || []);

    // Compare recurrence
    const origRec = task.recurrence;
    const origRecType = origRec?.type || "none";
    const origRecDays = origRec?.days || [];
    const origRecDayOfMonth = origRec?.dayOfMonth || 1;
    const origRecInterval = origRec?.interval || 1;
    const origRecUnit = origRec?.unit || "days";

    const recurrenceTypeDiff = recurrenceType !== origRecType;
    const recurrenceDaysDiff = recurrenceType === "weekly" && JSON.stringify(recurrenceDays) !== JSON.stringify(origRecDays);
    const recurrenceDayOfMonthDiff = recurrenceType === "monthly" && recurrenceDayOfMonth !== origRecDayOfMonth;
    const recurrenceIntervalDiff = recurrenceType === "interval" && (intervalVal !== origRecInterval || intervalUnit !== origRecUnit);

    return (
      titleDiff ||
      descDiff ||
      dateDiff ||
      priorityDiff ||
      folderDiff ||
      reminderHourDiff ||
      reminderMinuteDiff ||
      reminderDaysDiff ||
      recurrenceTypeDiff ||
      recurrenceDaysDiff ||
      recurrenceDayOfMonthDiff ||
      recurrenceIntervalDiff
    );
  }, [
    task,
    editedTask,
    mode,
    reminderHour,
    reminderMinute,
    reminderDays,
    recurrenceType,
    recurrenceDays,
    recurrenceDayOfMonth,
    intervalVal,
    intervalUnit,
    itemType,
  ]);

  // Sync incoming task to local state
  useEffect(() => {
    if (task) {
      setEditedTask({ ...task });
      setReminderHour(task.reminderHour);
      setReminderMinute(task.reminderMinute);
      setReminderDays(task.reminderDays || []);
      
      const rec = task.recurrence;
      if (rec) {
        setRecurrenceType(rec.type || "none");
        setIntervalVal(rec.interval || 1);
        setIntervalUnit(rec.unit || "days");
        setRecurrenceDays(rec.days || []);
        setRecurrenceDayOfMonth(rec.dayOfMonth || 1);
      } else {
        setRecurrenceType("none");
        setIntervalVal(1);
        setIntervalUnit("days");
        setRecurrenceDays([]);
        setRecurrenceDayOfMonth(1);
      }
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
      const timer = setTimeout(() => {
        setEditedTask(null);
        setActivePicker(null);
        setTimePickerVisible(false);
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
      // Build final recurrence object
      let recurrence: any = undefined;
      if (recurrenceType !== "none") {
        recurrence = {
          type: recurrenceType,
          days: recurrenceType === "weekly" ? recurrenceDays : (recurrenceType === "weekdays" ? [1, 2, 3, 4, 5] : undefined),
          dayOfMonth: recurrenceType === "monthly" ? recurrenceDayOfMonth : undefined,
          interval: recurrenceType === "interval" ? intervalVal : undefined,
          unit: recurrenceType === "interval" ? intervalUnit : undefined,
        };
      }

      const updated = {
        ...editedTask,
        reminderHour,
        reminderMinute,
        reminderDays,
        recurrence,
      };
      onSave(updated);
      if (mode === "edit") {
        showToast("Changes saved");
      }
    }
    handleClose();
  };

  const toggleDaySelection = (dayIdx: number) => {
    setRecurrenceDays((prev) => {
      if (prev.includes(dayIdx)) {
        return prev.filter((d) => d !== dayIdx);
      } else {
        return [...prev, dayIdx].sort();
      }
    });
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>{mode === "add" ? (itemType === "habit" ? "New Habit" : "New Task") : (itemType === "habit" ? "Edit Habit" : "Edit Task")}</Text>
            <Pressable 
              onPress={handleSave} 
              disabled={mode === "edit" ? !hasChanges : !editedTask?.title?.trim()}
              style={[styles.headerBtn, { opacity: (mode === "edit" ? hasChanges : !!editedTask?.title?.trim()) ? 1 : 0.5 }]}
            >
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
              placeholder={itemType === "habit" ? "Habit Name" : "Task Name"}
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

            {/* Date Picker (Tasks only) */}
            {itemType === "task" && (
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
            )}

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

            {/* Reminder Setting */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setTimePickerVisible(!timePickerVisible)}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Feather name="bell" size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: "600", marginLeft: 8, fontSize: 16 }}>
                    Reminder Schedule
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                    {reminderHour !== undefined && reminderMinute !== undefined
                      ? `${String(reminderHour).padStart(2, "0")}:${String(reminderMinute).padStart(2, "0")}`
                      : "Off"}
                  </Text>
                  <Feather name={timePickerVisible ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </View>
              </TouchableOpacity>

              {timePickerVisible && (
                <View style={{ marginTop: 12 }}>
                  <TimeSelectorDial
                    colors={colors}
                    initialHour={reminderHour ?? 7}
                    initialMinute={reminderMinute ?? 0}
                    initialDays={reminderDays}
                    onSave={(h, m, d) => {
                      setReminderHour(h);
                      setReminderMinute(m);
                      setReminderDays(d || []);
                      setTimePickerVisible(false);
                    }}
                    saveLabel="Confirm Time"
                  />
                  <TouchableOpacity
                    style={{ alignSelf: "center", marginTop: 8 }}
                    onPress={() => {
                      setReminderHour(undefined);
                      setReminderMinute(undefined);
                      setReminderDays([]);
                      setTimePickerVisible(false);
                    }}
                  >
                    <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>Disable Reminder</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Recurrence Pattern Configuration */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 16 }}>
                Recurrence Pattern
              </Text>

              <View style={styles.recurrencePillsRow}>
                {["none", "daily", "weekdays", "weekly", "monthly", "interval"].map((r) => {
                  const isSelected = recurrenceType === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.recurrencePillBtn, {
                        backgroundColor: isSelected ? `${colors.primary}22` : colors.cardLight,
                        borderColor: isSelected ? colors.primary : "transparent",
                        borderWidth: 1,
                      }]}
                      onPress={() => setRecurrenceType(r)}
                    >
                      <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {recurrenceType === "weekly" && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>Repeat on days:</Text>
                  <View style={styles.daysSelectionRow}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => {
                      const isDaySelected = recurrenceDays.includes(idx);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.dayCircleBtn, {
                            backgroundColor: isDaySelected ? colors.primary : colors.cardLight,
                            borderColor: isDaySelected ? colors.primary : colors.border,
                            borderWidth: 1,
                          }]}
                          onPress={() => toggleDaySelection(idx)}
                        >
                          <Text style={{ color: isDaySelected ? "#fff" : colors.text, fontSize: 11, fontWeight: "700" }}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {recurrenceType === "monthly" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Repeat on day of month:</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={[styles.numInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardLight }]}
                    value={String(recurrenceDayOfMonth)}
                    onChangeText={(val) => {
                      const num = Number(val);
                      if (!isNaN(num) && num >= 1 && num <= 31) {
                        setRecurrenceDayOfMonth(num);
                      }
                    }}
                  />
                </View>
              )}

              {recurrenceType === "interval" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Repeat every</Text>
                  <TextInput
                    keyboardType="number-pad"
                    style={[styles.numInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardLight, width: 50 }]}
                    value={String(intervalVal)}
                    onChangeText={(val) => {
                      const num = Number(val);
                      if (!isNaN(num) && num >= 1) {
                        setIntervalVal(num);
                      }
                    }}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["hours", "days"].map((unit) => {
                      const isUnitSelected = intervalUnit === unit;
                      return (
                        <TouchableOpacity
                          key={unit}
                          style={[styles.unitBtn, {
                            backgroundColor: isUnitSelected ? `${colors.primary}22` : colors.cardLight,
                            borderColor: isUnitSelected ? colors.primary : colors.border,
                            borderWidth: 1,
                          }]}
                          onPress={() => setIntervalUnit(unit as any)}
                        >
                          <Text style={{ color: isUnitSelected ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
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
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete {itemType === "habit" ? "Habit" : "Task"}</Text>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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
  metaCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  recurrencePillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  recurrencePillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  daysSelectionRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 8 },
  dayCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  numInput: {
    width: 40,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});
