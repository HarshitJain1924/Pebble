import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View, Modal, ScrollView, TouchableOpacity, Image, Alert, Dimensions, Linking } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import * as Haptics from "expo-haptics";
import PressableScale from "@/components/ui/PressableScale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import { SwipeableCard } from "@/components/SwipeableCard";
import { Typography } from "@/constants/typography";
import { getTaskCategoryMeta, normalizeTaskCategory, type TaskCategory } from "@/services/taskCategories";
import { getRecurrenceLabel } from "@/services/recurrence";
import { formatReminderTime } from "@/services/v3/scheduleFormatter";

export type Todo = {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  category?: any;
  alarmId?: string;
  alarmTime?: number;
  notificationIds?: string[];
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
  scheduledDate?: string;
  durationMinutes?: number;
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
  linkedCollectionIds?: string[];
};

export type TaskList = { id: string; name: string };

const getFormattedDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

interface TodoItemProps {
  item: Todo;
  colors: any;
  colorScheme: "light" | "dark" | null;
  isOverdue: boolean;
  lists: TaskList[];
  selectedList: string;
  onToggleTodo: () => void;
  onDeleteTodo: () => void;
  onEditTodo?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  allResources?: any[];
  onToggleLinkResource?: (itemId: string, itemType: "task", resourceId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

type MetaPart = {
  key: "category" | "date" | "duration" | "reminder" | "recurrence" | "overdue";
  text: string;
  icon?: string;
  color?: string;
};

export function TodoItem({
  item,
  colors,
  colorScheme,
  isOverdue: overdue,
  lists,
  selectedList,
  onToggleTodo,
  onDeleteTodo,
  onEditTodo,
  onLayout,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  allResources = [],
  onToggleLinkResource,
  isExpanded: isExpandedProp,
  onToggleExpand,
}: TodoItemProps) {
  const category = getTaskCategoryMeta(normalizeTaskCategory(item.category));
  const isLight = colorScheme === "light";

  // Context Linkage States
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : localExpanded;
  const setIsExpanded = onToggleExpand !== undefined ? onToggleExpand : setLocalExpanded;
  const [showLinkSelector, setShowLinkSelector] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);

  const linkedResourceIds = item.linkedCollectionIds || [];
  const linkedCount = linkedResourceIds.length;

  // Automatically collapse when no resources are left
  React.useEffect(() => {
    if (linkedCount === 0 && isExpanded) {
      if (onToggleExpand) {
        onToggleExpand();
      } else {
        setLocalExpanded(false);
      }
    }
  }, [linkedCount, isExpanded, onToggleExpand]);

  // Reset showAllResources state when drawer is collapsed
  React.useEffect(() => {
    if (!isExpanded) {
      setShowAllResources(false);
    }
  }, [isExpanded]);

  const linkedResources = useMemo(() => {
    return linkedResourceIds
      .map((id) => allResources.find((r) => r.id === id))
      .filter(Boolean);
  }, [linkedResourceIds, allResources]);

  const hasHiddenResources = linkedResources.length > 3;
  const displayedResources = useMemo(() => {
    if (hasHiddenResources && !showAllResources) {
      return linkedResources.slice(0, 2);
    }
    return linkedResources;
  }, [linkedResources, hasHiddenResources, showAllResources]);

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  const getPriorityColor = () => {
    if (item.priority === "high") return "#EF4444";
    if (item.priority === "medium") return "#F97316";
    if (item.priority === "low") return "#3B82F6";
    return "#4B5563"; // Gray/None
  };

  const metaParts = useMemo<MetaPart[]>(() => {
    const parts: MetaPart[] = [];

    // 1. Category
    if (category?.label) {
      parts.push({
        key: "category",
        text: category.label,
        icon: "folder",
      });
    }

    // 2. Schedule
    if (overdue) {
      parts.push({
        key: "overdue",
        text: "Overdue",
        icon: "alert-circle",
        color: colors.warning,
      });
    } else if (item.scheduledDate && item.scheduledDate !== "inbox") {
      const today = getFormattedDateKey(new Date());
      const tomorrow = getFormattedDateKey(addDays(new Date(), 1));
      const isToday = item.scheduledDate === today;
      const isTomorrow = item.scheduledDate === tomorrow;
      const dateLabel = isToday
        ? "Today"
        : isTomorrow
        ? "Tomorrow"
        : item.scheduledDate;

      parts.push({
        key: "date",
        text: dateLabel,
        icon: "calendar",
        color: isToday ? colors.primary : (isTomorrow ? colors.text : colors.textMuted),
      });
    }

    // 3. Duration
    if (item.durationMinutes) {
      const mins = item.durationMinutes;
      let text = "";
      if (mins < 60) {
        text = `${mins}m`;
      } else {
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        text = rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
      }
      parts.push({
        key: "duration",
        text,
        icon: "clock",
      });
    }

    // 4. Reminder
    let reminderText = "";
    if (item.reminderHour !== undefined && item.reminderMinute !== undefined) {
      reminderText = formatReminderTime(item.reminderHour, item.reminderMinute) || "";
    } else if (item.alarmTime) {
      const d = new Date(item.alarmTime);
      reminderText = formatReminderTime(d.getHours(), d.getMinutes()) || "";
    }

    if (reminderText) {
      parts.push({
        key: "reminder",
        text: reminderText,
        icon: "bell",
        color: isLight ? "#4B5563" : "#D1D5DB",
      });
    }

    // 5. Recurrence
    if (item.recurrence) {
      const label = getRecurrenceLabel(item.recurrence);
      if (label) {
        const cleanLabel = label.replace(/[↻↻↻]/g, "").trim();
        parts.push({
          key: "recurrence",
          text: cleanLabel,
          icon: "repeat",
        });
      }
    }

    return parts;
  }, [category, overdue, item.scheduledDate, item.durationMinutes, item.reminderHour, item.reminderMinute, item.alarmTime, item.recurrence, colors, isLight]);

  return (
    <SwipeableCard
      onSwipeRight={onToggleTodo}
      onSwipeLeft={onDeleteTodo}
      disabled={isSelectionMode}
    >
      <View onLayout={onLayout}>
        <AppCard
          style={[
            styles.todoItemCard,
            {
              paddingLeft: 14,
              paddingRight: 10,
              paddingTop: 10,
              paddingBottom: 10,
              position: "relative",
              overflow: "hidden",
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 14,
              opacity: item.completed ? 0.6 : 1, // Satisfying opacity fade on completion
            },
          ]}
        >
          {/* Thin vertical priority strip */}
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3.5,
              backgroundColor: getPriorityColor(),
            }}
          />

