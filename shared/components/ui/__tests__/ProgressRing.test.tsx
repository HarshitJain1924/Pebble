jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { create, act } from "react-test-renderer";
import { ProgressRing } from "../ProgressRing";

describe("ProgressRing (Continuous)", () => {
  it("mounts correctly with default props", () => {
    let renderer: any;
    act(() => {
      renderer = create(<ProgressRing progress={0.5} />);
    });
    expect(renderer.root).toBeDefined();
  });

  it("renders with custom dimensions and colors", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <ProgressRing
          progress={0.75}
          size={160}
          strokeWidth={8}
          color="#6366F1"
          trackColor="rgba(255, 255, 255, 0.1)"
          showText={false}
        />
      );
    });
    expect(renderer.root).toBeDefined();
  });

  it("renders percentage text when showText is true", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <ProgressRing progress={0.65} showText={true} />
      );
    });
    const texts = renderer.root.findAllByType("Text" as any).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : String(t.props.children)
    );
    expect(texts.join("")).toContain("65%");
  });

  it("safely handles 0% and 100% progress", () => {
    let renderer0: any;
    let renderer1: any;
    act(() => {
      renderer0 = create(<ProgressRing progress={0} showText={false} />);
      renderer1 = create(<ProgressRing progress={1} showText={false} />);
    });
    expect(renderer0.root).toBeDefined();
    expect(renderer1.root).toBeDefined();
  });
});
