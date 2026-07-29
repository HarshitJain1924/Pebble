# Pebble Smart Capture — Implementation Blueprint

**Status:** Ready for implementation  
**Architecture frozen:** Yes — ADR at `docs/architecture/smart_capture_adr.md`  
**Total PRs:** 5  
**Estimated duration:** 5-8 days

---

## 1. File-by-File Change Plan (Phase 1)

### 1A. `nlp-parser.service.ts` — Add Classification Metadata

**Why:** Enable CaptureService to distinguish high-confidence type assignments from fallback defaults.

**What changes:**
1. Add a `classification` field to `ParsedProductivityItem`:
```typescript
classification: {
  suggested: "task" | "habit" | "checklist" | "note" | "link" | "idea" | "file";
  confidence: "high" | "medium" | "low" | "unclear";
  detectionSignal?: string;
}
```
2. At the end of `parseProductivityText()`, populate `classification`:
   - If `detectionSignal` is `"default_task"` or `undefined` with no other signals → confidence: `"unclear"`
   - If `confidence >= 0.85` → `"high"`
   - If `confidence >= 0.6` → `"medium"`
   - If `confidence < 0.6` → `"low"`
   - `suggested` = the `type` value the parser determined
3. Keep the existing `type` field — it stays as the parser's best guess. The `classification` field is downstream metadata.

**Lines changed:** ~15 (type definition + 10 lines at end of function + return statement)
**Impact:** Non-breaking. All existing consumers still read `type`. New consumers read `classification.confidence`.
**Risk:** Low.

### 1B. `nlp-parser.service.ts` — Remove `compromise.js`

**Why:** ~50KB bundle size for a library used only for marginal POS tagging. Keyword regex covers the same cases.

**What changes:**
1. Remove `import nlp from "compromise"` line.
2. Delete the Stage 1 `compromiseDoc` usage:
   - Remove `const compromiseDoc = nlp(cleanedText);`
   - Remove the three `compromiseDoc.match(...).found` checks in the category fallback section
3. The primary category detection (CATEGORY_MAP keyword regex) is unaffected.

**Lines changed:** Remove ~15 lines
**Impact:** The category fallback may lose 1-2 detections per 100 inputs (cases where no keyword matched but a verb pattern did). Acceptable.
**Risk:** Low. The fallback is only used when CATEGORY_MAP fails, which is already rare.

### 1C. `nlp-parser.service.ts` — Remove Artificial Prefix Detection

**Why:** Users don't type `note:`, `memo:`, or `remember:` naturally. Keep only natural patterns.

**What changes:**
1. Remove the `"note:"` / `"note "` / `"remember:"` / `"remember "` / `"memo:"` / `"memo "` detection block.
2. Keep `"idea:"` / `"idea "` / `"what if "` / `"concept:"` — these are natural.
3. Idea detection falls back to lower confidence since we removed semantic scoring.

**Lines changed:** Remove ~10 lines
**Impact:** Users who typed `note: buy milk` will now get a Task instead of a Note. This is acceptable because: (a) almost no users type this prefix, and (b) the "unclear → Resource" behavior change will handle truly ambiguous cases better anyway.
**Risk:** Low.

### 1D. Delete `cognitive-flow.service.ts`

**Why:** Dead code. No imports. 60 lines.

**What changes:**
1. Delete the entire file.
2. Remove any re-exports if they exist (check `index.ts` files — none expected).

**Lines changed:** -60
**Impact:** Zero.
**Risk:** None.

### 1E. `TaskRepository.ts` — Remove DEBUG-* Console Logs

**Why:** 4 `console.log` statements logging full entity payloads in production code.

**What changes:**
Remove these four lines (search for `[DEBUG-4]`, `[DEBUG-5]`, `[DEBUG-6]`, `[DEBUG-7]`):
- `console.log("[DEBUG-4] task entering normalizeTask():"...)`
- `console.log("[DEBUG-5] cleanTask leaving normalizeTask():"...)`
- `console.log("[DEBUG-6] object written to AsyncStorage:"...)`
- `console.log("[DEBUG-7] object returned by getTask():"...)`

