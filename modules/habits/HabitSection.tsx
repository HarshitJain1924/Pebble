import React, { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { View, Pressable, ScrollView, Modal, TouchableOpacity, Image, Alert, StyleSheet, Dimensions, Linking } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { SwipeableCard } from "@/components/SwipeableCard";
import { HabitStreakCard } from "@/components/dashboard/HabitStreakCard";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/components/ui/EmptyState";
import * as Haptics from "expo-haptics";
import { type Habit } from "../types";
import { isRecurringOccurrenceForDate, getDateKey } from "@/services/recurrence";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface HabitSectionProps {
  displayedHabits: Habit[];
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits: (nextHabits: Habit[]) => Promise<void>;
  toggleHabit: (id: string) => void;
  deleteHabit: (id: string) => void;
  unfinishedHabitCount: number;
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleSelectItem?: (id: string) => void;
  onEditHabit?: (habit: Habit) => void;
  allResources?: any[];
  onToggleLinkResource?: (itemId: string, itemType: "habit", resourceId: string) => void;
  onCreateHabit?: () => void;
}

export function HabitSection({
  displayedHabits,
  toggleHabit,
  deleteHabit,
  isSelectionMode = false,
  selectedItemIds = new Set(),
  onToggleSelectItem,
  allResources = [],
  onToggleLinkResource,
  onCreateHabit,
}: HabitSectionProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  // Habit context states
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  const [activeHabitId, setActiveHabitId] = useState<string | null>(null);
  const [showLinkSelector, setShowLinkSelector] = useState(false);
  const [peekingResourceIds, setPeekingResourceIds] = useState<string[] | null>(null);
  const [showAllResourcesMap, setShowAllResourcesMap] = useState<Record<string, boolean>>({});

  // Section expanded states
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [pausedExpanded, setPausedExpanded] = useState(false);

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  const peekingResources = useMemo(() => {
    if (!peekingResourceIds) return [];
    return peekingResourceIds
      .map((id) => allResources.find((r) => r.id === id))
      .filter(Boolean);
  }, [peekingResourceIds, allResources]);

  const todayKey = getDateKey();
  const dayOfWeek = new Date().getDay();

  // Group habits
  const todayList = useMemo(() => {
    return displayedHabits.filter((h) => {
      const isDueToday = h.recurrence
        ? isRecurringOccurrenceForDate(h, todayKey)
        : (!h.reminderDays || h.reminderDays.length === 0 || h.reminderDays.includes(dayOfWeek));
      return isDueToday && !h.completedToday;
    });
  }, [displayedHabits, todayKey, dayOfWeek]);

  const completedList = useMemo(() => {
    return displayedHabits.filter((h) => h.completedToday);
  }, [displayedHabits]);

  const pausedList = useMemo(() => {
    return displayedHabits.filter((h) => {
      const isDueToday = h.recurrence
        ? isRecurringOccurrenceForDate(h, todayKey)
        : (!h.reminderDays || h.reminderDays.length === 0 || h.reminderDays.includes(dayOfWeek));
      return !isDueToday && !h.completedToday;
    });
  }, [displayedHabits, todayKey, dayOfWeek]);

  // Reset showAllResources state when drawer is collapsed
  React.useEffect(() => {
    if (expandedHabitId === null) {
      setShowAllResourcesMap({});
    }
  }, [expandedHabitId]);

  const renderHabitItem = (item: Habit) => {
    const linkedIds = item.linkedCollectionIds || [];
    const linkedCount = linkedIds.length;
    const isExpanded = expandedHabitId === item.id;
    const linkedResources = linkedIds
      .map((id) => allResources.find((r) => r.id === id))
      .filter(Boolean);

    const showAllResources = !!showAllResourcesMap[item.id];
    const setShowAllResources = (val: boolean) => {
      setShowAllResourcesMap(prev => ({ ...prev, [item.id]: val }));
    };

    const hasHiddenResources = linkedResources.length > 3;
    const displayedResources = hasHiddenResources && !showAllResources
      ? linkedResources.slice(0, 2)
      : linkedResources;

    // Automatically collapse when no resources are left
    if (linkedCount === 0 && isExpanded) {
      setExpandedHabitId(null);
    }

    return (
      <View key={item.id} style={styles.habitWrap}>
        <SwipeableCard
          onSwipeRight={() => toggleHabit(item.id)}
          onSwipeLeft={() => deleteHabit(item.id)}
          disabled={isSelectionMode}
        >
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            {isSelectionMode && (
              <Pressable
                onPress={() => onToggleSelectItem?.(item.id)}
                style={{ paddingLeft: 6, paddingRight: 4 }}
              >
                <Feather
                  name={selectedItemIds.has(item.id) ? "check-circle" : "circle"}
                  size={18}
                  color={selectedItemIds.has(item.id) ? colors.primary : colors.textMuted}
                />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>
              <HabitStreakCard
                title={item.title}
                streak={item.streak}
                bestStreak={item.bestStreak}
                completedToday={item.completedToday}
                priority={item.priority}
                onPressToggle={isSelectionMode ? () => onToggleSelectItem?.(item.id) : () => toggleHabit(item.id)}
                onCardPress={isSelectionMode ? () => onToggleSelectItem?.(item.id) : () =>
                  router.push(`/task-details?id=${item.id}&type=habit`)
                }
                linkedCount={linkedCount}
                isExpanded={isExpanded}
                onPressResources={() => {
                  if (linkedCount === 0) {
                    setActiveHabitId(item.id);
                    setShowLinkSelector(true);
                  } else {
                    setExpandedHabitId(expandedHabitId === item.id ? null : item.id);
                  }
                }}
                onLongPressResources={() => {
                  if (linkedCount > 0) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    setPeekingResourceIds(linkedIds);
                  }
                }}
                habit={item}
                linkedResources={linkedResources}
                displayedResources={displayedResources}
                onPressAddResource={() => {
                  setActiveHabitId(item.id);
                  setShowLinkSelector(true);
                }}
                onPressOpenResource={(res) => {
                  if (res.type === "link") {
                    handleOpenUrl(res.url);
                  } else if (res.type === "note") {
                    Alert.alert(res.title, res.content || "No details available.");
                  } else {
                    Alert.alert(res.title, "Image attachment");
                  }
                }}
                showAllResources={showAllResources}
                setShowAllResources={setShowAllResources}
                hasHiddenResources={hasHiddenResources}
              />
            </View>
          </View>
        </SwipeableCard>
      </View>
    );
  };

  const hasAnyHabits = todayList.length > 0 || completedList.length > 0;

  return (
    <View style={styles.listContent}>
      {hasAnyHabits ? (
        <View style={{ gap: 14 }}>
          {/* Today Section */}
          {todayList.length > 0 && (
            <View style={styles.sectionContainer}>
              <Pressable
                onPress={() => setTodayExpanded(!todayExpanded)}
                style={styles.sectionHeaderPressable}
              >
                <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
                  {`TODAY (${todayList.length})`}
                </Text>
                <Feather
                  name={todayExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={colors.textMuted}
                />
              </Pressable>
              {todayExpanded && (
                <View style={styles.sectionHabitsList}>
                  {todayList.map(renderHabitItem)}
                </View>
              )}
            </View>
          )}

          {/* Completed Today Section */}
          {completedList.length > 0 && (
            <View style={styles.sectionContainer}>
              <Pressable
                onPress={() => setCompletedExpanded(!completedExpanded)}
                style={styles.sectionHeaderPressable}
              >
                <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
                  {`COMPLETED (${completedList.length})`}
                </Text>
                <Feather
                  name={completedExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={colors.textMuted}
                />
              </Pressable>
              {completedExpanded && (
                <View style={styles.sectionHabitsList}>
                  {completedList.map(renderHabitItem)}
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: 12, marginTop: 10 }}>
          <EmptyState
            graphic={<Feather name="activity" size={24} color={colors.textMuted} />}
            title="No habits yet."
            description="Small routines become lasting habits."
            style={{ width: "100%", padding: 32, gap: 8 }}
          />
          <TouchableOpacity
            onPress={onCreateHabit}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              height: 40,
              borderRadius: 20,
              gap: 6,
              marginTop: 4,
            }}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>
              Create Habit
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Link Selector Modal for Habit */}
      <Modal
        visible={showLinkSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkSelector(false)}
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
          <View
            style={{
              width: "90%",
              maxHeight: "70%",
              backgroundColor: colors.card,
              borderRadius: 24,
              borderColor: colors.border,
              borderWidth: 1.5,
              padding: 20,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
              Link Resources
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: -4 }}>
              Select resources to link to this habit:
            </Text>

            {allResources.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>No resources in this workspace.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
                {allResources.map((res) => {
                  const currentHabit = displayedHabits.find(h => h.id === activeHabitId);
                  const isLinked = !!currentHabit?.linkedCollectionIds?.includes(res.id);
                  return (
                    <TouchableOpacity
                      key={res.id}
                      onPress={() => activeHabitId && onToggleLinkResource?.(activeHabitId, "habit", res.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isLinked ? colors.primary : colors.border,
                        backgroundColor: isLinked ? `${colors.primary}08` : (isLight ? "#F8FAFC" : "#1E1E24"),
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Feather
                          name={res.type === "link" ? "link-2" : res.type === "image" ? "image" : "file-text"}
                          size={14}
                          color={colors.textMuted}
                        />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                          {res.title}
                        </Text>
                      </View>
                      <Feather
                        name={isLinked ? "check-circle" : "circle"}
                        size={16}
                        color={isLinked ? colors.primary : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={() => setShowLinkSelector(false)}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* iOS-style Long Press Peek Modal for Habits */}
      <Modal
        visible={peekingResourceIds !== null}
        transparent
        animationType="none"
        onRequestClose={() => setPeekingResourceIds(null)}
      >
        <Pressable
          onPress={() => setPeekingResourceIds(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: SCREEN_WIDTH * 0.8,
              backgroundColor: colors.card,
              borderRadius: 20,
              borderColor: colors.border,
              borderWidth: 1.5,
              padding: 16,
              gap: 12,
              elevation: 10,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25,
              shadowRadius: 15,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase" }}>
              Glance Resources
            </Text>
            <View style={{ gap: 10 }}>
              {peekingResources.map((res: any) => (
                <View
                  key={res.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: isLight ? "#E2E8F0" : "#27272A", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {res.type === "image" ? (
                      <Image
                        source={{ uri: res.mediaUri || "https://images.unsplash.com/photo-1544005313-94ddf0286df2" }}
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <Feather
                        name={res.type === "link" ? "link-2" : "file-text"}
                        size={12}
                        color={colors.textMuted}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                      {res.title}
                    </Text>
                    {res.type === "link" && (
                      <Text style={{ fontSize: 9, color: colors.textMuted }} numberOfLines={1}>
                        {res.url}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 4,
    gap: 16,
  },
  sectionContainer: {
    gap: 6,
  },
  sectionHeaderPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHabitsList: {
    gap: 8,
  },
  habitWrap: {
    marginVertical: 2,
  },
});
