import { useEffect, useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";

export interface UseLiveClockOptions {
  /**
   * Refresh interval in milliseconds.
   * Defaults to 60,000ms (1 minute).
   */
  intervalMs?: number;

  /**
   * When true, synchronizes the first tick with the next natural minute boundary
   * (second 00) so state changes (e.g. 2:30:00) trigger promptly.
   * Defaults to true.
   */
  syncToMinuteBoundary?: boolean;
}

/**
 * Lightweight, battery-conscious clock hook for time-reactive UI (e.g. Pebble NOW).
 *
 * Design constraints:
 * - Updates once per minute (never every second).
 * - Immediately refreshes on screen focus (via useFocusEffect).
 * - Syncs to the minute boundary.
 * - Completely cleans up timeouts and intervals on unmount.
 */
export function useLiveClock({
  intervalMs = 60000,
  syncToMinuteBoundary = true,
}: UseLiveClockOptions = {}): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  // Immediate refresh when the screen regains focus
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, []),
  );

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (syncToMinuteBoundary) {
      const nowMs = Date.now();
      const msUntilNextMinute = 60000 - (nowMs % 60000) + 50; // slight 50ms buffer past boundary
      timeoutId = setTimeout(() => {
        setNow(new Date());
        intervalId = setInterval(() => {
          setNow(new Date());
        }, intervalMs);
      }, msUntilNextMinute);
    } else {
      intervalId = setInterval(() => {
        setNow(new Date());
      }, intervalMs);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalMs, syncToMinuteBoundary]);

  return now;
}
