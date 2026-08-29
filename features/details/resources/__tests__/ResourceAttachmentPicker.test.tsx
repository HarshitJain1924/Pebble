import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ResourceAttachmentPicker } from "../ResourceAttachmentPicker";
import type { Resource } from "@/shared/types/domain.types";

const mockResources: Resource[] = [
  {
    id: "res-1",
    type: "link",
    title: "Google",
    workspaceId: "inbox",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 100,
    updatedAt: 100,
    attachments: [{ id: "att-1", name: "Google", uri: "https://google.com", mimeType: "text/html" }],
  },
  {
    id: "res-2",
    type: "note",
    title: "Meeting Notes",
    workspaceId: "inbox",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 100,
    updatedAt: 100,
    body: "Some notes",
  },
  {
    id: "res-3",
    type: "link",
    title: "Archived Resource",
    workspaceId: "inbox",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 100,
    updatedAt: 100,
    archivedAt: 200,
    attachments: [],
  },
];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe("ResourceAttachmentPicker", () => {
  it("renders available resources (ignoring archived ones)", async () => {
    const { getByText, queryByText } = await render(
      <ResourceAttachmentPicker
        visible={true}
        resources={mockResources}
        selectedResourceIds={[]}
        onToggle={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(getByText("Google")).toBeTruthy();
    expect(getByText("Meeting Notes")).toBeTruthy();
    expect(queryByText("Archived Resource")).toBeNull();
  });

  it("renders empty state correctly", async () => {
    const { getByText } = await render(
      <ResourceAttachmentPicker
        visible={true}
        resources={[]}
        selectedResourceIds={[]}
        onToggle={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(getByText("No resources available.")).toBeTruthy();
  });

  it("calls onToggle when a resource is selected", async () => {
    const mockOnToggle = jest.fn();
    const { getByLabelText } = await render(
      <ResourceAttachmentPicker
        visible={true}
        resources={mockResources}
        selectedResourceIds={[]}
        onToggle={mockOnToggle}
        onClose={jest.fn()}
      />
    );

    fireEvent.press(getByLabelText("Link Google"));
    expect(mockOnToggle).toHaveBeenCalledWith("res-1");
  });

  it("calls onToggle when a selected resource is pressed again (unselecting)", async () => {
    const mockOnToggle = jest.fn();
    const { getByLabelText } = await render(
      <ResourceAttachmentPicker
        visible={true}
        resources={mockResources}
        selectedResourceIds={["res-1"]}
        onToggle={mockOnToggle}
        onClose={jest.fn()}
      />
    );

    fireEvent.press(getByLabelText("Link Google"));
    expect(mockOnToggle).toHaveBeenCalledWith("res-1");
  });

  it("calls onClose without persisting domain data directly", async () => {
    const mockOnClose = jest.fn();
    const { getByLabelText } = await render(
      <ResourceAttachmentPicker
        visible={true}
        resources={mockResources}
        selectedResourceIds={[]}
        onToggle={jest.fn()}
        onClose={mockOnClose}
      />
    );

    fireEvent.press(getByLabelText("Done linking resources"));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
