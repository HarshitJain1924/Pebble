import { AppText as Text } from "@/shared/components/ui/AppText";
import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CARD_MARGIN = 4;
const JAR_CONTAINER_WIDTH = 70;
const INNER_TEXT_WIDTH =
  SCREEN_WIDTH - 32 - 2 * CARD_MARGIN - 3 - JAR_CONTAINER_WIDTH;

const PEBBLE_SLOTS = [
  // Row 1 (bottom)
  { x: 3, b: 4 },
  { x: 9, b: 4 },
  { x: 15, b: 4 },
  { x: 21, b: 4 },
  { x: 27, b: 4 },
  { x: 33, b: 4 },
  // Row 2
  { x: 6, b: 11 },
  { x: 12, b: 11 },
  { x: 18, b: 11 },
  { x: 24, b: 11 },
  { x: 30, b: 11 },
  // Row 3
  { x: 3, b: 18 },
  { x: 9, b: 18 },
  { x: 15, b: 18 },
  { x: 21, b: 18 },
  { x: 27, b: 18 },
  { x: 33, b: 18 },
  // Row 4
  { x: 6, b: 25 },
  { x: 12, b: 25 },
  { x: 18, b: 25 },
  { x: 24, b: 25 },
  { x: 30, b: 25 },
];

const getMilestoneInfo = (pebbles: number) => {
  if (pebbles <= 10) {
    return {
      stage: 1,
      name: "First Steps",
      range: "0-10",
      desc: "Gathering the first stones of momentum.",
    };
  }
  if (pebbles <= 25) {
    return {
      stage: 2,
      name: "Sprout",
      range: "11-25",
      desc: "A small base of habit stones.",
    };
  }
  if (pebbles <= 50) {
    return {
      stage: 3,
      name: "Zen Stream",
      range: "26-50",
      desc: "Flowing stream of productivity.",
    };
  }
  if (pebbles <= 100) {
    return {
      stage: 4,
      name: "Sanctuary Base",
      range: "51-100",
      desc: "Solid foundation for daily rhythm.",
    };
  }
  if (pebbles <= 250) {
    return {
      stage: 5,
      name: "Pebble Hoarder",
      range: "101-250",
      desc: "A significant heap of accomplishments.",
    };
  }
  if (pebbles <= 500) {
    return {
      stage: 6,
      name: "Zen Mountain",
      range: "251-500",
      desc: "An impressive, towering mount of zen.",
    };
  }
  return {
    stage: 7,
    name: "Ocean of Focus",
    range: "500+",
    desc: "Infinite zen achieved. Master level.",
  };
};

export interface PebbleJarProgressCardProps {
  colors: {
    card: string;
    border: string;
    primary: string;
    text: string;
    textMuted: string;
  };
  colorScheme: "light" | "dark";
  todoStats: {
    completed: number;
    total: number;
  };
  habitStats: {
    completed: number;
    total: number;
  };
  todayPebbles?: number;
  todayTypes?: { task: number; habit: number; focus: number; checklist: number };
  monthlyTypes?: { task: number; habit: number; focus: number; checklist: number };
  monthlyPebbles: number;
  lifetimePebbles: number;
  jarFillAnim: SharedValue<number>;
  cardScrollX: SharedValue<number>;
  miniJarRef: React.RefObject<any>;
  onJarLayout: () => void;
  breathScale: SharedValue<number>;
  parentScrollRef: React.RefObject<any>;
}

