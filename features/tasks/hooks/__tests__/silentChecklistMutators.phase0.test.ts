import fs from "node:fs";
import path from "node:path";

describe("Phase 0 checklist mutator contract", () => {
  test("does not expose silent checklist-item no-op functions", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../useTasksState.ts"), "utf8");
    expect(source).not.toMatch(/addChecklistItem:\s*\([^)]*\)\s*=>\s*\{\s*\}/);
    expect(source).not.toMatch(/deleteChecklistItem:\s*\([^)]*\)\s*=>\s*\{\s*\}/);
  });
});
