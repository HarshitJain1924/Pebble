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
  hoveredMinute?: number | null;
  hoveredTargetTime?: any | null;
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
  hoveredMinute,
  hoveredTargetTime,
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

  const dragGuideLayout = useMemo(() => {
    if (!hoveredTargetTime && hoveredHour === null) return null;
    const startMinutes = hoveredTargetTime
      ? hoveredTargetTime.startMinutes
      : (hoveredHour ?? 0) * 60 + (hoveredMinute ?? 0);
    const durationMinutes = hoveredTargetTime
      ? hoveredTargetTime.durationMinutes
      : activeDragItem?.durationMinutes || 60;

    const top = calculateTimeYCoordinate(startMinutes, activeCollapsedGaps, 80);
    const bottom = calculateTimeYCoordinate(
      Math.min(1440, startMinutes + durationMinutes),
      activeCollapsedGaps,
      80,
    );
    const height = Math.max(36, bottom - top);

    return {
      top,
      height,
      timeLabel: hoveredTargetTime?.timeRangeLabel,
      durationLabel: hoveredTargetTime?.durationLabel,
      title: activeDragItem?.title,
    };
  }, [hoveredTargetTime, hoveredHour, hoveredMinute, activeDragItem, activeCollapsedGaps]);

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

          {/* Snappable minute-accurate drag outline guide */}
          {isDragging && dragGuideLayout && activeDragItem && (
            <View
              style={[
                styles.dragGuideCard,
                {
                  top: dragGuideLayout.top,
                  height: dragGuideLayout.height,
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
                numberOfLines={1}
              >
                {dragGuideLayout.timeLabel
                  ? `${dragGuideLayout.timeLabel}${dragGuideLayout.durationLabel ? ` · ${dragGuideLayout.durationLabel}` : ""}`
                  : `Move to ${hoveredHour === 12 ? 12 : (hoveredHour ?? 0) % 12}:00 ${(hoveredHour ?? 0) >= 12 ? "PM" : "AM"}`}
              </Text>
              {dragGuideLayout.title && (
                <Text
                  style={[
                    styles.dragGuideSubtext,
                    { color: isLight ? "#475569" : "#94A3B8" },
                  ]}
                  numberOfLines={1}
                >
                  {dragGuideLayout.title}
                </Text>
              )}
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
  dragGuideSubtext: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  bottomSpacer: {
    height: 48,
  },
});
