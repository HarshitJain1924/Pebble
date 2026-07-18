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
import { TaskEditorSheet } from "@/components/TaskEditorSheet";
import { AppHeader } from "@/components/ui/AppHeader";
import { SegmentedSwitcher } from "@/components/ui/SegmentedSwitcher";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { styles } from "@/constants/taskStyles";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import PressableScale from "@/components/ui/PressableScale";

import { WorkspaceModal } from "../../modules/workspaces/WorkspaceModal";
import { WorkspaceGrid } from "../../modules/workspaces/WorkspaceGrid";
import { AlarmModal } from "../../modules/reminders/AlarmModal";
import { AnimatedOverlay } from "@/components/ui/AnimatedOverlay";
import { emitStateChange } from "@/services/stateEvents";
import { TaskSections } from "../../modules/tasks/TaskSections";
import { HabitSection } from "../../modules/habits/HabitSection";
import { SuggestionBanner } from "../../modules/suggestions/SuggestionBanner";
import { ProgressSection } from "../../modules/stats/ProgressSection";
import { VaultSection } from "../../modules/vault/VaultSection";
import { ChecklistSection } from "../../modules/checklists/ChecklistSection";

import { useTasksState, getDateKey } from "../../modules/tasks/useTasksState";
import { DEFAULT_TASK_CATEGORY, TASK_CATEGORY_META } from "@/services/taskCategories";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";

