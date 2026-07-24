/**
 * UnifiedCapture.tsx
 * ─────────────────
 * Pebble Capture current — The unified, parser-first capture interface.
 *
 * Design Philosophy:
 *   - "The parser should feel like a helpful companion, not a form filling itself."
 *   - Parser leads, layout is clean and out of the way.
 *   - Smart dynamic headers change based on detected capture intent.
 *   - Sleek companion progress bar shows understanding state.
 *   - Dynamic override selector replaces pill tabs.
 *   - Progressive disclosure keeps secondary attributes hidden.
 *   - File picking support using expo-document-picker.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOut,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";

import { AppText as Text } from "@/shared/components/ui/AppText";
import CaptureInputBox from "@/features/capture/components/CaptureInputBox";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { useVoiceCapture } from "@/features/capture/hooks/useVoiceCapture";
import {
  parseProductivityText,
  type ParsedProductivityItem,
} from "@/features/capture/services/nlp-parser.service";
import {
  getWorkspaceSuggestions,
  type WorkspaceSuggestionResult,
} from "@/features/workspaces/services/workspace-suggestions.service";
import { emitStateChange } from "@/services/events/state-events";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { TaskRepository, HabitRepository, ChecklistRepository, ResourceRepository } from "@/repositories";
import PressableScale from "@/shared/components/ui/PressableScale";

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP_POINTS = ["90%"];

const TYPE_META: Record<
  ParsedProductivityItem["type"],
  { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string }
> = {
  task: { label: "Task", icon: "edit-3", color: "#6366F1" },
  habit: { label: "Habit", icon: "refresh-cw", color: "#10B981" },
  checklist: { label: "List", icon: "list", color: "#3B82F6" },
  note: { label: "Note", icon: "file-text", color: "#A855F7" },
  link: { label: "Link", icon: "link", color: "#F59E0B" },
  idea: { label: "Idea", icon: "zap", color: "#EC4899" },
  file: { label: "File", icon: "paperclip", color: "#EC4899" },
};

const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }> = {
  work: { label: "Work", color: "#3B82F6", icon: "briefcase" },
  personal: { label: "Personal", color: "#10B981", icon: "user" },
  health: { label: "Health", color: "#F59E0B", icon: "activity" },
  learning: { label: "Learning", color: "#A855F7", icon: "book-open" },
  creative: { label: "Creative", color: "#EC4899", icon: "feather" },
  focus: { label: "Focus", color: "#6366F1", icon: "target" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#EF4444" },
  medium: { label: "Medium", color: "#F59E0B" },
  low: { label: "Low", color: "#10B981" },
};

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function getAdaptiveSuggestions(
  hour: number,
  currentTab?: string,
  workspaceName?: string,
): string[] {
  if (currentTab === "schedule") {
    return ["Team standup at 10am", "Focus block 2 hours", "Coffee break at 3pm", "Note: review meeting notes"];
  }
  if (currentTab === "resources") {
    return ["Note: project requirements", "https://example.com", "Idea: weekly review screen", "Note: API endpoint docs"];
  }
  if (hour >= 6 && hour < 10) {
    return ["Gym every morning at 7am", "Meditate for 10 minutes", "Review today's tasks", "Read for 30 minutes"];
  }
  if (hour >= 10 && hour < 18) {
    return ["Send project update email", "Focus block 90 minutes", "Team meeting at 2pm", "Note: client feedback"];
  }
  // Evening
  return ["Study Kubernetes at 8pm", "Run 5km every evening", "Journal before bed", "Idea: new side project"];
}

function getFriendlyDateLabel(dateStr?: string): string {
  if (!dateStr) return "No date";
  const today = getDateKey();
  if (dateStr === today) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === getDateKey(tomorrow)) return "Tomorrow";
  // Format as "Jul 17"
  const [, m, d] = dateStr.split("-").map(Number);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[m - 1]} ${d}`;
}

function getFriendlyTimeLabel(timeStr?: string): string {
  if (!timeStr) return "Anytime";
  const [h, m] = timeStr.split(":").map(Number);
  const isPm = h >= 12;
  const displayHour = h % 12 || 12;
  const displayMin = String(m).padStart(2, "0");
  return `${displayHour}:${displayMin} ${isPm ? "PM" : "AM"}`;
}

function getRecurrenceLabel(item: ParsedProductivityItem): string | null {
  if (!item.recurrence) return null;
  const r = item.recurrence;
  if (r.type === "daily") return "Daily";
  if (r.type === "weekdays") return "Weekdays";
  if (r.type === "weekly") {
    if (r.days && r.days.length > 0) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return r.days.map((d) => dayNames[d]).join(", ");
    }
    return "Weekly";
  }
  if (r.type === "monthly") return `Monthly (${r.dayOfMonth || 1}${getOrdinal(r.dayOfMonth || 1)})`;
  if (r.type === "interval") return `Every ${r.interval} ${r.unit}`;
  return null;
}

function getOrdinal(n: number): string {
  if (n > 3 && n < 21) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface UnifiedCaptureProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  workspaces: { id: string; name: string; emoji?: string; color?: string }[];
  defaultWorkspaceId?: string;
  defaultDate?: string;
  defaultType?: ParsedProductivityItem["type"];
  entryTab?: string;
  onSaveComplete?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function UnifiedCapture({
  sheetRef,
  workspaces,
  defaultWorkspaceId = "default",
  defaultDate,
  defaultType,
  entryTab,
  onSaveComplete,
}: UnifiedCaptureProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "dark"];
  const { showToast } = useUndo();

  // ─── State ──────────────────────────────────────────────────────────────

  const [inputText, setInputText] = useState("");
  const [parsedItem, setParsedItem] = useState<ParsedProductivityItem | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(defaultWorkspaceId);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showTypeOverride, setShowTypeOverride] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; uri: string } | null>(null);

  // Workspace suggestion from parser
  const [topSuggestion, setTopSuggestion] = useState<WorkspaceSuggestionResult | null>(null);

  // Voice capture
  const {
    status: voiceStatus,
    volume: voiceVolume,
    errorMsg: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceCapture({
    onTranscriptComplete: (finalText) => setInputText(finalText),
    onTranscriptChange: (interimText) => setInputText(interimText),
  });

  // Animation values
  const cardScale = useSharedValue(1);
  const loadingProgress = useSharedValue(0);

  // ─── Effects ────────────────────────────────────────────────────────────

  // Dynamic header updates based on type
  const smartHeader = useMemo(() => {
    if (isParsing) return { title: "Quick Capture", desc: "Understanding your thought..." };
    if (!parsedItem || !inputText.trim()) {
      return { title: "Quick Capture", desc: "Drop a thought. We'll organize it." };
    }
    switch (parsedItem.type) {
      case "task":
        return { title: "Create Task", desc: "Organizing your next action..." };
      case "habit":
        return { title: "Add Habit", desc: "Forming positive routines..." };
      case "checklist":
        return { title: "Create Checklist", desc: "Building your reference list..." };
      case "note":
        return { title: "Save Note", desc: "Saving context to Vault..." };
      case "link":
        return { title: "Save Link", desc: "Clipping resource to reference..." };
      case "idea":
        return { title: "Save Idea", desc: "Incubating dynamic concepts..." };
      case "file":
        return { title: "Save File", desc: "Linking file reference..." };
      default:
        return { title: "Quick Capture", desc: "Drop a thought. We'll organize it." };
    }
  }, [parsedItem, isParsing, inputText]);

  // Generate adaptive suggestions on mount
  useEffect(() => {
    const hour = new Date().getHours();
    const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name;
    setSuggestions(getAdaptiveSuggestions(hour, entryTab, wsName));
  }, [entryTab, selectedWorkspaceId]);

  // Check clipboard for URL on sheet open (don't auto-read, just detect)
  useEffect(() => {
    (async () => {
      try {
        const content = await Clipboard.getStringAsync();
        if (content && /^https?:\/\//.test(content.trim())) {
          setClipboardUrl(content.trim());
        } else {
          setClipboardUrl(null);
        }
      } catch {
        setClipboardUrl(null);
      }
    })();
  }, []);

  // Apply defaults from entry context
  useEffect(() => {
    if (defaultWorkspaceId) setSelectedWorkspaceId(defaultWorkspaceId);
  }, [defaultWorkspaceId]);

  // Debounced NLP parsing
  useEffect(() => {
    if (!inputText.trim()) {
      setParsedItem(null);
      setShowTypeOverride(false);
      setShowMoreOptions(false);
      setIsParsing(false);
      return;
    }

    setIsParsing(true);
    loadingProgress.value = 0;
    loadingProgress.value = withRepeat(
      withSequence(withTiming(0.4, { duration: 400 }), withTiming(0.9, { duration: 600 })),
      -1,
      true,
    );

    const timer = setTimeout(async () => {
      const parsed = parseProductivityText(inputText.trim());
      // Apply default overrides from entry context
      if (defaultType && parsed.type === "task" && parsed.detectionSignal === "default_task") {
        parsed.type = defaultType;
      }
      if (defaultDate && parsed.type === "task" && !parsed.date) {
        parsed.date = defaultDate;
      }
      setParsedItem(parsed);
      setIsParsing(false);
      loadingProgress.value = withTiming(1, { duration: 200 });

      // Workspace suggestion
      if (parsed.type === "task" || parsed.type === "habit") {
        try {
          const suggestions = await getWorkspaceSuggestions(
            parsed.title,
            parsed.category || "work",
            workspaces,
            {},
          );
          const top = suggestions[0];
          if (top && top.score >= 70) {
            setTopSuggestion(top);
            setSelectedWorkspaceId(top.workspaceId);
          }
        } catch {
          // ignore
        }
      }

      // Subtle card animation on parse
      cardScale.value = 0.98;
      cardScale.value = withSpring(1, { damping: 15, stiffness: 300 });
    }, 450); // slight stagger feel

    return () => clearTimeout(timer);
  }, [inputText]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleTypeOverride = useCallback(
    (newType: ParsedProductivityItem["type"]) => {
      if (!parsedItem) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setParsedItem({ ...parsedItem, type: newType });
      setShowTypeOverride(false);
    },
    [parsedItem],
  );

  const handleClipboardPaste = useCallback(() => {
    if (clipboardUrl) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setInputText(clipboardUrl);
      setClipboardUrl(null);
    }
  }, [clipboardUrl]);

  const handleSuggestionTap = useCallback((text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInputText(text);
  }, []);

  const handleAttachment = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAttachedFile({
          name: asset.name,
          size: asset.size || 0,
          uri: asset.uri,
        });
        setParsedItem({
          type: "file",
          title: asset.name,
          confidence: 0.95,
        });
      }
    } catch (err) {
      console.warn("Document picker error", err);
    }
  }, []);

  // ─── Save Handlers ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!parsedItem || !parsedItem.title.trim()) return;

    try {
      switch (parsedItem.type) {
        case "task":
          await saveTask(parsedItem);
          break;
        case "habit":
          await saveHabit(parsedItem);
          break;
        case "checklist":
          await saveChecklist(parsedItem);
          break;
        case "note":
        case "idea":
          await saveResource(parsedItem, parsedItem.type === "idea");
          break;
        case "link":
          await saveResource(parsedItem, false);
          break;
        case "file":
          await saveResource(parsedItem, false);
          break;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void recordDailyHistorySnapshot();

      const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
      const typeLabel = TYPE_META[parsedItem.type].label;
      showToast(`✓ ${typeLabel} added to ${wsName}`);

      // Reset
      setInputText("");
      setParsedItem(null);
      setAttachedFile(null);
      setShowMoreOptions(false);
      setShowTypeOverride(false);
      sheetRef.current?.dismiss();
      onSaveComplete?.();
    } catch (e) {
      console.warn("UnifiedCapture save failed:", e);
    }
  }, [parsedItem, selectedWorkspaceId, workspaces]);

  const saveTask = async (item: ParsedProductivityItem) => {
    const folderId = selectedWorkspaceId || "default";
    const generatedId = String(Date.now());
    let notificationIds: string[] = [];
    let alarmId: string | undefined;
    let alarmTime: number | undefined;

    if (item.time && item.date && item.date !== "inbox") {
      if (item.recurrence) {
        try {
          const scheduled = await scheduleReminderBatch({
            kind: "todo",
            itemId: generatedId,
            title: item.title,
            category: item.category || "work",
            dailyTime: {
              hour: Number(item.time.split(":")[0]),
              minute: Number(item.time.split(":")[1]),
            },
            recurrence: item.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
            context: { title: item.title, remainingCount: 1, totalCount: 1 },
          });
          alarmId = scheduled.primaryId;
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to schedule task reminder:", e);
        }
      } else {
        const [hours, minutes] = item.time.split(":").map(Number);
        const [year, monthVal, dayVal] = item.date.split("-").map(Number);
        const alarmDate = new Date(year, monthVal - 1, dayVal, hours, minutes, 0, 0);
        if (alarmDate.getTime() > Date.now()) {
          try {
            const batch = await scheduleReminderBatch({
              kind: "todo",
              itemId: generatedId,
              title: item.title,
              oneTimeAt: alarmDate,
              category: item.category || "work",
              channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
            });
            alarmTime = batch.alarmTime;
            notificationIds = batch.ids;
            alarmId = batch.primaryId;
          } catch (e) {
            console.error("Failed to schedule one-time task reminder:", e);
          }
        }
      }
    }

    await TaskRepository.saveTask({
      id: generatedId,
      workspaceId: folderId,
      title: item.title,
      completed: false,
      priority: (item.priority || "medium") as any,
      dueDate: item.date || getDateKey(),
      category: item.category || "work",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Attach metadata for reminders
      alarmTime,
      notificationIds,
      alarmId,
      reminderHour: item.time ? Number(item.time.split(":")[0]) : undefined,
      reminderMinute: item.time ? Number(item.time.split(":")[1]) : undefined,
      recurrence: item.recurrence || undefined,
    } as any);

    emitStateChange("tasks_changed");
  };

  const saveHabit = async (item: ParsedProductivityItem) => {
    const folderId = selectedWorkspaceId || "default";
    const generatedId = `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let reminderDays: number[] | undefined;
    if (item.recurrence) {
      if (item.recurrence.type === "weekdays") reminderDays = [1, 2, 3, 4, 5];
      else if (item.recurrence.type === "weekly") reminderDays = item.recurrence.days;
    }

    let hour: number | undefined;
    let minute: number | undefined;
    let notificationIds: string[] = [];

    if (item.time) {
      hour = Number(item.time.split(":")[0]);
      minute = Number(item.time.split(":")[1]);
      try {
        const scheduled = await scheduleReminderBatch({
          kind: "habit",
          itemId: generatedId,
          title: item.title,
          dailyTime: { hour, minute },
          dailyDays: reminderDays,
          recurrence: item.recurrence || undefined,
          escalationMinutes: [120, 240],
          channelId: Platform.OS === "android" ? "daily-habits" : undefined,
          context: { title: item.title, remainingCount: 1, totalCount: 1, streak: 0, bestStreak: 0 },
        });
        notificationIds = scheduled.ids;
      } catch (e) {
        console.error("Failed to schedule habit reminder:", e);
      }
    }

    await HabitRepository.saveHabit({
      id: generatedId,
      workspaceId: folderId,
      title: item.title,
      streak: 0,
      bestStreak: 0,
      completedDates: [],
      recurrenceRule: item.recurrence ? JSON.stringify(item.recurrence) : "FREQ=DAILY",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Attach UI-ready metadata
      priority: item.priority || "medium",
      category: item.category || "health",
      reminderDays,
      reminderHour: hour,
      reminderMinute: minute,
      notificationIds,
    } as any);

    emitStateChange("habits_changed");
  };

  const saveChecklist = async (item: ParsedProductivityItem) => {
    const folderId = selectedWorkspaceId || "default";
    const itemsArray = item.items || [];

    const newChecklist = {
      id: `checklist-${Date.now()}`,
      workspaceId: folderId,
      title: item.title,
      items: itemsArray.map((title, index) => ({
        id: `checklist-item-${Date.now()}-${index}`,
        title,
        completed: false,
      })),
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await ChecklistRepository.saveChecklist(newChecklist);
    emitStateChange("checklists_changed");
  };

  const saveResource = async (item: ParsedProductivityItem, isIdea: boolean) => {
    const folderId = selectedWorkspaceId || "default";
    const itemId = `res-${Date.now()}`;
    const payload = item.type === "link" ? { url: item.url || "" } : { content: item.title || "" };

    const metadataRaw = await AsyncStorage.getItem(`pebble:core:collections_metadata:${folderId}`);
    const collectionsMeta: any[] = metadataRaw ? JSON.parse(metadataRaw) : [];
    
    let targetColl = collectionsMeta.find((c) => c.name === "Quick Captures");
    if (!targetColl) {
      targetColl = { id: `quick-captures-${folderId}-${Date.now()}`, name: "Quick Captures", emoji: "⚡" };
      collectionsMeta.push(targetColl);
      await AsyncStorage.setItem(`pebble:core:collections_metadata:${folderId}`, JSON.stringify(collectionsMeta));
    }

    await ResourceRepository.saveResource({
      id: itemId,
      workspaceId: folderId,
      title: item.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resourceType: isIdea ? "idea" : (item.type === "link" ? "link" : "note"),
      payload,
      pinned: false,
      archived: false,
      tags: [isIdea ? "idea" : "", `collection_${targetColl.id}`].filter(Boolean),
    });

    emitStateChange("vault_changed");
  };

  // ─── Derived Values ─────────────────────────────────────────────────────

  const inputBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const textPrimary = theme.text;
  const textMuted = theme.textMuted;

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${loadingProgress.value * 100}%`,
  }));

  const saveButtonLabel = useMemo(() => {
    if (!parsedItem) return "Add";
    const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
    
    switch (parsedItem.type) {
      case "task":
        return `Add Task to ${wsName}`;
      case "habit":
        return `Add Habit to ${wsName}`;
      case "checklist":
        return `Create List in ${wsName}`;
      case "note":
        return `Save Note to ${wsName}`;
      case "link":
        return `Save Link to ${wsName}`;
      case "idea":
        return `Save Idea to ${wsName}`;
      case "file":
        return `Save File to ${wsName}`;
      default:
        return `Add to ${wsName}`;
    }
  }, [parsedItem, selectedWorkspaceId, workspaces]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        setInputText("");
        setParsedItem(null);
        setAttachedFile(null);
        setShowMoreOptions(false);
        setShowTypeOverride(false);
        setClipboardUrl(null);
        cancelRecording();
      }
    },
    [cancelRecording],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: isDark ? "#121215" : "#FAFAFA",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
        width: 44,
        height: 4,
      }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {/* ── Smart Companion Header ── */}
      <View style={styles.sheetHeaderContainer}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[styles.sheetHeaderTitle, { color: textPrimary }]}>
            {smartHeader.title}
          </Text>
          <TouchableOpacity
            onPress={() => sheetRef.current?.dismiss()}
            style={[styles.closeIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
          >
            <Feather name="x" size={16} color={textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.sheetHeaderDesc, { color: textMuted }]}>
          {smartHeader.desc}
        </Text>
      </View>

      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Input Layer ── */}
        <CaptureInputBox
          value={inputText}
          onChangeText={setInputText}
          placeholder={voiceStatus === "listening" ? "Listening..." : "What do you want to remember?"}
          placeholderTextColor={textMuted}
          voiceStatus={voiceStatus}
          voiceVolume={voiceVolume}
          onVoiceStart={startRecording}
          onVoiceStop={stopRecording}
          onVoiceCancel={cancelRecording}
          onAttachmentPress={handleAttachment}
          themePrimary={theme.primary}
          backgroundColor={inputBg}
          borderColor={borderColor}
          textColor={textPrimary}
          TextInputComponent={BottomSheetTextInput as any}
          textInputProps={{
            autoCorrect: false,
            autoFocus: voiceStatus !== "listening",
            maxLength: 500,
          }}
        />

        {/* ── Companion Progress Bar (Parsing working animation) ── */}
        {isParsing && (
          <Animated.View entering={FadeInUp.duration(150)} style={styles.companionLoadingRow}>
            <Text style={[styles.companionLoadingText, { color: theme.primary }]}>
              ✨ Understanding your thought...
            </Text>
            <View style={[styles.progressBarContainer, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }]}>
              <Animated.View style={[styles.progressBarFill, { backgroundColor: theme.primary }, animatedProgressStyle]} />
            </View>
          </Animated.View>
        )}

        {/* ── Clipboard URL Suggestion ── */}
        {clipboardUrl && !inputText.trim() && (
          <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)}>
            <PressableScale
              onPress={handleClipboardPaste}
              style={[
                styles.clipboardPrompt,
                {
                  backgroundColor: isDark ? "rgba(245, 158, 11, 0.04)" : "rgba(217, 119, 6, 0.03)",
                  borderColor: isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(217, 119, 6, 0.15)",
                },
              ]}
            >
              <Feather name="clipboard" size={14} color={isDark ? "#F59E0B" : "#D97706"} />
              <Text style={[styles.clipboardText, { color: isDark ? "#F59E0B" : "#D97706" }]} numberOfLines={1}>
                📋 Paste{" "}
                {(() => {
                  try {
                    const domain = clipboardUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
                    return domain;
                  } catch {
                    return "link";
                  }
                })()}
                ?
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        {/* ── Checklist Suggestion (medium confidence) ── */}
        {parsedItem?.type === "checklist" && parsedItem.checklistConfidence === "medium" && (
          <Animated.View
            entering={FadeInDown.duration(200)}
            style={[
              styles.checklistSuggestion,
              {
                backgroundColor: isDark ? "rgba(59, 130, 246, 0.04)" : "rgba(37, 99, 235, 0.03)",
                borderColor: isDark ? "rgba(59, 130, 246, 0.15)" : "rgba(37, 99, 235, 0.15)",
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Feather name="list" size={16} color={TYPE_META.checklist.color} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: textPrimary }}>
                Looks like a checklist ✓
              </Text>
            </View>
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (parsedItem) {
                  setParsedItem({ ...parsedItem, checklistConfidence: "high", confidence: 0.85 });
                }
              }}
              style={[styles.checklistConfirmBtn, { backgroundColor: `${TYPE_META.checklist.color}20` }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: TYPE_META.checklist.color }}>
                Create as List
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        {/* ── Capture Companion Card ── */}
        {parsedItem && parsedItem.title.trim().length > 0 && !isParsing && (
          <Animated.View
            layout={Layout.springify().damping(18).stiffness(200)}
            style={[
              styles.summaryCard,
              animatedCardStyle,
              {
                backgroundColor: isDark ? "#1C1C21" : "#FFFFFF",
                borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.25 : 0.06,
                shadowRadius: 15,
                elevation: 4,
              },
            ]}
          >
            {/* Header: Type Badge + Confidence */}
            <View style={styles.summaryHeader}>
              <View style={[styles.typeBadge, { backgroundColor: `${TYPE_META[parsedItem.type].color}12` }]}>
                <Feather
                  name={TYPE_META[parsedItem.type].icon}
                  size={13}
                  color={TYPE_META[parsedItem.type].color}
                />
                <Text style={[styles.typeBadgeText, { color: TYPE_META[parsedItem.type].color }]}>
                  {TYPE_META[parsedItem.type].label}
                </Text>
              </View>

              {/* Confidence badge */}
              {parsedItem.confidence >= 0.8 ? (
                <View style={[styles.confidenceBadge, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#10B981" }}>
                    {Math.round(parsedItem.confidence * 100)}% confident
                  </Text>
                </View>
              ) : parsedItem.confidence >= 0.6 ? (
                <View style={[styles.confidenceBadge, { backgroundColor: "rgba(245, 158, 11, 0.1)" }]}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#F59E0B" }}>
                    {Math.round(parsedItem.confidence * 100)}% confident
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Title */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={[styles.summaryTitle, { color: textPrimary, flex: 1 }]}>
                {parsedItem.title}
              </Text>
              <Feather name="edit-2" size={14} color={textMuted} style={{ opacity: 0.6 }} />
            </View>

            {/* Attached File Preview (if type file) */}
            {parsedItem.type === "file" && attachedFile && (
              <View style={[styles.fileCard, { borderColor }]}>
                <Feather name="file" size={24} color={TYPE_META.file.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: textPrimary }]} numberOfLines={1}>
                    {attachedFile.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                    {(attachedFile.size / 1024).toFixed(1)} KB
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setAttachedFile(null);
                    setParsedItem({ ...parsedItem, type: "task" });
                  }}
                >
                  <Feather name="x" size={16} color={textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* URL subtitle (links only) */}
            {parsedItem.type === "link" && parsedItem.url && (
              <Text style={[styles.urlSubtitle, { color: theme.secondary }]} numberOfLines={1}>
                {parsedItem.url.replace(/^https?:\/\//, "").replace(/^www\./, "")}
              </Text>
            )}

            {/* Checklist preview */}
            {parsedItem.type === "checklist" && parsedItem.items && parsedItem.items.length > 0 && (
              <View style={styles.checklistPreview}>
                {parsedItem.items.slice(0, 6).map((checkItem, i) => (
                  <View key={i} style={styles.checklistRow}>
                    <View style={[styles.checklistBox, { borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)" }]} />
                    <Text style={[styles.checklistItemText, { color: textPrimary }]} numberOfLines={1}>
                      {checkItem}
                    </Text>
                  </View>
                ))}
                {parsedItem.items.length > 6 && (
                  <Text style={{ fontSize: 12, color: textMuted, paddingLeft: 28, fontWeight: "500" }}>
                    +{parsedItem.items.length - 6} more items
                  </Text>
                )}
              </View>
            )}

            {/* Core details mapping */}
            <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 12 }}>
              {parsedItem.recurrence && (
                <View style={styles.coreValueRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="refresh-cw" size={13} color={textMuted} />
                    <Text style={{ fontSize: 13, color: textMuted }}>Repeat</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
                    {getRecurrenceLabel(parsedItem)}
                  </Text>
                </View>
              )}

              {parsedItem.time && (
                <View style={styles.coreValueRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="clock" size={13} color={textMuted} />
                    <Text style={{ fontSize: 13, color: textMuted }}>Time</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
                    {getFriendlyTimeLabel(parsedItem.time)}
                  </Text>
                </View>
              )}

              {parsedItem.date && parsedItem.type === "task" && (
                <View style={styles.coreValueRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="calendar" size={13} color={textMuted} />
                    <Text style={{ fontSize: 13, color: textMuted }}>Date</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
                    {getFriendlyDateLabel(parsedItem.date)}
                  </Text>
                </View>
              )}

              <View style={styles.coreValueRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="folder" size={13} color={textMuted} />
                  <Text style={{ fontSize: 13, color: textMuted }}>Workspace</Text>
                </View>
                <PressableScale
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    const idx = workspaces.findIndex((w) => w.id === selectedWorkspaceId);
                    const nextIdx = (idx + 1) % workspaces.length;
                    setSelectedWorkspaceId(workspaces[nextIdx].id);
                  }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
                    {workspaces.find((w) => w.id === selectedWorkspaceId)?.emoji || "📂"}{" "}
                    {workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles"}
                  </Text>
                  <Feather name="chevron-down" size={12} color={textMuted} />
                </PressableScale>
              </View>
            </View>

            {/* Change Type Dropdown trigger */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowTypeOverride(!showTypeOverride);
              }}
              style={styles.changeTypeTrigger}
            >
              <Text style={[styles.changeTypeTriggerText, { color: theme.primary }]}>
                Change type ▾
              </Text>
            </TouchableOpacity>

            {/* Inline Change Type Dropdown list */}
            {showTypeOverride && (
              <Animated.View entering={FadeInDown.duration(150)} exiting={FadeOut.duration(100)} style={[styles.dropdownContainer, { borderColor }]}>
                {(Object.keys(TYPE_META) as ParsedProductivityItem["type"][]).map((t) => {
                  const isActive = parsedItem.type === t;
                  const meta = TYPE_META[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => handleTypeOverride(t)}
                      style={[styles.dropdownItem, { borderBottomColor: borderColor }]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <Feather name={meta.icon} size={14} color={isActive ? meta.color : textMuted} />
                        <Text style={{ fontSize: 13, fontWeight: isActive ? "700" : "500", color: isActive ? textPrimary : textMuted }}>
                          {meta.label}
                        </Text>
                      </View>
                      {isActive && <Feather name="check" size={13} color={meta.color} />}
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            )}

            {/* Progressive Metadata Details trigger */}
            {(parsedItem.type === "task" || parsedItem.type === "habit") && (
              <View style={{ borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 10 }}>
                <PressableScale
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowMoreOptions(!showMoreOptions);
                  }}
                  style={styles.moreDetailsTrigger}
                >
                  <Text style={[styles.moreDetailsTriggerText, { color: textMuted }]}>
                    {showMoreOptions ? "− Hide details" : "+ More details (Priority, Reminder, Category, Notes)"}
                  </Text>
                </PressableScale>

                {showMoreOptions && (
                  <Animated.View entering={FadeInDown.duration(180)} style={styles.moreDetailsCard}>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: textMuted }]}>Priority</Text>
                      <Text style={[styles.detailValue, { color: PRIORITY_META[parsedItem.priority || "medium"].color, fontWeight: "700" }]}>
                        {PRIORITY_META[parsedItem.priority || "medium"].label}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: textMuted }]}>Reminder</Text>
                      <Text style={[styles.detailValue, { color: textPrimary }]}>
                        {parsedItem.time ? `On time` : "None"}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: textMuted }]}>Category</Text>
                      <Text style={[styles.detailValue, { color: textPrimary }]}>
                        {parsedItem.category ? CATEGORY_META[parsedItem.category].label : "None"}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: textMuted }]}>Notes</Text>
                      <Text style={[styles.detailValue, { color: textMuted, fontStyle: "italic" }]}>
                        Add notes...
                      </Text>
                    </View>
                  </Animated.View>
                )}
              </View>
            )}

            {/* Dismiss and Primary Save Action buttons */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => sheetRef.current?.dismiss()}
                style={[styles.dismissBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
              >
                <Text style={[styles.dismissBtnText, { color: textPrimary }]}>Dismiss</Text>
              </TouchableOpacity>

              <PressableScale
                onPress={handleSave}
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: theme.primary,
                    shadowColor: theme.primary,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.25,
                    shadowRadius: 10,
                    elevation: 5,
                    flex: 1,
                  },
                ]}
              >
                <Text style={styles.saveButtonText}>{saveButtonLabel}</Text>
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* ── Smart Suggestions (Recently Captured / Suggested for you) ── */}
        {!inputText.trim() && (
          <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOut.duration(150)} style={styles.suggestionsContainer}>
            <Text style={[styles.suggestionsLabel, { color: textMuted }]}>Suggested for you</Text>
            <View style={styles.suggestionsRow}>
              {[
                { title: "Gym 7:00 AM", icon: "activity", text: "Gym every morning at 7am" },
                { title: "Review PRs", icon: "check-circle", text: "Review open pull requests" },
                { title: "Read 20 pages", icon: "book-open", text: "Read for 30 minutes" },
                { title: "Deploy to staging", icon: "cpu", text: "Deploy build to staging" },
              ].map((s, i) => (
                <PressableScale
                  key={i}
                  onPress={() => handleSuggestionTap(s.text)}
                  style={[
                    styles.suggestionChip,
                    {
                      backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.02)",
                      borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
                    },
                  ]}
                >
                  <Feather name={s.icon as any} size={12} color={theme.primary} />
                  <Text style={[styles.suggestionChipText, { color: textPrimary }]}>
                    {s.title}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </Animated.View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetHeaderContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 4,
  },
  sheetHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  sheetHeaderDesc: {
    fontSize: 13,
    fontWeight: "500",
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  // Companion progress bar
  companionLoadingRow: {
    marginBottom: 16,
    gap: 6,
  },
  companionLoadingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  // Suggestions
  suggestionsContainer: {
    marginTop: 8,
    gap: 10,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.15,
  },
  // Clipboard
  clipboardPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: "dashed",
    marginBottom: 16,
  },
  clipboardText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    letterSpacing: -0.1,
  },
  // Checklist suggestion
  checklistSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: "dashed",
    marginBottom: 16,
  },
  checklistConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  // Summary card
  summaryCard: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 20,
    gap: 16,
    marginTop: 4,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  // Title
  summaryTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  urlSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: -8,
    textDecorationLine: "underline",
  },
  // Attached File card
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.2,
    backgroundColor: "rgba(100,116,139,0.03)",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Checklist preview
  checklistPreview: {
    gap: 8,
    backgroundColor: "rgba(100, 116, 139, 0.03)",
    padding: 14,
    borderRadius: 14,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.8,
  },
  checklistItemText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    letterSpacing: -0.15,
  },
  // Core value row
  coreValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Change Type triggers
  changeTypeTrigger: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  changeTypeTriggerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dropdownContainer: {
    borderWidth: 1.2,
    borderRadius: 14,
    backgroundColor: "rgba(100,116,139,0.02)",
    overflow: "hidden",
    marginTop: 4,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 0.8,
  },
  // More options details
  moreDetailsTrigger: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  moreDetailsTriggerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  moreDetailsCard: {
    gap: 8,
    backgroundColor: "rgba(100, 116, 139, 0.02)",
    padding: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Dismiss and Save Buttons
  dismissBtn: {
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
});
