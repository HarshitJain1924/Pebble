import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  TouchableOpacity,
} from "react-native";
import PressableScale from "@/shared/components/ui/PressableScale";
import { AppText as Text } from "@/shared/components/ui/AppText";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";

import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { TimeSelectorDial } from "@/shared/components/ui/TimeSelectorDial";
import * as Haptics from "expo-haptics";
import { getCognitiveFlowStats, CognitiveFlowStats } from "@/features/capture/services/cognitive-flow.service";
import { TASK_CATEGORY_META, normalizeTaskCategory, getTaskCategoryMeta } from "@/features/tasks/services/task-categories";

import { Workspace } from "@/shared/types/domain.types";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

interface TaskEditorSheetProps {
  task: any | null;
  lists: Workspace[];
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

  const [flowStats, setFlowStats] = useState<CognitiveFlowStats | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const stats = await getCognitiveFlowStats();
        setFlowStats(stats);
      } catch {}
    }
    loadStats();
  }, []);

  const suggestions = useMemo(() => {
    if (!flowStats) return [];
    if (flowStats.peakZone === "Morning Focus Peak") {
      return [
        { label: "8:00 AM", hour: 8, minute: 0 },
        { label: "10:00 AM", hour: 10, minute: 0 },
        { label: "11:30 AM", hour: 11, minute: 30 },
      ];
    } else if (flowStats.peakZone === "Afternoon Steady Flow") {
      return [
        { label: "12:30 PM", hour: 12, minute: 30 },
        { label: "2:00 PM", hour: 14, minute: 0 },
        { label: "4:00 PM", hour: 16, minute: 0 },
      ];
    } else if (flowStats.peakZone === "Night Owl Momentum") {
      return [
        { label: "6:00 PM", hour: 18, minute: 0 },
        { label: "8:00 PM", hour: 20, minute: 0 },
        { label: "9:30 PM", hour: 21, minute: 30 },
      ];
    }
    return [
      { label: "9:00 AM", hour: 9, minute: 0 },
      { label: "2:00 PM", hour: 14, minute: 0 },
      { label: "7:00 PM", hour: 19, minute: 0 },
    ];
  }, [flowStats]);

  const hasChanges = useMemo(() => {
    if (!task || !editedTask) return false;
    if (mode === "add") return true;

    const titleDiff = (editedTask.title || "").trim() !== (task.title || "").trim();
    const descDiff = (editedTask.description || "").trim() !== (task.description || "").trim();
    const dateDiff = itemType === "task" && editedTask.scheduledDate !== task.scheduledDate;
    const priorityDiff = editedTask.priority !== task.priority;
    const folderDiff = editedTask.folderId !== task.folderId;
    const categoryDiff = editedTask.category !== task.category;
    const durationDiff = editedTask.durationMinutes !== task.durationMinutes;
    
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
      categoryDiff ||
      durationDiff ||
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
      setEditedTask({
        ...task,
        category: normalizeTaskCategory(task.category),
      });
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
            <PressableScale onPress={handleClose} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </PressableScale>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {(() => {
                if (itemType === "habit") return mode === "add" ? "New Habit" : "Edit Habit";
                if (editedTask?.category === "focus") return mode === "add" ? "New Focus Session" : "Edit Focus Session";
                if (editedTask?.category === "travel" || editedTask?.category === "creative") return mode === "add" ? "New Event" : "Edit Event";
                return mode === "add" ? "New Task" : "Edit Task";
              })()}
            </Text>
            <PressableScale 
              onPress={handleSave} 
              disabled={mode === "edit" ? !hasChanges : !editedTask?.title?.trim()}
              style={[styles.headerBtn, { opacity: (mode === "edit" ? hasChanges : !!editedTask?.title?.trim()) ? 1 : 0.5 }]}
            >
              <Text style={[styles.headerBtnText, { color: colors.primary, fontWeight: "700" }]}>Save</Text>
            </PressableScale>
          </View>

          <BottomSheetScrollView contentContainerStyle={styles.content}>
            {/* Capture Container matching CaptureInputBox design */}
            <View
              style={[
                styles.captureContainer,
                {
                  backgroundColor: isLight ? "#FFFFFF" : "rgba(255,255,255,0.03)",
                  borderColor: isLight ? colors.border : "rgba(255,255,255,0.06)",
                },
              ]}
            >
              {/* Title Input */}
              <BottomSheetTextInput
                style={[
                  styles.titleInput,
                  { color: colors.text }
                ]}
                value={editedTask.title}
                onChangeText={(t) => setEditedTask({ ...editedTask, title: t })}
                placeholder={
                  itemType === "habit"
                    ? "Habit Name"
                    : editedTask?.category === "focus"
                    ? "Focus Topic (e.g., Deep Work)"
                    : editedTask?.isEvent
                    ? "Event Name"
                    : "Task Name"
                }
                placeholderTextColor={colors.textMuted}
                autoFocus={mode === "add"}
              />

              {/* Description Input */}
              <BottomSheetTextInput
                style={[
                  styles.descInput,
                  {
                    color: colors.text,
                    borderTopColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
                  }
                ]}
                value={editedTask.description || ""}
                onChangeText={(t) => setEditedTask({ ...editedTask, description: t })}
                placeholder="Add a note..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Item Type Switcher (only for tasks/events/focus) */}
            {itemType === "task" && (
              <View style={{ flexDirection: "row", backgroundColor: isLight ? "#F1F5F9" : "#27272A", borderRadius: 12, padding: 3, marginBottom: 4 }}>
                {["task", "event", "focus"].map((type) => {
                  const isSelected = type === "task" 
                    ? (!editedTask.isEvent && editedTask.category !== "focus") 
                    : type === "event" 
                    ? editedTask.isEvent 
                    : editedTask.category === "focus";
                  
                  return (
                    <Pressable
                      key={type}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        if (type === "task") {
                          setEditedTask({ ...editedTask, isEvent: false, category: "work" });
                        } else if (type === "event") {
                          setEditedTask({ ...editedTask, isEvent: true, category: "work" });
                        } else {
                          setEditedTask({ ...editedTask, isEvent: false, category: "focus" });
                        }
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                        backgroundColor: isSelected ? colors.primary : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? "#FFFFFF" : colors.textMuted }}>
                        {type === "task" ? "Task" : type === "event" ? "Event" : "Focus"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Horizontal Picker Pills matching Quick Add styling */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}
            >
              {/* Date Pill */}
              {itemType === "task" && (
                <Pressable
                  onPress={() => setActivePicker(activePicker === "date" ? null : "date")}
                  style={[styles.metaPill, { backgroundColor: activePicker === "date" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "date" ? colors.primary : "transparent" }]}
                >
                  <Feather name="calendar" size={12} color={activePicker === "date" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.metaPillText, { color: activePicker === "date" ? colors.primary : colors.text }]}>
                    {editedTask.scheduledDate === "inbox" ? "Inbox" : editedTask.scheduledDate || "Date"}
                  </Text>
                </Pressable>
              )}

              {/* Workspace Pill */}
              <Pressable
                onPress={() => setActivePicker(activePicker === "workspace" ? null : "workspace")}
                style={[styles.metaPill, { backgroundColor: activePicker === "workspace" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "workspace" ? colors.primary : "transparent" }]}
              >
                {(() => {
                  const ws = lists.find(l => l.id === editedTask.folderId);
                  return (
                    <>
                      {ws?.iconType === "icon" && ws?.icon ? (
                        <Feather name={ws.icon as any} size={12} color={activePicker === "workspace" ? colors.primary : colors.textMuted} />
                      ) : (
                        <Text style={{ fontSize: 12 }}>{ws?.emoji || "📁"}</Text>
                      )}
                      <Text style={[styles.metaPillText, { color: activePicker === "workspace" ? colors.primary : colors.text }]}>
                        {ws?.name || "Workspace"}
                      </Text>
                    </>
                  );
                })()}
              </Pressable>

              {/* Category Pill (Tasks & Events only) */}
              {itemType === "task" && editedTask.category !== "focus" && (
                <Pressable
                  onPress={() => setActivePicker(activePicker === "category" ? null : "category")}
                  style={[styles.metaPill, { backgroundColor: activePicker === "category" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "category" ? colors.primary : "transparent" }]}
                >
                  <Feather name="tag" size={12} color={activePicker === "category" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.metaPillText, { color: activePicker === "category" ? colors.primary : colors.text }]}>
                    {getTaskCategoryMeta(normalizeTaskCategory(editedTask.category)).label}
                  </Text>
                </Pressable>
              )}

              {/* Duration Pill (Events & Focus Sessions only) */}
              {itemType === "task" && (editedTask.isEvent || editedTask.category === "focus") && (
                <Pressable
                  onPress={() => setActivePicker(activePicker === "duration" ? null : "duration")}
                  style={[styles.metaPill, { backgroundColor: activePicker === "duration" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "duration" ? colors.primary : "transparent" }]}
                >
                  <Feather name="clock" size={12} color={activePicker === "duration" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.metaPillText, { color: activePicker === "duration" ? colors.primary : colors.text }]}>
                    {editedTask.durationMinutes ? `${editedTask.durationMinutes}m` : "Duration"}
                  </Text>
                </Pressable>
              )}

              {/* Priority Pill */}
              <Pressable
                onPress={() => setActivePicker(activePicker === "priority" ? null : "priority")}
                style={[styles.metaPill, { backgroundColor: activePicker === "priority" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "priority" ? colors.primary : "transparent" }]}
              >
                <Feather name="flag" size={12} color={activePicker === "priority" ? colors.primary : colors.textMuted} />
                <Text style={[styles.metaPillText, { color: activePicker === "priority" ? colors.primary : colors.text, textTransform: "capitalize" }]}>
                  {editedTask.priority || "Medium"}
                </Text>
              </Pressable>

              {/* Reminder Pill */}
              <Pressable
                onPress={() => setActivePicker(activePicker === "reminder" ? null : "reminder")}
                style={[styles.metaPill, { backgroundColor: activePicker === "reminder" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "reminder" ? colors.primary : "transparent" }]}
              >
                <Feather name="bell" size={12} color={activePicker === "reminder" ? colors.primary : colors.textMuted} />
                <Text style={[styles.metaPillText, { color: activePicker === "reminder" ? colors.primary : colors.text }]}>
                  {reminderHour !== undefined && reminderMinute !== undefined
                    ? `${String(reminderHour).padStart(2, "0")}:${String(reminderMinute).padStart(2, "0")}`
                    : "Reminder"}
                </Text>
              </Pressable>

              {/* Recurrence Pill */}
              <Pressable
                onPress={() => setActivePicker(activePicker === "recurrence" ? null : "recurrence")}
                style={[styles.metaPill, { backgroundColor: activePicker === "recurrence" ? `${colors.primary}18` : (isLight ? "#F1F5F9" : "#27272A"), borderColor: activePicker === "recurrence" ? colors.primary : "transparent" }]}
              >
                <Feather name="repeat" size={12} color={activePicker === "recurrence" ? colors.primary : colors.textMuted} />
                <Text style={[styles.metaPillText, { color: activePicker === "recurrence" ? colors.primary : colors.text, textTransform: "capitalize" }]}>
                  {recurrenceType === "none" ? "Repeat" : recurrenceType}
                </Text>
              </Pressable>
            </ScrollView>

            {/* Active Inline Picker Drawer Slot */}
            {activePicker && (
              <View style={{ marginTop: 8, padding: 4 }}>
                {activePicker === "date" && (
                  <View>
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

                {activePicker === "workspace" && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerContent}>
                    {lists.filter(l => !(l as any).archived).map(l => (
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

                {activePicker === "category" && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerContent}>
                    {TASK_CATEGORY_META.filter(c => c.key !== "focus").map(cat => {
                      const isSelected = normalizeTaskCategory(editedTask.category) === cat.key;
                      return (
                        <Pressable
                          key={cat.key}
                          style={[
                            styles.pill,
                            {
                              backgroundColor: isSelected ? `${cat.tint}22` : colors.cardLight,
                              borderColor: isSelected ? cat.tint : colors.border,
                              borderWidth: 1.2,
                            }
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setEditedTask({ ...editedTask, category: cat.key });
                            setActivePicker(null);
                          }}
                        >
                          <Text style={{ color: isSelected ? cat.tint : colors.text, fontSize: 13, fontWeight: "600" }}>
                            {cat.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {activePicker === "duration" && (
                  <View style={styles.pickerContent}>
                    {[15, 30, 45, 60, 90, 120, 180].map((dur) => (
                      <Pressable
                        key={dur}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: editedTask.durationMinutes === dur ? `${colors.primary}22` : colors.cardLight,
                            borderColor: editedTask.durationMinutes === dur ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setEditedTask({ ...editedTask, durationMinutes: dur });
                          setActivePicker(null);
                        }}
                      >
                        <Text style={{ color: editedTask.durationMinutes === dur ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>
                          {dur >= 60 ? `${dur / 60}h` : `${dur}m`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

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

                {activePicker === "reminder" && (
                  <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 10, padding: 12 }]}>
                    <PressableScale
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
                    </PressableScale>

                    {flowStats && suggestions.length > 0 && (
                      <View style={{ gap: 6, marginTop: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5 }}>
                          ⚡ RECOMMENDATIONS ({flowStats.peakZone.toUpperCase().split(" ")[0]})
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {suggestions.map((s) => {
                            const isSelected = reminderHour === s.hour && reminderMinute === s.minute;
                            return (
                              <PressableScale
                                key={s.label}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                  setReminderHour(s.hour);
                                  setReminderMinute(s.minute);
                                  if (reminderDays.length === 0) {
                                    setReminderDays([0, 1, 2, 3, 4, 5, 6]);
                                  }
                                }}
                                style={{ flex: 1 }}
                                contentStyle={{
                                  backgroundColor: isSelected ? `${colors.primary}18` : (isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)"),
                                  borderColor: isSelected ? colors.primary : colors.border,
                                  borderWidth: 1.2,
                                  borderRadius: 12,
                                  paddingVertical: 10,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: "800", color: isSelected ? colors.primary : colors.text }}>
                                  {s.label}
                                </Text>
                              </PressableScale>
                            );
                          })}
                        </View>
                      </View>
                    )}

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
                        <PressableScale
                          style={{ alignSelf: "center", marginTop: 8 }}
                          onPress={() => {
                            setReminderHour(undefined);
                            setReminderMinute(undefined);
                            setReminderDays([]);
                            setTimePickerVisible(false);
                          }}
                        >
                          <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>Disable Reminder</Text>
                        </PressableScale>
                      </View>
                    )}
                  </View>
                )}

                {activePicker === "recurrence" && (
                  <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 12, padding: 12 }]}>
                    <Text style={{ color: colors.text, fontWeight: "600", fontSize: 16 }}>
                      Recurrence Pattern
                    </Text>

                    <View style={styles.recurrencePillsRow}>
                      {["none", "daily", "weekdays", "weekly", "monthly", "interval"].map((r) => {
                        const isSelected = recurrenceType === r;
                        return (
                          <PressableScale
                            key={r}
                            contentStyle={[styles.recurrencePillBtn, {
                              backgroundColor: isSelected ? `${colors.primary}22` : colors.cardLight,
                              borderColor: isSelected ? colors.primary : "transparent",
                              borderWidth: 1,
                            }]}
                            onPress={() => setRecurrenceType(r)}
                          >
                            <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                              {r}
                            </Text>
                          </PressableScale>
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
                              <PressableScale
                                key={idx}
                                contentStyle={[styles.dayCircleBtn, {
                                  backgroundColor: isDaySelected ? colors.primary : colors.cardLight,
                                  borderColor: isDaySelected ? colors.primary : colors.border,
                                  borderWidth: 1,
                                }]}
                                onPress={() => toggleDaySelection(idx)}
                              >
                                <Text style={{ color: isDaySelected ? "#fff" : colors.text, fontSize: 11, fontWeight: "700" }}>
                                  {day}
                                </Text>
                              </PressableScale>
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
                              <PressableScale
                                key={unit}
                                contentStyle={[styles.unitBtn, {
                                  backgroundColor: isUnitSelected ? `${colors.primary}22` : colors.cardLight,
                                  borderColor: isUnitSelected ? colors.primary : colors.border,
                                  borderWidth: 1,
                                }]}
                                onPress={() => setIntervalUnit(unit as any)}
                              >
                                <Text style={{ color: isUnitSelected ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>
                                  {unit}
                                </Text>
                              </PressableScale>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Delete Button */}
            {mode === "edit" && onDelete && (
              <PressableScale
                contentStyle={[styles.deleteBtn, { backgroundColor: "rgba(239, 68, 68, 0.1)", marginTop: 16 }]}
                onPress={() => {
                  onDelete(editedTask.id);
                  handleClose();
                }}
              >
                <Feather name="trash-2" size={18} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete {itemType === "habit" ? "Habit" : "Task"}</Text>
              </PressableScale>
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
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  captureContainer: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 8,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: "600",
    padding: 0,
    minHeight: 44,
    textAlignVertical: "top",
    lineHeight: 22,
  },
  descInput: {
    fontSize: 13,
    fontWeight: "400",
    padding: 0,
    minHeight: 36,
    textAlignVertical: "top",
    borderTopWidth: 1,
    paddingTop: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: "600",
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
    paddingHorizontal: 4,
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
