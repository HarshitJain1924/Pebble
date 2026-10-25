jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));
const mockChecklistDetailContent = jest.fn((_props: any) => null);
jest.mock("@/features/details/checklist/ChecklistDetailContent", () => ({
  ChecklistDetailContent: (props: any) => {
    mockChecklistDetailContent(props);
    return null;
  },
}));

import React from "react";
import { act, create } from "react-test-renderer";

import ChecklistDetailsScreen from "@/app/checklist-details";
import { useLocalSearchParams, useRouter } from "expo-router";

const mockRouter = { back: jest.fn(), replace: jest.fn() };

const renderRoute = async (params: Record<string, string>) => {
  (useLocalSearchParams as jest.Mock).mockReturnValue(params);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ChecklistDetailsScreen />);
  });
  return renderer;
};

describe("checklist-details route dispatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it("passes the checklist id to ChecklistDetailContent", async () => {
    await renderRoute({ id: "checklist-abc" });
    expect(mockChecklistDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({ checklistId: "checklist-abc" }),
    );
  });

  it("defaults to view mode when the edit param is absent or false", async () => {
    await renderRoute({ id: "checklist-abc" });
    expect(mockChecklistDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({ initialEdit: false }),
    );

    await renderRoute({ id: "checklist-abc", edit: "false" });
    expect(mockChecklistDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({ initialEdit: false }),
    );
  });

  it("opens in edit mode when the edit param is true", async () => {
    await renderRoute({ id: "checklist-abc", edit: "true" });
    expect(mockChecklistDetailContent).toHaveBeenCalledWith(
      expect.objectContaining({ initialEdit: true }),
    );
  });

  it("wires the back callback to the router", async () => {
    await renderRoute({ id: "checklist-abc" });
    const props = mockChecklistDetailContent.mock.calls[0][0];

    await act(async () => {
      props.onBack();
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
