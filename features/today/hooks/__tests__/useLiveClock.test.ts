import React from "react";
import { create, act } from "react-test-renderer";
import { useLiveClock } from "../useLiveClock";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => {
    const r = require("react");
    r.useEffect(() => {
      cb();
    }, [cb]);
  },
}));

function ClockTestHarness({
  onTick,
  syncToMinuteBoundary = false,
  intervalMs = 60000,
}: {
  onTick: (time: Date) => void;
  syncToMinuteBoundary?: boolean;
  intervalMs?: number;
}) {
  const clock = useLiveClock({ syncToMinuteBoundary, intervalMs });
  React.useEffect(() => {
    onTick(clock);
  }, [clock, onTick]);
  return null;
}

describe("useLiveClock hook", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial Date and advances on interval without minute sync", () => {
    const startTime = new Date(2026, 8, 12, 14, 0, 0);
    jest.setSystemTime(startTime);

    let latestTime: Date = startTime;
    const onTick = jest.fn((time: Date) => {
      latestTime = time;
    });

    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(ClockTestHarness, {
          onTick,
          syncToMinuteBoundary: false,
          intervalMs: 60000,
        }),
      );
    });

    expect(latestTime.getTime()).toBe(startTime.getTime());

    // Advance 60 seconds
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(latestTime.getTime()).toBe(startTime.getTime() + 60000);
    act(() => {
      renderer.unmount();
    });
  });

  it("synchronizes to minute boundary and continues ticking", () => {
    // Current time at 14:00:40 (40 seconds into the minute)
    const startTime = new Date(2026, 8, 12, 14, 0, 40);
    jest.setSystemTime(startTime);

    let latestTime: Date = startTime;
    const onTick = jest.fn((time: Date) => {
      latestTime = time;
    });

    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(ClockTestHarness, {
          onTick,
          syncToMinuteBoundary: true,
          intervalMs: 60000,
        }),
      );
    });

    expect(latestTime.getTime()).toBe(startTime.getTime());

    // Advance 20 seconds + buffer to cross into 14:01:00
    act(() => {
      jest.advanceTimersByTime(20050);
    });

    expect(latestTime.getMinutes()).toBe(1);

    // Advance another full minute
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(latestTime.getMinutes()).toBe(2);
    act(() => {
      renderer.unmount();
    });
  });

  it("cleans up timer on unmount", () => {
    const startTime = new Date(2026, 8, 12, 14, 0, 0);
    jest.setSystemTime(startTime);

    let tickCount = 0;
    const onTick = jest.fn(() => {
      tickCount++;
    });

    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(ClockTestHarness, {
          onTick,
          syncToMinuteBoundary: false,
          intervalMs: 60000,
        }),
      );
    });

    const ticksBeforeUnmount = tickCount;
    act(() => {
      renderer.unmount();
    });

    act(() => {
      jest.advanceTimersByTime(120000);
    });

    expect(tickCount).toBe(ticksBeforeUnmount);
  });
});
