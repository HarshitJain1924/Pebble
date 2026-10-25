import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import {
  applyCaptureOverrides,
  type CaptureOverrides,
} from "@/features/capture/utils/capture-overrides";

/**
 * The override model is the single source of truth for "what will be saved",
 * so these tests exercise the exact function the capture component calls for
 * every parse (idle parse, type change, attachment removal, save catch-up).
 */
describe("capture override model", () => {
  const parse = (text: string) => parseProductivityText(text);

  it("uses parser-derived values when the user has not touched a field", () => {
    const parsed = parse("Buy milk tomorrow at 5pm urgent");

    const applied = applyCaptureOverrides(parsed, {});

    expect(applied).toEqual(parsed);
    expect(applied.date).toBe(parsed.date);
    expect(applied.time).toBe("17:00");
    expect(applied.priorityDetected).toBe(true);
  });

  it("keeps an explicitly cleared date cleared after the text is edited and re-parsed", () => {
    const overrides: CaptureOverrides = { date: { value: undefined } };

    const first = applyCaptureOverrides(parse("Buy milk tomorrow"), overrides);
    expect(first.date).toBeUndefined();

    // The user keeps typing: a brand-new parse arrives with "tomorrow" again.
    const reparsed = applyCaptureOverrides(
      parse("Buy milk tomorrow and eggs"),
      overrides,
    );

    expect(reparsed.date).toBeUndefined();
    expect(reparsed.title).toBe("Buy milk and eggs");
  });

  it("keeps a cleared value cleared at save time (idempotent across re-application)", () => {
    const overrides: CaptureOverrides = { date: { value: undefined } };
    const parsed = parse("Buy milk tomorrow");

    const atSave = applyCaptureOverrides(
      applyCaptureOverrides(parsed, overrides),
      overrides,
    );

    expect(atSave.date).toBeUndefined();
  });

  it("honours an explicitly chosen different date", () => {
    const applied = applyCaptureOverrides(parse("Call John tomorrow"), {
      date: { value: "2026-12-01" },
    });

    expect(applied.date).toBe("2026-12-01");
  });

  it("does not let an entry-context default override an explicit clear", () => {
    const cleared = applyCaptureOverrides(
      parse("Buy milk tomorrow"),
      { date: { value: undefined } },
      { date: "2026-11-11" },
    );
    expect(cleared.date).toBeUndefined();

    // Without a user decision the entry default still applies as before.
    const defaulted = applyCaptureOverrides(
      parse("Buy milk"),
      {},
      { date: "2026-11-11" },
    );
    expect(defaulted.date).toBe("2026-11-11");
  });

  it("restores parser values when a new capture session resets the overrides", () => {
    const parsed = parse("Buy milk tomorrow");

    const cleared = applyCaptureOverrides(parsed, {
      date: { value: undefined },
    });
    expect(cleared.date).toBeUndefined();

    // Session reset: the component replaces the ref value with {}.
    const newSession = applyCaptureOverrides(parsed, {});
    expect(newSession.date).toBe(parsed.date);
  });

  it("clears time, reminder, recurrence, priority, category and type-safe fields independently", () => {
    const parsed = parse("Gym every morning at 8am and remind me 30 minutes before");
    expect(parsed.time).toBe("08:00");
    expect(parsed.reminderOffsetMinutes).toBe(30);
    expect(parsed.recurrence?.type).toBe("daily");

    const cleared = applyCaptureOverrides(parsed, {
      time: { value: undefined },
      reminderOffsetMinutes: { value: undefined },
      recurrence: { value: undefined },
    });

    expect(cleared.time).toBeUndefined();
    expect(cleared.reminderOffsetMinutes).toBeUndefined();
    expect(cleared.recurrence).toBeUndefined();
  });

  it("clears a parser-detected priority without restoring it on re-parse", () => {
    const parsed = parse("Submit report urgent");
    expect(parsed.priority).toBe("high");
    expect(parsed.priorityDetected).toBe(true);

    const overrides: CaptureOverrides = { priority: { value: undefined } };
    const cleared = applyCaptureOverrides(
      parse("Submit report urgent please"),
      overrides,
    );

    expect(cleared.priority).toBeUndefined();
    expect(cleared.priorityDetected).toBe(false);
  });

  it("clears a parser-detected category", () => {
    const parsed = parse("Study Kubernetes at 8pm");
    expect(parsed.category).toBe("learning");

    const cleared = applyCaptureOverrides(parse("Study Kubernetes at 9pm"), {
      category: { value: undefined },
    });

    expect(cleared.category).toBeUndefined();
  });

  it("keeps user-chosen values authoritative over parser output", () => {
    const applied = applyCaptureOverrides(
      parse("Buy milk tomorrow at 5pm urgent"),
      {
        date: { value: "2026-12-24" },
        time: { value: "09:30" },
        priority: { value: "low" },
        category: { value: "personal" },
      },
    );

    expect(applied.date).toBe("2026-12-24");
    expect(applied.time).toBe("09:30");
    expect(applied.priority).toBe("low");
    expect(applied.priorityDetected).toBe(true);
    expect(applied.category).toBe("personal");
  });

  it("keeps type precedence: user type > entry default > parser", () => {
    const parsed = parse("milk");
    expect(parsed.type).toBe("task");

    expect(
      applyCaptureOverrides(parsed, {}, { type: "checklist" }).type,
    ).toBe("checklist");
    expect(
      applyCaptureOverrides(parsed, { type: "habit" }, { type: "checklist" })
        .type,
    ).toBe("habit");
  });

  it("never mutates the parse result", () => {
    const parsed = parse("Buy milk tomorrow at 5pm");
    const snapshot = { ...parsed };

    applyCaptureOverrides(parsed, {
      date: { value: undefined },
      time: { value: undefined },
    });

    expect(parsed).toEqual(snapshot);
  });
});
