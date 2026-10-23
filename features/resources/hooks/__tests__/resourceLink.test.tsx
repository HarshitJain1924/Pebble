jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
import React from "react";
import { act, create } from "react-test-renderer";
import { useResourceLinkState } from "@/features/resources/hooks/useResourceLinkState";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
} from "@/repositories";
import type { Habit, Task, Workspace, Checklist } from "@/shared/types/domain.types";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));

jest.mock("@/repositories", () => ({
  TaskRepository: {
    getTasks: jest.fn(),
  },
  HabitRepository: {
    getHabits: jest.fn(),
  },
  ChecklistRepository: {
    getChecklists: jest.fn(),
  },
  ResourceRepository: {
    getResource: jest.fn(),
    saveResource: jest.fn(),
  },
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    updateTask: jest.fn(),
    updateHabit: jest.fn(),
    updateChecklist: jest.fn(),
  },
}));

const workspace: Workspace = {
  id: "ws",
  name: "Workspace",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

const task: Task = {
  id: "task-1",
  workspaceId: "ws",
  title: "Test Task",
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

const habit: Habit = {
  id: "habit-1",
  workspaceId: "ws",
  title: "Test Habit",
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

const checklist: Checklist = {
  id: "checklist-1",
  workspaceId: "ws",
  title: "Test Checklist",
  priority: "none",
  items: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe("useResourceLinkState — Regression tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ResourceRepository.getResource as jest.Mock).mockResolvedValue({
      id: "resource-1",
      workspaceId: "ws",
      title: "Test Resource",
      type: "note",
      linkedItemCount: 1,
    });
    (ResourceRepository.saveResource as jest.Mock).mockResolvedValue(undefined);
  });

  describe("Missing entity handling (Ghost entity prevention)", () => {
    test("does not fabricate task or call updateTask when task is missing in repository; cleans up stale local state", async () => {
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      let latestTodos: Record<string, Task[]> = { ws: [task] };
      const setTodos = jest.fn((updater: any) => {
        latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          latestTodos,
          setTodos,
          [],
          jest.fn(),
          {},
          jest.fn(),
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("task-1", "task", "resource-1");
        });

        expect(EntityCommandService.updateTask).not.toHaveBeenCalled();
        expect(setTodos).toHaveBeenCalled();
        expect(latestTodos.ws).toEqual([]);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });

    test("does not fabricate habit or call updateHabit when habit is missing in repository; cleans up stale local state", async () => {
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      let latestHabits: Habit[] = [habit];
      const setHabits = jest.fn((updater: any) => {
        latestHabits = typeof updater === "function" ? updater(latestHabits) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          {},
          jest.fn(),
          latestHabits,
          setHabits,
          {},
          jest.fn(),
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("habit-1", "habit", "resource-1");
        });

        expect(EntityCommandService.updateHabit).not.toHaveBeenCalled();
        expect(setHabits).toHaveBeenCalled();
        expect(latestHabits).toEqual([]);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });

    test("does not fabricate checklist or call updateChecklist when checklist is missing in repository; cleans up stale local state", async () => {
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});
      let latestChecklists: Record<string, Checklist[]> = { ws: [checklist] };
      const setChecklists = jest.fn((updater: any) => {
        latestChecklists =
          typeof updater === "function" ? updater(latestChecklists) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          {},
          jest.fn(),
          [],
          jest.fn(),
          latestChecklists,
          setChecklists,
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("checklist-1", "checklist", "resource-1");
        });

        expect(EntityCommandService.updateChecklist).not.toHaveBeenCalled();
        expect(setChecklists).toHaveBeenCalled();
        expect(latestChecklists.ws).toEqual([]);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });
  });

  describe("Successful link and unlink operations", () => {
    test("successfully links resource to task via EntityCommandService.updateTask and updates local state", async () => {
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
        "task-1": task,
      });
      const updatedTaskFromCommand: Task = {
        ...task,
        resourceIds: ["resource-1"],
        revision: 2,
        updatedAt: 100,
      };
      (EntityCommandService.updateTask as jest.Mock).mockResolvedValue(
        updatedTaskFromCommand,
      );

      let latestTodos: Record<string, Task[]> = { ws: [task] };
      const setTodos = jest.fn((updater: any) => {
        latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          latestTodos,
          setTodos,
          [],
          jest.fn(),
          {},
          jest.fn(),
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("task-1", "task", "resource-1");
        });

        expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
          "task-1",
          "ws",
          { resourceIds: ["resource-1"] },
          { skipAnalytics: true, skipEvents: true },
        );
        expect(latestTodos.ws[0]).toEqual(updatedTaskFromCommand);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });

    test("successfully unlinks resource from task when already linked", async () => {
      const taskWithResource: Task = {
        ...task,
        resourceIds: ["resource-1", "resource-2"],
      };
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
        "task-1": taskWithResource,
      });
      const unlinkedTaskFromCommand: Task = {
        ...task,
        resourceIds: ["resource-2"],
        revision: 3,
        updatedAt: 200,
      };
      (EntityCommandService.updateTask as jest.Mock).mockResolvedValue(
        unlinkedTaskFromCommand,
      );

      let latestTodos: Record<string, Task[]> = { ws: [taskWithResource] };
      const setTodos = jest.fn((updater: any) => {
        latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          latestTodos,
          setTodos,
          [],
          jest.fn(),
          {},
          jest.fn(),
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("task-1", "task", "resource-1");
        });

        expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
          "task-1",
          "ws",
          { resourceIds: ["resource-2"] },
          { skipAnalytics: true, skipEvents: true },
        );
        expect(latestTodos.ws[0]).toEqual(unlinkedTaskFromCommand);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });

    test("successfully links resource to habit via EntityCommandService.updateHabit", async () => {
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({
        "habit-1": habit,
      });
      const updatedHabitFromCommand: Habit = {
        ...habit,
        resourceIds: ["resource-1"],
        revision: 2,
        updatedAt: 100,
      };
      (EntityCommandService.updateHabit as jest.Mock).mockResolvedValue(
        updatedHabitFromCommand,
      );

      let latestHabits: Habit[] = [habit];
      const setHabits = jest.fn((updater: any) => {
        latestHabits = typeof updater === "function" ? updater(latestHabits) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          {},
          jest.fn(),
          latestHabits,
          setHabits,
          {},
          jest.fn(),
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("habit-1", "habit", "resource-1");
        });

        expect(EntityCommandService.updateHabit).toHaveBeenCalledWith(
          "habit-1",
          "ws",
          { resourceIds: ["resource-1"] },
          { skipAnalytics: true, skipEvents: true },
        );
        expect(latestHabits[0]).toEqual(updatedHabitFromCommand);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });

    test("successfully links resource to checklist via EntityCommandService.updateChecklist", async () => {
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
        "checklist-1": checklist,
      });
      const updatedChecklistFromCommand: Checklist = {
        ...checklist,
        resourceIds: ["resource-1"],
        revision: 2,
        updatedAt: 100,
      };
      (EntityCommandService.updateChecklist as jest.Mock).mockResolvedValue(
        updatedChecklistFromCommand,
      );

      let latestChecklists: Record<string, Checklist[]> = { ws: [checklist] };
      const setChecklists = jest.fn((updater: any) => {
        latestChecklists =
          typeof updater === "function" ? updater(latestChecklists) : updater;
      });

      let api: ReturnType<typeof useResourceLinkState> | undefined;
      function Harness() {
        api = useResourceLinkState(
          {},
          jest.fn(),
          [],
          jest.fn(),
          latestChecklists,
          setChecklists,
          {},
          "ws",
          null,
          [workspace],
        );
        return null;
      }

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(Harness));
      });

      try {
        await act(async () => {
          await api!.toggleLinkResource("checklist-1", "checklist", "resource-1");
        });

        expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
          "checklist-1",
          "ws",
          { resourceIds: ["resource-1"] },
          { skipAnalytics: true, skipEvents: true },
        );
        expect(latestChecklists.ws[0]).toEqual(updatedChecklistFromCommand);
      } finally {
        act(() => {
          renderer.unmount();
        });
      }
    });
  });
});
