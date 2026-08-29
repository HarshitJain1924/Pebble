import { loadWorkspaceData } from "../workspace-data-loader";
import { TaskRepository, HabitRepository, ChecklistRepository, ResourceRepository } from "@/repositories";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@/repositories", () => ({
  TaskRepository: { getTasks: jest.fn() },
  HabitRepository: { getHabits: jest.fn() },
  ChecklistRepository: { getChecklists: jest.fn() },
  ResourceRepository: { getResources: jest.fn() },
}));

describe("workspace-data-loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockWorkspace = (id: string): Workspace => ({
    id,
    name: `Workspace ${id}`,
    emoji: "📁",
    color: "#000",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const mockTask = (id: string, workspaceId: string, updatedAt: number): Task => ({
    id,
    workspaceId,
    title: "Test Task",
    status: "todo",
    priority: "medium",
    categoryId: "work",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: Date.now(),
    updatedAt,
    schedule: {},
  });

  test("deduplicates tasks when they exist in multiple workspace partitions", async () => {
    const ws1 = mockWorkspace("ws-1");
    const ws2 = mockWorkspace("ws-2");
    
    const ghostTask = mockTask("task-multi", "ws-1", 100);
    const authoritativeTask = mockTask("task-multi", "ws-2", 200);

    (TaskRepository.getTasks as jest.Mock).mockImplementation((wsId: string) => {
      if (wsId === "ws-1") return Promise.resolve({ "task-multi": ghostTask });
      if (wsId === "ws-2") return Promise.resolve({ "task-multi": authoritativeTask });
      return Promise.resolve({});
    });
    
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});
    (ResourceRepository.getResources as jest.Mock).mockResolvedValue({});

    const result = await loadWorkspaceData([ws1, ws2]);

    // Ghost should be eliminated, authoritative should remain.
    expect(result.todosMap["ws-1"]).toEqual([]);
    expect(result.todosMap["ws-2"]).toEqual([authoritativeTask]);
  });
});
