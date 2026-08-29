jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { EntityCommandService } from "../EntityCommandService";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID, Workspace } from "@/shared/types/domain.types";

// Mock dependencies
jest.mock("@/repositories/WorkspaceRepository", () => ({
  WorkspaceRepository: {
    getWorkspaces: jest.fn(),
    saveWorkspace: jest.fn(),
  },
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(),
}));

describe("Workspace Archive Foundation", () => {
  const mockWorkspace: Workspace = {
    id: "ws-1",
    name: "Test Workspace",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([mockWorkspace]);
  });

  describe("archiveWorkspace", () => {
    it("should set archivedAt on an active workspace", async () => {
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      await EntityCommandService.archiveWorkspace("ws-1");

      expect(WorkspaceRepository.saveWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ws-1",
          archivedAt: now,
          updatedAt: now,
        })
      );
    });

    it("should throw if the workspace does not exist", async () => {
      await expect(EntityCommandService.archiveWorkspace("ws-missing")).rejects.toThrow("Workspace not found");
    });

    it("should throw if archiving a protected workspace", async () => {
      await expect(EntityCommandService.archiveWorkspace(INBOX_WORKSPACE_ID)).rejects.toThrow("Cannot archive protected workspace.");
      await expect(EntityCommandService.archiveWorkspace(MY_PEBBLES_WORKSPACE_ID)).rejects.toThrow("Cannot archive protected workspace.");
    });

    it("should be idempotent and not save if already archived", async () => {
      (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
        { ...mockWorkspace, archivedAt: 1000 },
      ]);

      await EntityCommandService.archiveWorkspace("ws-1");

      expect(WorkspaceRepository.saveWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("restoreWorkspaceArchive", () => {
    it("should clear archivedAt on an archived workspace", async () => {
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
        { ...mockWorkspace, archivedAt: 1000 },
      ]);

      await EntityCommandService.restoreWorkspaceArchive("ws-1");

      expect(WorkspaceRepository.saveWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ws-1",
          archivedAt: undefined,
          updatedAt: now,
        })
      );
    });

    it("should throw if the workspace does not exist", async () => {
      await expect(EntityCommandService.restoreWorkspaceArchive("ws-missing")).rejects.toThrow("Workspace not found");
    });

    it("should be idempotent and not save if already active", async () => {
      (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([mockWorkspace]);

      await EntityCommandService.restoreWorkspaceArchive("ws-1");

      expect(WorkspaceRepository.saveWorkspace).not.toHaveBeenCalled();
    });
  });
});
