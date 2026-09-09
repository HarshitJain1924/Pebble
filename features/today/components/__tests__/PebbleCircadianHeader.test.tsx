import React from "react";
import { create, act } from "react-test-renderer";
import {
  PebbleCircadianHeader,
  getCircadianPeriod,
  getGreetingForPeriod,
  getCircadianArtSource,
} from "../PebbleCircadianHeader";
import { Colors } from "@/shared/constants/theme";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: ({ children }: any) => children,
}));

describe("PebbleCircadianHeader", () => {
  describe("Circadian Time Helpers", () => {
    it("identifies morning period between 4:00 and 11:59 and returns theme-aware art", () => {
      const earlyMorningDate = new Date(2026, 8, 8, 4, 30);
      const morningDate = new Date(2026, 8, 8, 8, 30);
      expect(getCircadianPeriod(earlyMorningDate)).toBe("morning");
      expect(getCircadianPeriod(morningDate)).toBe("morning");
      expect(getGreetingForPeriod("morning")).toBe("Good morning,");
      expect(getCircadianArtSource("morning", false)).toBeTruthy();
      expect(getCircadianArtSource("morning", true)).toBeTruthy();
      expect(getCircadianArtSource("morning", false)).not.toEqual(
        getCircadianArtSource("morning", true)
      );
    });

    it("identifies afternoon period between 12:00 and 17:59", () => {
      const afternoonDate = new Date(2026, 8, 8, 14, 0);
      expect(getCircadianPeriod(afternoonDate)).toBe("afternoon");
      expect(getGreetingForPeriod("afternoon")).toBe("Good afternoon,");
      expect(getCircadianArtSource("afternoon")).toBeTruthy();
    });

    it("identifies night period between 18:00 and 3:59", () => {
      const nightDate = new Date(2026, 8, 8, 22, 15);
      const lateNightDate = new Date(2026, 8, 8, 2, 0);
      expect(getCircadianPeriod(nightDate)).toBe("night");
      expect(getCircadianPeriod(lateNightDate)).toBe("night");
      expect(getGreetingForPeriod("night")).toBe("Good evening,");
      expect(getCircadianArtSource("night")).toBeTruthy();
    });
  });

  describe("Component Rendering", () => {
    it("renders title, greeting kicker, and subtitle", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PebbleCircadianHeader
            kicker="Good morning,"
            title="Alex"
            subtitle="Small steps. A calmer you."
            colors={Colors.light}
            colorScheme="light"
          />
        );
      });

      const textNodes = renderer.root.findAllByType("Text");
      const textContents = textNodes.map((n: any) => n.props.children).flat();
      expect(textContents).toContain("Good morning,");
      expect(textContents).toContain("Alex");
      expect(textContents).toContain("Small steps. A calmer you.");
    });

    it("renders profile.name without adding leaf emoji or hardcoded fallback", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PebbleCircadianHeader
            profile={{ name: "Jordan", avatar: "avatar-1" }}
            colors={Colors.light}
            colorScheme="light"
          />
        );
      });

      const textNodes = renderer.root.findAllByType("Text");
      const textContents = textNodes.map((n: any) => n.props.children).flat();
      expect(textContents).toContain("Jordan");
      expect(textContents).not.toContain("Jordan 🌿");
      expect(textContents).not.toContain("Harshit");
    });

    it("renders streak pill when streak is provided", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PebbleCircadianHeader
            streak={7}
            colors={Colors.dark}
            colorScheme="dark"
          />
        );
      });

      const textNodes = renderer.root.findAllByType("Text");
      const textContents = textNodes.map((n: any) => n.props.children).flat();
      expect(textContents).toContain("🔥 7");
    });
  });
});
