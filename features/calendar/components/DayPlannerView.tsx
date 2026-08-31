import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AllDaySection } from "./AllDaySection";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineItem } from "./TimelineItem";
import { FreeTimeGap } from "./FreeTimeGap";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";
import {
  processGapsLayout,
  calculateTimeYCoordinate,
} from "@/features/calendar/utils/timelineCollapsibleLayout";

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
  onPlaceAtTime: (
    hour: number,
    minute: number,
    gap?: { startMinutes: number; durationMinutes: number },
  ) => void;
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
  // Ephemeral component state tracking which collapsible gaps the user has expanded
  const [expandedGapKeys, setExpandedGapKeys] = useState<Set<string>>(() => new Set());

  const handleToggleCollapse = useCallback((gapKey: string) => {
    setExpandedGapKeys((prev) => {
      const next = new Set(prev);
      if (next.has(gapKey)) {
        next.delete(gapKey);
      } else {
        next.add(gapKey);
      }
      return next;
    });
  }, []);

  // Compute layout & coordinates for gaps and timeline items
  const { processedGaps, activeCollapsedGaps, totalHeight } = useMemo(() => {
    return processGapsLayout(freeTimeGaps, expandedGapKeys, 80);
  }, [freeTimeGaps, expandedGapKeys]);

  const dragGuideTop = useMemo(() => {
    if (hoveredHour === null) return 0;
    return calculateTimeYCoordinate(hoveredHour * 60, activeCollapsedGaps, 80);
  }, [hoveredHour, activeCollapsedGaps]);

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
        style={[styles.timelineGridWrapper, { minHeight: totalHeight }]}
      >
        {/* Background 24-Hour Grid with Collapsed Rows */}
        <TimelineGrid
          activeCollapsedGaps={activeCollapsedGaps}
          hourHeight={80}
          colors={colors}
          onPlaceAtTime={onPlaceAtTime}
        />

        {/* Absolutely positioned task blocks & inline gaps */}
        <View style={styles.absoluteBlocksContainer} pointerEvents="box-none">
          {/* Timed Items */}
          {filteredTimedItems.map((item, idx) => (
            <TimelineItem
              key={item.id || idx}
              item={item}
              activeCollapsedGaps={activeCollapsedGaps}
              hourHeight={80}
              colors={colors}
              isLight={isLight}
              onOpenItem={onOpenItem}
              createPanGesture={createPanGesture}
            />
          ))}

          {/* Inline Free-Time Planner Affordances (Collapsed or Expanded) */}
          {processedGaps.map((gap) => (
            <FreeTimeGap
              key={gap.key}
              gap={gap}
              top={gap.top}
              height={gap.height}
              isCollapsible={gap.isCollapsible}
              isCollapsed={gap.isCollapsed}
              onToggleCollapse={handleToggleCollapse}
              isViewingToday={isViewingToday}
              currentTime={currentTime}
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
                  top: dragGuideTop,
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
              activeCollapsedGaps={activeCollapsedGaps}
              hourHeight={80}
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
    marginTop: 6,
  },
  timelineGridWrapper: {
    position: "relative",
    width: "100%",
  },
  absoluteBlocksContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 65, // Leaves 65pt on the left for right-aligned hour labels
    right: 0,
  },
  dragGuideCard: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  dragGuideText: {
    fontSize: 12,
    fontWeight: "700",
  },
  bottomSpacer: {
    height: 48,
  },
});