          {/* Parent Task Main Info Row */}
          <View style={styles.todoMainRow}>
            <View style={styles.todoLeft}>
              {isSelectionMode ? (
                <Pressable onPress={onSelect} style={{ padding: 4 }}>
                  <Feather
                    name={isSelected ? "check-circle" : "circle"}
                    size={18}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              ) : (
                <AnimatedCheckbox
                  checked={item.completed}
                  onToggle={onToggleTodo}
                />
              )}
              <Pressable onPress={isSelectionMode ? onSelect : onEditTodo} style={styles.todoTexts}>
                <Text
                  style={[
                    styles.todoTitle,
                    {
                      color: item.completed ? colors.textMuted : colors.text,
                      textDecorationLine: item.completed
                        ? "line-through"
                        : "none",
                    },
                  ]}
                >
                  {item.title}
                </Text>
                
                {/* Single line metadata row with double spaced dot delimiters */}
                <View style={styles.metaRow}>
                  {metaParts.map((part, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <Text style={{ color: colors.textMuted, fontSize: 11 }}>   •   </Text>}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3.5 }}>
                        {part.icon && (
                          <Feather
                            name={part.icon as any}
                            size={10}
                            color={part.color || colors.textMuted}
                          />
                        )}
                        <Text
                          style={{
                            color: part.color || colors.textMuted,
                            fontSize: 11,
                            fontWeight: part.key === "overdue" || part.text === "Today" ? "700" : "500",
                          }}
                        >
                          {part.text}
                        </Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </Pressable>
            </View>

