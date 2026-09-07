import React from "react";
import { create, act } from "react-test-renderer";
import {
  PebbleCircadianHeader,
  getCircadianPeriod,
  getGreetingForPeriod,
} from "../PebbleCircadianHeader";
import { Colors } from "@/shared/constants/theme";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

describe("PebbleCircadianHeader", () => {
  describe("Circadian Time Helpers", () => {
    it("identifies morning period between 5:00 and 11:59", () => {
      const morningDate = new Date(2026, 8, 8, 8, 30);
      expect(getCircadianPeriod(morningDate)).toBe("morning");
      expect(getGreetingForPeriod("morning")).toBe("Good morning,");
    });

    it("identifies afternoon period between 12:00 and 17:59", () => {
      const afternoonDate = new Date(2026, 8, 8, 14, 0);
      expect(getCircadianPeriod(afternoonDate)).toBe("afternoon");
      expect(getGreetingForPeriod("afternoon")).toBe("Good afternoon,");
    });

    it("identifies night period between 18:00 and 4:59", () => {
      const nightDate = new Date(2026, 8, 8, 22, 15);
      const lateNightDate = new Date(2026, 8, 8, 2, 0);
      expect(getCircadianPeriod(nightDate)).toBe("night");
      expect(getCircadianPeriod(lateNightDate)).toBe("night");
      expect(getGreetingForPeriod("night")).toBe("Good evening,");
    });
  });

  describe("Component Rendering", () => {
    it("renders title, greeting kicker, and subtitle", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PebbleCircadianHeader
            kicker="Good morning,"
            title="Harshit 🌿"
            subtitle="Small steps. A calmer you."
            colors={Colors.light}
            colorScheme="light"
          />
        );
      });

      const textNodes = renderer.root.findAllByType("Text");
      const textContents = textNodes.map((n: any) => n.props.children).flat();
      expect(textContents).toContain("Good morning,");
      expect(textContents).toContain("Harshit 🌿");
      expect(textContents).toContain("Small steps. A calmer you.");
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
