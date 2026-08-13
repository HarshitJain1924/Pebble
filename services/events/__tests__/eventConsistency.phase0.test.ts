import fs from "node:fs";
import path from "node:path";
import { addStateListener, emitStateChange } from "@/services/events/state-events";

describe("Phase 0 event and reload contracts", () => {
  it("delivers an explicitly attributed event to listeners", () => {
    const listener = jest.fn();
    const unsubscribe = addStateListener("tasks_changed", listener);
    emitStateChange("tasks_changed", "tasks_screen");
    unsubscribe();
    expect(listener).toHaveBeenCalledWith("tasks_screen");
  });

  test("requires TodayActions tasks_changed emission to carry a stable emitter id", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../../features/today/hooks/useTodayActions.ts"), "utf8");
    expect(source).toMatch(/emitStateChange\(["']tasks_changed["'],\s*["'][^"']+["']\)/);
  });

  test("requires Today dashboard to subscribe to mutation events while mounted", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../../features/today/hooks/useTodayDashboard.ts"), "utf8");
    expect(source).toContain("addStateListener");
  });
});