            {/* Trailing action button (plain icon / label without container pill) */}
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (linkedCount > 0) {
                  setIsExpanded(!isExpanded);
                } else {
                  setShowLinkSelector(true);
                }
              }}
              onLongPress={linkedCount > 0 ? () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                setIsPeeking(true);
              } : undefined}
              delayLongPress={350}
              style={{
                width: 44,
                height: 44,
                justifyContent: "center",
                alignItems: "center",
                marginRight: -4,
              }}
            >
              {linkedCount === 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                  <Feather name="paperclip" size={13} color={colors.textMuted} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted }}>+</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather
                    name="paperclip"
                    size={12}
                    color={isExpanded ? colors.primary : colors.textMuted}
                  />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: isExpanded ? colors.primary : colors.textMuted }}>
                    {linkedCount}
                  </Text>
                </View>
              )}
            </PressableScale>
          </View>

          {/* Expanded Flat Resource List inside the same card */}
          {isExpanded && linkedResources.length > 0 && (
            <View style={styles.expandedContent}>
              {/* Subtle divider before the resources section */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Flat List (Apple Notes attachment style) */}
              <View style={styles.resourcesList}>
                {displayedResources.map((res: any, idx: number) => {
                  const isImage = res.type === "image";
                  const isNote = res.type === "note";
                  const isLink = res.type === "link";
                  const isVideo = isLink && (res.url?.toLowerCase().includes("youtube") || res.url?.toLowerCase().includes("video"));

                  return (
                    <View key={res.id}>
                      <TouchableOpacity
                        onPress={() => {
                          if (isLink) {
                            handleOpenUrl(res.url);
                          } else if (isNote) {
                            Alert.alert(res.title, res.content || "No details available.");
                          } else {
                            Alert.alert(res.title, "Image attachment");
                          }
                        }}
                        style={styles.resourceRow}
                      >
                        {/* Icon or Thumbnail */}
                        {isImage ? (
                          <View style={[styles.thumbnailWrap, { backgroundColor: isLight ? "#F1F5F9" : "#27272A" }]}>
                            <Image
                              source={{ uri: res.mediaUri || "https://images.unsplash.com/photo-1544005313-94ddf0286df2" }}
                              style={{ width: "100%", height: "100%" }}
                            />
                          </View>
                        ) : (
                          <View style={[styles.thumbnailWrap, { backgroundColor: isLight ? "#F1F5F9" : "#27272A" }]}>
                            <Feather
                              name={isVideo ? "play-circle" : isLink ? "globe" : isNote ? "file-text" : "file"}
                              size={13}
                              color={colors.primary}
                            />
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                            {res.title}
                          </Text>
                          {isLink && res.url && (
                            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                              {res.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0]}
                            </Text>
                          )}
                          {isNote && res.content && (
                            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                              {res.content.trim().split("\n")[0]}
                            </Text>
                          )}
                          {isImage && (
                            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
                              Image attachment
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>

                      {/* Inner row separator divider */}
                      {idx < displayedResources.length - 1 && (
                        <View style={[styles.innerDivider, { backgroundColor: colors.border + "40" }]} />
                      )}
                    </View>
                  );
                })}

                {/* Show More/Less Gate */}
                {hasHiddenResources && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowAllResources(!showAllResources);
                    }}
                    style={styles.showMoreBtn}
                  >
                    <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "600" }}>
                      {showAllResources ? "Show less" : `Show ${linkedResources.length - 2} more`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Flat Link Resource Action button (no dashed border) */}
                <TouchableOpacity
                  onPress={() => setShowLinkSelector(true)}
                  style={styles.addResourceBtn}
                >
                  <Feather name="plus" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                    Link Resource
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </AppCard>

        {/* Resource Link Selector Modal */}
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
                Select resources to link to this task:
              </Text>

              {allResources.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>No resources in this workspace.</Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
                  {allResources.map((res) => {
                    const isLinked = linkedResourceIds.includes(res.id);
                    return (
                      <TouchableOpacity
                        key={res.id}
                        onPress={() => onToggleLinkResource?.(item.id, "task", res.id)}
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

        {/* iOS-style Long Press Peek Modal */}
        <Modal
          visible={isPeeking}
          transparent
          animationType="none"
          onRequestClose={() => setIsPeeking(false)}
        >
          <Pressable
            onPress={() => setIsPeeking(false)}
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
                {linkedResources.map((res: any) => (
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
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  todoItemCard: {
    flexDirection: "column",
  },
  todoMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todoLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  todoTexts: {
    flex: 1,
    gap: 1,
  },
  todoTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
    flexWrap: "wrap",
  },
  tagBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  tagBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reminderText: {
    fontSize: 10,
    fontWeight: "600",
  },
  expandedContent: {
    marginTop: 10,
    paddingBottom: 4,
  },
  divider: {
    height: 1,
    width: "100%",
    marginBottom: 12,
    opacity: 0.5,
  },
  resourcesList: {
    paddingLeft: 26, // Align nicely with content text offset
    gap: 4,
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  thumbnailWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  innerDivider: {
    height: 1,
    width: "100%",
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  addResourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 6,
  },
});
