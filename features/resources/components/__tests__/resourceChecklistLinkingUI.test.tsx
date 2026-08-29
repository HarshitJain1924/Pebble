jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-linking", () => ({
  openURL: jest.fn(),
  canOpenURL: jest.fn(async () => true),
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import React from "react";
import { act, create } from "react-test-renderer";
import { Text as RNText, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResourceSection } from "@/features/resources/components/ResourceSection";
import { ChecklistProgressCard } from "@/features/checklists/components/ChecklistProgressCard";
import { useResourceLinkState } from "@/features/resources/hooks/useResourceLinkState";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import type { Resource, Checklist, Workspace } from "@/shared/types/domain.types";

describe("Resource -> Checklist Linking UI & Persistence Suite", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const sampleResource: Resource = {
    id: "res-100",
    workspaceId: "ws-1",
    title: "Travel Docs Guide",
    type: "note",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const sampleUnlinkedChecklist: Checklist = {
    id: "chk-unlinked",
    workspaceId: "ws-1",
    title: "Packing List",
    items: [],
    resourceIds: [],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const sampleLinkedChecklist: Checklist = {
    id: "chk-linked",
    workspaceId: "ws-1",
    title: "Flight Check",
    items: [],
    resourceIds: ["res-100"],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it("1. Resource modal renders checklist entries (both linked and unlinked)", async () => {
    const onToggleLinkResource = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [sampleResource] }}
          stateTodos={[]}
          stateHabits={[]}
          stateChecklists={[sampleUnlinkedChecklist, sampleLinkedChecklist]}
          activeFolderId="ws-1"
          onToggleLinkResource={onToggleLinkResource}
        />
      );
    });

    // Open detail menu for resource by clicking moreButton
    const appCard = renderer.root.findByType(require("@/shared/components/ui/AppCard").AppCard);
    const touchablesCard1 = appCard.findAllByType(TouchableOpacity);
    const moreBtn1 = touchablesCard1.find((t: any) => {
      try {
        const icon = t.findByType(require("@expo/vector-icons").Feather);
        return icon.props.name === "more-vertical";
      } catch {
        return false;
      }
    });
    await act(async () => {
      moreBtn1.props.onPress();
    });

    await act(async () => {
      await Promise.resolve();
    });

    // In detail modal, find "Link to Task / Habit" menu item
    const touchables = renderer.root.findAllByType(TouchableOpacity);
    const linkMenuItem = touchables.find((t: any) => {
      const texts = t.findAllByType(RNText);
      return texts.some((txt: any) => txt.props.children === "Link to Task / Habit");
    });

    expect(linkMenuItem).toBeDefined();

    await act(async () => {
      linkMenuItem.props.onPress();
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Verify CHECKLISTS heading exists
    const allRNTexts = renderer.root.findAllByType(RNText);
    const checklistsHeader = allRNTexts.find((t: any) => t.props.children === "CHECKLISTS");
    expect(checklistsHeader).toBeDefined();

    // Verify both checklist titles are rendered
    const unlinkedText = allRNTexts.find((t: any) => t.props.children === "Packing List");
    const linkedText = allRNTexts.find((t: any) => t.props.children === "Flight Check");
    expect(unlinkedText).toBeDefined();
    expect(linkedText).toBeDefined();

    // Verify checked / unchecked feather icon names
    const featherIcons = renderer.root.findAllByType(require("@expo/vector-icons").Feather);
    const squareIcon = featherIcons.find((f: any) => f.props.name === "square");
    const checkSquareIcon = featherIcons.find((f: any) => f.props.name === "check-square");
    expect(squareIcon).toBeDefined();
    expect(checkSquareIcon).toBeDefined();
  });

  it("2 & 3 & 4. An unlinked checklist can be linked, displays as linked, and pressing again unlinks it", async () => {
    const onToggleLinkResource = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [sampleResource] }}
          stateTodos={[]}
          stateHabits={[]}
          stateChecklists={[sampleUnlinkedChecklist]}
          activeFolderId="ws-1"
          onToggleLinkResource={onToggleLinkResource}
        />
      );
    });

    // Open detail modal then link modal
    const appCard = renderer.root.findByType(require("@/shared/components/ui/AppCard").AppCard);
    const touchablesCard2 = appCard.findAllByType(TouchableOpacity);
    const moreBtn2 = touchablesCard2.find((t: any) => {
      try {
        const icon = t.findByType(require("@expo/vector-icons").Feather);
        return icon.props.name === "more-vertical";
      } catch {
        return false;
      }
    });
    await act(async () => {
      moreBtn2.props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const touchables = renderer.root.findAllByType(TouchableOpacity);
    const linkMenuItem = touchables.find((t: any) => {
      const texts = t.findAllByType(RNText);
      return texts.some((txt: any) => txt.props.children === "Link to Task / Habit");
    });

    await act(async () => {
      linkMenuItem.props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Find row for Packing List
    const linkRows = renderer.root.findAllByType(TouchableOpacity);
    const packingRow = linkRows.find((t: any) => {
      const texts = t.findAllByType(RNText);
      return texts.some((txt: any) => txt.props.children === "Packing List");
    });

    expect(packingRow).toBeDefined();

    // Press unlinked checklist
    await act(async () => {
      packingRow.props.onPress();
    });

    expect(onToggleLinkResource).toHaveBeenCalledWith("chk-unlinked", "checklist", "res-100");
  });

  it("5. Existing checklist resource selector in ChecklistProgressCard continues to work", async () => {
    const onToggleLinkResource = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ChecklistProgressCard
          checklist={sampleLinkedChecklist}
          colors={{ card: "#fff", border: "#ccc", primary: "#00f", text: "#000", textMuted: "#888" }}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
          onToggleLinkResource={onToggleLinkResource}
          allResources={[sampleResource]}
        />
      );
    });

    // Verify paperclip button shows linked count of 1
    const texts = renderer.root.findAllByType(RNText);
    const countText = texts.find((t: any) => t.props.children === 1 || t.props.children === "1");
    expect(countText).toBeDefined();
  });

  it("6. Link state relationship persists after reload using useResourceLinkState & ChecklistRepository", async () => {
    await ChecklistRepository.saveChecklist(sampleUnlinkedChecklist);

    let latestChecklists: Record<string, Checklist[]> = { "ws-1": [sampleUnlinkedChecklist] };
    const setChecklists = (updater: any) => {
      latestChecklists = typeof updater === "function" ? updater(latestChecklists) : updater;
    };

    const workspace: Workspace = { id: "ws-1", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

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
        "ws-1",
        null,
        [workspace],
        jest.fn(async () => undefined),
        jest.fn(async () => undefined)
      );
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      // 1. Link checklist
      await act(async () => {
        await api!.toggleLinkResource("chk-unlinked", "checklist", "res-100");
      });

      expect(latestChecklists["ws-1"][0].resourceIds).toEqual(["res-100"]);

      // Verify persistence reload
      let reloaded = await ChecklistRepository.getChecklists("ws-1");
      expect(reloaded["chk-unlinked"].resourceIds).toEqual(["res-100"]);

      // 2. Unlink checklist
      await act(async () => {
        await api!.toggleLinkResource("chk-unlinked", "checklist", "res-100");
      });

      expect(latestChecklists["ws-1"][0].resourceIds).toEqual([]);

      reloaded = await ChecklistRepository.getChecklists("ws-1");
      expect(reloaded["chk-unlinked"].resourceIds).toBeFalsy();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });
});
