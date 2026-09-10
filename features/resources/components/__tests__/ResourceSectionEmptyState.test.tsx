jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  selectionAsync: jest.fn(async () => undefined),
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResourceSection } from "../ResourceSection";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { AppCard } from "@/shared/components/ui/AppCard";
import type { Resource } from "@/shared/types/domain.types";

describe("ResourceSection EmptyState Integration Suite", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const sampleResource: Resource = {
    id: "res-1",
    workspaceId: "ws-1",
    title: "Design System Tokens",
    type: "note",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it("1. Renders contextual EmptyState with mascot when folder has 0 resources", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [] }}
          activeFolderId="ws-1"
        />
      );
    });

    const emptyStates = renderer.root.findAllByType(EmptyState);
    expect(emptyStates.length).toBe(1);
    expect(emptyStates[0].props.title).toBe("No resources yet");
    expect(emptyStates[0].props.mascot).toBe("peek");
    expect(emptyStates[0].props.action.label).toBe("Add Resource");

    // Does not render any resource cards
    const cards = renderer.root.findAllByType(AppCard);
    expect(cards.length).toBe(0);
  });

  it("2. Renders normal resource card content when resources exist", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [sampleResource] }}
          activeFolderId="ws-1"
        />
      );
    });

    const emptyStates = renderer.root.findAllByType(EmptyState);
    expect(emptyStates.length).toBe(0);

    const cards = renderer.root.findAllByType(AppCard);
    expect(cards.length).toBe(1);
  });

  it("3. Distinguishes filtered empty condition from genuinely empty workspace", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [sampleResource] }}
          activeFolderId="ws-1"
          searchQuery="non-existent search term"
        />
      );
    });

    const emptyStates = renderer.root.findAllByType(EmptyState);
    expect(emptyStates.length).toBe(1);
    expect(emptyStates[0].props.title).toBe("No matching resources");
    expect(emptyStates[0].props.mascot).toBeUndefined(); // Uses folder graphic for filter results
  });
});
