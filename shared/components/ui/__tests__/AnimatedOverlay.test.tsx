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

  it("handles duplicate close requests without invoking onClose twice", () => {
    jest.useFakeTimers();
    let renderer: any;
    const onCloseMock = jest.fn();
    let triggerClose: (() => void) | undefined;

    act(() => {
      renderer = create(
        <AnimatedOverlay visible={true} onClose={onCloseMock} type="bottom-sheet">
          {(close) => {
            triggerClose = close;
            return <Text>Sheet Content</Text>;
          }}
        </AnimatedOverlay>
      );
    });

    expect(triggerClose).toBeDefined();

    // 1. Initial close request starts the animation
    act(() => {
      triggerClose?.();
      triggerClose?.();
    });

    // 2. Additional close requests during flight
    act(() => {
      jest.advanceTimersByTime(50);
      triggerClose?.();
    });

    // 3. Advance timers fully to complete the animation and flush callbacks
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 4. Additional close request after animation has finished
    act(() => {
      triggerClose?.();
    });

    expect(onCloseMock).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("handles external dismissal without invoking onClose", () => {
    let renderer: any;
    const onCloseMock = jest.fn();

    act(() => {
      renderer = create(
        <AnimatedOverlay visible={true} onClose={onCloseMock} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    // External dismissal (props visible -> false)
    act(() => {
      renderer.update(
        <AnimatedOverlay visible={false} onClose={onCloseMock} type="bottom-sheet">
          {() => <Text>Sheet Content</Text>}
        </AnimatedOverlay>
      );
    });

    expect(onCloseMock).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBeNull();
  });

  it("does not invoke onClose if component is unmounted during active exit animation", () => {
    jest.useFakeTimers();
    let renderer: any;
    const onCloseMock = jest.fn();
    let triggerClose: (() => void) | undefined;

    act(() => {
      renderer = create(
        <AnimatedOverlay visible={true} onClose={onCloseMock} type="bottom-sheet">
          {(close) => {
            triggerClose = close;
            return <Text>Sheet Content</Text>;
          }}
        </AnimatedOverlay>
      );
    });

    expect(triggerClose).toBeDefined();

    // 1. Start the close animation (isClosingRef becomes true, spring starts)
    act(() => {
      triggerClose?.();
    });

    // 2. Unmount DURING the pending animation before it completes
    act(() => {
      renderer.unmount();
    });

    // 3. Advance timers so any pending animation frames/callbacks run
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Verification: finishClose was cancelled / guarded by isMountedRef and onClose was never called
    expect(onCloseMock).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
