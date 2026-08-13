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
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({ showToast: jest.fn(), showUndo: jest.fn() }),
}));
jest.mock("@/features/workspaces/services/workspace-suggestions.service", () => ({
  getWorkspaceSuggestions: jest.fn(async () => []),
}));
jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(() => jest.fn()),
}));

import React, { useState } from "react";
import { TextInput } from "react-native";
import { act, create } from "react-test-renderer";
import CaptureInputBox from "@/features/capture/components/CaptureInputBox";
import UnifiedCapture from "@/features/capture/components/UnifiedCapture";
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import { getWorkspaceSuggestions } from "@/features/workspaces/services/workspace-suggestions.service";

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
});
