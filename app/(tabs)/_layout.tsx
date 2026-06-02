import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Feather } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Platform,
  Pressable,
  StyleSheet,
  View,
  Modal,
  
  
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity } from "react-native";
import { AppTextInput as TextInput } from "@/components/ui/AppText";
import { AppText as Text } from "@/components/ui/AppText";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetTextInput, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TODOS_STORAGE_KEY, DAILY_STORAGE_KEY } from "@/services/storage";
import {
  TASK_CATEGORY_META,
  DEFAULT_TASK_CATEGORY,
  type TaskCategory,
} from "@/services/taskCategories";
import { recordDailyHistorySnapshot } from "@/services/productivityHistory";
import { addXp } from "@/services/settingsService";
import { scheduleReminderBatch } from "@/services/reminders";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import * as Haptics from "expo-haptics";
import { emitStateChange } from "@/services/stateEvents";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const SCHED_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const SCHED_WEEKDAY_INITS = ["S", "M", "T", "W", "T", "F", "S"];

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  // Modal State
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [activeSegment, setActiveSegment] = useState<"task" | "habit">("task");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("default");
  const [selectedPriority, setSelectedPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedQuickAddDate, setSelectedQuickAddDate] = useState<string>(getDateKey());
  const [selectedQuickAddTime, setSelectedQuickAddTime] = useState<string | null>(null);
  const [enableReminder, setEnableReminder] = useState<boolean>(false);
  const [showCustomTimePicker, setShowCustomTimePicker] = useState<boolean>(false);
  const [workspacePickerVisible, setWorkspacePickerVisible] = useState<boolean>(false);
  const [priorityPickerVisible, setPriorityPickerVisible] = useState<boolean>(false);
  const [tagsPickerVisible, setTagsPickerVisible] = useState<boolean>(false);
  const [showSchedulerModal, setShowSchedulerModal] = useState<boolean>(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedRepeat, setSelectedRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [searchWorkspaceQuery, setSearchWorkspaceQuery] = useState("");
  const [searchTagsQuery, setSearchTagsQuery] = useState("");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
  const [schedulerMonth, setSchedulerMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const quickAddSheetRef = useRef<BottomSheetModal>(null);
  
  const openQuickAdd = () => {
    setQuickAddVisible(true);
    loadFolders();
    quickAddSheetRef.current?.present();
  };

  const closeQuickAdd = () => {
    quickAddSheetRef.current?.dismiss();
  };

  const schedulerCells = useMemo(() => {
    const cells = [];
    const daysInMonth = new Date(schedulerMonth.year, schedulerMonth.month + 1, 0).getDate();
    const startOffset = new Date(schedulerMonth.year, schedulerMonth.month, 1).getDay();

    for (let i = 0; i < startOffset; i++) {
      cells.push({ type: "empty", key: `empty-${i}` });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${schedulerMonth.year}-${String(schedulerMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        type: "day",
        dateString: dateKey,
        dayNum: d,
        key: `day-${d}`,
      });
    }
    return cells;
  }, [schedulerMonth]);

  const handleSchedulerPrevMonth = () => {
    setSchedulerMonth((prev) => {
      let nextMonth = prev.month - 1;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const handleSchedulerNextMonth = () => {
    setSchedulerMonth((prev) => {
      let nextMonth = prev.month + 1;
      let nextYear = prev.year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const loadFolders = async () => {
    try {
      const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lists && parsed.lists.length > 0) {
          setFolders(parsed.lists);
          setSelectedFolderId(parsed.selectedList || parsed.lists[0].id);
          return;
        }
      }
      
      const defaultFolders = [
        { id: "default", name: "My Pebbles", emoji: "📋", color: "#6366F1" },
      ];
      setFolders(defaultFolders);
      setSelectedFolderId("default");
    } catch (e) {
      console.warn("Failed to load folders for Quick Add", e);
    }
  };

  const handleSheetChange = (index: number) => {
    if (index === -1) {
      setQuickAddVisible(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskTags([]);
      setSelectedPriority("medium");
      setSelectedQuickAddDate(getDateKey());
      setSelectedQuickAddTime(null);
      setEnableReminder(false);
      setShowCustomTimePicker(false);
      setWorkspacePickerVisible(false);
      setPriorityPickerVisible(false);
      setTagsPickerVisible(false);
      setShowSchedulerModal(false);
      setSelectedDuration(null);
      setSelectedRepeat("none");
      setSearchWorkspaceQuery("");
      setSearchTagsQuery("");
      setShowAdvancedOptions(false);
    }
  };

  const handleCreateTask = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
      const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let lists = folders;
      let selectedList = selectedFolderId;
      let todos: Record<string, any[]> = { [selectedFolderId]: [] };

      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lists && parsed.lists.length > 0) lists = parsed.lists;
        if (parsed.todos) todos = parsed.todos;
      }

      if (!todos[selectedFolderId]) {
        todos[selectedFolderId] = [];
      }

      let alarmTime: number | undefined;
      let notificationIds: string[] = [];
      let alarmId: string | undefined;

      if (selectedQuickAddTime && enableReminder && selectedQuickAddDate !== "inbox") {
        const [hours, minutes] = selectedQuickAddTime.split(":").map(Number);
        const [year, monthVal, dayVal] = selectedQuickAddDate.split("-").map(Number);
        const alarmDate = new Date(year, monthVal - 1, dayVal, hours, minutes, 0, 0);

        if (alarmDate.getTime() > Date.now()) {
          const batch = await scheduleReminderBatch({
            kind: "todo",
            itemId: String(Date.now()),
            title: trimmed,
            oneTimeAt: alarmDate,
            category: "work",
            channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
          });
          alarmTime = batch.alarmTime;
          notificationIds = batch.ids;
          alarmId = batch.primaryId;
        }
      }

      const newTask = {
        id: String(Date.now()),
        title: trimmed,
        description: taskDescription.trim() || undefined,
        tags: taskTags.length > 0 ? taskTags : undefined,
        completed: false,
        folderId: selectedFolderId,
        category: "work",
        priority: selectedPriority,
        scheduledDate: selectedQuickAddDate,
        alarmTime,
        notificationIds,
        alarmId,
        reminderHour: selectedQuickAddTime ? Number(selectedQuickAddTime.split(":")[0]) : undefined,
        reminderMinute: selectedQuickAddTime ? Number(selectedQuickAddTime.split(":")[1]) : undefined,
        durationMinutes: selectedDuration || undefined,
        repeatType: selectedRepeat !== "none" ? selectedRepeat : undefined,
      };

      todos[selectedFolderId] = [newTask, ...todos[selectedFolderId]];

      await AsyncStorage.setItem(
        TODOS_STORAGE_KEY,
        JSON.stringify({ lists, selectedList: selectedFolderId, todos })
      );

      // Standard rewards & haptics
      await addXp(10).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void recordDailyHistorySnapshot();
      emitStateChange("tasks_changed");

      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add task", e);
    }
  };

  const handleCreateHabit = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
      const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      let dailyHabits: any[] = [];

      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.dailyHabits) dailyHabits = parsed.dailyHabits;
      }

      const newHabit = {
        id: `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: trimmed,
        streak: 0,
        bestStreak: 0,
        completedToday: false,
        priority: selectedPriority,
      };

      dailyHabits = [...dailyHabits, newHabit];

      await AsyncStorage.setItem(
        DAILY_STORAGE_KEY,
        JSON.stringify({ dailyHabits })
      );

      // Standard rewards & haptics
      await addXp(5).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void recordDailyHistorySnapshot();

      closeQuickAdd();
    } catch (e) {
      console.warn("Failed to quick add habit", e);
    }
  };

  // High-fidelity bottom sheet swipe-down gesture using Reanimated & Gesture Handler
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (quickAddVisible) {
      translateY.value = 0;
    }
  }, [quickAddVisible]);

  const gesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .onUpdate((event) => {
      // Allow drag down
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      } else {
        // slight upward resistance
        translateY.value = event.translationY * 0.15;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 550) {
        // Dismiss smoothly down
        translateY.value = withTiming(600, { duration: 200 }, () => {
          runOnJS(setQuickAddVisible)(false);
        });
      } else {
        // Bounce back up to normal
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const isLight = colorScheme === "light";
  const cardBg = isLight ? "#FFFFFF" : "#18181B";
  const borderColor = isLight ? theme.border : "rgba(255,255,255,0.08)";
  const inputBg = isLight ? "#F1F5F9" : "#09090B";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textMuted,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            bottom: Platform.OS === "ios" ? 28 : 20,
            left: 16,
            right: 16,
            backgroundColor: isLight ? "rgba(255, 255, 255, 0.92)" : "rgba(24, 24, 27, 0.82)",
            borderRadius: 28,
            height: 68,
            borderWidth: 1,
            borderColor: borderColor,
            borderTopWidth: 1,
            paddingTop: Platform.OS === "ios" ? 4 : 8,
            paddingBottom: Platform.OS === "ios" ? 18 : 8,
            elevation: 12,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.45,
            shadowRadius: 18,
            ...Platform.select({
              web: {
                boxShadow:
                  "0px 10px 30px rgba(0,0,0,0.55), inset 0px 1px 0px rgba(255,255,255,0.08)",
                backdropFilter: "blur(20px)",
              },
            }),
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "600",
            marginTop: -2,
          },
          tabBarItemStyle: {
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Today",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather name="home" size={focused ? 22 : 20} color={color} />
                {focused && (
                  <View
                    style={[
                      navStyles.activeDot,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: "Workspaces",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather name="folder" size={focused ? 22 : 20} color={color} />
                {focused && (
                  <View
                    style={[
                      navStyles.activeDot,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="daily"
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              openQuickAdd();
            },
          }}
          options={{
            title: "",
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: (props) => {
              const { ref, ...rest } = props as any;
              return (
                <Pressable
                  {...rest}
                  accessibilityRole="button"
                  accessibilityLabel="Add task"
                  onPress={openQuickAdd}
                  style={({ pressed }) => [
                    props.style,
                    navStyles.centerTabButton,
                    {
                      opacity: pressed ? 0.9 : 1,
                      backgroundColor: theme.primary,
                      shadowColor: theme.primary,
                      borderColor: isLight ? "rgba(255, 255, 255, 0.92)" : "rgba(24, 24, 27, 0.82)",
                    },
                  ]}
                >
                  <Feather name="plus" size={26} color="#ffffff" />
                </Pressable>
              );
            },
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather
                  name="calendar"
                  size={focused ? 22 : 20}
                  color={color}
                />
                {focused && (
                  <View
                    style={[
                      navStyles.activeDot,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: "Focus",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather name="target" size={focused ? 22 : 20} color={color} />
                {focused && (
                  <View
                    style={[
                      navStyles.activeDot,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="lists"
          options={{
            title: "Lists",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather name="list" size={focused ? 22 : 20} color={color} />
                {focused && (
                  <View
                    style={[
                      navStyles.activeDot,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
          }}
        />
      </Tabs>

      {/* Global Quick Add Overlay Modal */}
      <BottomSheetModal
        ref={quickAddSheetRef}
        snapPoints={["75%", "90%"]}
        enablePanDownToClose
        onChange={handleSheetChange}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
        backgroundStyle={{ backgroundColor: cardBg }}
        handleIndicatorStyle={{ backgroundColor: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)", width: 40, height: 4 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Modal Title Banner */}
          <View style={[modalStyles.headerRow, { marginTop: 12, marginBottom: 20 }]}>
            <View>
                    <Text style={[modalStyles.sheetTitle, { color: theme.text }]}>
                      Quick Add {activeSegment === "task" ? "Task" : "Habit"}
                    </Text>
                    <Text style={[modalStyles.sheetSubtitle, { color: theme.textMuted }]}>
                      Swipe down on handle to close
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <TouchableOpacity
                      onPress={() => {
                        closeQuickAdd();
                        // Route pointing directly to selected segment on full page
                        router.push({
                          pathname: "/tasks",
                          params: { segment: activeSegment === "task" ? "tasks" : "habits" },
                        } as any);
                      }}
                      style={[
                        modalStyles.headerActionBtn,
                        { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Feather name="external-link" size={12} color={theme.primary} style={{ marginRight: 4 }} />
                      <Text style={[modalStyles.headerActionText, { color: theme.text, fontSize: 12, fontWeight: "700" }]}>
                        Full List
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={closeQuickAdd}
                      style={[
                        modalStyles.closeIconBtn,
                        { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                      ]}
                    >
                      <Feather name="x" size={16} color={theme.text} />
                    </TouchableOpacity>
            </View>
          </View>

          {/* Segment Toggle Selector */}
          <View style={[modalStyles.segmentContainer, { backgroundColor: isLight ? "#F1F5F9" : "#27272A", marginBottom: 16 }]}>
              <TouchableOpacity
                style={[
                  modalStyles.segmentButton,
                  activeSegment === "task" && [
                    modalStyles.segmentActive,
                    { backgroundColor: theme.primary },
                  ],
                ]}
                activeOpacity={0.9}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setActiveSegment("task");
                }}
              >
                <Feather name="edit-3" size={13} color={activeSegment === "task" ? "#FFFFFF" : theme.textMuted} style={{ marginRight: 6 }} />
                <Text style={[modalStyles.segmentText, { color: activeSegment === "task" ? "#FFFFFF" : theme.textMuted, fontWeight: activeSegment === "task" ? "700" : "600" }]}>
                  Task
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  modalStyles.segmentButton,
                  activeSegment === "habit" && [
                    modalStyles.segmentActive,
                    { backgroundColor: theme.primary },
                  ],
                ]}
                activeOpacity={0.9}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setActiveSegment("habit");
                }}
              >
                <Feather name="activity" size={13} color={activeSegment === "habit" ? "#FFFFFF" : theme.textMuted} style={{ marginRight: 6 }} />
                <Text style={[modalStyles.segmentText, { color: activeSegment === "habit" ? "#FFFFFF" : theme.textMuted, fontWeight: activeSegment === "habit" ? "700" : "600" }]}>
                  Habit
                </Text>
              </TouchableOpacity>
            </View>

          {/* Note-Like Task Inputs */}
          <View
            style={{
              backgroundColor: inputBg,
              borderColor: isLight ? theme.border : "rgba(255,255,255,0.06)",
              borderWidth: 1.5,
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 8,
              marginBottom: 16,
            }}
          >
            <BottomSheetTextInput
              style={{ color: theme.text, fontSize: 16, fontWeight: "600", padding: 0 }}
              value={taskTitle}
              onChangeText={setTaskTitle}
              placeholder={activeSegment === "task" ? "What would you like to do?" : "E.g. Drink water, Gym, Study..."}
              placeholderTextColor={theme.textMuted}
              autoCorrect={false}
              maxLength={70}
              autoFocus={true}
            />
            {activeSegment === "task" && (
              <BottomSheetTextInput
                style={{ color: theme.text, fontSize: 13, fontWeight: "400", padding: 0 }}
                value={taskDescription}
                onChangeText={setTaskDescription}
                placeholder="Description (optional)"
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={2}
                maxLength={200}
              />
            )}
          </View>

                     {/* Minimal Toolbar Row */}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12, paddingHorizontal: 4 }}>
              {/* Date Button */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowSchedulerModal(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                  gap: 6,
                }}
              >
                <Feather name="calendar" size={14} color={theme.primary} />
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                  {selectedQuickAddDate === "inbox" ? "Date" : "📅 " + (selectedQuickAddDate === getDateKey() ? "Today" : selectedQuickAddDate)}
                </Text>
              </TouchableOpacity>

              {/* Priority Button */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setPriorityPickerVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                  gap: 6,
                }}
              >
                <Feather
                  name="flag"
                  size={14}
                  color={selectedPriority === "high" ? theme.error : selectedPriority === "low" ? theme.success : theme.warning}
                />
                <Text style={{
                  color: selectedPriority === "high" ? theme.error : selectedPriority === "low" ? theme.success : theme.warning,
                  fontSize: 12, fontWeight: "600"
                }}>
                  {selectedPriority ? selectedPriority.charAt(0).toUpperCase() + selectedPriority.slice(1) : "Priority"}
                </Text>
              </TouchableOpacity>

              {/* Workspace Button */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setWorkspacePickerVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                  gap: 6,
                }}
              >
                {(() => {
                  const folder = folders.find((f) => f.id === selectedFolderId);
                  return (
                    <>
                      <Text style={{ fontSize: 14 }}>{folder?.emoji || "📁"}</Text>
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                        {folder?.name || "Workspace"}
                      </Text>
                    </>
                  );
                })()}
              </TouchableOpacity>
            </View>

            {/* Advanced Options Toggle Link */}
            {activeSegment === "task" && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowAdvancedOptions(!showAdvancedOptions);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                  alignSelf: "flex-start",
                  gap: 4,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
                  {showAdvancedOptions ? "Hide Advanced Options" : "Advanced Options"}
                </Text>
                <Feather
                  name={showAdvancedOptions ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.primary}
                />
              </TouchableOpacity>
            )}

            {/* Collapsible Advanced Options Section */}
            {showAdvancedOptions && activeSegment === "task" && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 16,
                  paddingHorizontal: 4,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
                }}
              >
                {/* Tags Button */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setTagsPickerVisible(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                    gap: 6,
                  }}
                >
                  <Feather name="tag" size={14} color={theme.primary} />
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                    {taskTags.length > 0 ? `#${taskTags.join(", ")}` : "Tags"}
                  </Text>
                </TouchableOpacity>

                {/* More Indicator if active */}
                {(selectedDuration || selectedRepeat !== "none") && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: `${theme.primary}12`,
                      borderColor: theme.primary,
                      borderWidth: 1,
                      gap: 6,
                    }}
                  >
                    <Feather name="more-horizontal" size={14} color={theme.primary} />
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                      {selectedDuration ? `${selectedDuration}m` : ""}
                      {selectedDuration && selectedRepeat !== "none" ? " · " : ""}
                      {selectedRepeat !== "none" ? selectedRepeat : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Actions Panel */}
            <View style={modalStyles.actionsContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={closeQuickAdd}
                style={[
                  modalStyles.actionButton,
                  modalStyles.cancelBtn,
                  { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                ]}
              >
                <Text style={[modalStyles.btnText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!taskTitle.trim()}
                onPress={activeSegment === "task" ? handleCreateTask : handleCreateHabit}
                style={[
                  modalStyles.actionButton,
                  {
                    backgroundColor: theme.primary,
                    opacity: taskTitle.trim() ? 1 : 0.6,
                  },
                ]}
              >
                <Text style={[modalStyles.btnText, { color: "#FFFFFF", fontWeight: "700" }]}>
                  Create {activeSegment === "task" ? "Task" : "Habit"}
                </Text>
              </TouchableOpacity>
            </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Date & Schedule Dedicated Modal */}
      <Modal
        visible={showSchedulerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSchedulerModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" }}
            onPress={() => setShowSchedulerModal(false)}
          />
          <View style={{
            backgroundColor: cardBg,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingHorizontal: 22,
            paddingTop: 16,
            paddingBottom: Platform.OS === "ios" ? 36 : 24,
            maxHeight: "85%",
            borderWidth: 1.5,
            borderColor: borderColor,
          }}>
            {/* Header: ✕ and ✓ */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setShowSchedulerModal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isLight ? "#F1F5F9" : "#27272A", alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>
                Schedule
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowSchedulerModal(false);
                }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${theme.primary}15`, alignItems: "center", justifyContent: "center" }}
              >
                <Feather name="check" size={18} color={theme.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Quick Date Shortcuts */}
              <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Quick Date
              </Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {(() => {
                  const today = new Date();
                  const tomorrow = new Date(today);
                  tomorrow.setDate(today.getDate() + 1);
                  
                  // Next Monday helper
                  const nextMonday = new Date(today);
                  nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));

                  return [
                    { label: "Today", val: getDateKey(today) },
                    { label: "Tomorrow", val: getDateKey(tomorrow) },
                    { label: "Next Monday", val: getDateKey(nextMonday) },
                    { label: "Today Morning", val: getDateKey(today), time: "09:00" },
                    { label: "No Date", val: "inbox" },
                  ].map((opt) => {
                    const isSel = selectedQuickAddDate === opt.val && (!opt.time || selectedQuickAddTime === opt.time);
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setSelectedQuickAddDate(opt.val);
                          if (opt.time) {
                            setSelectedQuickAddTime(opt.time);
                            setEnableReminder(true);
                          } else if (opt.val === "inbox") {
                            setSelectedQuickAddTime(null);
                            setEnableReminder(false);
                          }
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 12,
                          backgroundColor: isSel ? `${theme.primary}18` : (isLight ? "#F1F5F9" : "#27272A"),
                          borderColor: isSel ? theme.primary : "transparent",
                          borderWidth: 1,
                        }}
                      >
                        <Text style={{ color: isSel ? theme.text : theme.textMuted, fontSize: 11, fontWeight: "700" }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>

              {/* Month Calendar Grid */}
              {selectedQuickAddDate !== "inbox" && (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={handleSchedulerPrevMonth} hitSlop={8}>
                      <Feather name="chevron-left" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "800" }}>
                      {SCHED_MONTH_NAMES[schedulerMonth.month]} {schedulerMonth.year}
                    </Text>
                    <TouchableOpacity onPress={handleSchedulerNextMonth} hitSlop={8}>
                      <Feather name="chevron-right" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: "row", marginBottom: 4 }}>
                    {SCHED_WEEKDAY_INITS.map((init, idx) => (
                      <Text key={`wk-${idx}`} style={{ flex: 1, textAlign: "center", color: theme.textMuted, fontSize: 10, fontWeight: "800" }}>{init}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
                    {schedulerCells.map((cell) => {
                      if (cell.type === "empty") {
                        return <View key={cell.key} style={{ width: "14.28%", height: 32 }} />;
                      }
                      const dateStr = cell.dateString || "";
                      const isSel = selectedQuickAddDate === dateStr;
                      const isToday = dateStr === getDateKey();
                      return (
                        <Pressable
                          key={cell.key}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setSelectedQuickAddDate(dateStr);
                          }}
                          style={{
                            width: "14.28%",
                            height: 32,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <View style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSel ? theme.primary : "transparent",
                            borderWidth: isToday && !isSel ? 1.5 : 0,
                            borderColor: isToday && !isSel ? theme.primary : "transparent",
                          }}>
                            <Text style={{ color: isSel ? "#FFFFFF" : isToday ? theme.primary : theme.text, fontSize: 11, fontWeight: isSel || isToday ? "800" : "500" }}>
                              {cell.dayNum}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Time Slots */}
                  <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>
                    Time
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {[
                      { label: "08:00", val: "08:00" },
                      { label: "13:00", val: "13:00" },
                      { label: "18:00", val: "18:00" },
                      { label: "20:00", val: "20:00" },
                    ].map((slot) => {
                      const isSel = selectedQuickAddTime === slot.val && !showCustomTimePicker;
                      return (
                        <TouchableOpacity
                          key={slot.val}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            if (isSel) {
                              setSelectedQuickAddTime(null);
                              setEnableReminder(false);
                            } else {
                              setSelectedQuickAddTime(slot.val);
                              setEnableReminder(true);
                              setShowCustomTimePicker(false);
                            }
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 12,
                            backgroundColor: isSel ? `${theme.primary}18` : (isLight ? "#F1F5F9" : "#27272A"),
                            borderColor: isSel ? theme.primary : "transparent",
                            borderWidth: 1,
                          }}
                        >
                          <Text style={{ color: isSel ? theme.text : theme.textMuted, fontSize: 11, fontWeight: "700" }}>{slot.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setShowCustomTimePicker(!showCustomTimePicker);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 12,
                        backgroundColor: showCustomTimePicker ? `${theme.primary}18` : (isLight ? "#F1F5F9" : "#27272A"),
                        borderColor: showCustomTimePicker ? theme.primary : "transparent",
                        borderWidth: 1,
                      }}
                    >
                      <Text style={{ color: showCustomTimePicker ? theme.text : theme.textMuted, fontSize: 11, fontWeight: "700" }}>Custom</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Custom Time Selector Dial */}
                  {showCustomTimePicker && (
                    <View style={{ marginBottom: 12 }}>
                      <TimeSelectorDial
                        initialHour={selectedQuickAddTime ? Number(selectedQuickAddTime.split(":")[0]) : 8}
                        initialMinute={selectedQuickAddTime ? Number(selectedQuickAddTime.split(":")[1]) : 0}
                        colors={theme}
                        saveLabel="Confirm Custom Time"
                        onSave={(hour, minute) => {
                          const formattedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                          setSelectedQuickAddTime(formattedTime);
                          setEnableReminder(true);
                          setShowCustomTimePicker(false);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        }}
                      />
                    </View>
                  )}

                  {/* Reminder Switch */}
                  {selectedQuickAddTime && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="bell" size={15} color={enableReminder ? theme.primary : theme.textMuted} />
                        <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Push Alarm</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setEnableReminder(!enableReminder);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        }}
                        style={{
                          width: 38,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: enableReminder ? theme.primary : (isLight ? "#CBD5E1" : "#3F3F46"),
                          justifyContent: "center",
                          paddingHorizontal: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            backgroundColor: "#FFFFFF",
                            alignSelf: enableReminder ? "flex-end" : "flex-start",
                          }}
                        />
                      </Pressable>
                    </View>
                  )}

                  {/* Repeat Section */}
                  <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>
                    Repeat
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {[
                      { label: "None", val: "none" as const },
                      { label: "Daily", val: "daily" as const },
                      { label: "Weekly", val: "weekly" as const },
                      { label: "Monthly", val: "monthly" as const },
                    ].map((opt) => {
                      const isSel = selectedRepeat === opt.val;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setSelectedRepeat(opt.val);
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 12,
                            backgroundColor: isSel ? `${theme.primary}18` : (isLight ? "#F1F5F9" : "#27272A"),
                            borderColor: isSel ? theme.primary : "transparent",
                            borderWidth: 1,
                          }}
                        >
                          <Text style={{ color: isSel ? theme.text : theme.textMuted, fontSize: 11, fontWeight: "700" }}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Duration Picker */}
                  <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>
                    Duration
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {[
                      { label: "None", val: null },
                      { label: "15m", val: 15 },
                      { label: "30m", val: 30 },
                      { label: "45m", val: 45 },
                      { label: "1h", val: 60 },
                      { label: "1.5h", val: 90 },
                      { label: "2h", val: 120 },
                    ].map((opt) => {
                      const isSel = selectedDuration === opt.val;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setSelectedDuration(opt.val);
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 12,
                            backgroundColor: isSel ? `${theme.primary}18` : (isLight ? "#F1F5F9" : "#27272A"),
                            borderColor: isSel ? theme.primary : "transparent",
                            borderWidth: 1,
                          }}
                        >
                          <Text style={{ color: isSel ? theme.text : theme.textMuted, fontSize: 11, fontWeight: "700" }}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowSchedulerModal(false);
              }}
              style={{
                backgroundColor: theme.primary,
                height: 48,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 16,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Priority Picker Overlay Modal */}
      <Modal
        visible={priorityPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPriorityPickerVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.4)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setPriorityPickerVisible(false)}
        >
          <View style={{
            width: 250,
            backgroundColor: cardBg,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1.5,
            borderColor: borderColor,
            gap: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 10,
          }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700", marginBottom: 4, textAlign: "center" }}>
              Select Priority
            </Text>
            {[
              { level: "high" as const, label: "High Priority", color: theme.error },
              { level: "medium" as const, label: "Medium Priority", color: theme.warning },
              { level: "low" as const, label: "Low Priority", color: theme.success },
              { level: "none" as const, label: "No Priority", color: theme.textMuted },
            ].map((opt) => {
              const isSel = selectedPriority === opt.level || (opt.level === "none" && !selectedPriority);
              return (
                <TouchableOpacity
                  key={opt.level}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedPriority(opt.level === "none" ? "medium" : opt.level);
                    setPriorityPickerVisible(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    height: 44,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: isSel ? `${opt.color}15` : "transparent",
                    gap: 10,
                  }}
                >
                  <Feather name="flag" size={16} color={opt.color} />
                  <Text style={{ color: isSel ? opt.color : theme.text, fontSize: 13, fontWeight: "600" }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Workspace Picker Modal */}
      <Modal
        visible={workspacePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWorkspacePickerVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.4)" }}
            onPress={() => setWorkspacePickerVisible(false)}
          />
          <View style={{
            backgroundColor: cardBg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "ios" ? 36 : 24,
            maxHeight: "75%",
            borderWidth: 1.5,
            borderColor: borderColor,
          }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>
                Select Workspace
              </Text>
              <TouchableOpacity onPress={() => setWorkspacePickerVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isLight ? "#F1F5F9" : "#27272A", alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              height: 42,
              borderRadius: 10,
              backgroundColor: isLight ? "#F1F5F9" : "#09090B",
              borderWidth: 1.5,
              borderColor: borderColor,
              paddingHorizontal: 12,
              marginBottom: 16,
            }}>
              <Feather name="search" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, color: theme.text, fontSize: 13, padding: 0 }}
                value={searchWorkspaceQuery}
                onChangeText={setSearchWorkspaceQuery}
                placeholder="Search workspaces..."
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
              />
              {searchWorkspaceQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchWorkspaceQuery("")}>
                  <Feather name="x-circle" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Workspace List */}
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ minHeight: 200 }}>
              {folders
                .filter((f) => f.name.toLowerCase().includes(searchWorkspaceQuery.toLowerCase()))
                .map((folder) => {
                  const isSelected = selectedFolderId === folder.id;
                  const fColor = folder.color || theme.primary;
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedFolderId(folder.id);
                        setWorkspacePickerVisible(false);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        backgroundColor: isSelected ? `${fColor}12` : "transparent",
                        marginBottom: 6,
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: `${fColor}15`, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 16 }}>{folder.emoji || "📁"}</Text>
                      </View>
                      <Text style={{ color: isSelected ? theme.text : theme.textMuted, fontSize: 13, fontWeight: "600", flex: 1 }}>
                        {folder.name}
                      </Text>
                      {isSelected && <Feather name="check" size={16} color={fColor} />}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Tags Picker Modal */}
      <Modal
        visible={tagsPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTagsPickerVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.4)" }}
            onPress={() => setTagsPickerVisible(false)}
          />
          <View style={{
            backgroundColor: cardBg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "ios" ? 36 : 24,
            maxHeight: "75%",
            borderWidth: 1.5,
            borderColor: borderColor,
          }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>
                Add Tags
              </Text>
              <TouchableOpacity onPress={() => setTagsPickerVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isLight ? "#F1F5F9" : "#27272A", alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search / Add Tag Input */}
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              height: 42,
              borderRadius: 10,
              backgroundColor: isLight ? "#F1F5F9" : "#09090B",
              borderWidth: 1.5,
              borderColor: borderColor,
              paddingHorizontal: 12,
              marginBottom: 16,
            }}>
              <Feather name="tag" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, color: theme.text, fontSize: 13, padding: 0 }}
                value={searchTagsQuery}
                onChangeText={setSearchTagsQuery}
                placeholder="Search or add custom tag..."
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
              />
              {searchTagsQuery.trim().length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    const tagToAdd = searchTagsQuery.trim();
                    if (!taskTags.includes(tagToAdd)) {
                      setTaskTags([...taskTags, tagToAdd]);
                    }
                    setSearchTagsQuery("");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }}
                  style={{
                    backgroundColor: theme.primary,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    marginRight: 4,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>Add</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Selected Tags Row */}
            {taskTags.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {taskTags.map((tag) => (
                  <View
                    key={tag}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: `${theme.primary}15`,
                      borderColor: theme.primary,
                      borderWidth: 1,
                      paddingLeft: 10,
                      paddingRight: 6,
                      paddingVertical: 4,
                      borderRadius: 10,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>#{tag}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setTaskTags(taskTags.filter((t) => t !== tag));
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      }}
                    >
                      <Feather name="x" size={12} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Predefined Tags Grid */}
            <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Suggested Tags
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ minHeight: 120 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Urgent", "Work", "Personal", "Study", "Coding", "Fitness", "Shopping", "Finance", "Quick"]
                  .filter((t) => t.toLowerCase().includes(searchTagsQuery.toLowerCase()))
                  .map((tag) => {
                    const isSelected = taskTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          if (isSelected) {
                            setTaskTags(taskTags.filter((t) => t !== tag));
                          } else {
                            setTaskTags([...taskTags, tag]);
                          }
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 12,
                          backgroundColor: isSelected ? `${theme.primary}18` : (isLight ? "#F1F5F9" : "#27272A"),
                          borderColor: isSelected ? theme.primary : "transparent",
                          borderWidth: 1,
                        }}
                      >
                        <Text style={{ color: isSelected ? theme.text : theme.textMuted, fontSize: 12, fontWeight: "600" }}>
                          #{tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const navStyles = StyleSheet.create({
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  centerTabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(24, 24, 27, 0.82)",
    marginTop: 0,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
});

const modalStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheetContent: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    elevation: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  gestureZone: {
    width: "100%",
    paddingBottom: 8,
  },
  dragLine: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  headerActionText: {
    fontSize: 11,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    borderRadius: 9,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  titleInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 0,
  },
  categoryWrapper: {
    height: 48,
    marginBottom: 20,
  },
  categoryScroll: {
    alignItems: "center",
    gap: 8,
    paddingRight: 20,
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  categoryText: {
    fontSize: 12,
  },
  habitInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  habitInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  priorityWrapper: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  priorityCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    borderRadius: 19,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  actionPill: {
    borderWidth: 1.2,
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  popupLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
