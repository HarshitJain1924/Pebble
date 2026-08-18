jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));
const mockTaskDetailContent = jest.fn((_props: any) => null);
jest.mock("@/features/details/task/TaskDetailContent", () => ({
  TaskDetailContent: (props: any) => {
    mockTaskDetailContent(props);
    return null;
  },
}));
const mockHabitDetailContent = jest.fn((_props: any) => null);
jest.mock("@/features/details/habit/HabitDetailContent", () => ({
  HabitDetailContent: (props: any) => {
    mockHabitDetailContent(props);
    return null;
  },
}));

import React from "react";
import { act, create } from "react-test-renderer";

import TaskDetailsScreen from "@/app/task-details";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getDateKey } from "@/services/scheduling/recurrence.service";

const mockRouter = { back: jest.fn(), replace: jest.fn() };

const renderRoute = async (params: Record<string, string>) => {
  (useLocalSearchParams as jest.Mock).mockReturnValue(params);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TaskDetailsScreen />);
  });
  return renderer;
};

describe("task-details route dispatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it("routes type=task to TaskDetailContent with route params", async () => {
    await renderRoute({ id: "t1", type: "task", workspaceId: "ws1", date: "2026-08-18" });
    expect(mockTaskDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t1",
        workspaceId: "ws1",
        selectedOccurrenceDate: "2026-08-18",
      }),
    );
    expect(mockHabitDetailContent).not.toHaveBeenCalled();
  });

  it("routes type=habit to HabitDetailContent with route params", async () => {
    await renderRoute({ id: "h1", type: "habit", workspaceId: "ws2", date: "2026-08-19" });
    expect(mockHabitDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({
        habitId: "h1",
        workspaceId: "ws2",
        selectedOccurrenceDate: "2026-08-19",
      }),
    );
    expect(mockTaskDetailContent).not.toHaveBeenCalled();
  });

  it("infers habit when type is omitted and the id starts with habit-", async () => {
    await renderRoute({ id: "habit-abc" });
    expect(mockHabitDetailContent).toHaveBeenCalled();
    expect(mockTaskDetailContent).not.toHaveBeenCalled();
  });

  it("defaults to task when type is omitted and the id does not look like a habit", async () => {
    await renderRoute({ id: "task-123" });
    expect(mockTaskDetailContent).toHaveBeenCalled();
    expect(mockHabitDetailContent).not.toHaveBeenCalled();
  });

  it("defaults the occurrence date to today when no date param is present", async () => {
    await renderRoute({ id: "t1", type: "task" });
    expect(mockTaskDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({ selectedOccurrenceDate: getDateKey() }),
    );
  });

  it("wires Task back and convert callbacks to the router", async () => {
    await renderRoute({ id: "t1", type: "task" });
    const props = mockTaskDetailContent.mock.calls[0][0];

    await act(async () => {
      props.onBack();
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);

    await act(async () => {
      props.onConvertedToHabit("habit-new");
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/task-details?id=habit-new&type=habit",
    );
  });

  it("wires Habit back and convert callbacks to the router", async () => {
    await renderRoute({ id: "h1", type: "habit" });
    const props = mockHabitDetailContent.mock.calls[0][0];

    await act(async () => {
      props.onBack();
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);

    await act(async () => {
      props.onConvertedToTask("task-new");
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/task-details?id=task-new&type=task",
    );
  });

  it("does not render both entity contents at once", async () => {
    await renderRoute({ id: "x1", type: "task" });
    await renderRoute({ id: "y1", type: "habit" });
    // Each render dispatches to exactly one content implementation.
    expect(mockTaskDetailContent).toHaveBeenCalledTimes(1);
    expect(mockHabitDetailContent).toHaveBeenCalledTimes(1);
  });
});
