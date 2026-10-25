/**
 * Pure timeline layout utilities for computing deterministic overlapping columns
 * across Day and Week views.
 */

export interface SchedulableTimelineItem {
  id: string;
  startHour?: number;
  startMinute?: number;
  durationMinutes: number;
  [key: string]: any;
}

export interface TimedItemWithLayout<T extends SchedulableTimelineItem> {
  item: T;
  colIdx: number;
  totalCols: number;
}

/**
 * Computes non-overlapping horizontal subdivisions for concurrent calendar items.
 * Guaranteed to produce deterministic colIdx (0..totalCols-1) and totalCols >= 1.
 */
export function calculateTimelineItemColumns<T extends SchedulableTimelineItem>(
  items: T[],
): Array<T & { colIdx: number; totalCols: number }> {
  const timed = items.filter(
    (item) => item.startHour !== undefined && item.startMinute !== undefined,
  );

  if (timed.length === 0) return [];

  const sorted = [...timed].sort((a, b) => {
    const startA = (a.startHour ?? 0) * 60 + (a.startMinute ?? 0);
    const startB = (b.startHour ?? 0) * 60 + (b.startMinute ?? 0);
    if (startA !== startB) return startA - startB;
    return (b.durationMinutes || 0) - (a.durationMinutes || 0);
  });

  // 1. Group overlapping items into connected clusters
  const clusters: T[][] = [];
  for (const item of sorted) {
    const start = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
    const end = start + (item.durationMinutes || 30);

    let placedInCluster = false;
    for (const cluster of clusters) {
      const overlapsCluster = cluster.some((cItem) => {
        const cStart = (cItem.startHour ?? 0) * 60 + (cItem.startMinute ?? 0);
        const cEnd = cStart + (cItem.durationMinutes || 30);
        return start < cEnd && cStart < end;
      });
      if (overlapsCluster) {
        cluster.push(item);
        placedInCluster = true;
        break;
      }
    }
    if (!placedInCluster) {
      clusters.push([item]);
    }
  }

  // 2. Assign column indices within each cluster
  return clusters.flatMap((cluster) => {
    const columns: T[][] = [];
    const itemColMap = new Map<string, number>();

    for (const item of cluster) {
      const start = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
      const end = start + (item.durationMinutes || 30);

      let colIdx = 0;
      while (true) {
        if (!columns[colIdx]) {
          columns[colIdx] = [item];
          itemColMap.set(item.id, colIdx);
          break;
        }

        const overlapsExisting = columns[colIdx].some((cItem) => {
          const cStart = (cItem.startHour ?? 0) * 60 + (cItem.startMinute ?? 0);
          const cEnd = cStart + (cItem.durationMinutes || 30);
          return start < cEnd && cStart < end;
        });

        if (!overlapsExisting) {
          columns[colIdx].push(item);
          itemColMap.set(item.id, colIdx);
          break;
        }
        colIdx++;
      }
    }

    const totalCols = Math.max(1, columns.length);
    return cluster.map((item) => {
      const colIdx = itemColMap.get(item.id) || 0;
      return {
        ...item,
        colIdx,
        totalCols,
      };
    });
  });
}
