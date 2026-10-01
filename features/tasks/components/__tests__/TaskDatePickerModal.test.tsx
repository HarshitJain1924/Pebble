import React from "react";
import { act, create } from "react-test-renderer";
import { TaskDatePickerModal } from "../TaskDatePickerModal";
import { Colors } from "@/shared/constants/theme";
import { getTodayDateKey, getOffsetDateKey } from "@/shared/utils/date-key";
import PressableScale from "@/shared/components/ui/PressableScale";
import { TouchableOpacity } from "react-native";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Feather: (props: any) => React.createElement(View, { testID: `feather-${props.name}`, ...props }),
  };
});

jest.mock("react-native-calendars", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Calendar: (props: any) =>
      React.createElement(View, { testID: "mock-calendar", ...props }),
  };
});

describe("TaskDatePickerModal", () => {
  const todayKey = getTodayDateKey();
  const mockColors = Colors.dark;

  it("renders when visible and triggers onClose on close button press", () => {
    const onClose = jest.fn();
    const onSelectDate = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <TaskDatePickerModal
          visible={true}
          onClose={onClose}
          selectedDate={todayKey}
          onSelectDate={onSelectDate}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const closeButtons = root.root.findAll(
      (node: any) =>
        node.type === TouchableOpacity &&
        node.props.accessibilityLabel === "Close date picker"
    );
    expect(closeButtons.length).toBe(1);

    act(() => {
      closeButtons[0].props.onPress();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSelectDate and onClose when a quick jump preset is pressed", () => {
    const onClose = jest.fn();
    const onSelectDate = jest.fn();
    const yesterdayKey = getOffsetDateKey(1, todayKey);

    let root: any;
    act(() => {
      root = create(
        <TaskDatePickerModal
          visible={true}
          onClose={onClose}
          selectedDate={todayKey}
          onSelectDate={onSelectDate}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const yesterdayBtn = root.root.findByProps({
      accessibilityLabel: "Select Yesterday",
    });
    expect(yesterdayBtn).toBeDefined();

    act(() => {
      yesterdayBtn.props.onPress();
    });
    expect(onSelectDate).toHaveBeenCalledWith(yesterdayKey);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSelectDate and onClose when calendar triggers dayPress", () => {
    const onClose = jest.fn();
    const onSelectDate = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <TaskDatePickerModal
          visible={true}
          onClose={onClose}
          selectedDate={todayKey}
          onSelectDate={onSelectDate}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const calendar = root.root.findByProps({ testID: "mock-calendar" });
    expect(calendar).toBeDefined();

    act(() => {
      calendar.props.onDayPress({ dateString: "2026-10-15" });
    });
    expect(onSelectDate).toHaveBeenCalledWith("2026-10-15");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows jump to today button when selectedDate is not today", () => {
    const onClose = jest.fn();
    const onSelectDate = jest.fn();
    const tomorrowKey = getOffsetDateKey(-1, todayKey);

    let root: any;
    act(() => {
      root = create(
        <TaskDatePickerModal
          visible={true}
          onClose={onClose}
          selectedDate={tomorrowKey}
          onSelectDate={onSelectDate}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const todayButton = root.root.findByProps({
      accessibilityLabel: "Jump to today",
    });
    expect(todayButton).toBeDefined();

    act(() => {
      todayButton.props.onPress();
    });
    expect(onSelectDate).toHaveBeenCalledWith(todayKey);
    expect(onClose).toHaveBeenCalled();
  });
});
