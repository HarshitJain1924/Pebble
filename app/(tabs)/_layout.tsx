import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Feather } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  Modal,
  Text,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  PanResponder,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TODOS_STORAGE_KEY, DAILY_STORAGE_KEY } from "@/services/storage";
import {
  TASK_CATEGORY_META,
  DEFAULT_TASK_CATEGORY,
  type TaskCategory,
} from "@/services/taskCategories";
import { recordDailyHistorySnapshot } from "@/services/productivityHistory";
import { addXp } from "@/services/settingsService";
import * as Haptics from "expo-haptics";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  // Modal State
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [activeSegment, setActiveSegment] = useState<"task" | "habit">("task");
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory>(DEFAULT_TASK_CATEGORY);
  const [selectedPriority, setSelectedPriority] = useState<"low" | "medium" | "high">("medium");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (quickAddVisible) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setTaskTitle("");
      setSelectedCategory(DEFAULT_TASK_CATEGORY);
      setSelectedPriority("medium");
    }
  }, [quickAddVisible]);

  const handleCreateTask = async () => {
    const trimmed = taskTitle.trim();
    if (!trimmed) return;

    try {
      const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let lists = [{ id: "default", name: "My Tasks" }];
      let selectedList = "default";
      let todos: Record<string, any[]> = { default: [] };

      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lists) lists = parsed.lists;
        if (parsed.selectedList) selectedList = parsed.selectedList;
        if (parsed.todos) todos = parsed.todos;
      }

      if (!todos[selectedList]) {
        todos[selectedList] = [];
      }

      const newTask = {
        id: String(Date.now()),
        title: trimmed,
        completed: false,
        category: selectedCategory,
        priority: selectedPriority,
      };

      todos[selectedList] = [newTask, ...todos[selectedList]];

      await AsyncStorage.setItem(
        TODOS_STORAGE_KEY,
        JSON.stringify({ lists, selectedList, todos })
      );

      // Standard rewards & haptics
      await addXp(5).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void recordDailyHistorySnapshot();

      setQuickAddVisible(false);
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

      setQuickAddVisible(false);
    } catch (e) {
      console.warn("Failed to quick add habit", e);
    }
  };

  // High-fidelity gestures (vertical swipe down to dismiss, horizontal swipe left/right to toggle segments)
  const gesturePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > 25 && Math.abs(gestureState.dy) < 15;
        const isVerticalDown = gestureState.dy > 20 && Math.abs(gestureState.dx) < 15;
        return isHorizontal || isVerticalDown;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 70) {
          // Swipe down -> dismiss modal
          setQuickAddVisible(false);
        } else if (gestureState.dx > 50) {
          // Swipe Right -> Switch to Task
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setActiveSegment("task");
        } else if (gestureState.dx < -50) {
          // Swipe Left -> Switch to Habit
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setActiveSegment("habit");
        }
      },
    })
  ).current;

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
          name="tasks"
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setQuickAddVisible(true);
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
                  onPress={() => setQuickAddVisible(true)}
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
          name="daily"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Analytics",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather
                  name="bar-chart-2"
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
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: "center" }}>
                <Feather
                  name="settings"
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
      </Tabs>

      {/* Global Quick Add Overlay Modal */}
      <Modal
        visible={quickAddVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickAddVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={modalStyles.modalContainer}
        >
          {/* Backdrop Dismiss Area */}
          <Pressable
            style={modalStyles.backdrop}
            onPress={() => setQuickAddVisible(false)}
          />

          {/* Centered Modal Card Content */}
          <View style={[modalStyles.sheetContent, { backgroundColor: cardBg }]}>
            {/* Gesture Zone (Includes Drag Handle + Header Row) */}
            <View {...gesturePanResponder.panHandlers} style={modalStyles.gestureZone}>
              {/* Soft Grab Handle Indicator */}
              <View
                style={[
                  modalStyles.dragLine,
                  { backgroundColor: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)" },
                ]}
              />

              {/* Modal Title Banner */}
              <View style={modalStyles.headerRow}>
                <View>
                  <Text style={[modalStyles.sheetTitle, { color: theme.text }]}>
                    Quick Add {activeSegment === "task" ? "Task" : "Habit"}
                  </Text>
                  <Text style={[modalStyles.sheetSubtitle, { color: theme.textMuted }]}>
                    Swipe left/right to toggle, down to close
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() => {
                      setQuickAddVisible(false);
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
                    onPress={() => setQuickAddVisible(false)}
                    style={[
                      modalStyles.closeIconBtn,
                      { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                    ]}
                  >
                    <Feather name="x" size={16} color={theme.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Segment Toggle Selector */}
            <View style={[modalStyles.segmentContainer, { backgroundColor: isLight ? "#F1F5F9" : "#27272A" }]}>
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

            {/* Form Inputs Container */}
            <View
              style={[
                modalStyles.inputContainer,
                {
                  backgroundColor: inputBg,
                  borderColor: isLight ? theme.border : "rgba(255,255,255,0.06)",
                },
              ]}
            >
              <Feather
                name={activeSegment === "task" ? "check-circle" : "zap"}
                size={18}
                color={theme.textMuted}
                style={{ marginRight: 8 }}
              />
              <TextInput
                ref={inputRef}
                style={[modalStyles.titleInput, { color: theme.text }]}
                value={taskTitle}
                onChangeText={setTaskTitle}
                placeholder={activeSegment === "task" ? "What needs to be done?" : "E.g. Drink water, Gym, Study..."}
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
                onSubmitEditing={activeSegment === "task" ? handleCreateTask : handleCreateHabit}
                maxLength={70}
              />
            </View>

            {activeSegment === "task" ? (
              <>
                {/* Category Selection for Tasks */}
                <Text style={[modalStyles.label, { color: theme.textMuted }]}>
                  Task Category
                </Text>
                <View style={modalStyles.categoryWrapper}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={modalStyles.categoryScroll}
                  >
                    {TASK_CATEGORY_META.map((cat) => {
                      const isSelected = selectedCategory === cat.key;
                      return (
                        <TouchableOpacity
                          key={cat.key}
                          activeOpacity={0.85}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setSelectedCategory(cat.key);
                          }}
                          style={[
                            modalStyles.categoryCard,
                            {
                              backgroundColor: isSelected ? cat.softTint : isLight ? "#F1F5F9" : "#27272A",
                              borderColor: isSelected ? cat.tint : "transparent",
                              borderWidth: 1.5,
                            },
                          ]}
                        >
                          <View style={[modalStyles.indicatorDot, { backgroundColor: cat.tint }]} />
                          <Text
                            style={[
                              modalStyles.categoryText,
                              {
                                color: isSelected ? theme.text : theme.textMuted,
                                fontWeight: isSelected ? "700" : "600",
                              },
                            ]}
                          >
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </>
            ) : (
              <>
                {/* Descriptive Tip Box for Habits */}
                <View style={[modalStyles.habitInfoBox, { backgroundColor: isLight ? "rgba(245, 158, 11, 0.05)" : "rgba(245, 158, 11, 0.08)" }]}>
                  <Feather name="info" size={14} color="#F59E0B" style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={[modalStyles.habitInfoText, { color: isLight ? "#78350F" : "#FBBF24" }]}>
                    Habits repeat daily. Check them off on your main dashboard to build powerful streaks and earn bonus experience points!
                  </Text>
                </View>
              </>
            )}

            {/* Priority Selector */}
            <Text style={[modalStyles.label, { color: theme.textMuted }]}>
              Priority Level
            </Text>
            <View style={modalStyles.priorityWrapper}>
              {[
                { key: "high", label: "High", color: theme.error, softColor: colorScheme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.12)" },
                { key: "medium", label: "Medium", color: theme.warning, softColor: colorScheme === "light" ? "rgba(217, 119, 6, 0.08)" : "rgba(245, 158, 11, 0.12)" },
                { key: "low", label: "Low", color: theme.success, softColor: colorScheme === "light" ? "rgba(5, 150, 105, 0.08)" : "rgba(16, 185, 129, 0.12)" },
              ].map((p) => {
                const isSelected = selectedPriority === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedPriority(p.key as any);
                    }}
                    style={[
                      modalStyles.priorityCard,
                      {
                        backgroundColor: isSelected ? p.softColor : isLight ? "#F1F5F9" : "#27272A",
                        borderColor: isSelected ? p.color : "transparent",
                        borderWidth: 1.5,
                      },
                    ]}
                  >
                    <View style={[modalStyles.indicatorDot, { backgroundColor: p.color }]} />
                    <Text
                      style={{
                        color: isSelected ? theme.text : theme.textMuted,
                        fontWeight: isSelected ? "700" : "600",
                        fontSize: 12,
                      }}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions Panel */}
            <View style={modalStyles.actionsContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setQuickAddVisible(false)}
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
          </View>
        </KeyboardAvoidingView>
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
});
