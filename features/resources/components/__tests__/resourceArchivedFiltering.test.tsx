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
import { ResourceSection } from "../ResourceSection";
import { AppCard } from "@/shared/components/ui/AppCard";
import { applyResourceFilters } from "@/features/workspaces/hooks/useDomainFilters";
import type { ResourceStatusFilter } from "@/features/resources/components/ResourceFilterModal";
import type { Resource } from "@/shared/types/domain.types";

describe("Resource Archived Filtering Regression Suite (Phase 1A)", () => {
  const activeNote: Resource = {
    id: "res-active-note",
    workspaceId: "ws-1",
    title: "Active Note",
    type: "note",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const activeMedia: Resource = {
    id: "res-active-media",
    workspaceId: "ws-1",
    title: "Active Image",
    type: "note",
    attachments: [{ id: "att-1", name: "photo.png", uri: "file://photo.png", mimeType: "image/png" }],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 2000,
    updatedAt: 2000,
  };

  const archivedNote: Resource = {
    id: "res-archived-note",
    workspaceId: "ws-1",
    title: "Archived Note",
    type: "note",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 3000,
    updatedAt: 3000,
    archivedAt: 5000,
  };

  const archivedMedia: Resource = {
    id: "res-archived-media",
    workspaceId: "ws-1",
    title: "Archived Image",
    type: "note",
    attachments: [{ id: "att-2", name: "old.png", uri: "file://old.png", mimeType: "image/png" }],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 4000,
    updatedAt: 4000,
    archivedAt: 6000,
  };

  const allTestResources = [activeNote, activeMedia, archivedNote, archivedMedia];
  const emptyLinkedIds = new Set<string>();

  it("1. ResourceSection with hideInternalHeader=true preserves archived resources without double-filtering", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [archivedNote, archivedMedia] }}
          activeFolderId="ws-1"
          hideInternalHeader={true}
        />
      );
    });

    const cards = renderer.root.findAllByType(AppCard);
    expect(cards.length).toBe(2);
  });

  it("2. ResourceSection with hideInternalHeader=false strips archived resources in standalone mode", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResourceSection
          resources={{ "ws-1": [activeNote, archivedNote] }}
          activeFolderId="ws-1"
          hideInternalHeader={false}
        />
      );
    });

    const cards = renderer.root.findAllByType(AppCard);
    expect(cards.length).toBe(1);
  });

  function mapResourceStatus(status: ResourceStatusFilter): "active" | "archived" {
    return status === "archived" ? "archived" : "active";
  }

  it("3. Workspace filtering pipeline: default/unfiltered view returns active resources only", () => {
    const statusFilter: ResourceStatusFilter = "all";
    const mappedStatus = mapResourceStatus(statusFilter);
    const filtered = applyResourceFilters(allTestResources, emptyLinkedIds, {
      type: "all",
      linkage: "all",
      status: mappedStatus,
    });

    expect(filtered.map((r) => r.id)).toEqual(["res-active-note", "res-active-media"]);
  });

  it("4. Workspace filtering pipeline: active filter returns active resources only", () => {
    const statusFilter: ResourceStatusFilter = "active";
    const mappedStatus = mapResourceStatus(statusFilter);
    const filtered = applyResourceFilters(allTestResources, emptyLinkedIds, {
      type: "all",
      linkage: "all",
      status: mappedStatus,
    });

    expect(filtered.map((r) => r.id)).toEqual(["res-active-note", "res-active-media"]);
  });

  it("5. Workspace filtering pipeline: archived filter returns archived resources only", () => {
    const statusFilter: ResourceStatusFilter = "archived";
    const mappedStatus = mapResourceStatus(statusFilter);
    const filtered = applyResourceFilters(allTestResources, emptyLinkedIds, {
      type: "all",
      linkage: "all",
      status: mappedStatus,
    });

    expect(filtered.map((r) => r.id)).toEqual(["res-archived-note", "res-archived-media"]);
  });

  it("6. Combined filtering: type=media + status=archived returns only archived media", () => {
    const statusFilter: ResourceStatusFilter = "archived";
    const mappedStatus = mapResourceStatus(statusFilter);
    const filtered = applyResourceFilters(allTestResources, emptyLinkedIds, {
      type: "media",
      linkage: "all",
      status: mappedStatus,
    });

    expect(filtered.map((r) => r.id)).toEqual(["res-archived-media"]);
  });

  it("7. Combined filtering: type=media + status=active returns only active media", () => {
    const statusFilter: ResourceStatusFilter = "active";
    const mappedStatus = mapResourceStatus(statusFilter);
    const filtered = applyResourceFilters(allTestResources, emptyLinkedIds, {
      type: "media",
      linkage: "all",
      status: mappedStatus,
    });

    expect(filtered.map((r) => r.id)).toEqual(["res-active-media"]);
  });
});
