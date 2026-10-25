jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(),
    volume: 0.5,
    currentTime: 0,
    duration: 0,
    playing: false,
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        const cleanup = cb();
        return () => {
          if (typeof cleanup === "function") cleanup();
        };
      }, [cb]);
    },
  };
});

jest.mock("@/repositories", () => ({
  FocusStatsRepository: {
    addFocusMinutes: jest.fn(async () => ({ completedToday: 0, totalFocusTime: 0 })),
    creditCompletedSession: jest.fn(async () => ({
      credited: true,
      stats: { completedToday: 1, totalFocusTime: 25 },
    })),
  },
  GraphRepository: {
    getFocusSessions: jest.fn(async () => []),
    saveFocusSession: jest.fn(async () => undefined),
    saveRelationship: jest.fn(async () => undefined),
  },
  HabitRepository: { getHabits: jest.fn(async () => ({})) },
  TaskRepository: { getTasks: jest.fn(async () => ({})) },
  WorkspaceRepository: { getWorkspaces: jest.fn(async () => []) },
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    recordFocusSession: jest.fn(),
    completeTask: jest.fn(async () => undefined),
    recoverHabitStreak: jest.fn(async () => undefined),
  },
}));

jest.mock("@/services/storage/storage.service", () => ({
  getRecycleBinItems: jest.fn(async () => []),
  saveRecycleBinItems: jest.fn(async () => undefined),
}));

jest.mock("@/services/analytics/widget-data.service", () => ({
  syncWidgetData: jest.fn(async () => undefined),
}));

import React from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, create } from "react-test-renderer";

import { useFocusState } from "@/features/focus/hooks/useFocusState";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { emitStateChange } from "@/services/events/state-events";

const CURRENT_SESSION_KEY = "todoapp:focus:current_session";
const CURRENT_STOPWATCH_KEY = "todoapp:focus:current_stopwatch";
const PENDING_STOPWATCH_KEY = "todoapp:focus:pending_stopwatch_session";
const recordFocusSession = EntityCommandService.recordFocusSession as jest.Mock;
const mounted: any[] = [];

let latestApi: any = null;

function Harness() {
  latestApi = useFocusState();
  return null;
}

