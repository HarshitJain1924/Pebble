import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

const CONSUMERS = [
  "app/profile.tsx",
  "app/(tabs)/index.tsx",
  "features/today/components/PebbleJarProgressCard.tsx",
  "features/today/components/PebbleSanctuaryModal.tsx",
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("milestone consumers", () => {
  it.each(CONSUMERS)("%s reads the canonical milestone helper", (file) => {
    expect(read(file)).toContain("@/shared/utils/pebble-milestones");
  });

  it.each(CONSUMERS)("%s declares no local milestone definitions", (file) => {
    const source = read(file);
    // Stage copy must live only in the canonical module.
    expect(source).not.toMatch(/First Steps/);
    expect(source).not.toMatch(/Zen Mountain/);
    expect(source).not.toMatch(/Ocean of Focus/);
  });

  it.each(CONSUMERS)("%s declares no local threshold ladder", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\[0,\s*10,\s*25,\s*50,\s*100,\s*250,\s*500\]/);
    expect(source).not.toMatch(/\[10,\s*25,\s*50,\s*100,\s*250,\s*500\]/);
  });

  it("keeps stage copy declared in exactly one production file", () => {
    const matches: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name.startsWith(".")
        ) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/__tests__|\.test\./.test(full)) continue;
        const source = fs.readFileSync(full, "utf8");
        if (source.includes("Ocean of Focus")) matches.push(full);
      }
    };
    walk(ROOT);

    expect(matches).toHaveLength(1);
    expect(matches[0].replace(/\\/g, "/")).toContain(
      "shared/utils/pebble-milestones.ts",
    );
  });
});
