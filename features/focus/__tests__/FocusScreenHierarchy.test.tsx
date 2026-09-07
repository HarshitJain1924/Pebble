import React from "react";
import { ScrollView } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock("@/shared/components/layout/ScreenSwipeWrapper", () => ({
  ScreenSwipeWrapper: ({ children }: any) => children,
}));

// Mock useFocusState with configurable mode
const mockFocusState = {
  mode: "pomodoro",
  pomodoroMode: "work",
  isActive: false,
  glowEnabled: true,
  sessionTime: 1500,
  totalSessionTime: 1500,
  focusedTaskId: null,
  todoList: [],
  habitList: [],
  swRunning: false,
  swTime: 0,
  swLaps: [],
  showCustomInput: false,
  customMinutes: 25,
  customMinsText: "25",
  breakType: "short",
  selectedSoundId: null,
  likedSoundIds: [],
  showMusicPlayer: false,
  showTaskPicker: false,
  completedToday: 0,
  totalFocusTime: 0,
  averageSessionLength: 0,
  longestSession: 0,
  toggleGlow: jest.fn(),
  setShowMusicPlayer: jest.fn(),
  setShowTaskPicker: jest.fn(),
  setMode: jest.fn(),
  setFocusedTaskId: jest.fn(),
  handleStartPause: jest.fn(),
  handleReset: jest.fn(),
  swStartPause: jest.fn(),
  swReset: jest.fn(),
  swLap: jest.fn(),
  selectDuration: jest.fn(),
  selectCustomDuration: jest.fn(),
  adjustCustomMinutes: jest.fn(),
  handleCustomMinutesChange: jest.fn(),
  handleCustomMinutesSubmitOrBlur: jest.fn(),
  setBreakType: jest.fn(),
  setSessionTime: jest.fn(),
  setTotalSessionTime: jest.fn(),
};

jest.mock("@/features/focus/hooks/useFocusState", () => ({
  useFocusState: () => mockFocusState,
}));

// Mock subcomponents so we can cleanly assert on their hierarchical order
jest.mock("@/features/focus/components/FocusHeader", () => ({
  FocusHeader: "FocusHeader",
}));
jest.mock("@/features/focus/components/ModeSelector", () => ({
  ModeSelector: "ModeSelector",
}));
jest.mock("@/features/focus/components/FocusTargetCard", () => ({
  FocusTargetCard: "FocusTargetCard",
}));
jest.mock("@/features/focus/components/TimerCockpit", () => ({
  TimerCockpit: "TimerCockpit",
}));
jest.mock("@/features/focus/components/FocusStatsCard", () => ({
  FocusStatsCard: "FocusStatsCard",
}));
jest.mock("@/features/focus/components/AmbientSoundBar", () => ({
  AmbientSoundBar: "AmbientSoundBar",
}));
jest.mock("@/features/focus/components/TaskPickerModal", () => ({
  TaskPickerModal: "TaskPickerModal",
}));
jest.mock("@/features/focus/components/MusicPlayerModal", () => ({
  MusicPlayerModal: "MusicPlayerModal",
}));

import FocusScreen from "@/app/(tabs)/focus";

describe("FocusScreen Information Hierarchy", () => {
  it("integrates FocusTargetCard inside TimerCockpit in Pomodoro work mode", () => {
    mockFocusState.mode = "pomodoro";
    mockFocusState.pomodoroMode = "work";

    let renderer: any;
    act(() => {
      renderer = create(<FocusScreen />);
    });

    const root = renderer.root;
    // Find all rendered component instances
    const header = root.findByType("FocusHeader" as any);
    const modeSelector = root.findByType("ModeSelector" as any);
    const timerCockpit = root.findByType("TimerCockpit" as any);
    const ambientSoundBar = root.findByType("AmbientSoundBar" as any);
    const statsCard = root.findByType("FocusStatsCard" as any);

    expect(header).toBeDefined();
    expect(modeSelector).toBeDefined();
    expect(timerCockpit).toBeDefined();
    expect(ambientSoundBar).toBeDefined();
    expect(statsCard).toBeDefined();

    // Verify unified structure: FocusTargetCard is passed to TimerCockpit via targetSlot
    expect(timerCockpit.props.targetSlot).toBeDefined();
    expect(timerCockpit.props.targetSlot.type).toBe("FocusTargetCard");

    // Verify ordering in ScrollView direct children
    const scrollView = root.findByType(ScrollView);
    const children = React.Children.toArray(scrollView.props.children).filter(Boolean) as any[];
    const componentNames = children.map((c: any) => c.type);

    const timerIndex = componentNames.indexOf("TimerCockpit");
    const ambientIndex = componentNames.indexOf("AmbientSoundBar");
    const statsIndex = componentNames.indexOf("FocusStatsCard");

    expect(timerIndex).toBeGreaterThan(-1);
    expect(ambientIndex).toBeGreaterThan(timerIndex);
    expect(statsIndex).toBeGreaterThan(ambientIndex);
  });

  it("omits FocusTargetCard in Stopwatch mode while keeping TimerCockpit and Stats intact", () => {
    mockFocusState.mode = "stopwatch";

    let renderer: any;
    act(() => {
      renderer = create(<FocusScreen />);
    });

    const root = renderer.root;
    const targetCards = root.findAllByType("FocusTargetCard" as any);
    expect(targetCards.length).toBe(0);

    const timerCockpit = root.findByType("TimerCockpit" as any);
    expect(timerCockpit).toBeDefined();
    expect(timerCockpit.props.targetSlot).toBeUndefined();

    const statsCard = root.findByType("FocusStatsCard" as any);
    expect(statsCard).toBeDefined();
  });
});
