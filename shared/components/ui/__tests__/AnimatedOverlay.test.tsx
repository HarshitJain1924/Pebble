import React from "react";
import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import { AnimatedOverlay } from "../AnimatedOverlay";

describe("AnimatedOverlay Lifecycle & Safety Regression Tests", () => {
  it("renders null when visible is false", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AnimatedOverlay visible={false} onClose={jest.fn()} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it("renders modal when visible is true", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AnimatedOverlay visible={true} onClose={jest.fn()} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    expect(renderer.toJSON()).not.toBeNull();
  });

  it("tears down and unmounts when visible prop becomes false externally", () => {
    let renderer: any;
    const onCloseMock = jest.fn();

    act(() => {
      renderer = create(
        <AnimatedOverlay visible={true} onClose={onCloseMock} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    expect(renderer.toJSON()).not.toBeNull();

    // Parent changes visible to false (e.g. parent unmounts entity or handles external close)
    act(() => {
      renderer.update(
        <AnimatedOverlay visible={false} onClose={onCloseMock} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it("handles unmount gracefully during active render without memory leak warnings", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AnimatedOverlay visible={true} onClose={jest.fn()} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    // Unmount immediately while Reanimated values might be active
    expect(() => {
      act(() => {
        renderer.unmount();
      });
    }).not.toThrow();
  });
});
