import React from "react";
import { AppText as Text, AppTextInput as TextInput } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

import { AppCard } from "@/components/AppCard";
import { HabitStreakCard } from "@/components/dashboard/HabitStreakCard";
import NLPCapture from "@/components/NLPCapture";
import { TaskEditorSheet } from "@/components/TaskEditorSheet";
import { AppHeader } from "@/components/ui/AppHeader";
import { SegmentedSwitcher } from "@/components/ui/SegmentedSwitcher";
import { styles } from "@/constants/taskStyles";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { WorkspaceModal } from "../../modules/workspaces/WorkspaceModal";
import { WorkspaceGrid } from "../../modules/workspaces/WorkspaceGrid";
import { AlarmModal } from "../../modules/reminders/AlarmModal";
import { TaskSections } from "../../modules/tasks/TaskSections";
import { HabitSection } from "../../modules/habits/HabitSection";
import { SuggestionBanner } from "../../modules/suggestions/SuggestionBanner";
import { ProgressSection } from "../../modules/stats/ProgressSection";

import { useTasksState, getDateKey } from "../../modules/tasks/useTasksState";
import { DEFAULT_TASK_CATEGORY, TASK_CATEGORY_META } from "@/services/taskCategories";

export default function TasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  const state = useTasksState();

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Animated.View entering={FadeInDown.duration(450).springify()} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.container}>
            {/* Header */}
            {state.openedFolderId ? (
              <View style={{ marginBottom: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      state.setOpenedFolderId(null);
                      state.setSelectedList("default");
                      state.setSearchQuery("");
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.cardLight,
                    }}
                  >
                    <Feather name="arrow-left" size={18} color={colors.text} />
                  </Pressable>

                  {(() => {
                    const currentFolder = state.lists.find((l) => l.id === state.openedFolderId) as any;
                    const folderColor = currentFolder?.color || colors.primary;
                    const hasIcon = currentFolder?.iconType === "icon";
                    return (
                      <View
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          marginLeft: 12,
                        }}
                      >
                        {hasIcon ? (
                          <Feather
                            name={currentFolder?.icon || "briefcase"}
                            size={20}
                            color={folderColor}
                            style={{ marginRight: 8 }}
                          />
                        ) : (
                          <Text style={{ fontSize: 20, marginRight: 6 }}>{currentFolder?.emoji || "📁"}</Text>
                        )}
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "800",
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {currentFolder?.name}
                        </Text>
                      </View>
                    );
                  })()}

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        state.setIsBulkSelectActive(!state.isBulkSelectActive);
                        state.setSelectedItemIds(new Set());
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: state.isBulkSelectActive ? `${colors.primary}22` : colors.cardLight,
                      }}
                    >
                      <Feather
                        name={state.isBulkSelectActive ? "x" : "check-square"}
                        size={16}
                        color={state.isBulkSelectActive ? colors.primary : colors.textMuted}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const folder = state.lists.find((l) => l.id === state.openedFolderId) as any;
                        if (folder) {
                          state.setEditingFolderId(folder.id);
                          state.setFolderModalVisible(true);
                        }
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.cardLight,
                      }}
                    >
                      <Feather name="sliders" size={16} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>

                {/* Tasks Search Bar inside Workspace */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 40,
                    marginTop: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Feather name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    value={state.searchQuery}
                    onChangeText={state.setSearchQuery}
                    placeholder="Search tasks..."
                    placeholderTextColor={colors.textMuted}
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: 13,
                      height: "100%",
                      padding: 0,
                    }}
                  />
                  {state.searchQuery.length > 0 && (
                    <Pressable onPress={() => state.setSearchQuery("")} hitSlop={10}>
                      <Feather name="x" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 4 }}>
                <AppHeader
                  kicker="Planner"
                  title={state.activeSegment === "tasks" ? "Workspaces" : "Habits"}
                  subtitle={
                    state.activeSegment === "tasks"
                      ? `${state.lists.length} workspaces active`
                      : `${state.unfinishedHabitCount} habits remaining`
                  }
                  profile={state.profile}
                  hasUnreadNotifs={state.hasUnreadNotifs}
                  showProfile={false}
                  showNotifications={false}
                  showArchive={true}
                  showTrash={true}
                />

                {/* Segment Selector Row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginVertical: 4,
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <SegmentedSwitcher
                      options={[
                        { key: "tasks", label: "Workspaces" },
                        { key: "habits", label: "All Habits" },
                      ]}
                      activeKey={state.activeSegment}
                      onChange={(val) => {
                        state.setActiveSegment(val as any);
                        state.setSearchQuery("");
                      }}
                    />
                  </View>
                  {state.activeSegment === "habits" && (
                    <Pressable
                      onPress={() => {
                        state.setIsBulkSelectActive(!state.isBulkSelectActive);
                        state.setSelectedItemIds(new Set());
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: state.isBulkSelectActive ? `${colors.primary}22` : colors.cardLight,
                      }}
                    >
                      <Feather
                        name={state.isBulkSelectActive ? "x" : "check-square"}
                        size={16}
                        color={state.isBulkSelectActive ? colors.primary : colors.textMuted}
                      />
                    </Pressable>
                  )}
                </View>

                {/* Heuristic Quick NLP Capture Pill */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    state.setNlpVisible(true);
                  }}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: colors.card,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderRadius: 14,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginVertical: 4,
                  }}
                >
                  <Feather name="zap" size={14} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Pebble Capture
                  </Text>
                </TouchableOpacity>

                {/* Workspaces Search Bar */}
                {state.activeSegment === "tasks" && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 40,
                      marginVertical: 4,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      value={state.searchQuery}
                      onChangeText={state.setSearchQuery}
                      placeholder="Search workspaces..."
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 13,
                        height: "100%",
                        padding: 0,
                      }}
                    />
                    {state.searchQuery.length > 0 && (
                      <Pressable onPress={() => state.setSearchQuery("")} hitSlop={10}>
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Active Content Screens */}
            {state.activeSegment === "tasks" ? (
              state.openedFolderId === null ? (
                <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                  <SuggestionBanner
                    activeSuggestions={state.activeSuggestions}
                    loadSuggestions={state.loadSuggestions}
                    setHabits={state.setHabits}
                    persistHabits={state.persistHabits}
                    setTodos={state.setTodos}
                    persistState={state.persistState}
                    lists={state.lists}
                    selectedList={state.selectedList}
                    openedFolderId={state.openedFolderId}
                    getDateKey={getDateKey}
                  />
                  <WorkspaceGrid
                    lists={state.lists}
                    todos={state.todos}
                    searchQuery={state.searchQuery}
                    onSelectWorkspace={(id) => {
                      state.setOpenedFolderId(id);
                      state.setSelectedList(id);
                    }}
                    onEditWorkspace={(id) => {
                      state.setEditingFolderId(id);
                      state.setFolderModalVisible(true);
                    }}
                    onCreateWorkspace={() => {
                      state.setEditingFolderId(null);
                      state.setFolderModalVisible(true);
                    }}
                  />
                </ScrollView>
              ) : (
                <ScrollView
                  ref={state.scrollViewRef}
                  style={styles.flex}
                  contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Add task bar */}
                  <Pressable
                    onPress={() => {
                      state.setAddingTask({
                        id: String(Date.now()),
                        title: "",
                        completed: false,
                        category: DEFAULT_TASK_CATEGORY,
                        priority: "medium",
                        scheduledDate: getDateKey(),
                        folderId: state.openedFolderId || "default",
                        createdAt: Date.now(),
                      });
                    }}
                  >
                    <AppCard style={styles.addTaskCard}>
                      <View style={[styles.addTaskInput, { justifyContent: "center" }]}>
                        <Text style={{ color: colors.textMuted }}>
                          {`Add a task to ${state.lists.find((l) => l.id === state.openedFolderId)?.name}`}
                        </Text>
                      </View>
                      <View style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                        <Feather name="plus" size={20} color="#ffffff" />
                      </View>
                    </AppCard>
                  </Pressable>

                  {/* Tasks List */}
                  <TaskSections
                    overdueTodos={state.overdueTodos}
                    todayTodos={state.todayTodos}
                    upcomingTodos={state.upcomingTodos}
                    inboxTodos={state.inboxTodos}
                    lists={state.lists}
                    selectedList={state.selectedList}
                    selectedDate={state.selectedDate}
                    completedCount={state.completedCount}
                    onClearCompleted={state.clearCompleted}
                    onToggleTodo={state.toggleTodo}
                    onDeleteTodo={state.deleteTodo}
                    onEditTodo={(todo) => {
                      router.push(`/task-details?id=${todo.id}&type=task&date=${state.selectedDate}`);
                    }}
                    onSetAlarm={state.setAlarmMenu}
                    onTaskLayout={(todoId, y) => {
                      state.setTaskPositions((prev) => ({ ...prev, [todoId]: y }));
                    }}
                    isSelectionMode={state.isBulkSelectActive}
                    selectedItemIds={state.selectedItemIds}
                    onToggleSelectItem={(id) => {
                      state.setSelectedItemIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  />
                </ScrollView>
              )
            ) : (
              <ScrollView style={styles.flex} contentContainerStyle={{ gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                <ProgressSection
                  statsExpanded={state.statsExpanded}
                  setStatsExpanded={state.setStatsExpanded}
                  habitCompletionPct={state.habitCompletionPct}
                  unfinishedHabitCount={state.unfinishedHabitCount}
                  showCelebrate={state.showCelebrate}
                  completedHabitCount={state.completedHabitCount}
                  totalHabitsCount={state.habits.length}
                  longestStreak={state.longestStreak}
                />

                {/* Add Habit input */}
                <AppCard style={styles.addTaskCard}>
                  <TextInput
                    value={state.habitTitle}
                    onChangeText={state.setHabitTitle}
                    placeholder="Add a new habit"
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={state.addHabit}
                    onFocus={() => {
                      state.setIsAddingHabit(true);
                    }}
                    onBlur={() => {
                      if (state.habitTitle.trim() === "") state.setIsAddingHabit(false);
                    }}
                    style={[styles.addTaskInput, { color: colors.text }]}
                  />
                  <Pressable onPress={state.addHabit} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                    <Feather name="plus" size={20} color="#ffffff" />
                  </Pressable>
                </AppCard>

                {/* Habit Priority Selector */}
                {(state.isAddingHabit || state.habitTitle.trim().length > 0) && (
                  <View style={styles.categoryChoiceRow}>
                    <Text style={[styles.categoryChoiceLabel, { color: colors.textMuted }]}>Priority</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        {
                          key: "high",
                          label: "🔴 High",
                          color: colors.error,
                          softColor:
                            colorScheme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.12)",
                        },
                        {
                          key: "medium",
                          label: "🟡 Medium",
                          color: colors.warning,
                          softColor:
                            colorScheme === "light" ? "rgba(217, 119, 6, 0.08)" : "rgba(245, 158, 11, 0.12)",
                        },
                        {
                          key: "low",
                          label: "🟢 Low",
                          color: colors.success,
                          softColor:
                            colorScheme === "light" ? "rgba(5, 150, 105, 0.08)" : "rgba(16, 185, 129, 0.12)",
                        },
                      ].map((p) => {
                        const isSelected = state.selectedHabitPriority === p.key;
                        return (
                          <Pressable
                            key={p.key}
                            onPress={() => state.setSelectedHabitPriority(p.key as any)}
                            style={({ pressed }) => [
                              styles.categoryChoicePill,
                              {
                                backgroundColor: isSelected ? p.softColor : colors.cardLight,
                                borderColor: isSelected ? p.color : colors.border,
                                opacity: pressed ? 0.9 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: isSelected ? p.color : colors.text,
                                fontWeight: "700",
                                fontSize: 12,
                              }}
                            >
                              {p.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Habit Priority Filter Row */}
                <View style={[styles.categoryChoiceRow, { marginBottom: 8, marginTop: 10 }]}>
                  <Text style={[styles.categoryChoiceLabel, { color: colors.textMuted }]}>Filter Priority</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[
                      { key: "all", label: "All" },
                      { key: "high", label: "🔴 High" },
                      { key: "medium", label: "🟡 Medium" },
                      { key: "low", label: "🟢 Low" },
                    ].map((p) => {
                      const isSelected = state.selectedListHabitPriorityFilter === p.key;
                      return (
                        <Pressable
                          key={p.key}
                          onPress={() => state.setSelectedListHabitPriorityFilter(p.key as any)}
                          style={({ pressed }) => [
                            styles.categoryChoicePill,
                            {
                              backgroundColor: isSelected
                                ? colorScheme === "light"
                                  ? "#E2E8F0"
                                  : "#27272A"
                                : colors.cardLight,
                              borderColor: isSelected ? colors.primary : colors.border,
                              opacity: pressed ? 0.9 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: isSelected ? colors.text : colors.textMuted,
                              fontWeight: isSelected ? "700" : "500",
                              fontSize: 12,
                            }}
                          >
                            {p.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Habits List View */}
                <HabitSection
                  displayedHabits={state.displayedHabits}
                  habits={state.habits}
                  setHabits={state.setHabits}
                  persistHabits={state.persistHabits}
                  toggleHabit={state.toggleHabit}
                  deleteHabit={state.deleteHabit}
                  unfinishedHabitCount={state.unfinishedHabitCount}
                  isSelectionMode={state.isBulkSelectActive}
                  selectedItemIds={state.selectedItemIds}
                  onToggleSelectItem={(id) => {
                    state.setSelectedItemIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onEditHabit={(item) => state.setEditingHabit(item)}
                />
              </ScrollView>
            )}

            {/* Workspace Creator Modal */}
            <WorkspaceModal
              visible={state.folderModalVisible}
              onClose={() => state.setFolderModalVisible(false)}
              editingFolderId={state.editingFolderId}
              lists={state.lists}
              setLists={state.setLists}
              todos={state.todos}
              setTodos={state.setTodos}
              selectedList={state.selectedList}
              setSelectedList={state.setSelectedList}
              openedFolderId={state.openedFolderId}
              setOpenedFolderId={state.setOpenedFolderId}
              persistState={state.persistState}
              habits={state.habits}
              setHabits={state.setHabits}
              persistHabits={state.persistHabits}
            />

            {/* Centered Alarm Modal */}
            <AlarmModal
              visible={!!state.alarmMenu}
              todoId={state.alarmMenu}
              todos={state.todos}
              selectedList={state.selectedList}
              onClose={() => state.setAlarmMenu(null)}
              onScheduleAlarm={state.scheduleAlarm}
              onScheduleAlarmWithDays={state.scheduleAlarmWithDays}
            />
          </View>
        </KeyboardAvoidingView>

        <TaskEditorSheet
          task={state.editingTask || state.addingTask}
          lists={state.lists}
          mode={state.addingTask ? "add" : "edit"}
          onClose={() => {
            if (state.editingTask) state.setEditingTask(null);
            if (state.addingTask) state.setAddingTask(null);
          }}
          onSave={state.addingTask ? state.onSaveNewTask : state.onSaveEditedTask}
          onDelete={state.editingTask ? state.deleteTodo : undefined}
        />
        <TaskEditorSheet
          task={state.editingHabit}
          lists={state.lists}
          mode="edit"
          itemType="habit"
          onClose={() => state.setEditingHabit(null)}
          onSave={state.handleSaveEditedHabit}
          onDelete={state.handleDeleteEditedHabit}
        />
        <NLPCapture
          visible={state.nlpVisible}
          onClose={() => state.setNlpVisible(false)}
          onSave={state.handleSaveParsedItem}
          onUpdateExisting={state.handleUpdateExistingFromNLP}
          workspaces={state.lists}
          currentWorkspaceId={state.openedFolderId || "default"}
          onCreateWorkspace={state.handleCreateWorkspaceFromNLP}
          todos={state.todos}
          habits={state.habits}
        />
      </Animated.View>

      {/* Workspace Picker Modal for Move Action */}
      <Modal visible={state.isMoveModalVisible} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <AppCard
            style={{
              width: "100%",
              padding: 20,
              gap: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>Move to Workspace</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: -4 }}>
              Select target workspace for {state.selectedItemIds.size} item(s):
            </Text>
            <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 8 }}>
              {state.lists.map((ws) => (
                <TouchableOpacity
                  key={ws.id}
                  onPress={() => state.handleBulkMove(ws.id)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.cardLight,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{ws.emoji || "📁"}</Text>
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>{ws.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => state.setIsMoveModalVisible(false)}
              style={{
                alignItems: "center",
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </AppCard>
        </View>
      </Modal>

      {/* Floating Bulk Actions Bar */}
      {state.isBulkSelectActive && state.selectedItemIds.size > 0 && (
        <View
          style={[
            localStyles.bulkBar,
            {
              backgroundColor: isDark ? "rgba(28, 28, 33, 0.95)" : "rgba(255, 255, 255, 0.95)",
              borderColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={state.handleBulkComplete} style={localStyles.bulkBtn}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Complete</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={state.handleBulkArchive} style={localStyles.bulkBtn}>
            <Feather name="archive" size={18} color={colors.warning} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Archive</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => state.setIsMoveModalVisible(true)} style={localStyles.bulkBtn}>
            <Feather name="folder" size={18} color={colors.primary} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Move</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={state.handleBulkDelete} style={localStyles.bulkBtn}>
            <Feather name="trash-2" size={18} color={colors.error} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Premium Floating NLP Button */}
      {!state.isBulkSelectActive && (
        <Animated.View
          entering={FadeInDown.delay(600).duration(400)}
          style={{
            position: "absolute",
            right: 20,
            bottom: Platform.OS === "ios" ? 110 : 96,
            zIndex: 99,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              state.setNlpVisible(true);
            }}
            activeOpacity={0.85}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 8,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Feather name="zap" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  bulkBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 110 : 96,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9999,
  },
  bulkBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flex: 1,
    height: "100%",
  },
  bulkBtnText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