**Lines changed:** Remove 4 lines
**Impact:** Zero. These are debugging artifacts.
**Risk:** None.

### 1F. `CaptureService.ts` — Add Confidence Check

**Why:** When the parser is uncertain, save as Resource instead of the suggested type.

**What changes:**
1. At the top of `saveParsedItem()`, add:
```typescript
// If classifier is uncertain, default to Resource
const isLowConfidence = item.classification?.confidence === "unclear";
```
2. In the switch-case, when `type === "task"`:
```typescript
case "task":
  if (isLowConfidence) {
    // Parser defaulted to task without strong signals — save as Resource
    const resource = buildResource(item, workspaceId);
    await ResourceRepository.saveResource(resource);
    emitStateChange("resources_changed");
    entity = resource;
    break;
  }
  // ... existing task logic ...
```
3. For other types (habit, checklist, link, note, idea): continue using the parser's suggestion. Only the default-to-task path needs this check.

**Lines changed:** ~15 lines added to `saveParsedItem()`
**Impact:** High user-facing impact — ambiguous inputs now become Resources instead of Tasks. This is the behavior change the ADR mandates.
**Risk:** Medium — changes the behavior of every capture. Test thoroughly.

### 1G. `CaptureService.ts` — Remove `parseTime()` Duplication

**Why:** Identical to `entity-factory.service.ts`'s version.

**What changes:**
1. Delete the private `parseTime()` function from CaptureService (lines ~45-50).
2. Change `scheduleNotifications()` to import `parseTime` from entity-factory.

**Lines changed:** Remove ~6 lines, add 1 import
**Impact:** Zero.
**Risk:** None.

### 1H. `entity-factory.service.ts` — Fix File Attachment Mapping

**Why:** `buildResource()` maps `type: "file"` to `{ type: "note" }`, losing all attachment metadata.

**What changes:**
1. `buildResource()` needs to accept attachment data and store it in `Resource.attachments`.
2. The `ParsedProductivityItem` type does not include attachment data (it lives in component state). Either:
   a. Add an `attachments` field to `ParsedProductivityItem`, OR
   b. Have `CaptureService` pass attachment data alongside the parsed item.
   
**Recommendation:** Option (a) — add `attachments?: Attachment[]` to `ParsedProductivityItem`. This keeps the single-object contract. The attachment data moves from component state into the parsed result.

3. In `buildResource()`, add:
```typescript
attachments: item.attachments?.length ? item.attachments : undefined,
```
4. In `UnifiedCapture.tsx`, when the user picks a file, store the attachment in state AND set it on the parsed item:
```typescript
setParsedItem({
  type: "file",
  title: asset.name,
  confidence: 0.95,
  attachments: [{ name: asset.name, size: asset.size, uri: asset.uri }],
});
```

**Lines changed:** ~10 across 2 files
**Impact:** Fixes a real data loss bug.
**Risk:** Low.

### 1I. `UnifiedCapture.tsx` — Wire Undo

**Why:** Undo infrastructure exists (`UndoContext.showUndo()`) but the save flow uses `showToast()` (no action).

