import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AllDaySection } from "./AllDaySection";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineItem } from "./TimelineItem";
import { FreeTimeGap } from "./FreeTimeGap";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";

interface DayPlannerViewProps {
  timelineGridRef: React.RefObject<View | null>;
  onLayoutTimeline: () => void;
  filteredAllDayItems: any[];
  filteredTimedItems: any[];
  freeTimeGaps: any[];
  hasPendingItems: boolean;
  isViewingToday: boolean;
  currentTime: { hours: number; minutes: number };
  isDragging: boolean;
  hoveredHour: number | null;
  activeDragItem: any;
  onPlanAllDay: () => void;
  onPlaceAtTime: (hour: number, minute: number) => void;
  onOpenItem: (item: any) => void;
  createPanGesture: (item: any) => any;
  colors: any;
  isLight: boolean;
}

export const DayPlannerView: React.FC<DayPlannerViewProps> = React.memo(({
  timelineGridRef,
  onLayoutTimeline,
  filteredAllDayItems,
  filteredTimedItems,
  freeTimeGaps,
  hasPendingItems,
  isViewingToday,
  currentTime,
  isDragging,
  hoveredHour,
  activeDragItem,
  onPlanAllDay,
  onPlaceAtTime,
  onOpenItem,
  createPanGesture,
  colors,
  isLight,
}) => {
  return (
    <View style={styles.plannerContainer}>
      {/* All Day Section */}
      <AllDaySection
        items={filteredAllDayItems}
        hasPendingItems={hasPendingItems}
        onPlanAllDay={onPlanAllDay}
        onOpenItem={onOpenItem}
        createPanGesture={createPanGesture}
        colors={colors}
        isLight={isLight}
      />

      {/* Hourly Planner Visual Blocks */}
      <View
        ref={timelineGridRef}
        onLayout={onLayoutTimeline}
        style={styles.timelineGridWrapper}
      >
        {/* Background 24-Hour Grid */}
        <TimelineGrid
          colors={colors}
          onPlaceAtTime={onPlaceAtTime}
        />

        {/* Absolutely positioned task blocks */}
        <View style={styles.absoluteBlocksContainer} pointerEvents="box-none">
          {/* Timed Items */}
          {filteredTimedItems.map((item, idx) => (
            <TimelineItem
              key={item.id || idx}
              item={item}
              colors={colors}
              isLight={isLight}
              onOpenItem={onOpenItem}
              createPanGesture={createPanGesture}
            />
          ))}

          {/* Inline Free-Time Planner Affordances */}
          {freeTimeGaps.map((gap, idx) => (
            <FreeTimeGap
              key={`gap-${idx}`}
              gap={gap}
              colors={colors}
              isLight={isLight}
              onPlan={onPlaceAtTime}
            />
          ))}

          {/* Snappable hourly drag outline guide */}
          {isDragging && hoveredHour !== null && activeDragItem && (
            <View
              style={[
                styles.dragGuideCard,
                {
                  top: hoveredHour * 80,
                  backgroundColor: isLight
                    ? "rgba(59, 130, 246, 0.06)"
                    : "rgba(59, 130, 246, 0.12)",
                  borderColor: colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.dragGuideText,
                  { color: colors.primary },
                ]}
              >
                Move to {hoveredHour === 12 ? 12 : hoveredHour % 12}:00{" "}
                {hoveredHour >= 12 ? "PM" : "AM"}
              </Text>
            </View>
          )}

          {/* Current Time Indicator (Today Only) */}
          {isViewingToday && (
            <CurrentTimeIndicator
              hours={currentTime.hours}
              minutes={currentTime.minutes}
              isLight={isLight}
            />
          )}
        </View>
      </View>

      {/* Bottom spacer for clean timeline scroll clearance */}
      <View style={styles.bottomSpacer} />
    </View>
  );
});

DayPlannerView.displayName = "DayPlannerView";

const styles = StyleSheet.create({
  plannerContainer: {
    marginTop: 4,
    gap: 8,
  },
  timelineGridWrapper: {
    position: "relative",
    flexDirection: "column",
    marginTop: 8,
  },
  absoluteBlocksContainer: {
    position: "absolute",
    top: 0,
    left: 65,
    right: 0,
    bottom: 0,
  },
  dragGuideCard: {
    position: "absolute",
    borderRadius: 6,
    height: 78,
    left: 0,
    right: 0,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dragGuideText: {
    fontSize: 11,
    fontWeight: "600",
  },
  bottomSpacer: {
    height: 64,
  },
});