export default function TasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";
  const isLight = colorScheme === "light";

  const state = useTasksState();

  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");
  const [newChecklistItems, setNewChecklistItems] = React.useState("");
  const [isAddingChecklist, setIsAddingChecklist] = React.useState(false);
  const [editingChecklistId, setEditingChecklistId] = React.useState<string | null>(null);
  const [expandedChecklistIds, setExpandedChecklistIds] = React.useState<Record<string, boolean>>({});
  const [isSearchActive, setIsSearchActive] = React.useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = React.useState(false);
  const [inboxProtectionVisible, setInboxProtectionVisible] = React.useState(false);
  const [inlineTodoTitle, setInlineTodoTitle] = React.useState("");

  const folderHabits = React.useMemo(() => {
    const raw = state.habits.filter((h) => !h.archived && (h.folderId || "default") === state.openedFolderId);
    if (state.searchQuery.trim() === "") return raw;
    return raw.filter((h) => {
      const matchesTitle = h.title.toLowerCase().includes(state.searchQuery.toLowerCase());
      const matchesDesc = h.description?.toLowerCase().includes(state.searchQuery.toLowerCase()) || false;
      const matchesCategory = h.category?.toLowerCase().includes(state.searchQuery.toLowerCase()) || false;
      return matchesTitle || matchesDesc || matchesCategory;
    });
  }, [state.habits, state.openedFolderId, state.searchQuery]);

  const allResources = React.useMemo(() => {
    const list = state.collections[state.openedFolderId || "default"] || [];
    const items: any[] = [];
    list.forEach((coll) => {
      if (coll.items) {
        coll.items.forEach((item) => {
          items.push({ ...item, collectionId: coll.id });
        });
      }
    });
    return items;
  }, [state.collections, state.openedFolderId]);

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
                    marginBottom: 4,
                    paddingHorizontal: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        state.setOpenedFolderId(null);
                        state.setSelectedList("default");
                        state.setSearchQuery("");
                        setIsSearchActive(false);
                      }}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 4,
                      }}
                    >
                      <Feather name="arrow-left" size={20} color={colors.text} />
                    </TouchableOpacity>

                    {(() => {
                      const currentFolder = state.lists.find((l) => l.id === state.openedFolderId) as any;
                      const hasIcon = currentFolder?.iconType === "icon";
                      const folderColor = currentFolder?.color || colors.primary;
                      return (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                          {hasIcon ? (
                            <Feather
                              name={currentFolder?.icon || "briefcase"}
                              size={18}
                              color={folderColor}
                            />
                          ) : (
                            <Text style={{ fontSize: 18 }}>{currentFolder?.emoji || "📁"}</Text>
                          )}
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: "700",
                              color: colors.text,
                            }}
                            numberOfLines={1}
                          >
                            {currentFolder?.name}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setIsSearchActive(!isSearchActive);
                        if (isSearchActive) {
                          state.setSearchQuery("");
                        }
                      }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="search" size={18} color={isSearchActive ? colors.primary : colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setWorkspaceMenuVisible(true);
                      }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="more-horizontal" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Subtitle */}
                {(() => {
                  const folderTodos = state.todos[state.openedFolderId || "default"] || [];
                  const totalTasks = folderTodos.filter(t => !t.archived && !t.completed).length;
                  const dueToday = folderTodos.filter(t => {
                    if (t.archived || t.completed) return false;
                    const today = getDateKey();
                    const isOverdue = t.scheduledDate && t.scheduledDate < today && t.scheduledDate !== "inbox";
                    const isToday = t.scheduledDate === today;
                    return isOverdue || isToday;
                  }).length;

                  let subtitle = "";
                  if (state.folderSegment === "tasks") {
                    subtitle = `${totalTasks} tasks • ${dueToday} due today`;
                  } else if (state.folderSegment === "habits") {
                    const todayKey = getDateKey();
                    const dayOfWeek = new Date().getDay();
                    const activeHabits = state.habits.filter(h => !h.archived && (h.folderId || "default") === state.openedFolderId);
                    const dueTodayCount = activeHabits.filter(h => {
                      if (h.recurrence) {
                        return isRecurringOccurrenceForDate(h, todayKey);
                      }
                      return (
                        !h.reminderDays ||
                        h.reminderDays.length === 0 ||
                        h.reminderDays.includes(dayOfWeek)
                      );
                    }).length;
                    subtitle = `${activeHabits.length} active habits • ${dueTodayCount} due today`;
                  } else if (state.folderSegment === "checklists") {
                    const folderChecklists = (state.checklists[state.openedFolderId || "default"] || []).filter(c => !c.archived);
                    const completed = folderChecklists.filter(c => c.items.length > 0 && c.items.every(i => i.completed)).length;
                    subtitle = `${folderChecklists.length} checklists • ${completed} completed`;
                  } else {
                    subtitle = `${allResources.length} resources`;
                  }

                  return (
                    <Text style={{ fontSize: 11, color: colors.textMuted, paddingHorizontal: 6, marginBottom: 8 }}>
                      {subtitle}
                    </Text>
                  );
                })()}

                {/* Progressive Search Disclosure Input */}
                {isSearchActive && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 38,
                      marginTop: 4,
                      borderWidth: 1,
                      borderColor: colors.border,
                      marginHorizontal: 4,
                    }}
                  >
                    <Feather name="search" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
                    <TextInput
                      value={state.searchQuery}
                      onChangeText={state.setSearchQuery}
                      placeholder="Search..."
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 13,
                        height: "100%",
                        padding: 0,
                      }}
                      autoFocus
                    />
                    {state.searchQuery.length > 0 && (
                      <Pressable onPress={() => state.setSearchQuery("")} hitSlop={10}>
                        <Feather name="x" size={14} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ marginBottom: 4 }}>
                <AppHeader
                  kicker="Planner"
                  title="Workspaces"
                  subtitle={`${state.lists.length} workspaces active`}
                  profile={state.profile}
                  hasUnreadNotifs={state.hasUnreadNotifs}
                  showProfile={false}
                  showNotifications={false}
                  showArchive={true}
                  showTrash={true}
                />

                {/* Workspaces Search Bar & Filters Row */}
                <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 6, gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#F1F5F9",
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      height: 44,
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
                        fontSize: 14,
                        fontWeight: "500",
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
              </View>
            )}

            {/* Active Content Screens */}
            {state.openedFolderId === null ? (
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
                  habits={state.habits}
                  collections={state.collections}
                  checklists={state.checklists}
                  searchQuery={state.searchQuery}
                  onSelectWorkspace={(id) => {
                    state.setOpenedFolderId(id);
                    state.setSelectedList(id);
                  }}
                  onEditWorkspace={(id) => {
                    if (id === "unassigned") {
                      setInboxProtectionVisible(true);
                      return;
                    }
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
                contentContainerStyle={{ gap: 20, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Tasks Section */}
                {state.folderSegment === "tasks" && (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, paddingHorizontal: 4 }}>
                      Tasks
                    </Text>
                    
                    {/* Add task inline */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        paddingVertical: 8,
                        paddingHorizontal: 6,
                        marginHorizontal: 4,
                        marginVertical: 4,
                      }}
                    >
                      <TextInput
                        value={inlineTodoTitle}
                        onChangeText={setInlineTodoTitle}
                        placeholder="Add a task..."
                        placeholderTextColor={colors.textMuted}
                        onSubmitEditing={() => {
                          if (inlineTodoTitle.trim()) {
                            const newTodo = {
                              id: String(Date.now()),
                              title: inlineTodoTitle.trim(),
                              completed: false,
                              category: DEFAULT_TASK_CATEGORY,
                              priority: "medium" as const,
                              scheduledDate: getDateKey(),
                              folderId: state.openedFolderId || "default",
                              createdAt: Date.now(),
                            };
                            state.onSaveNewTask(newTodo);
                            setInlineTodoTitle("");
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                          }
                        }}
                        style={{
                          flex: 1,
                          color: colors.text,
                          fontSize: 14,
                          padding: 0,
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          if (inlineTodoTitle.trim()) {
                            const newTodo = {
                              id: String(Date.now()),
                              title: inlineTodoTitle.trim(),
                              completed: false,
                              category: DEFAULT_TASK_CATEGORY,
                              priority: "medium" as const,
                              scheduledDate: getDateKey(),
                              folderId: state.openedFolderId || "default",
                              createdAt: Date.now(),
                            };
                            state.onSaveNewTask(newTodo);
                            setInlineTodoTitle("");
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                          }
                        }}
                        style={{ padding: 4 }}
                      >
                        <Feather name="plus" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    </View>

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
                      allResources={allResources}
                      onToggleLinkResource={state.toggleLinkResource}
                      onToggleSelectItem={(id) => {
                        state.setSelectedItemIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                    />
                  </View>
                )}

                {/* Habits Section */}
                {state.folderSegment === "habits" && (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, paddingHorizontal: 4 }}>
                      Habits
                    </Text>

                    {/* Add habit bar */}
                    <Pressable
                      onPress={() => {
                        state.setIsAddingHabit(true);
                        state.setEditingHabit({
                          id: `habit-${Date.now()}`,
                          title: "",
                          streak: 0,
                          bestStreak: 0,
                          completedToday: false,
                          priority: "medium",
                          folderId: state.openedFolderId || "default",
                          category: "health",
                          createdAt: Date.now(),
                        } as any);
                      }}
                    >
                      <AppCard style={styles.addTaskCard}>
                        <View style={[styles.addTaskInput, { justifyContent: "center" }]}>
                          <Text style={{ color: colors.textMuted }}>
                            Start a new habit...
                          </Text>
                        </View>
                        <View style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                          <Feather name="plus" size={20} color="#ffffff" />
                        </View>
                      </AppCard>
                    </Pressable>

                    {/* Habits List */}
                    <HabitSection
                      displayedHabits={folderHabits}
                      habits={state.habits}
                      setHabits={state.setHabits}
                      persistHabits={state.persistHabits}
                      toggleHabit={state.toggleHabit}
                      deleteHabit={state.deleteHabit}
                      unfinishedHabitCount={state.unfinishedHabitCount}
                      isSelectionMode={state.isBulkSelectActive}
                      selectedItemIds={state.selectedItemIds}
                      allResources={allResources}
                      onToggleLinkResource={state.toggleLinkResource}
                      onToggleSelectItem={(id) => {
                        state.setSelectedItemIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                      onEditHabit={(item) => state.setEditingHabit(item)}
                      onCreateHabit={() => {
                        state.setIsAddingHabit(true);
                        state.setEditingHabit({
                          id: `habit-${Date.now()}`,
                          title: "",
                          streak: 0,
                          bestStreak: 0,
                          completedToday: false,
                          priority: "medium",
                          folderId: state.openedFolderId || "default",
                          category: "health",
                          createdAt: Date.now(),
                        } as any);
                      }}
                    />
                  </View>
                )}

                {/* Checklists Section */}
                {state.folderSegment === "checklists" && (() => {
                  const folderChecklists = state.checklists[state.openedFolderId || "default"] || [];
                  const activeChecklists = folderChecklists.filter(c => !c.archived);
                  const filteredChecklists = state.searchQuery.trim() === ""
                    ? activeChecklists
                    : activeChecklists.filter(c => {
                        const matchesTitle = c.title.toLowerCase().includes(state.searchQuery.toLowerCase());
                        const matchesItems = c.items.some(i => i.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
                        return matchesTitle || matchesItems;
                      });
                  
                  return (
                    <View style={{ gap: 10 }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, paddingHorizontal: 4 }}>
                        Checklists
                      </Text>

                      {/* Add Checklist bar */}
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setIsAddingChecklist(true);
                        }}
                      >
                        <AppCard style={styles.addTaskCard}>
                          <View style={[styles.addTaskInput, { justifyContent: "center" }]}>
                            <Text style={{ color: colors.textMuted }}>
                              Start a new checklist...
                            </Text>
                          </View>
                          <View style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                            <Feather name="plus" size={20} color="#ffffff" />
                          </View>
                        </AppCard>
                      </Pressable>

                      {filteredChecklists.length === 0 ? (
                        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
                          <Feather name="list" size={24} color={colors.textMuted} style={{ marginBottom: 8 }} />
                          <Text style={{ color: colors.textMuted, fontSize: 13 }}>No checklists in this workspace.</Text>
                        </View>
                      ) : (
                        <ChecklistSection
                          checklists={filteredChecklists}
                          colors={colors}
                          colorScheme={colorScheme}
                          allResources={allResources}
                          onUpdateChecklist={state.updateChecklist}
                          onDeleteChecklist={(id) => state.deleteChecklist(id, state.openedFolderId || "default")}
                          onDuplicateChecklist={(chk) => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            state.addChecklist(
                              `${chk.title} (Copy)`,
                              chk.items.map(i => i.title),
                              state.openedFolderId || "default"
                            );
                          }}
                          onRenameChecklist={(chk) => {
                            setEditingChecklistId(chk.id);
                            setNewChecklistTitle(chk.title);
                            setNewChecklistItems(chk.items.map(i => i.title).join(", "));
                            setIsAddingChecklist(true);
                          }}
                          onToggleLinkResource={state.toggleLinkResource}
                        />
                      )}
                    </View>
                  );
                })()}

                {/* Collections Section */}
                {state.folderSegment === "vault" && (
                  <View style={{ gap: 10 }}>
                    <VaultSection
                      collections={state.collections}
                      lists={state.lists}
                      createCollection={state.createCollection}
                      deleteCollection={state.deleteCollection}
                      renameCollection={state.renameCollection}
                      addCollectionItem={state.addCollectionItem}
                      updateCollectionItem={state.updateCollectionItem}
                      deleteCollectionItem={state.deleteCollectionItem}
                      toggleArchiveCollectionItem={state.toggleArchiveCollectionItem}
                      togglePinCollectionItem={state.togglePinCollectionItem}
                      convertCollectionItemToTask={state.convertCollectionItemToTask}
                      searchQuery={state.searchQuery}
                      activeFolderId={state.openedFolderId || "unassigned"}
                      stateTodos={Object.values(state.todos).flat()}
                      stateHabits={state.habits}
                      stateChecklists={Object.values(state.checklists).flat()}
                      onToggleLinkResource={state.toggleLinkResource}
                    />
                  </View>
                )}
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

            {/* Workspace Options Bottom Sheet */}
            <AnimatedOverlay
              visible={workspaceMenuVisible}
              onClose={() => setWorkspaceMenuVisible(false)}
              type="bottom-sheet"
            >
              {(close) => {
                const folder = state.lists.find((l) => l.id === state.openedFolderId) as any;
                const folderName = folder ? folder.name : "Workspace";
                const isInbox = state.openedFolderId === null || state.openedFolderId === "unassigned";

                return (
                  <View
                    style={{
                      backgroundColor: colors.card,
                      borderTopLeftRadius: 24,
                      borderTopRightRadius: 24,
                      paddingTop: 16,
                      paddingHorizontal: 20,
                      paddingBottom: Platform.OS === "ios" ? 36 : 24,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                    }}
                  >
                    {/* Header */}
                    <View
                      style={{
                        alignItems: "center",
                        paddingBottom: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border + "40",
                        marginBottom: 12,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                        {folderName}
                      </Text>
                    </View>

                    {/* Options list */}
                    <View style={{ gap: 4 }}>
                      {/* Workspace Settings */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          if (isInbox) {
                            setInboxProtectionVisible(true);
                            return;
                          }
                          if (folder) {
                            state.setEditingFolderId(folder.id);
                            state.setFolderModalVisible(true);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                          opacity: isInbox ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>⚙️</Text>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          Workspace Settings
                        </Text>
                      </TouchableOpacity>

                      {/* Bulk Select */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          state.setIsBulkSelectActive(!state.isBulkSelectActive);
                          state.setSelectedItemIds(new Set());
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>☑️</Text>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          {state.isBulkSelectActive ? "Disable Bulk Select" : "Bulk Select"}
                        </Text>
                      </TouchableOpacity>

                      {/* Rename Workspace */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          if (isInbox) {
                            setInboxProtectionVisible(true);
                            return;
                          }
                          if (folder) {
                            if (Platform.OS === "ios") {
                              setTimeout(() => {
                                Alert.prompt(
                                  "Rename Workspace",
                                  "Enter new name:",
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                      text: "Rename",
                                      onPress: async (newName?: string) => {
                                        if (newName && newName.trim()) {
                                          const updated = state.lists.map((l) =>
                                            l.id === folder.id ? { ...l, name: newName.trim() } : l
                                          );
                                          state.setLists(updated);
                                          await state.persistState(updated, state.selectedList, state.todos);
                                          emitStateChange("tasks_changed");
                                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                        }
                                      }
                                    }
                                  ],
                                  "plain-text",
                                  folder.name
                                );
                              }, 300);
                            } else {
                              state.setEditingFolderId(folder.id);
                              state.setFolderModalVisible(true);
                            }
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                          opacity: isInbox ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>✏️</Text>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          Rename Workspace
                        </Text>
                      </TouchableOpacity>

                      {/* Archive Workspace */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          if (isInbox) {
                            setInboxProtectionVisible(true);
                            return;
                          }
                          if (folder) {
                            setTimeout(() => {
                              Alert.alert(
                                "Archive Workspace",
                                `Are you sure you want to archive "${folder.name}"?`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Archive",
                                    style: "destructive",
                                    onPress: async () => {
                                      const updated = state.lists.map((l) =>
                                        l.id === folder.id ? { ...l, archived: true } : l
                                      );
                                      state.setLists(updated);
                                      await state.persistState(updated, "default", state.todos);
                                      state.setOpenedFolderId("default");
                                      state.setSelectedList("default");
                                      emitStateChange("tasks_changed");
                                      emitStateChange("habits_changed");
                                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                    }
                                  }
                                ]
                              );
                            }, 300);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                          opacity: isInbox ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>📦</Text>
                        <Text style={{ color: colors.error, fontSize: 15, fontWeight: "600" }}>
                          Archive Workspace
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Separator before Cancel */}
                    <View style={{ height: 1.5, backgroundColor: colors.border, marginVertical: 12 }} />

                    {/* Cancel option */}
                    <TouchableOpacity
                      onPress={close}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            </AnimatedOverlay>

            {/* Inbox Protected System Workspace Modal */}
            <AnimatedOverlay
              visible={inboxProtectionVisible}
              onClose={() => setInboxProtectionVisible(false)}
              type="center-modal"
            >
              {(close) => (
                <View
                  style={{
                    width: 280,
                    backgroundColor: colors.card,
                    borderRadius: 24,
                    padding: 24,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 32 }}>📥</Text>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" }}>
                    Inbox is Protected
                  </Text>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    System Workspace
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 4 }}>
                    This workspace is protected because it powers quick capture across Pebble.
                  </Text>
                  <View style={{ height: 1, backgroundColor: colors.border + "40", width: "100%", marginVertical: 8 }} />
                  <TouchableOpacity
                    onPress={close}
                    style={{
                      width: "100%",
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>Got it</Text>
                  </TouchableOpacity>
                </View>
              )}
            </AnimatedOverlay>

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
        {/* NLPCapture deprecated in favor of global UnifiedCapture */}
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
              {state.lists.filter((ws) => !ws.archived).map((ws) => (
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

      {/* Create/Edit Checklist Modal */}
      <Modal
        visible={isAddingChecklist}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setIsAddingChecklist(false);
          setEditingChecklistId(null);
          setNewChecklistTitle("");
          setNewChecklistItems("");
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
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
              backgroundColor: colors.card,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>
                {editingChecklistId ? "Edit Checklist" : "Create Checklist"}
              </Text>
              <TouchableOpacity onPress={() => {
                setIsAddingChecklist(false);
                setEditingChecklistId(null);
                setNewChecklistTitle("");
                setNewChecklistItems("");
              }}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12 }}>
              <TextInput
                value={newChecklistTitle}
                onChangeText={setNewChecklistTitle}
                placeholder="Checklist title (e.g. Packing list)..."
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <TextInput
                value={newChecklistItems}
                onChangeText={setNewChecklistItems}
                placeholder="Items (comma-separated, e.g. Bread, Milk, Eggs)..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            <TouchableOpacity
              onPress={() => {
                if (newChecklistTitle.trim()) {
                  const itemsArray = newChecklistItems
                    .split(",")
                    .map(i => i.trim())
                    .filter(i => i.length > 0);

                  if (editingChecklistId) {
                    const folderChecklists = state.checklists[state.openedFolderId || "default"] || [];
                    const target = folderChecklists.find(c => c.id === editingChecklistId);
                    if (target) {
                      const updatedItems = itemsArray.map((title) => {
                        const existing = target.items.find(i => i.title.toLowerCase() === title.toLowerCase());
                        return {
                          id: existing?.id || `checklist-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                          title,
                          completed: existing?.completed || false
                        };
                      });
                      state.updateChecklist({
                        ...target,
                        title: newChecklistTitle.trim(),
                        items: updatedItems
                      });
                    }
                    setEditingChecklistId(null);
                  } else {
                    state.addChecklist(
                      newChecklistTitle.trim(),
                      itemsArray,
                      state.openedFolderId || "default"
                    );
                  }

                  setNewChecklistTitle("");
                  setNewChecklistItems("");
                  setIsAddingChecklist(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                } else {
                  Alert.alert("Title Required", "Please enter a checklist title.");
                }
              }}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 6,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                {editingChecklistId ? "Save Changes" : "Create Checklist"}
              </Text>
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
              emitStateChange("open_quick_add");
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