**What changes:**
1. Import `useUndo` at the top of the component (if not already imported — it's in `UndoContext.tsx`).
2. Store the last saved entity ID in a ref:
```typescript
const lastSavedEntityRef = useRef<{ id: string; type: string; repo: any } | null>(null);
```
3. In `handleSave()`, after `saveParsedItem()` succeeds:
```typescript
lastSavedEntityRef.current = { id: entity.id, type: entity.type, repo: getRepositoryForType(entity) };
```
4. Replace `showToast(...)` with:
```typescript
showUndo({
  message: `✓ ${typeLabel} added to ${wsName}`,
  actionLabel: "Undo",
  duration: 5000,
  onUndo: async () => {
    const ref = lastSavedEntityRef.current;
    if (ref) {
      if (ref.type === "task") await TaskRepository.deleteTask(ref.id, selectedWorkspaceId);
      else if (ref.type === "habit") await HabitRepository.deleteHabit(ref.id, selectedWorkspaceId);
      // ... etc
      emitStateChange(`${ref.type}s_changed`);
    }
  },
});
```

**Lines changed:** ~30 lines added, 1 line changed
**Impact:** Users can now undo a capture. This is the second most impactful user-facing change after the classification fix.
**Risk:** Low. UndoContext already supports the pattern.

### 1J. `UnifiedCapture.tsx` — Remove `onSaveComplete` Prop

**Why:** Always passed as `undefined`. Dead parameter.

**What changes:**
1. Remove `onSaveComplete?: () => void` from the `UnifiedCaptureProps` interface.
2. Remove the `onSaveComplete?.()` call in `handleSave()`.
3. Update the caller in `(tabs)/_layout.tsx` to remove the `onSaveComplete` prop.

**Lines changed:** Remove 3 lines across 2 files
**Impact:** Breaking change to the component interface. The caller (`_layout.tsx`) must update.
**Risk:** Low. The prop is literally `undefined`.

### 1K. `nlp-parser.service.ts` — Add Absolute-Time Reminder Parsing

**Why:** Only relative offsets are supported ("30 minutes before"). Users also type "remind me at 5pm".

**What changes:**
After the existing Stage 3 (relative reminder offset), add:
```typescript
// Absolute-time reminder parsing
const absoluteReminderRegex = /\b(?:remind|alert|notify)(?:\s+me)?\s+(?:at|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
const absoluteMatch = cleanedText.match(absoluteReminderRegex);
if (absoluteMatch) {
  let h = Number(absoluteMatch[1]);
  const m = absoluteMatch[2] ? Number(absoluteMatch[2]) : 0;
  if (absoluteMatch[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (absoluteMatch[3]?.toLowerCase() === "am" && h === 12) h = 0;
  reminderTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  // Set both time and a flag for absolute reminder
  timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  cleanedText = cleanedText.replace(absoluteMatch[0], "");
}
```

**Lines changed:** ~15 lines added
**Impact:** Supports common user phrase.
**Risk:** Low.

---

## 2. Implementation Order

Each step must compile, keep the app working, and be independently testable.

```
Step 1: SAFE DELETIONS
├── Delete cognitive-flow.service.ts
├── Remove DEBUG-* logs from TaskRepository.ts
├── Remove compromise.js from nlp-parser.service.ts
├── Remove artificial prefix detection from nlp-parser.service.ts
├── Remove onSaveComplete prop from UnifiedCapture.tsx and _layout.tsx
├── Remove duplicate parseTime() from CaptureService.ts
│
│   Why first: No behavior changes. No new types. Pure cleanup.
│   Testing: App must compile. Tests must pass.
│   PR: #1 — Cleanup

Step 2: NEW FIELD (zero behavior change)
├── Add classification field to ParsedProductivityItem type
├── Populate classification at end of parseProductivityText()
│
│   Why second: Adds the field but doesn't read it yet. Safe to ship.
│   Testing: nlpParser.test.ts must pass. New assertion on classification.confidence.
│   PR: #2 — Classification metadata (merged into PR #1 or separate)

Step 3: BEHAVIOR CHANGE
├── Add confidence check in CaptureService.saveParsedItem()
│
│   Why third: Depends on Step 2. The field must exist before it can be read.
│   Testing: Capture behavior changes for ambiguous inputs.
│   PR: #3 — Default unknown to Resource

Step 4: BUG FIXES
├── Wire undo in UnifiedCapture.tsx
├── Fix file attachment mapping in entity-factory.service.ts
│
│   Why fourth: Independent of Steps 1-3. Both are isolated fixes.
│   Testing: Undo button appears. File attachments persist.
│   PR: #4 — Bug fixes (undo + attachments)

Step 5: ENHANCEMENT
├── Add absolute-time reminder parsing to nlp-parser.service.ts
│
│   Why last: Small additive change. No dependencies on earlier steps.
│   Testing: "remind me at 5pm" produces correct time.
│   PR: #5 — Reminder enhancement
```

---

## 3. Per-Step Detail

### Step 1: Cleanup

| Item | Files Modified | Functions Modified | New Functions | Deleted Functions | Tests Affected | Possible Regressions | Rollback |
|---|---|---|---|---|---|---|---|
| Delete cognitive-flow | `cognitive-flow.service.ts` | None | None | `getCognitiveFlowStats()`, `getOptimalHours()` | None | None | Restore file |
| Remove DEBUG-* logs | `TaskRepository.ts` | `normalizeTask()`, `getTask()`, `saveTask()` | None | None | None | Console noise removed. Zero behavior change. | Restore lines |
| Remove compromise.js | `nlp-parser.service.ts` | `parseProductivityText()` | None | None | `nlpParser.test.ts` — category tests may change if fallback was hit | 1-2 fewer category detections per 100 inputs. Tests may need assertion updates. | Restore import + lines |
| Remove prefix detection | `nlp-parser.service.ts` | `parseProductivityText()` | None | None | `nlpParser.test.ts` — note/idea tests may change | Users who typed `note:` get Task instead of Note. Acceptable. | Restore lines |
| Remove onSaveComplete | `UnifiedCapture.tsx`, `(tabs)/_layout.tsx` | Component prop + handleSave | None | None | None | No behavior change. Prop was `undefined`. | Restore lines + prop |
| Remove parseTime() | `CaptureService.ts` | `scheduleNotifications()` | None | Private `parseTime()` | None | Import from entity-factory must resolve. | Restore function + add import |

### Step 2: Classification Field

| Item | Files Modified | Functions Modified | New Functions | Deleted Functions | Tests Affected | Possible Regressions | Rollback |
|---|---|---|---|---|---|---|---|
| Add `classification` type | `nlp-parser.service.ts` | Type definition | None | None | Type-checking across project | Any code accessing non-existent field. | Remove field |
| Populate `classification` | `nlp-parser.service.ts` | `parseProductivityText()` return | None | None | `nlpParser.test.ts` — add assertion on `classification.confidence` | New field ignored by existing consumers. Safe. | Remove population logic |

### Step 3: Confidence Check

| Item | Files Modified | Functions Modified | New Functions | Deleted Functions | Tests Affected | Possible Regressions | Rollback |
|---|---|---|---|---|---|---|---|
| Check `classification.confidence` in CaptureService | `CaptureService.ts` | `saveParsedItem()` | None | None | `nlpParser.test.ts` — ambiguous inputs now produce different behavior | If `classification` field is missing on any ParsedProductivityItem, optional chaining returns undefined. `undefined === "unclear"` is false → falls through to existing logic. Safe. | Remove the if-block |

### Step 4: Bug Fixes

| Item | Files Modified | Functions Modified | New Functions | Deleted Functions | Tests Affected | Possible Regressions | Rollback |
|---|---|---|---|---|---|---|---|
| Wire undo | `UnifiedCapture.tsx` | `handleSave()` | `getRepositoryForType()` | None | Manual QA | Undo button appears on save. Wrong entity type could call wrong delete method. | Remove undo wiring |
| Fix file attachments | `entity-factory.service.ts`, `UnifiedCapture.tsx` | `buildResource()`, `handleAttachment()` | None | None | Existing entities without attachments still load correctly | `attachments` field on Resource is optional. Missing `attachments: undefined` is valid. | Remove attachment logic |

### Step 5: Reminder Enhancement

| Item | Files Modified | Functions Modified | New Functions | Deleted Functions | Tests Affected | Possible Regressions | Rollback |
|---|---|---|---|---|---|---|---|
| Add absolute-time parsing | `nlp-parser.service.ts` | `parseProductivityText()` Stage 3 | None | None | Add test case | Existing relative-offset parsing not affected. Regex is separate. | Remove regex block |

---

## 4. Dependency Graph

```
Step 1: Cleanup (no deps)
├── 1D: Delete cognitive-flow.service.ts
├── 1E: Remove DEBUG-* logs
├── 1B: Remove compromise.js
├── 1C: Remove prefix detection
├── 1J: Remove onSaveComplete prop
├── 1G: Remove duplicate parseTime()
│
└── None depend on anything else. All safe.

Step 2: Classification field (depends on Step 1 parsing cleanup)
├── 1A: Add classification type + population
│
└── Depends on: nothing structural. Can run alongside Step 1.

Step 3: Confidence check (depends on Step 2)
├── 1F: Add confidence check to CaptureService
│
└── Depends on: Step 2 (classification field must exist on ParsedProductivityItem)

Step 4: Bug fixes (no deps on Steps 1-3)
├── 1H: Wire undo
├── 1I: Fix file attachments
│
└── Depends on: nothing. Can run alongside Steps 1-3.

Step 5: Enhancement (no deps)
├── 1K: Add absolute-time reminder parsing
│
└── Depends on: nothing. Can run alongside Steps 1-4.
```

**Parallel tracks:**
- Track A: Steps 1 → 2 → 3 (must be sequential — classification field before confidence check)
- Track B: Step 4 (independent, can run in parallel)
- Track C: Step 5 (independent, can run in parallel)

**Optimal parallel implementation:**
1. Day 1: Step 1 (cleanup) + Step 4 (bug fixes) in parallel
2. Day 2: Step 2 (classification field) + Step 5 (reminder parsing) in parallel
3. Day 2-3: Step 3 (confidence check — depends on Step 2)

---

## 5. Testing Plan

### Unit Tests

| Change | Test File | What to Test |
|---|---|---|
| Classification field | `nlpParser.test.ts` | Add test cases: empty input → `confidence: "unclear"`; normal task → `confidence: "high"`; ambiguous text → `confidence: "unclear"` |
| Remove compromise.js | `nlpParser.test.ts` | Existing category tests should still pass. Verify by running full suite. |
| Remove prefix detection | `nlpParser.test.ts` | Update any tests that used `note:` or `memo:` prefixes. These inputs now get different types. |
| Absolute-time parsing | `nlpParser.test.ts` | Add test: `"remind me at 5pm"` → `time: "17:00"`; `"alert me at 14:30"` → `time: "14:30"`; Existing relative-offset tests should still pass. |

### Integration Tests

| Change | What to Test |
|---|---|
| Confidence check in CaptureService | Save an ambiguous input (e.g., `"Research SQLite WAL"`). Verify it is saved as Resource, not Task. |
| Wire undo | Create an entity via capture. Tap undo. Verify entity is deleted. Verify toast appears and disappears. |
| File attachment fix | Attach a file via capture. Save. Reload workspace. Verify Resource has `attachments` populated. |
| Remove parseTime duplication | Create a task with a time. Verify reminder is scheduled correctly. |

### Manual QA Checklist

- [ ] Type `"Buy milk"` → saves as Task (high confidence, actionable verb)
- [ ] Type `"Research SQLite WAL"` → saves as Resource/Note (unclear, passive)
- [ ] Type `"Quote from a book..."` → saves as Resource/Note (unclear)
- [ ] Type `"Gym every day at 7am"` → saves as Habit (recurrence + health)
- [ ] Type `"Remind me at 5pm to call mom"` → time parsed as 17:00
- [ ] Attach a file → saves as Resource with attachment metadata
- [ ] Save a capture → undo button appears → tap undo → entity deleted
- [ ] Tap dismiss without saving → draft recovery restores text (Phase 1 will not have this — note it as gap)

### Edge Cases

| Input | Expected Behavior |
|---|---|
| `""` (empty) | No parse. No save button. |
| `" "` (whitespace) | No parse. No save button. |
| `"a"` (single char) | Classification: low confidence. Saved as Resource. |
| `"https://github.com/pebble"` | Classification: high confidence (URL pattern). Link Resource. |
| `"Buy milk, eggs, bread"` | Classification: medium. Single-line checklist NOT detected. Saved as Task. (Known limitation — Phase 2 improvement). |
| `"- Milk\n- Bread\n- Eggs"` | Classification: high (multiline). Checklist. |
| Text with 501+ chars | Truncated at 500 by input maxLength. No downstream validation. |
| `"Remind me 30 minutes before meeting"` | Existing relative-offset parsing. reminderOffsetMinutes: 30. |
| `"Alert at 5pm that meeting starts"` | New absolute-time parsing. time: "17:00". |

### Failure Scenarios

| Scenario | Expected Behavior | Recovery |
|---|---|---|
| `saveParsedItem()` throws after repository save | Entity saved but events/analytics not emitted. | Manual refresh. |
| `scheduleReminderBatch()` throws | Entity saved without reminders. Console.warn logged. | User can add reminder manually. |
| Undo callback throws | Entity not deleted. Toast disappears. | User can manually delete. |
| Classification field is missing on parsed item | Optional chaining: `item.classification?.confidence` returns `undefined`. `undefined === "unclear"` is false → falls through to existing behavior. | No crash. Falls back correctly. |

---

## 6. Risk Assessment

### High-Risk Changes

| Change | Risk | Why | Mitigation |
|---|---|---|---|
| Confidence check in CaptureService | Medium | Changes save behavior for every capture. Could accidentally save intended Tasks as Resources. | Conservative threshold: only `"unclear"` triggers the Resource path. `"low"` and `"medium"` still use the parser's suggestion. Test with real ambiguous inputs. |

### Medium-Risk Changes

| Change | Risk | Why | Mitigation |
|---|---|---|---|
| Remove compromise.js | Low-Medium | Category fallback may miss 1-2 cases per 100 inputs. | Track category detection rate before and after. If rate drops, add regex patterns to compensate. |
| Remove prefix detection | Low-Medium | Users who typed `note:` get Task instead of Note. | Acceptable because (a) almost no users type this, (b) the unclear→Resource path handles truly ambiguous inputs better. |

### Low-Risk Changes

| Change | Risk | Why |
|---|---|---|
| Delete cognitive-flow.service.ts | None | Dead code. No imports. |
| Remove DEBUG-* logs | None | Debug artifacts. |
| Wire undo | Low | UndoContext already supports the pattern. Entity deletion is well-tested. |
| Fix file attachments | Low | `attachments` field on Resource is optional. Backward compatible. |
| Add absolute-time parsing | Low | Separate regex, does not affect existing relative-offset parsing. |
| Add classification field | Low | New optional field. All existing consumers still read `type`. No behavior change until Step 3. |
| Remove duplicate parseTime() | Low | Identical logic. Importing shared version produces same output. |

---

## 7. Actionable Checklist

### Step 1: Cleanup (PR #1)

- [ ] 1D: Delete `cognitive-flow.service.ts` from `features/capture/services/`
- [ ] 1E: Remove 4 `console.log("[DEBUG-*]")` lines from `TaskRepository.ts`
- [ ] 1B: Remove `import nlp from "compromise"` and 3 `compromiseDoc.match(...)` checks from `nlp-parser.service.ts`
- [ ] 1C: Remove `note:`, `note `, `remember:`, `remember `, `memo:`, `memo ` prefix detection block from `nlp-parser.service.ts`
- [ ] 1J: Remove `onSaveComplete` prop from `UnifiedCaptureProps` interface
- [ ] 1J: Remove `onSaveComplete?.()` call from `handleSave()`
- [ ] 1J: Remove `onSaveComplete={undefined}` from `(tabs)/_layout.tsx`
- [ ] 1G: Delete private `parseTime()` from `CaptureService.ts`
- [ ] 1G: Add import `{ parseTime }` from entity-factory in `CaptureService.ts`
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Verify: `npx jest services/__tests__/nlpParser.test.ts` passes
- [ ] Verify: `npx jest` passes (full suite)

### Step 2: Classification Field (PR #2)

- [ ] 1A: Add `classification: { suggested, confidence, detectionSignal? }` type to `ParsedProductivityItem`
- [ ] 1A: Add classification population logic at end of `parseProductivityText()`
- [ ] 1A: Return `classification` in the return object
- [ ] Verify: `nlpParser.test.ts` includes new assertion on `classification.confidence`
- [ ] Verify: `npx tsc --noEmit` passes

### Step 3: Confidence Check (PR #3)

- [ ] 1F: Add `isLowConfidence` check in `saveParsedItem()`
- [ ] 1F: When `classification.confidence === "unclear"` and `type === "task"`, build + save Resource
- [ ] 1F: When `classification.confidence === "unclear"` and type is not task, use existing logic
- [ ] Verify: Type `"Research SQLite WAL"` → saves as Resource
- [ ] Verify: Type `"Buy milk"` → saves as Task (unchanged)
- [ ] Verify: `npx jest` passes

### Step 4: Bug Fixes (PR #4)

- [ ] 1H: Add `attachments` field to `ParsedProductivityItem` type
- [ ] 1H: Update `UnifiedCapture.tsx` handleAttachment to store attachment in parsedItem
- [ ] 1H: Update `buildResource()` to populate `Resource.attachments`
- [ ] 1I: Add `lastSavedEntityRef` to `UnifiedCapture.tsx`
- [ ] 1I: Replace `showToast()` with `showUndo()` in `handleSave()`
- [ ] 1I: Import repository delete methods for undo callback
- [ ] Verify: Attach file → save → reload → attachment persists
- [ ] Verify: Save → undo button appears → tap undo → entity deleted
- [ ] Verify: `npx tsc --noEmit` passes

### Step 5: Reminder Enhancement (PR #5)

- [ ] 1K: Add absolute-time regex and parsing logic to `nlp-parser.service.ts` Stage 3
- [ ] Verify: `"remind me at 5pm"` → `time: "17:00"`
- [ ] Verify: `"alert me at 14:30"` → `time: "14:30"`
- [ ] Verify: Existing `"remind me 30 minutes before"` still works
- [ ] Verify: `npx jest services/__tests__/nlpParser.test.ts` passes

---

## 8. Pull Request Plan

### PR #1: Cleanup

| Field | Value |
|---|---|
| **Title** | `chore: remove dead code and debug artifacts from capture pipeline` |
| **Purpose** | Remove `cognitive-flow.service.ts`, `compromise.js`, DEBUG-* logs, artificial prefix detection, duplicate `parseTime()`, and dead `onSaveComplete` prop. Zero behavior change. |
| **Files touched** | `cognitive-flow.service.ts` (DELETE), `TaskRepository.ts` (-4 lines), `nlp-parser.service.ts` (-25 lines), `CaptureService.ts` (-6 lines + 1 import), `UnifiedCapture.tsx` (-1 line), `(tabs)/_layout.tsx` (-1 line) |
| **Review difficulty** | Easy. Each change is mechanical. |
| **Merge order** | 1st. |
| **Expected size** | ~-90 lines net. |
| **Testing** | `tsc --noEmit` + full test suite. |

### PR #2: Classification Metadata

| Field | Value |
|---|---|
| **Title** | `feat: add classification metadata to parser output` |
| **Purpose** | Add `classification: { suggested, confidence }` field to `ParsedProductivityItem`. Populated but not consumed yet. Safe additive change. |
| **Files touched** | `nlp-parser.service.ts` (+15 lines for type + ~10 for population) |
| **Review difficulty** | Easy. New field on existing type. No consumers yet. |
| **Merge order** | 2nd (depends on PR #1 for clean parser). |
| **Expected size** | ~+25 lines. |
| **Testing** | `nlpParser.test.ts` adds assertions on `classification.confidence`. Full test suite. |

### PR #3: Default Unknown to Resource

| Field | Value |
|---|---|
| **Title** | `fix: default ambiguous captures to Resource instead of Task` |
| **Purpose** | When parser confidence is `"unclear"`, CaptureService saves as Resource instead of the suggested type. Fixes the most impactful user-facing bug. |
| **Files touched** | `CaptureService.ts` (+15 lines) |
| **Review difficulty** | Medium. Reviewer must understand the confidence model and verify threshold is correct. |
| **Merge order** | 3rd (depends on PR #2 for the classification field). |
| **Expected size** | ~+15 lines. |
| **Testing** | Manual QA with ambiguous inputs. Type check. |

### PR #4: Bug Fixes (Undo + Attachments)

| Field | Value |
|---|---|
| **Title** | `fix: wire capture undo and fix file attachment persistence` |
| **Purpose** | (1) Replace `showToast` with `showUndo` so users can undo saves. (2) Fix file attachment data loss in EntityFactory. |
| **Files touched** | `UnifiedCapture.tsx` (+30 lines), `entity-factory.service.ts` (+3 lines), `nlp-parser.service.ts` type (+3 lines) |
| **Review difficulty** | Medium. Undo logic spans multiple repositories. EntityFactory change is small. |
| **Merge order** | 4th (no dependencies on PR #2/3). Could merge before PR #3. |
| **Expected size** | ~+36 lines. |
| **Testing** | Manual QA for undo flow. Manual QA for file attachment persistence. Type check. |

### PR #5: Reminder Enhancement

| Field | Value |
|---|---|
| **Title** | `feat: add absolute-time reminder parsing to capture` |
| **Purpose** | Support "remind me at 5pm" in addition to existing "remind me 30 minutes before". |
| **Files touched** | `nlp-parser.service.ts` (+15 lines) |
| **Review difficulty** | Easy. Isolated regex addition. |
| **Merge order** | 5th (no dependencies). Could merge before or after any other PR. |
| **Expected size** | ~+15 lines. |
| **Testing** | `nlpParser.test.ts` adds absolute-time test cases. |

### PR Merge Order Diagram

```
PR #1 (Cleanup) ──→ PR #2 (Classification field) ──→ PR #3 (Confidence check)
                                                         
PR #4 (Bug fixes) ────────────────────────────────── (independent, can merge anytime)
                                                         
PR #5 (Reminder) ──────────────────────────────────── (independent, can merge anytime)
```

---

## 9. Final Validation Against ADR

Before starting implementation, verify against the Architecture Constitution:

| ADR Rule | Verified? | How |
|---|---|---|
| All entity creation goes through CaptureService | ✅ Yes | SuggestionBanner still bypasses — this is a Phase 2 task, not Phase 1. Phase 1 fixes the classification and bugs. |
| Parser never writes to repositories | ✅ Yes | `nlp-parser.service.ts` is still pure. No changes to side effects. |
| EntityFactory remains pure | ✅ Yes | `buildResource()` gains a new field (`attachments`) but no side effects. |
| UI never constructs entities | ✅ Yes | UnifiedCapture still calls CaptureService. Undo callback calls repositories directly — acceptable for a rollback action. |
| Prefer extending existing services over new files | ✅ Yes | Zero new files in Phase 1 (cognitive-flow deletion removes one). |
| One function is better than one class | ✅ Yes | No classes introduced. |
| Dead code is deleted | ✅ Yes | `cognitive-flow.service.ts`, `compromise.js` import, `onSaveComplete` prop — all deleted. |
| `console.log` is for development only | ✅ Yes | 4 DEBUG-* statements removed. |
| Every entity creation should be undoable | ✅ Yes | `showUndo` wired with entity deletion callback. |
| Default unknown to Resource | ✅ Yes | `classification.confidence === "unclear"` → Resource. |

### What Phase 1 does NOT fix (acknowledged gaps)

| Gap | ADR Reference | Scheduled For |
|---|---|---|
| SuggestionBanner still bypasses CaptureService | Rule 1 | Phase 2 |
| `useTasksState.ts` still imports parser type | Rule 1 | Phase 2 |
| Draft recovery not implemented | ADR Phase 2 | Phase 2 |
| Tag extraction not implemented | ADR Phase 2 | Phase 2 |
| Editable review panel not implemented | ADR Phase 2 | Phase 2 |
| Duplicate detection not implemented | ADR Phase 2 | Phase 2 |
| `collectSuggestions()` not created | ADR Phase 2 | Phase 2 |

These are acknowledged Phase 2 items. They do not block Phase 1.

---

## Summary

| Metric | Value |
|---|---|
| **Total PRs** | 5 |
| **Total lines changed** | ~-5 net (more deleted than added) |
| **New files** | 0 |
| **Deleted files** | 1 (`cognitive-flow.service.ts`) |
| **Estimated effort** | 5-8 days |
| **Risk** | Low-Medium (highest risk: PR #3 confidence check) |
| **Merge order** | PR #1 → PR #2 → PR #3, PR #4 and PR #5 independent |
| **Testing confidence** | High — each step independently testable, rollback is restore individual lines |
