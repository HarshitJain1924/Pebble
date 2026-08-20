import { TaskRepository } from "../TaskRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("TaskRepository Field Preservation", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("preserves recurrenceExceptions during full AsyncStorage roundtrip", async () => {
    const wsId = "test-workspace";
    const initialTask: Task = {
      id: "test-task",
      title: "Initial Title",
      status: "todo",
      priority: "none",
      workspaceId: wsId,
      recurrenceExceptions: ["2026-08-19", "2026-08-20"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Save Task
    await TaskRepository.saveTask(initialTask);

    // 2. Load it through TaskRepository
    let tasks = await TaskRepository.getTasks(wsId);
    let loadedTask = tasks["test-task"];
    
    expect(loadedTask).toBeDefined();
    expect(loadedTask.recurrenceExceptions).toEqual(["2026-08-19", "2026-08-20"]);

    // 3. Modify unrelated field
    loadedTask.title = "Updated Title";

    // 4. Save modified Task
    await TaskRepository.saveTask(loadedTask);

    // 5. Load it again
    tasks = await TaskRepository.getTasks(wsId);
    loadedTask = tasks["test-task"];

    // 6. Assert recurrenceExceptions unchanged
    expect(loadedTask.recurrenceExceptions).toEqual(["2026-08-19", "2026-08-20"]);
    
    // 7. Assert unrelated field changed
    expect(loadedTask.title).toBe("Updated Title");
  });
});
