// The official Reanimated jest mock invokes withTiming callbacks synchronously
// (finished=true) and treats runOnJS as identity, which lets us behaviorally
// verify the projectile lifecycle: one animation per mount, exactly-once
// completion, and no restart when the parent re-creates the callback.
//
// The official mock's useSharedValue returns a NEW object on every call, but
// the real library returns a stable identity across re-renders. We stabilize it
// so the effect dependency array behaves exactly as it does in production;
// otherwise the unstable mock identity alone would re-trigger the effect.
jest.mock("react-native-reanimated", () => {
  const reanimatedMock = require("react-native-reanimated/mock");
  const stableSharedValue = { value: 0 };
  return {
    ...reanimatedMock,
    useSharedValue: () => stableSharedValue,
  };
});

import React from "react";
import { act, create } from "react-test-renderer";
import { ProjectilePebble } from "@/features/today/components/ProjectilePebble";

type Renderer = ReturnType<typeof create>;

function renderProjectile(onComplete: () => void, type: "task" | "habit" | "checklist" | "focus" = "task") {
  let renderer!: Renderer;
  act(() => {
    renderer = create(
      <ProjectilePebble
        startX={0}
        startY={0}
        endX={100}
        endY={50}
        onComplete={onComplete}
        type={type}
      />,
    );
  });
  return renderer;
}

describe("ProjectilePebble lifecycle", () => {
  test("one mount runs the animation completion exactly once", () => {
    const onComplete = jest.fn();
    const renderer = renderProjectile(onComplete);
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("a new onComplete callback identity on re-render does not restart or duplicate the animation", () => {
    const first = jest.fn();
    const renderer = renderProjectile(first);
    // Initial completion fires once on mount.
    expect(first).toHaveBeenCalledTimes(1);

    // Parent re-renders supply a brand-new inline callback (e.g. after a
    // dashboard reload). The animation must NOT restart and must NOT fire the
    // new callback.
    const second = jest.fn();
    act(() => {
      renderer.update(
        <ProjectilePebble
          startX={0}
          startY={0}
          endX={100}
          endY={50}
          onComplete={second}
          type="task"
        />,
      );
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    // Multiple re-renders with fresh identities stay inert.
    const third = jest.fn();
    act(() => {
      renderer.update(
        <ProjectilePebble
          startX={0}
          startY={0}
          endX={100}
          endY={50}
          onComplete={third}
          type="task"
        />,
      );
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(third).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
    expect(first).toHaveBeenCalledTimes(1);
  });

  test("completion still fires exactly once after many parent re-renders", () => {
    const onComplete = jest.fn();
    const renderer = renderProjectile(onComplete);
    expect(onComplete).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      act(() => {
        renderer.update(
          <ProjectilePebble
            startX={i}
            startY={i}
            endX={100 + i}
            endY={50}
            onComplete={() => {}}
            type="task"
          />,
        );
      });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("simultaneous projectiles are independent: each completes once and re-rendering one does not restart the other", () => {
    const completeA = jest.fn();
    const completeB = jest.fn();

    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <>
          <ProjectilePebble
            startX={0}
            startY={0}
            endX={100}
            endY={50}
            onComplete={completeA}
            type="task"
          />
          <ProjectilePebble
            startX={10}
            startY={10}
            endX={110}
            endY={50}
            onComplete={completeB}
            type="habit"
          />
        </>,
      );
    });
    expect(completeA).toHaveBeenCalledTimes(1);
    expect(completeB).toHaveBeenCalledTimes(1);

    // Re-rendering the tree (e.g. a third projectile added/removed) with a new
    // callback identity for A must not re-fire B's animation either.
    const newCompleteA = jest.fn();
    act(() => {
      renderer.update(
        <>
          <ProjectilePebble
            startX={0}
            startY={0}
            endX={100}
            endY={50}
            onComplete={newCompleteA}
            type="task"
          />
          <ProjectilePebble
            startX={10}
            startY={10}
            endX={110}
            endY={50}
            onComplete={completeB}
            type="habit"
          />
        </>,
      );
    });
    expect(newCompleteA).not.toHaveBeenCalled();
    expect(completeB).toHaveBeenCalledTimes(1);
    expect(completeA).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
  });
});
