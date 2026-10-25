import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import OnboardingScreen from "@/app/onboarding";
import { OnboardingService } from "@/services/onboarding/onboarding.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/services/onboarding/onboarding.service", () => ({
  OnboardingService: {
    completeOnboarding: jest.fn(),
    isOnboardingCompleted: jest.fn(),
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

describe("app/onboarding.tsx navigation integrity", () => {
  const mockReplace = jest.fn();
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      push: jest.fn(),
      back: jest.fn(),
    });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("navigates to /(tabs) when completeOnboarding succeeds", async () => {
    (OnboardingService.completeOnboarding as jest.Mock).mockResolvedValueOnce({
      success: true,
      changed: true,
    });

    const { getByText } = await render(<OnboardingScreen />);
    const skipButton = getByText("Skip");

    fireEvent.press(skipButton);

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  it("does NOT navigate into the app when completeOnboarding throws an error", async () => {
    (OnboardingService.completeOnboarding as jest.Mock).mockRejectedValueOnce(
      new Error("Initialization failed disk full"),
    );

    const { getByText } = await render(<OnboardingScreen />);
    const skipButton = getByText("Skip");

    fireEvent.press(skipButton);

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        "Setup Error",
        "An error occurred while finishing setup. Please try again.",
      );
    });
  });

  it("does NOT navigate into the app when completeOnboarding returns success: false", async () => {
    (OnboardingService.completeOnboarding as jest.Mock).mockResolvedValueOnce({
      success: false,
      changed: false,
    });

    const { getByText } = await render(<OnboardingScreen />);
    const skipButton = getByText("Skip");

    fireEvent.press(skipButton);

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        "Setup Incomplete",
        "Could not finish onboarding setup. Please try again.",
      );
    });
  });
});
