import {
  formatFrequency,
  formatTime,
  getDaysOverdue,
  getOverdueLabel,
  getTabScrollTarget,
} from "@/features/today/utils/stream-formatting";
import { resolveResourceVisual } from "@/features/today/utils/resource-presentation";
import { resolveItemCategorySymbol } from "@/features/today/utils/item-presentation";
import { getOffsetDateKey, getTodayDateKey } from "@/shared/utils/date-key";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const TODAY = getTodayDateKey();

describe("resolveResourceVisual", () => {
  it("detects an image by MIME type and surfaces the thumbnail URI", () => {
    const visual = resolveResourceVisual({
      title: "photo",
      attachments: [
        { name: "photo", uri: "file:///a/photo", mimeType: "image/jpeg" },
      ],
    });

    expect(visual.category).toBe("image");
    expect(visual.label).toBe("Image");
    expect(visual.thumbnailUri).toBe("file:///a/photo");
    expect(visual.attachmentCount).toBe(1);
  });

  it("detects an image by file extension in the title", () => {
    const visual = resolveResourceVisual({ title: "Diagram.PNG" });
    expect(visual.category).toBe("image");
  });

  it("detects a PDF by MIME type", () => {
    const visual = resolveResourceVisual({
      title: "plan",
      attachments: [{ name: "plan", uri: "file:///p", mimeType: "application/pdf" }],
    });

    expect(visual.category).toBe("pdf");
    expect(visual.label).toBe("PDF");
    expect(visual.thumbnailUri).toBeUndefined();
  });

  it("detects a PDF by extension", () => {
    expect(resolveResourceVisual({ title: "report.pdf" }).category).toBe("pdf");
  });

  it("detects a link from the resource type", () => {
    const visual = resolveResourceVisual({ title: "Docs", type: "link" });
    expect(visual.category).toBe("link");
    expect(visual.label).toBe("Link");
  });

  it("detects a link pasted into the title", () => {
    expect(resolveResourceVisual({ title: "https://example.com" }).category).toBe(
      "link",
    );
  });

  it("falls back to a note for plain content", () => {
    const visual = resolveResourceVisual({ title: "Meeting notes", content: "hi" });
    expect(visual.category).toBe("note");
    expect(visual.label).toBe("Note");
  });

  it("labels an idea resource as an Idea note", () => {
    const visual = resolveResourceVisual({ title: "App idea", type: "idea" });
    expect(visual.category).toBe("note");
    expect(visual.label).toBe("Idea");
  });

  it("counts every attachment", () => {
    const visual = resolveResourceVisual({
      title: "bundle",
      attachments: [
        { name: "a.txt", uri: "file:///a", mimeType: "text/plain" },
        { name: "b.txt", uri: "file:///b", mimeType: "text/plain" },
      ],
    });

    expect(visual.attachmentCount).toBe(2);
    expect(visual.category).toBe("note");
  });
});

describe("resolveItemCategorySymbol", () => {
  it("uses the explicit task category when one is present", () => {
    expect(resolveItemCategorySymbol({ type: "task", categoryId: "health" }, true).icon).toBe(
      "activity",
    );
    expect(resolveItemCategorySymbol({ type: "task", categoryId: "finance" }, true).icon).toBe(
      "wallet",
    );
  });

  it("falls back to the default work category for a bare task", () => {
    expect(resolveItemCategorySymbol({ type: "task" }, true).icon).toBe("briefcase");
  });

  it("falls back by domain type for habit, checklist and resource", () => {
    expect(resolveItemCategorySymbol({ type: "habit" }, true).icon).toBe("activity");
    expect(resolveItemCategorySymbol({ type: "checklist" }, true).icon).toBe(
      "check-square",
    );
    expect(resolveItemCategorySymbol({ type: "resource" }, true).icon).toBe(
      "file-text",
    );
  });

  it("applies keyword-based categories ahead of the generic fallback", () => {
    expect(resolveItemCategorySymbol({ type: "task", title: "Morning meditation" }, true).label).toBe(
      "Mindfulness",
    );
    expect(resolveItemCategorySymbol({ type: "task", title: "Buy groceries" }, true).label).toBe(
      "Shopping",
    );
  });

  it("resolves a scheme-aware tint", () => {
    const dark = resolveItemCategorySymbol({ type: "habit" }, true);
    const light = resolveItemCategorySymbol({ type: "habit" }, false);
    expect(dark.tint).not.toBe(light.tint);
  });
});

describe("stream formatting", () => {
  it("formats reminder timestamps as a 12-hour clock", () => {
    expect(formatTime(new Date(2026, 8, 28, 8, 34, 0).getTime())).toBe("8:34 AM");
    expect(formatTime(new Date(2026, 8, 28, 20, 5, 0).getTime())).toBe("8:05 PM");
    expect(formatTime(new Date(2026, 8, 28, 0, 0, 0).getTime())).toBe("12:00 AM");
  });

  it("humanises recurrence frequencies", () => {
    expect(formatFrequency("daily")).toBe("Every day");
    expect(formatFrequency("weekly")).toBe("Every week");
    expect(formatFrequency("monthly")).toBe("Every month");
    expect(formatFrequency("2 weeks")).toBe("Every 2 weeks");
    expect(formatFrequency(undefined)).toBeNull();
  });

  it("measures how overdue a date is and labels it", () => {
    expect(getDaysOverdue(TODAY)).toBeNull();
    expect(getDaysOverdue(getOffsetDateKey(1, TODAY))).toBe(1);
    expect(getDaysOverdue(getOffsetDateKey(3, TODAY))).toBe(3);
    expect(getDaysOverdue("")).toBeNull();

    expect(getOverdueLabel(null)).toBe("Overdue");
    expect(getOverdueLabel(1)).toBe("Yesterday");
    expect(getOverdueLabel(4)).toBe("4 days ago");
  });

  it("centres a tab in the viewport without scrolling past the start", () => {
    expect(getTabScrollTarget(1000, 80, 390)).toBe(845);
    expect(getTabScrollTarget(0, 80, 390)).toBe(0);
    expect(getTabScrollTarget(40, 80, 390)).toBe(0);
  });
});
