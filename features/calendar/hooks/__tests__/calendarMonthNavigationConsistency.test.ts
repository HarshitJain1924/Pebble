import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, []);
    },
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: "Medium" },
  NotificationFeedbackType: { Success: "Success" },
}));

import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";

describe("Calendar Month Navigation and Selected Date Consistency (Fix #14)", () => {
  async function renderCalendarHook() {
    let hookResult: ReturnType<typeof useCalendarState> = null as any;
    function TestComponent() {
      hookResult = useCalendarState();
      return null;
    }
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestComponent));
      await new Promise((r) => setTimeout(r, 10));
    });
    return {
      getHook: () => hookResult,
      unmount: async () => {
        await act(async () => {
          renderer.unmount();
        });
      },
    };
  }

  test("Test A: next month navigation moves selected date into new month", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Start with August 30, 2026
    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });

    expect(getHook().selectedDate).toBe("2026-08-30");
    expect(getHook().month).toEqual({ year: 2026, month: 7 }); // 0-indexed: 7 = August

    // Navigate to next month (September)
    await act(async () => {
      getHook().handleNextMonth();
    });

    expect(getHook().month).toEqual({ year: 2026, month: 8 }); // 8 = September
    expect(getHook().selectedDate).toBe("2026-09-30"); // Valid September date

    unmount();
  });

  test("Test B: previous month navigation moves selected date into previous month", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Start with September 30, 2026
    await act(async () => {
      getHook().setSelectedDate("2026-09-30");
    });

    expect(getHook().selectedDate).toBe("2026-09-30");
    expect(getHook().month).toEqual({ year: 2026, month: 8 });

    // Navigate to previous month (August)
    await act(async () => {
      getHook().handlePrevMonth();
    });

    expect(getHook().month).toEqual({ year: 2026, month: 7 });
    expect(getHook().selectedDate).toBe("2026-08-30");

    unmount();
  });

  test("Test C: month boundary transitions clamp to valid days (e.g. Jan 31 -> Feb 28)", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Start with January 31, 2026
    await act(async () => {
      getHook().setSelectedDate("2026-01-31");
    });

    expect(getHook().selectedDate).toBe("2026-01-31");
    expect(getHook().month).toEqual({ year: 2026, month: 0 }); // 0 = January

    // Navigate to next month (February 2026 has 28 days)
    await act(async () => {
      getHook().handleNextMonth();
    });

    expect(getHook().month).toEqual({ year: 2026, month: 1 }); // 1 = February
    expect(getHook().selectedDate).toBe("2026-02-28"); // Clamped to valid Feb 28, never Feb 31

    unmount();
  });

  test("Test D: explicit month-grid selection sets both selectedDate and displayed month consistently", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-10-15");
    });

    expect(getHook().selectedDate).toBe("2026-10-15");
    expect(getHook().month).toEqual({ year: 2026, month: 9 }); // 9 = October

    unmount();
  });

  test("Test E: year boundary navigation works correctly across Dec -> Jan and Jan -> Dec", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Start at December 31, 2026
    await act(async () => {
      getHook().setSelectedDate("2026-12-31");
    });

    expect(getHook().month).toEqual({ year: 2026, month: 11 }); // 11 = December

    // Next month -> January 2027
    await act(async () => {
      getHook().handleNextMonth();
    });

    expect(getHook().month).toEqual({ year: 2027, month: 0 }); // 0 = January 2027
    expect(getHook().selectedDate).toBe("2027-01-31");

    // Prev month -> December 2026
    await act(async () => {
      getHook().handlePrevMonth();
    });

    expect(getHook().month).toEqual({ year: 2026, month: 11 });
    expect(getHook().selectedDate).toBe("2026-12-31");

    unmount();
  });
});
