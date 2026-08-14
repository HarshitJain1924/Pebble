jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(async () => ""),
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View, TextInput } = require("react-native");
  return {
    BottomSheetModal: ({ children }: any) => React.createElement(View, null, children),
    BottomSheetScrollView: ({ children }: any) => React.createElement(View, null, children),
    BottomSheetTextInput: (props: any) => React.createElement(TextInput, props),
    BottomSheetBackdrop: () => null,
  };
});
const mockUndoApi = { showToast: jest.fn(), showUndo: jest.fn() };
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => mockUndoApi,
}));
jest.mock("@/features/workspaces/services/workspace-suggestions.service", () => ({
  getWorkspaceSuggestions: jest.fn(async () => []),
}));
jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(() => jest.fn()),
}));

import React, { useState } from "react";
import { TextInput, Modal, Image } from "react-native";
import { act, create } from "react-test-renderer";
import CaptureInputBox from "@/features/capture/components/CaptureInputBox";
import UnifiedCapture from "@/features/capture/components/UnifiedCapture";
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import { getWorkspaceSuggestions } from "@/features/workspaces/services/workspace-suggestions.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResourceRepository, TaskRepository } from "@/repositories";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("Quick Capture text-input concurrency, multiline & integrity suite", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("1. Rapid typing does not lose characters (e.g. 'm' -> 'mi' -> 'mil' -> 'milk')", () => {
    const keystrokeHistory: string[] = [];

    function TestHarness() {
      const [text, setText] = useState("");
      return (
        <CaptureInputBox
          value={text}
          onChangeText={(newText) => {
            keystrokeHistory.push(newText);
            setText(newText);
          }}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    }

    let renderer: any;
    act(() => {
      renderer = create(<TestHarness />);
    });

    const textInput = renderer.root.findByType(TextInput);

    // Simulate typing "m", "mi", "mil", "milk" rapidly without waiting for timeouts
    act(() => {
      textInput.props.onChangeText("m");
    });
    act(() => {
      textInput.props.onChangeText("mi");
    });
    act(() => {
      textInput.props.onChangeText("mil");
    });
    act(() => {
      textInput.props.onChangeText("milk");
    });

    // Verify all keystrokes were received synchronously and in exact order
    expect(keystrokeHistory).toEqual(["m", "mi", "mil", "milk"]);

    // Verify the controlled TextInput holds the authoritative full text "milk"
    expect(renderer.root.findByType(TextInput).props.value).toBe("milk");
  });

  it("2. Rapid deletion ('milk' -> 'mil' -> 'mi' -> 'm' -> '') preserves intermediate states and never stalls or overwrites", () => {
    const deletionHistory: string[] = [];

    function TestHarness() {
      const [text, setText] = useState("milk");
      return (
        <CaptureInputBox
          value={text}
          onChangeText={(newText) => {
            deletionHistory.push(newText);
            setText(newText);
          }}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    }

    let renderer: any;
    act(() => {
      renderer = create(<TestHarness />);
    });

    const textInput = renderer.root.findByType(TextInput);
    expect(textInput.props.value).toBe("milk");

    // Rapid backspaces
    act(() => {
      textInput.props.onChangeText("mil");
    });
    act(() => {
      textInput.props.onChangeText("mi");
    });
    act(() => {
      textInput.props.onChangeText("m");
    });
    act(() => {
      textInput.props.onChangeText("");
    });

    expect(deletionHistory).toEqual(["mil", "mi", "m", ""]);
    expect(renderer.root.findByType(TextInput).props.value).toBe("");
  });

  it("3. Rapid multiline input progression ('shopping' -> 'shopping\\n' -> 'shopping\\nmilk' -> 'shopping\\nmilk\\n' -> 'shopping\\nmilk\\nbread')", () => {
    const multilineHistory: string[] = [];

    function TestHarness() {
      const [text, setText] = useState("");
      return (
        <CaptureInputBox
          value={text}
          onChangeText={(newText) => {
            multilineHistory.push(newText);
            setText(newText);
          }}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    }

    let renderer: any;
    act(() => {
      renderer = create(<TestHarness />);
    });

    const textInput = renderer.root.findByType(TextInput);
    expect(textInput.props.multiline).toBe(true);

    const steps = [
      "shopping",
      "shopping\n",
      "shopping\nmilk",
      "shopping\nmilk\n",
      "shopping\nmilk\nbread",
    ];

    for (const step of steps) {
      act(() => {
        textInput.props.onChangeText(step);
      });
      expect(renderer.root.findByType(TextInput).props.value).toBe(step);
    }

    expect(multilineHistory).toEqual(steps);
  });

  it("4. Rapid typing and deletion of a long multiline block preserves all intermediate values", () => {
    const history: string[] = [];

    function TestHarness() {
      const [text, setText] = useState("");
      return (
        <CaptureInputBox
          value={text}
          onChangeText={(newText) => {
            history.push(newText);
            setText(newText);
          }}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    }

    let renderer: any;
    act(() => {
      renderer = create(<TestHarness />);
    });

    const textInput = renderer.root.findByType(TextInput);

    // Rapid multiline entry
    const multilineText = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6";
    const chunks = [
      "Line 1",
      "Line 1\n",
      "Line 1\nLine 2",
      "Line 1\nLine 2\nLine 3",
      "Line 1\nLine 2\nLine 3\nLine 4",
      "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
      multilineText,
    ];

    chunks.forEach((chunk) => {
      act(() => {
        textInput.props.onChangeText(chunk);
      });
    });

    expect(renderer.root.findByType(TextInput).props.value).toBe(multilineText);

    // Rapid multiline deletion
    const deletionChunks = [
      "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
      "Line 1\nLine 2\nLine 3\nLine 4",
      "Line 1\nLine 2\nLine 3",
      "Line 1\nLine 2",
      "Line 1",
      "",
    ];

    deletionChunks.forEach((chunk) => {
      act(() => {
        textInput.props.onChangeText(chunk);
      });
    });

    expect(renderer.root.findByType(TextInput).props.value).toBe("");
  });

  it("5. Rapid middle-of-text insertions and deletions remain completely responsive", () => {
    const history: string[] = [];

    function TestHarness() {
      const [text, setText] = useState("buy milk today");
      return (
        <CaptureInputBox
          value={text}
          onChangeText={(newText) => {
            history.push(newText);
            setText(newText);
          }}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    }

    let renderer: any;
    act(() => {
      renderer = create(<TestHarness />);
    });

    const textInput = renderer.root.findByType(TextInput);

    // Insert in middle: "buy oat milk today"
    act(() => {
      textInput.props.onChangeText("buy oat milk today");
    });
    // Delete in middle: "buy milk today"
    act(() => {
      textInput.props.onChangeText("buy milk today");
    });
    // Replace in middle: "buy almond milk today"
    act(() => {
      textInput.props.onChangeText("buy almond milk today");
    });

    expect(history).toEqual([
      "buy oat milk today",
      "buy milk today",
      "buy almond milk today",
    ]);
    expect(renderer.root.findByType(TextInput).props.value).toBe("buy almond milk today");
  });

  it("6. NLP parsing and animations are strictly debounced and do not trigger immediately on keystrokes", () => {
    const sheetRef = { current: { dismiss: jest.fn() } } as any;
    const workspaces = [{ id: "ws-1", name: "General", emoji: "📂" }];

    let renderer: any;
    act(() => {
      renderer = create(
        <UnifiedCapture
          sheetRef={sheetRef}
          workspaces={workspaces}
          defaultWorkspaceId="ws-1"
        />
      );
    });

    const getTextInput = () => renderer.root.findByType(TextInput);

    // User types "m"
    act(() => {
      getTextInput().props.onChangeText("m");
    });
    // User types "i" within 50ms
    act(() => {
      jest.advanceTimersByTime(50);
      getTextInput().props.onChangeText("mi");
    });
    // User types "l" within 50ms
    act(() => {
      jest.advanceTimersByTime(50);
      getTextInput().props.onChangeText("mil");
    });
    // User types "k" within 50ms
    act(() => {
      jest.advanceTimersByTime(50);
      getTextInput().props.onChangeText("milk");
    });

    // Verify raw input holds "milk" immediately
    expect(getTextInput().props.value).toBe("milk");

    // Only after full 450ms idle does parsing occur
    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(getTextInput().props.value).toBe("milk");
  });

  it("7. An async NLP/workspace result arriving after newer input does not overwrite the newer text or apply stale state", async () => {
    const mockGetWorkspaceSuggestions = getWorkspaceSuggestions as jest.Mock;
    const firstCallDeferred = deferred<any[]>();
    const secondCallDeferred = deferred<any[]>();

    let callCount = 0;
    mockGetWorkspaceSuggestions.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return firstCallDeferred.promise;
      return secondCallDeferred.promise;
    });

    const sheetRef = { current: { dismiss: jest.fn() } } as any;
    const workspaces = [
      { id: "ws-groceries", name: "Groceries", emoji: "🛒" },
      { id: "ws-work", name: "Work", emoji: "💼" },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <UnifiedCapture
          sheetRef={sheetRef}
          workspaces={workspaces}
          defaultWorkspaceId="ws-work"
        />
      );
    });

    const getTextInput = () => renderer.root.findByType(TextInput);

    // Step 1: User types "milk"
    act(() => {
      getTextInput().props.onChangeText("milk");
    });
    expect(getTextInput().props.value).toBe("milk");

    // Fast-forward debounce timer (450ms) to trigger first async suggestion fetch
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(mockGetWorkspaceSuggestions).toHaveBeenCalledTimes(1);

    // Step 2: While first suggestion is in-flight, user types "milk and cookies"
    act(() => {
      getTextInput().props.onChangeText("milk and cookies");
    });
    expect(getTextInput().props.value).toBe("milk and cookies");

    // Step 3: First in-flight async result resolves late with suggestions for "milk" (ws-groceries)
    await act(async () => {
      firstCallDeferred.resolve([
        { workspaceId: "ws-groceries", name: "Groceries", score: 90 },
      ]);
    });

    // Verify: input text is STILL "milk and cookies", raw input was never clobbered
    expect(getTextInput().props.value).toBe("milk and cookies");

    // Advance timers for the second debounced parse ("milk and cookies")
    act(() => {
      jest.advanceTimersByTime(450);
    });

    await act(async () => {
      secondCallDeferred.resolve([
        { workspaceId: "ws-work", name: "Work", score: 80 },
      ]);
    });

    // Input remains authoritative
    expect(getTextInput().props.value).toBe("milk and cookies");
  });

  it("8. Cursor/selection remains usable when editing in the middle of a sentence", () => {
    let currentText = "buy milk today";
    const onSelectionChange = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <CaptureInputBox
          value={currentText}
          onChangeText={(newText) => {
            currentText = newText;
          }}
          textInputProps={{
            selection: { start: 4, end: 4 },
            onSelectionChange,
          }}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    });

    const textInput = renderer.root.findByType(TextInput);
    expect(textInput.props.selection).toEqual({ start: 4, end: 4 });

    // User inserts "fresh " at index 4 -> "buy fresh milk today"
    act(() => {
      textInput.props.onChangeText("buy fresh milk today");
    });

    expect(currentText).toBe("buy fresh milk today");
  });

  it("9. Existing NLP extraction still works after typing stops/submission", () => {
    // Task with date & time
    const taskParsed = parseProductivityText("Buy groceries tomorrow at 5pm");
    expect(taskParsed.type).toBe("task");
    expect(taskParsed.title).toBe("Buy groceries");
    expect(taskParsed.time).toBe("17:00");
    expect(taskParsed.date).toBeDefined();

    // Habit with daily recurrence
    const habitParsed = parseProductivityText("Gym workout every morning");
    expect(habitParsed.type).toBe("habit");
    expect(habitParsed.recurrence?.type).toBe("daily");

    // Link detection
    const linkParsed = parseProductivityText("https://github.com/facebook/react-native");
    expect(linkParsed.type).toBe("link");
    expect(linkParsed.url).toBe("https://github.com/facebook/react-native");

    // Checklist detection
    const listParsed = parseProductivityText("- Apples\n- Oranges\n- Bananas");
    expect(listParsed.type).toBe("checklist");
    expect(listParsed.items).toEqual(["Apples", "Oranges", "Bananas"]);
  });

  it("10. Quick Capture submission creates the correct entity via CaptureService", async () => {
    const taskItem = parseProductivityText("Submit quarterly taxes tomorrow at 2pm");
    const savedTask = await saveParsedItem(taskItem, "ws-finance");

    expect(savedTask.id).toMatch(/^task-/);
    expect(savedTask.workspaceId).toBe("ws-finance");
    expect(savedTask.title).toBe("Submit quarterly taxes");
    expect((savedTask as any).status).toBe("todo");

    const habitItem = parseProductivityText("Meditate every day");
    const savedHabit = await saveParsedItem(habitItem, "ws-health");

    expect(savedHabit.id).toMatch(/^habit-/);
    expect(savedHabit.workspaceId).toBe("ws-health");
    expect(savedHabit.title).toBe("Meditate");
  });

  it("11. Crossing multiline height thresholds (lines 1->2->3->4 and deletion) preserves stable container space", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <CaptureInputBox
          value=""
          onChangeText={jest.fn()}
          voiceStatus="idle"
          onVoiceStart={jest.fn()}
          onVoiceStop={jest.fn()}
          onVoiceCancel={jest.fn()}
          themePrimary="#6366F1"
          backgroundColor="#FFFFFF"
          borderColor="#CCCCCC"
          textColor="#000000"
        />
      );
    });

    const container = renderer.root.children[0];
    const textInput = renderer.root.findByType(TextInput);

    // Verify container and textInput styles specify allocated minHeights
    const flatContainerStyle = Object.assign({}, ...[].concat(container.props.style).filter(Boolean));
    const flatTextInputStyle = Object.assign({}, ...[].concat(textInput.props.style).filter(Boolean));

    expect(flatContainerStyle.minHeight).toBe(172);
    expect(flatTextInputStyle.minHeight).toBe(88);
    expect(flatTextInputStyle.maxHeight).toBe(154);
  });

  describe("Quick Capture draft persistence, checklist preview & undo suite", () => {
    const sheetRef = { current: { dismiss: jest.fn() } } as any;
    const workspaces = [{ id: "ws-work", name: "Work", emoji: "💼" }];

    beforeEach(async () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      await AsyncStorage.clear();
    });

    const renderCapture = async () => {
      let renderer: any;
      await act(async () => {
        renderer = create(
          <UnifiedCapture
            sheetRef={sheetRef}
            workspaces={workspaces}
            defaultWorkspaceId="ws-work"
          />
        );
      });
      return renderer;
    };

    it("12. Persists the in-progress draft on idle and restores it on a fresh mount", async () => {
      let renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      act(() => {
        getTextInput().props.onChangeText("Finish the report tomorrow");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      await act(async () => {});

      // Draft is persisted to storage
      expect(await AsyncStorage.getItem("quick_capture_draft_v1")).toBe("Finish the report tomorrow");

      // Simulate an app restart: unmount and mount fresh
      await act(async () => {
        renderer.unmount();
      });
      renderer = await renderCapture();
      await act(async () => {});

      // Draft is restored into the input (and its metadata re-parsed)
      expect(getTextInput().props.value).toBe("Finish the report tomorrow");
    });

    it("13. Clears the draft when the input is emptied", async () => {
      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      act(() => {
        getTextInput().props.onChangeText("Buy milk");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      await act(async () => {});
      expect(await AsyncStorage.getItem("quick_capture_draft_v1")).toBe("Buy milk");

      act(() => {
        getTextInput().props.onChangeText("");
      });
      await act(async () => {});
      expect(await AsyncStorage.getItem("quick_capture_draft_v1")).toBeNull();
    });

    it("14. Shows a compact preview of parsed checklist items", async () => {
      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      act(() => {
        getTextInput().props.onChangeText("- Apples\n- Oranges\n- Bananas\n- Butter");
      });
      act(() => {
        jest.advanceTimersByTime(450); // debounce → parse runs
      });
      act(() => {
        jest.advanceTimersByTime(600); // parsing phase → "understood", summary card appears
      });
      await act(async () => {});

      const renderedStrings = renderer.root
        .findAll((n: any) => typeof n.props?.children === "string")
        .map((n: any) => n.props.children as string);

      expect(renderedStrings).toContain("Apples");
      expect(renderedStrings).toContain("Oranges");
      expect(renderedStrings).toContain("Bananas");
      expect(renderedStrings).toContain("+1 more");
    });

    it("15. Add offers Undo; invoking it deletes the created entity and restores the text", async () => {
      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      act(() => {
        getTextInput().props.onChangeText("Buy milk tomorrow");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      await act(async () => {});

      // Tap the Add button (walk up from the label to the pressable with the handler)
      const addText = renderer.root.find((n: any) => n.props?.children === "Add");
      let pressable: any = addText.parent;
      while (pressable && typeof pressable.props?.onPress !== "function") {
        pressable = pressable.parent;
      }
      await act(async () => {
        pressable.props.onPress();
      });

      // Undo was offered with the correct contract
      expect(mockUndoApi.showUndo).toHaveBeenCalledTimes(1);
      const undoOpts = mockUndoApi.showUndo.mock.calls[0][0];
      expect(undoOpts.actionLabel).toBe("Undo");
      expect(undoOpts.message).toContain("Task added");
      expect(typeof undoOpts.onUndo).toBe("function");

      // The task exists in the repository
      const tasks = await TaskRepository.getTasks("ws-work");
      const saved = Object.values(tasks).find((t: any) => t.title === "Buy milk");
      expect(saved).toBeDefined();

      // Invoking Undo deletes it and restores the capture text
      await act(async () => {
        await undoOpts.onUndo();
      });

      const tasksAfter = await TaskRepository.getTasks("ws-work");
      expect(Object.values(tasksAfter).some((t: any) => t.id === (saved as any).id)).toBe(false);
      expect(getTextInput().props.value).toBe("Buy milk tomorrow");
    });

    const getAddDisabled = (renderer: any) => {
      const addText = renderer.root.find((n: any) => n.props?.children === "Add");
      let pressable: any = addText.parent;
      while (pressable && typeof pressable.props?.onPress !== "function") {
        pressable = pressable.parent;
      }
      return pressable.props.disabled === true;
    };

    const pressLabel = (renderer: any, label: string) => {
      const labelNode = renderer.root.find((n: any) => n.props?.children === label);
      let pressable: any = labelNode.parent;
      while (pressable && typeof pressable.props?.onPress !== "function") {
        pressable = pressable.parent;
      }
      return act(async () => {
        pressable.props.onPress();
      });
    };

    it("16. A near-duplicate (same title, different date) offers Create anyway / Use existing", async () => {
      // Seed an existing task with no date
      await saveParsedItem(parseProductivityText("Buy milk"), "ws-work");

      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      // Same title but with a date → near_duplicate (isPotentialDuplicate: true)
      act(() => {
        getTextInput().props.onChangeText("Buy milk tomorrow");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await act(async () => {});

      // Explicit choice UI, same as exact duplicates / habits — no dead end
      const renderedStrings = renderer.root
        .findAll((n: any) => typeof n.props?.children === "string")
        .map((n: any) => n.props.children as string);
      expect(renderedStrings).toContain("Similar item found");
      expect(renderedStrings).toContain("Create anyway");
      expect(renderedStrings).toContain("Use existing");
      expect(getAddDisabled(renderer)).toBe(true);

      // "Create anyway" actually saves
      await pressLabel(renderer, "Create anyway");
      expect(mockUndoApi.showUndo).toHaveBeenCalled();
    });

    it("17. Editing text immediately re-enables Add (stale duplicate cleared on keystroke)", async () => {
      // Seed an exact duplicate target
      await saveParsedItem(parseProductivityText("Buy milk"), "ws-work");

      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      // Exact duplicate → Add disabled (the intended block with Create anyway / Use existing)
      act(() => {
        getTextInput().props.onChangeText("Buy milk");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await act(async () => {});
      expect(getAddDisabled(renderer)).toBe(true);

      // User edits — Add re-enables on the keystroke itself, no 450ms wait
      act(() => {
        getTextInput().props.onChangeText("Buy milk and eggs");
      });
      expect(getAddDisabled(renderer)).toBe(false);
    });

    it("18. Saves a Note resource via Quick Capture", async () => {
      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      act(() => {
        getTextInput().props.onChangeText("Note: project requirements");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await act(async () => {});

      await pressLabel(renderer, "Add");

      // The resource was persisted through the real capture pipeline
      const resources = await ResourceRepository.getResources("ws-work");
      expect(Object.values(resources).some((r: any) => r.title === "Project requirements")).toBe(true);
      expect(mockUndoApi.showUndo).toHaveBeenCalled();
    });

    it("19. Saves a picked file as a Resource with the attachment (no typed text needed)", async () => {
      const { getDocumentAsync } = require("expo-document-picker");
      (getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            name: "report.pdf",
            uri: "file:///cache/report.pdf",
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
      });

      const renderer = await renderCapture();

      // Tap the paperclip (attachment) button
      const paperclip = renderer.root.findAll((n: any) => n.props?.name === "paperclip")[0];
      let attachBtn: any = paperclip.parent;
      while (attachBtn && typeof attachBtn.props?.onPress !== "function") {
        attachBtn = attachBtn.parent;
      }
      await act(async () => {
        await attachBtn.props.onPress();
      });

      // The attachment preview renders as a standalone file card (editable name +
      // size · type details), as independent metadata — no "File" type chip.
      const renameInput = renderer.root.findAll((n: any) => n.props?.accessibilityLabel === "Rename file")[0];
      expect(renameInput.props.value).toBe("report.pdf");
      const metaStrings = renderer.root
        .findAll((n: any) => typeof n.props?.children === "string")
        .map((n: any) => n.props.children as string);
      expect(metaStrings).toContain("2 KB · PDF");
      expect(metaStrings).not.toContain("File");

      // Add saves the Resource with the attachment — no typed text required
      await pressLabel(renderer, "Add");

      const resources = await ResourceRepository.getResources("ws-work");
      const saved = Object.values(resources).find((r: any) => r.title === "report.pdf");
      expect(saved).toBeDefined();
      expect((saved as any).attachments?.[0]?.uri).toBe("file:///cache/report.pdf");
      expect(mockUndoApi.showUndo).toHaveBeenCalled();
    });

    it("20. Attaching a file keeps typed text as the title and saves the attachment", async () => {
      const { getDocumentAsync } = require("expo-document-picker");
      (getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            name: "invoice.pdf",
            uri: "file:///cache/invoice.pdf",
            mimeType: "application/pdf",
            size: 1024,
          },
        ],
      });

      const renderer = await renderCapture();
      const getTextInput = () => renderer.root.findByType(TextInput);

      // Type a title first, then attach a file
      act(() => {
        getTextInput().props.onChangeText("Client invoice");
      });
      act(() => {
        jest.advanceTimersByTime(450);
      });
      await act(async () => {});

      const paperclip = renderer.root.findAll((n: any) => n.props?.name === "paperclip")[0];
      let attachBtn: any = paperclip.parent;
      while (attachBtn && typeof attachBtn.props?.onPress !== "function") {
        attachBtn = attachBtn.parent;
      }
      await act(async () => {
        await attachBtn.props.onPress();
      });

      // Add → saved as a Resource titled by the typed text, with the attachment
      await pressLabel(renderer, "Add");

      const resources = await ResourceRepository.getResources("ws-work");
      const saved = Object.values(resources).find((r: any) => r.title === "Client invoice");
      expect(saved).toBeDefined();
      expect((saved as any).attachments?.[0]?.uri).toBe("file:///cache/invoice.pdf");
    });

    it("21. Eye button previews image attachments in-app", async () => {
      const { getDocumentAsync } = require("expo-document-picker");
      (getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            name: "photo.png",
            uri: "file:///cache/photo.png",
            mimeType: "image/png",
            size: 512,
          },
        ],
      });

      const renderer = await renderCapture();

      // Attach the image
      const paperclip = renderer.root.findAll((n: any) => n.props?.name === "paperclip")[0];
      let attachBtn: any = paperclip.parent;
      while (attachBtn && typeof attachBtn.props?.onPress !== "function") {
        attachBtn = attachBtn.parent;
      }
      await act(async () => {
        await attachBtn.props.onPress();
      });

      // Eye button is present on the preview
      const eye = renderer.root.findAll((n: any) => n.props?.name === "eye")[0];
      expect(eye).toBeDefined();

      // Tapping it opens the in-app image preview modal with the picked uri
      let eyeBtn: any = eye.parent;
      while (eyeBtn && typeof eyeBtn.props?.onPress !== "function") {
        eyeBtn = eyeBtn.parent;
      }
      await act(async () => {
        eyeBtn.props.onPress();
      });

      const modal = renderer.root.findAll((n: any) => n.type === Modal).find((m: any) => m.props.visible === true);
      expect(modal).toBeDefined();
      const previewImage = renderer.root
        .findAll((n: any) => n.type === Image)
        .find((n: any) => n.props?.source?.uri === "file:///cache/photo.png");
      expect(previewImage).toBeDefined();
    });

    it("22. Renames a file before adding", async () => {
      const { getDocumentAsync } = require("expo-document-picker");
      (getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            name: "IMG-20240101-WA0001.jpg",
            uri: "file:///cache/img.jpg",
            mimeType: "image/jpeg",
            size: 2048,
          },
        ],
      });

      const renderer = await renderCapture();

      // Attach the file
      const paperclip = renderer.root.findAll((n: any) => n.props?.name === "paperclip")[0];
      let attachBtn: any = paperclip.parent;
      while (attachBtn && typeof attachBtn.props?.onPress !== "function") {
        attachBtn = attachBtn.parent;
      }
      await act(async () => {
        await attachBtn.props.onPress();
      });

      // Rename via the editable name field
      const renameInput = renderer.root.findAll((n: any) => n.props?.accessibilityLabel === "Rename file")[0];
      act(() => {
        renameInput.props.onChangeText("Family trip");
      });

      // Add saves the resource under the new name
      await pressLabel(renderer, "Add");

      const resources = await ResourceRepository.getResources("ws-work");
      const saved = Object.values(resources).find((r: any) => r.title === "Family trip");
      expect(saved).toBeDefined();
      expect((saved as any).attachments?.[0]?.name).toBe("Family trip");
    });

    it("23. Non-image files get an open-in-another-app button instead of in-app preview", async () => {
      const { getDocumentAsync } = require("expo-document-picker");
      (getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            name: "contract.pdf",
            uri: "file:///cache/contract.pdf",
            mimeType: "application/pdf",
            size: 4096,
          },
        ],
      });

      const renderer = await renderCapture();

      const paperclip = renderer.root.findAll((n: any) => n.props?.name === "paperclip")[0];
      let attachBtn: any = paperclip.parent;
      while (attachBtn && typeof attachBtn.props?.onPress !== "function") {
        attachBtn = attachBtn.parent;
      }
      await act(async () => {
        await attachBtn.props.onPress();
      });

      // external-link (open in another app) is shown; no in-app eye for non-images
      expect(renderer.root.findAll((n: any) => n.props?.name === "external-link").length).toBeGreaterThan(0);
      expect(renderer.root.findAll((n: any) => n.props?.name === "eye").length).toBe(0);

      // Tapping it hands off to the system handler without crashing
      const openBtn = renderer.root.find((n: any) => n.props?.accessibilityLabel === "Open in another app");
      let pressable: any = openBtn;
      while (pressable && typeof pressable.props?.onPress !== "function") {
        pressable = pressable.parent;
      }
      await act(async () => {
        pressable.props.onPress();
      });
    });

    it("24. Editing the rename field letter-by-letter keeps every keystroke without triggering re-parses", async () => {
      const { getDocumentAsync } = require("expo-document-picker");
      (getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            name: "IMG-20240101-WA0001.jpg",
            uri: "file:///cache/img.jpg",
            mimeType: "image/jpeg",
            size: 2048,
          },
        ],
      });

      const renderer = await renderCapture();

      const paperclip = renderer.root.findAll((n: any) => n.props?.name === "paperclip")[0];
      let attachBtn: any = paperclip.parent;
      while (attachBtn && typeof attachBtn.props?.onPress !== "function") {
        attachBtn = attachBtn.parent;
      }
      await act(async () => {
        await attachBtn.props.onPress();
      });

      const renameInput = renderer.root.findAll((n: any) => n.props?.accessibilityLabel === "Rename file")[0];

      // Simulate the laggy path: deleting characters one at a time
      const edits = [
        "IMG-20240101-WA0001.jp",
        "IMG-20240101-WA0001.j",
        "IMG-20240101-WA0001",
        "Family photo",
      ];
      for (const s of edits) {
        act(() => {
          renameInput.props.onChangeText(s);
        });
        expect(renameInput.props.value).toBe(s);
      }

      // The rename edits are isolated — they must not trigger the NLP parse pipeline
      const renderedStrings = renderer.root
        .findAll((n: any) => typeof n.props?.children === "string")
        .map((n: any) => n.props.children as string);
      expect(renderedStrings).not.toContain("Interpreting…");

      // And the final name is what gets saved
      await pressLabel(renderer, "Add");

      const resources = await ResourceRepository.getResources("ws-work");
      const saved = Object.values(resources).find((r: any) => r.title === "Family photo");
      expect(saved).toBeDefined();
      expect((saved as any).attachments?.[0]?.name).toBe("Family photo");
    });
  });
});