const flush = async (rounds = 3) => {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const mountHook = async () => {
  let renderer: any;
  await act(async () => {
    renderer = create(<Harness />);
  });
  await flush();
  mounted.push(renderer);
  return renderer;
};

async function seedExpiredSession(startTime: number) {
  await AsyncStorage.setItem(
    CURRENT_SESSION_KEY,
    JSON.stringify({
      type: "work",
      startTime,
      duration: 25 * 60,
      elapsedBeforeStart: 0,
      isActive: true,
      breakType: "short",
      focusedTaskId: null,
      loggedMinutes: 0,
      lastSaved: startTime,
    }),
  );
}

async function seedStoppedStopwatch(startTime: number, elapsed: number) {
  await AsyncStorage.setItem(
    CURRENT_STOPWATCH_KEY,
    JSON.stringify({
      startTime,
      elapsedBeforeStart: elapsed,
      isRunning: false,
      laps: [],
    }),
  );
}

describe("focus stopwatch completion durability", () => {
  const now = 1_700_000_100_000;
  const startTime = now - 45_000;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    latestApi = null;
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    mounted.forEach((renderer) => {
      act(() => {
        renderer.unmount();
      });
    });
    mounted.length = 0;
    jest.restoreAllMocks();
  });

  it("persists a recovery record before dropping the live stopwatch state", async () => {
    await seedStoppedStopwatch(startTime, 45);
    await mountHook();
    jest.spyOn(Date, "now").mockReturnValue(now);
    recordFocusSession.mockRejectedValueOnce(new Error("disk full"));

    await act(async () => {
      await latestApi.swReset();
    });
    await flush();

    // The session was attempted with the stable id ...
    expect(recordFocusSession).toHaveBeenCalledWith(
      45,
      undefined,
      undefined,
      expect.objectContaining({ sessionId: `focus_sw_${startTime}` }),
    );
    // ... and the failed attempt left both a marker and no live stopwatch.
    const pending = await AsyncStorage.getItem(PENDING_STOPWATCH_KEY);
    expect(pending).not.toBeNull();
    expect(JSON.parse(pending!)).toEqual({
      sessionId: `focus_sw_${startTime}`,
      startedAt: startTime,
      endedAt: now,
      durationSeconds: 45,
    });
    expect(await AsyncStorage.getItem(CURRENT_STOPWATCH_KEY)).toBeNull();
  });

  it("recovers the pending stopwatch session exactly once on the next sync", async () => {
    await seedStoppedStopwatch(startTime, 45);
    await mountHook();
    jest.spyOn(Date, "now").mockReturnValue(now);
    recordFocusSession
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);

    await act(async () => {
      await latestApi.swReset();
    });
    await flush();
    expect(await AsyncStorage.getItem(PENDING_STOPWATCH_KEY)).not.toBeNull();

    // Same recovery path used on mount/foreground.
    await act(async () => {
      emitStateChange("focus_changed", "test_foreground");
    });
    await flush();

    expect(recordFocusSession).toHaveBeenCalledTimes(2);
    const ids = recordFocusSession.mock.calls.map((call) => call[3]?.sessionId);
    expect(ids).toEqual([`focus_sw_${startTime}`, `focus_sw_${startTime}`]);
    expect(await AsyncStorage.getItem(PENDING_STOPWATCH_KEY)).toBeNull();

    // A third trigger must not record the already-committed session again.
    await act(async () => {
      emitStateChange("focus_changed", "test_foreground");
    });
    await flush();
    expect(recordFocusSession).toHaveBeenCalledTimes(2);
  });

  it("refuses to clear the stopwatch when its recovery record cannot be written", async () => {
    await seedStoppedStopwatch(startTime, 45);
    await mountHook();
    jest.spyOn(Date, "now").mockReturnValue(now);

    const setItem = AsyncStorage.setItem as unknown as jest.Mock;
    const original = setItem.getMockImplementation();
    setItem.mockImplementation(async (key: string, value: string) => {
      if (key === PENDING_STOPWATCH_KEY) {
        throw new Error("disk failure writing recovery record");
      }
      return original ? original(key, value) : undefined;
    });

    await act(async () => {
      await latestApi.swReset();
    });
    setItem.mockImplementation(original as any);

    // Nothing was recorded for a session that has no recovery path, and the
    // live stopwatch record still owns the elapsed time.
    expect(recordFocusSession).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(CURRENT_STOPWATCH_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(PENDING_STOPWATCH_KEY)).toBeNull();
  });

  it("a stopwatch under ten seconds records nothing and leaves no marker", async () => {
    await seedStoppedStopwatch(startTime, 9);
    await mountHook();
    jest.spyOn(Date, "now").mockReturnValue(now);

    await act(async () => {
      await latestApi.swReset();
    });
    await flush();

    expect(recordFocusSession).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(CURRENT_STOPWATCH_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_STOPWATCH_KEY)).toBeNull();
  });
});

describe("focus timer completion durability", () => {
  const startTime = 1_700_000_000_000;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    // Unmount so a previous test's recovery listener cannot react to this
    // test's events (the event bus is a module-level singleton).
    mounted.forEach((renderer) => {
      act(() => {
        renderer.unmount();
      });
    });
    mounted.length = 0;
    jest.restoreAllMocks();
  });

  it("keeps the recovery record when persistence fails", async () => {
    await seedExpiredSession(startTime);
    recordFocusSession.mockRejectedValueOnce(new Error("disk full"));

    await mountHook();

    expect(recordFocusSession).toHaveBeenCalledTimes(1);
    expect(recordFocusSession).toHaveBeenCalledWith(
      25 * 60,
      undefined,
      "task",
      expect.objectContaining({ sessionId: `focus_timer_${startTime}` }),
    );
    // Durable commit never happened, so the marker must survive for retry.
    expect(await AsyncStorage.getItem(CURRENT_SESSION_KEY)).not.toBeNull();
  });

  it("commits on retry, clears the marker, and never re-records afterwards", async () => {
    await seedExpiredSession(startTime);
    recordFocusSession
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);

    await mountHook();
    expect(recordFocusSession).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(CURRENT_SESSION_KEY)).not.toBeNull();

    // Same recovery path that runs when the app returns to the foreground.
    await act(async () => {
      emitStateChange("focus_changed", "test_foreground");
    });
    await flush();

    expect(recordFocusSession).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem(CURRENT_SESSION_KEY)).toBeNull();

    // Repeated recovery of an already-completed session must be a no-op.
    await act(async () => {
      emitStateChange("focus_changed", "test_foreground");
    });
    await flush();

    expect(recordFocusSession).toHaveBeenCalledTimes(2);
    const ids = recordFocusSession.mock.calls.map(
      (call) => call[3]?.sessionId,
    );
    expect(ids).toEqual([
      `focus_timer_${startTime}`,
      `focus_timer_${startTime}`,
    ]);
  });
});
