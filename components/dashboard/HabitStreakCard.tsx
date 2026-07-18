import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getRecurrenceLabel } from "@/services/recurrence";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import {
    Image,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import { AppCard } from "../AppCard";
import { ProgressRing } from "../ProgressRing";
import PressableScale from "../ui/PressableScale";

type HabitStreakCardProps = {
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  priority?: "low" | "medium" | "high";
  onPressToggle: (event?: any) => void;
  onCardPress?: () => void;
  linkedCount?: number;
  isExpanded?: boolean;
  onPressResources?: (event?: any) => void;
  onLongPressResources?: () => void;
  habit: any;

  // Resource drawer props passed from HabitSection
  linkedResources?: any[];
  displayedResources?: any[];
  onPressAddResource?: () => void;
  onPressOpenResource?: (res: any) => void;
  showAllResources?: boolean;
  setShowAllResources?: (show: boolean) => void;
  hasHiddenResources?: boolean;
};

type MetaPart = {
  key: "streak" | "recurrence" | "reminder";
  text: string;
  icon?: string;
  color?: string;
};

export const HabitStreakCard: React.FC<HabitStreakCardProps> = ({
  title,
  streak,
  completedToday,
  onPressToggle,
  onCardPress,
  linkedCount = 0,
  isExpanded = false,
  onPressResources,
  onLongPressResources,
  habit,

  linkedResources = [],
  displayedResources = [],
  onPressAddResource,
  onPressOpenResource,
  showAllResources = false,
  setShowAllResources,
  hasHiddenResources = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const amberColor = "#F59E0B";

  // Build single line metadata (including streak value flatly without enclosing badge)
  const metaParts = useMemo<MetaPart[]>(() => {
    const parts: MetaPart[] = [];

    // 1. Streak flatly (slightly bolder streak value)
    parts.push({
      key: "streak",
      text: `🔥 ${streak}`,
      color: isLight ? "#B45309" : "#F59E0B",
    });

    // 2. Schedule / Recurrence
    let recLabel = "";
    if (habit.recurrence) {
      recLabel = getRecurrenceLabel(habit.recurrence) ?? "";
    } else if (habit.reminderDays && habit.reminderDays.length > 0) {
      const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const sorted = [...habit.reminderDays].sort((a, b) => a - b);
      if (sorted.length === 7) {
        recLabel = "Daily";
      } else if (
        sorted.length === 5 &&
        !sorted.includes(0) &&
        !sorted.includes(6)
      ) {
        recLabel = "Weekdays";
      } else if (
        sorted.length === 2 &&
        sorted.includes(0) &&
        sorted.includes(6)
      ) {
        recLabel = "Weekends";
      } else {
        recLabel = sorted.map((d) => DAY_FULL[d]?.substring(0, 3)).join(" ");
      }
    } else {
      recLabel = "Daily";
    }

    if (recLabel) {
      parts.push({
        key: "recurrence",
        text: recLabel.replace(/[↻↻↻]/g, "").trim(),
        icon: "repeat",
      });
    }

    // 3. Reminder (no bell icon, clean 12h format e.g. 8:00 AM)
    if (
      habit.reminderHour !== undefined &&
      habit.reminderMinute !== undefined
    ) {
      const ampm = habit.reminderHour >= 12 ? "PM" : "AM";
      const displayHour =
        habit.reminderHour % 12 === 0 ? 12 : habit.reminderHour % 12;
      const displayMinute = String(habit.reminderMinute).padStart(2, "0");
      parts.push({
        key: "reminder",
        text: `${displayHour}:${displayMinute} ${ampm}`,
        icon: "clock",
        color: isLight ? "#4B5563" : "#D1D5DB",
      });
    }

    return parts;
  }, [
    streak,
    habit.recurrence,
    habit.reminderDays,
    habit.reminderHour,
    habit.reminderMinute,
    isLight,
  ]);

  return (
    <AppCard
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          opacity: completedToday ? 0.6 : 1, // Satisfying opacity fade on completion
        },
      ]}
      onPress={onCardPress}
    >
      {/* Primary Card Row */}
      <View style={styles.cardHeaderRow}>
        {/* Thicker empty ring for satisfying Apple-style fitness feel */}
        <Pressable onPress={onPressToggle} style={styles.checkButton}>
          <ProgressRing
            progress={completedToday ? 1 : 0}
            size={24}
            strokeWidth={3.5}
            showText={false}
            color={amberColor}
            trackColor={
              isLight ? "rgba(245, 158, 11, 0.18)" : "rgba(245, 158, 11, 0.28)"
            }
          />
          {completedToday && (
            <View style={styles.checkTick}>
              <Feather name="check" size={10} color="#FFFFFF" />
            </View>
          )}
        </Pressable>

        {/* Habit Info Content */}
        <View style={styles.content}>
          <Text
            style={[
              styles.title,
              {
                color: completedToday ? colors.textMuted : colors.text,
                textDecorationLine: completedToday ? "line-through" : "none",
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>

          {/* Flat Single Line Metadata with double spacing dots */}
          <View style={styles.metaRow}>
            {metaParts.map((part, idx) => {
              const isStreak = part.key === "streak";
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {" "}
                      •{" "}
                    </Text>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3.5,
                    }}
                  >
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
                        fontWeight: isStreak ? "700" : "500",
                      }}
                    >
                      {part.text}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Trailing resource action button (plain icon / label without container pill) */}
        <PressableScale
          onPress={onPressResources}
          onLongPress={linkedCount > 0 ? onLongPressResources : undefined}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 1 }}
            >
              <Feather name="paperclip" size={13} color={colors.textMuted} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: colors.textMuted,
                }}
              >
                +
              </Text>
            </View>
          ) : (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Feather
                name="paperclip"
                size={12}
                color={isExpanded ? colors.primary : colors.textMuted}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: isExpanded ? colors.primary : colors.textMuted,
                }}
              >
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
              const isVideo =
                isLink &&
                (res.url?.toLowerCase().includes("youtube") ||
                  res.url?.toLowerCase().includes("video"));

              return (
                <View key={res.id}>
                  <TouchableOpacity
                    onPress={() => onPressOpenResource?.(res)}
                    style={styles.resourceRow}
                  >
                    {/* Icon or Thumbnail */}
                    {isImage ? (
                      <View
                        style={[
                          styles.thumbnailWrap,
                          { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                        ]}
                      >
                        <Image
                          source={{
                            uri:
                              res.mediaUri ||
                              "https://images.unsplash.com/photo-1544005313-94ddf0286df2",
                          }}
                          style={{ width: "100%", height: "100%" }}
                        />
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.thumbnailWrap,
                          { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                        ]}
                      >
                        <Feather
                          name={
                            isVideo
                              ? "play-circle"
                              : isLink
                                ? "globe"
                                : isNote
                                  ? "file-text"
                                  : "file"
                          }
                          size={13}
                          color={colors.primary}
                        />
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: colors.text,
                        }}
                        numberOfLines={1}
                      >
                        {res.title}
                      </Text>
                      {isLink && res.url && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {
                            res.url
                              .replace(/https?:\/\/(www\.)?/, "")
                              .split("/")[0]
                          }
                        </Text>
                      )}
                      {isNote && res.content && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {res.content.trim().split("\n")[0]}
                        </Text>
                      )}
                      {isImage && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                        >
                          Image attachment
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Inner row separator divider */}
                  {idx < displayedResources.length - 1 && (
                    <View
                      style={[
                        styles.innerDivider,
                        { backgroundColor: colors.border + "40" },
                      ]}
                    />
                  )}
                </View>
              );
            })}

            {/* Show More / Less Gate */}
            {hasHiddenResources && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  setShowAllResources?.(!showAllResources);
                }}
                style={styles.showMoreBtn}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    fontWeight: "600",
                  }}
                >
                  {showAllResources
                    ? "Show less"
                    : `Show ${linkedResources.length - 2} more`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Flat Link Resource Action button (no dashed border) */}
            <TouchableOpacity
              onPress={onPressAddResource}
              style={styles.addResourceBtn}
            >
              <Feather name="plus" size={14} color={colors.primary} />
              <Text
                style={{
                  fontSize: 12,
                  color: colors.primary,
                  fontWeight: "600",
                }}
              >
                Link Resource
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "column",
    paddingLeft: 14,
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 14,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkButton: {
    position: "relative",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  checkTick: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
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
    paddingLeft: 36, // Align neatly with content text offset
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