export const PebbleJarProgressCard: React.FC<PebbleJarProgressCardProps> = ({
  colors,
  colorScheme,
  todoStats,
  habitStats,
  todayPebbles,
  todayTypes,
  monthlyTypes,
  monthlyPebbles,
  lifetimePebbles,
  jarFillAnim,
  cardScrollX,
  miniJarRef,
  onJarLayout,
  breathScale,
  parentScrollRef,
}) => {
  const todayPebbleCount =
    todayPebbles !== undefined
      ? todayPebbles
      : Math.min(15, todoStats.completed + habitStats.completed);
  const completedCount = todoStats.completed + habitStats.completed;
  const totalCount = todoStats.total + habitStats.total;
  const progressPct = totalCount > 0 ? completedCount / totalCount : 0;
  const displayPercent = Math.round(progressPct * 100);

  const monthlyPebblesCount = Math.min(100, monthlyPebbles);
  const milestoneInfo = getMilestoneInfo(lifetimePebbles);

  const crowAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    return {
      opacity: ratio,
      transform: [{ scale: ratio }],
    };
  });

  const liquidAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    const todayY = 46 * (1 - Math.min(15, todayPebbleCount) / 15);
    const monthlyY = 46 * (1 - Math.min(100, monthlyPebbles) / 100);
    const translateY = todayY + (monthlyY - todayY) * ratio;

    // Sloshing rotation driven by sine of scroll offset
    const rotation = `${Math.sin(ratio * Math.PI) * 7}deg`;

    const backgroundColor = interpolateColor(
      cardScrollX.value,
      [0, INNER_TEXT_WIDTH || 1],
      [colors.primary, "#F59E0B"],
    );

    const opacity = 0.22 + (0.25 - 0.22) * ratio;

    return {
      transform: [{ translateY }, { rotate: rotation }],
      backgroundColor,
      opacity,
    };
  });

  const todayPebblesAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    return {
      opacity: 1 - ratio,
    };
  });

  const monthlyPebblesAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    return {
      opacity: ratio,
    };
  });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      cardScrollX.value = event.contentOffset.x;
    },
  });

  return (
    <View style={{ width: "100%", marginTop: 12, position: "relative" }}>
      {/* Single Premium Outer Card Container */}
      <View
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1.5,
          borderRadius: 20,
          marginHorizontal: CARD_MARGIN,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: colorScheme === "light" ? 0.04 : 0.2,
          shadowRadius: 12,
          elevation: 2,
          overflow: "hidden",
          height: 108,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Animated.ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={INNER_TEXT_WIDTH}
          decelerationRate="fast"
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
          directionalLockEnabled={true}
          onScrollBeginDrag={() => {
            parentScrollRef.current?.setNativeProps({
              scrollEnabled: false,
            });
          }}
          onScrollEndDrag={() => {
            parentScrollRef.current?.setNativeProps({
              scrollEnabled: true,
            });
          }}
          onMomentumScrollEnd={() => {
            parentScrollRef.current?.setNativeProps({
              scrollEnabled: true,
            });
          }}
          onScroll={scrollHandler}
          style={{ width: INNER_TEXT_WIDTH, height: "100%" }}
        >
          {/* Mode 1 Content: Today's Progress Text */}
          <View
            style={{
              width: INNER_TEXT_WIDTH,
              paddingLeft: 16,
              paddingRight: 10,
              paddingVertical: 12,
              justifyContent: "center",
              height: "100%",
            }}
          >
            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: colors.primary,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  Today's Progress
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: colors.textMuted,
                  }}
                >
                  {displayPercent}%
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "baseline", marginVertical: 1 }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "800",
                    color: colors.text,
                    letterSpacing: -0.5,
                  }}
                >
                  {completedCount}{" "}
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "500",
                      color: colors.textMuted,
                    }}
                  >
                    / {totalCount || 1}
                  </Text>
                </Text>
              </View>

              {/* Sleek Progress Bar Track */}
              <View
                style={{
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor:
                    colorScheme === "light"
                      ? "#E5E7EB"
                      : "rgba(255,255,255,0.08)",
                  width: "92%",
                  marginVertical: 3,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    borderRadius: 2.5,
                    backgroundColor: colors.primary,
                    width: `${Math.min(100, displayPercent)}%`,
                  }}
                />
              </View>

              <Text
                style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  fontWeight: "500",
                }}
                numberOfLines={1}
              >
                {completedCount >= totalCount && totalCount > 0
                  ? "All clear! You did incredible today."
                  : "You're building a better tomorrow."}
              </Text>
            </View>
          </View>

          {/* Mode 2 Content: Monthly Progress Text */}
          <View
            style={{
              width: INNER_TEXT_WIDTH,
              paddingLeft: 16,
              paddingRight: 10,
              paddingVertical: 12,
              justifyContent: "center",
              height: "100%",
            }}
          >
            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: "#F59E0B",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  Monthly Sanctuary
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: colors.textMuted,
                  }}
                >
                  {monthlyPebblesCount}%
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "baseline", marginVertical: 1 }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "800",
                    color: colors.text,
                    letterSpacing: -0.5,
                  }}
                >
                  {monthlyPebblesCount}{" "}
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "500",
                      color: colors.textMuted,
                    }}
                  >
                    / 100
                  </Text>
                </Text>
              </View>

              {/* Sleek Progress Bar Track */}
              <View
                style={{
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor:
                    colorScheme === "light"
                      ? "#E5E7EB"
                      : "rgba(255,255,255,0.08)",
                  width: "92%",
                  marginVertical: 3,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    borderRadius: 2.5,
                    backgroundColor: "#F59E0B",
                    width: `${Math.min(100, monthlyPebblesCount)}%`,
                  }}
                />
              </View>

              <Text
                style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  fontWeight: "500",
                }}
                numberOfLines={1}
              >
                {milestoneInfo
                  ? `Stage ${milestoneInfo.stage} • ${milestoneInfo.name}`
                  : "Thirsty Crow Milestone"}
              </Text>
            </View>
          </View>
        </Animated.ScrollView>

        {/* Stationary Glass Jar (Outside ScrollView) */}
        <View
          style={{
            width: JAR_CONTAINER_WIDTH,
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 12,
          }}
        >
          <View
            ref={miniJarRef}
            onLayout={onJarLayout}
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: 55,
              height: 66,
              position: "relative",
            }}
          >
            {/* Perched Crow Emoji (Animated fade/scale based on swipe) */}
            <Animated.Text
              style={[
                {
                  position: "absolute",
                  left: -13,
                  top: 8,
                  fontSize: 18,
                  zIndex: 2,
                },
                crowAnimatedStyle,
              ]}
            >
              🦅
            </Animated.Text>

            {/* Jar Lid */}
            <View
              style={{
                width: 26,
                height: 5,
                borderRadius: 2.5,
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.5)"
                    : "rgba(255,255,255,0.5)",
              }}
            />
            {/* Jar Neck */}
            <View
              style={{
                width: 18,
                height: 5,
                borderLeftWidth: 2,
                borderRightWidth: 2,
                borderColor:
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.5)"
                    : "rgba(255,255,255,0.5)",
                backgroundColor: "transparent",
                marginTop: -1,
                zIndex: 1,
              }}
            />
            {/* Jar Body */}
            <View
              style={{
                width: 42,
                height: 46,
                borderRadius: 12,
                borderWidth: 2,
                borderColor:
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.5)"
                    : "rgba(255,255,255,0.5)",
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.01)"
                    : "rgba(255,255,255,0.01)",
                overflow: "hidden",
                justifyContent: "flex-end",
                position: "relative",
                marginTop: -1,
              }}
            >
              {/* Dynamic Liquid Wave Fill (With morphing color and level) */}
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: -10,
                    right: -10,
                    bottom: -5,
                    height: 56,
                  },
                  liquidAnimatedStyle,
                ]}
              />

              {/* Stacked Pebbles (Today - Fading out) */}
              <Animated.View
                style={[StyleSheet.absoluteFill, todayPebblesAnimatedStyle]}
                pointerEvents="none"
              >
                {(() => {
                  const slots = PEBBLE_SLOTS;
                  const countToRender = Math.min(todayPebbleCount, 15);
                  const typeSequence: ("task" | "habit" | "checklist" | "focus")[] = [];

                  if (todayTypes) {
                    const { task = 0, habit = 0, checklist = 0, focus = 0 } = todayTypes;
                    for (let i = 0; i < task; i++) typeSequence.push("task");
                    for (let i = 0; i < habit; i++) typeSequence.push("habit");
                    for (let i = 0; i < checklist; i++) typeSequence.push("checklist");
                    for (let i = 0; i < focus; i++) typeSequence.push("focus");
                  }
                  if (typeSequence.length === 0) {
                    for (let i = 0; i < countToRender; i++) {
                      const isTask = i < todoStats.completed;
                      typeSequence.push(isTask ? "task" : "habit");
                    }
                  }

                  const PEBBLE_TYPE_COLORS: Record<string, string> = {
                    task: "#818CF8",
                    habit: "#F59E0B",
                    checklist: "#3B82F6",
                    focus: "#10B981",
                  };

                  const pebblesToRender = [];
                  for (let i = 0; i < countToRender; i++) {
                    const slot = slots[i];
                    const pType = typeSequence[i] || "task";
                    const color = PEBBLE_TYPE_COLORS[pType] || "#818CF8";
                    pebblesToRender.push(
                      <View
                        key={`today-pebble-${i}`}
                        style={{
                          position: "absolute",
                          left: slot.x,
                          bottom: slot.b,
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: color,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.15,
                          shadowRadius: 1,
                        }}
                      />,
                    );
                  }
                  return pebblesToRender;
                })()}
              </Animated.View>

              {/* Stacked Pebbles (Monthly - Fading in) */}
              <Animated.View
                style={[StyleSheet.absoluteFill, monthlyPebblesAnimatedStyle]}
                pointerEvents="none"
              >
                {(() => {
                  const slots = PEBBLE_SLOTS;
                  const typeSequence: ("task" | "habit" | "checklist" | "focus")[] = [];
                  if (monthlyTypes) {
                    const { task = 0, habit = 0, checklist = 0, focus = 0 } = monthlyTypes;
                    for (let i = 0; i < task; i++) typeSequence.push("task");
                    for (let i = 0; i < habit; i++) typeSequence.push("habit");
                    for (let i = 0; i < checklist; i++) typeSequence.push("checklist");
                    for (let i = 0; i < focus; i++) typeSequence.push("focus");
                  }
                  if (typeSequence.length === 0) {
                    for (let i = 0; i < monthlyPebbles; i++) typeSequence.push("task");
                  }

                  let dotsToRender = 0;
                  if (monthlyPebbles > 0) {
                    if (monthlyPebbles <= 15) {
                      dotsToRender = monthlyPebbles;
                    } else {
                      dotsToRender = Math.min(
                        slots.length,
                        15 + Math.floor((monthlyPebbles - 15) / 10)
                      );
                    }
                  }

                  const PEBBLE_TYPE_COLORS: Record<string, string> = {
                    task: "#818CF8",
                    habit: "#F59E0B",
                    checklist: "#3B82F6",
                    focus: "#10B981",
                  };

                  const pebblesToRender = [];
                  for (let i = 0; i < dotsToRender; i++) {
                    const slot = slots[i];
                    const typeIdx =
                      monthlyPebbles <= 15
                        ? i
                        : Math.floor((i / dotsToRender) * typeSequence.length);
                    const pType = typeSequence[typeIdx] || "task";
                    const color = PEBBLE_TYPE_COLORS[pType] || "#818CF8";

                    pebblesToRender.push(
                      <View
                        key={`monthly-pebble-${i}`}
                        style={{
                          position: "absolute",
                          left: slot.x,
                          bottom: slot.b,
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: color,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.15,
                          shadowRadius: 1,
                        }}
                      />,
                    );
                  }
                  return pebblesToRender;
                })()}
              </Animated.View>

              {/* Glass Reflection Highlight */}
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  width: 3,
                  height: 30,
                  borderRadius: 1.5,
                  backgroundColor: "rgba(255, 255, 255, 0.25)",
                }}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Sliding Pagination Dot Line Track */}
      <View
        style={{
          width: 36,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: colors.border,
          alignSelf: "center",
          marginTop: 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              width: 18,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: colors.primary,
              position: "absolute",
              left: 0,
            },
            useAnimatedStyle(() => {
              const maxScroll = INNER_TEXT_WIDTH;
              const translate =
                maxScroll > 0 ? (cardScrollX.value / maxScroll) * 18 : 0;
              return {
                transform: [{ translateX: translate }],
              };
            }),
          ]}
        />
      </View>
    </View>
  );
};
