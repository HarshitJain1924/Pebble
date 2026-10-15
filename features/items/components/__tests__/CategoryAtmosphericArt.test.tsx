import React from "react";
import { act, create } from "react-test-renderer";
import {
  CategoryAtmosphericArt,
  resolveArtworkMotif,
  ArtworkMotif,
} from "../CategoryAtmosphericArt";

describe("CategoryAtmosphericArt Component & Resolver", () => {
  describe("resolveArtworkMotif", () => {
    it("resolves explicit task category keys", () => {
      expect(resolveArtworkMotif("work")).toBe("work");
      expect(resolveArtworkMotif("learning")).toBe("learning");
      expect(resolveArtworkMotif("health")).toBe("health");
      expect(resolveArtworkMotif("fitness")).toBe("health");
      expect(resolveArtworkMotif("finance")).toBe("finance");
      expect(resolveArtworkMotif("creative")).toBe("creative");
      expect(resolveArtworkMotif("travel")).toBe("travel");
      expect(resolveArtworkMotif("home")).toBe("home");
      expect(resolveArtworkMotif("personal")).toBe("home");
      expect(resolveArtworkMotif("focus")).toBe("focus");
    });

    it("resolves keywords from title when categoryKey is unspecified", () => {
      expect(resolveArtworkMotif(null, "Review client PR contract")).toBe("documents");
      expect(resolveArtworkMotif(null, "Weekly team sync call")).toBe("meetings");
      expect(resolveArtworkMotif(null, "Read chapter 4 of book")).toBe("learning");
      expect(resolveArtworkMotif(null, "Morning gym workout session")).toBe("health");
      expect(resolveArtworkMotif(null, "Mindful breathing meditation")).toBe("mindful");
      expect(resolveArtworkMotif(null, "Pay electricity bill and tax")).toBe("finance");
      expect(resolveArtworkMotif(null, "UI design system sketch")).toBe("creative");
      expect(resolveArtworkMotif(null, "Clean the kitchen and laundry")).toBe("home");
      expect(resolveArtworkMotif(null, "Grocery market shopping")).toBe("shop");
      expect(resolveArtworkMotif(null, "Book flight ticket for trip")).toBe("travel");
    });

    it("returns null for unclassified titles without category", () => {
      expect(resolveArtworkMotif(null, "Check battery level")).toBeNull();
      expect(resolveArtworkMotif(null, "Observe morning horizon")).toBeNull();
      expect(resolveArtworkMotif(undefined, "")).toBeNull();
      expect(resolveArtworkMotif(null, null)).toBeNull();
    });
  });

  describe("CategoryAtmosphericArt SVG rendering", () => {
    const motifs: ArtworkMotif[] = [
      "work",
      "documents",
      "meetings",
      "learning",
      "health",
      "finance",
      "creative",
      "mindful",
      "home",
      "focus",
      "travel",
      "shop",
    ];

    motifs.forEach((m) => {
      it(`renders motif "${m}" cleanly with linear gradient definitions`, () => {
        let renderer: any;
        act(() => {
          renderer = create(
            <CategoryAtmosphericArt
              motif={m}
              color="#3B82F6"
              isDark={true}
              gradientId={`test-grad-${m}`}
              testID={`art-${m}`}
            />
          );
        });

        const json = renderer.toJSON();
        expect(json).toBeDefined();
        expect(json.props.testID).toBe(`art-${m}`);
        expect(json.props.pointerEvents).toBe("none");
      });
    });

    it("renders light mode without throwing", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <CategoryAtmosphericArt
            motif="documents"
            color="#3B82F6"
            isDark={false}
            gradientId="test-grad-light"
            testID="art-light"
          />
        );
      });

      const json = renderer.toJSON();
      expect(json).toBeDefined();
      expect(json.props.testID).toBe("art-light");
    });
  });
});
