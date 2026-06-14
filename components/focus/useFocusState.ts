import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { earnPebble } from "@/services/pebbleService";
import { syncWidgetData } from "@/services/widgetData";
import { TODOS_STORAGE_KEY } from "@/services/storage";
import { emitStateChange } from "@/services/stateEvents";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { AMBIENT_SOUNDS } from "@/constants/sounds";

export function useFocusState() {
  // Core states
  const [sessionTime, setSessionTime] = useState(25 * 60); // 25 mins Pomodoro
  const [isActive, setIsActive] = useState(false);
  const [totalSessionTime, setTotalSessionTime] = useState(25 * 60);
  const [completedToday, setCompletedToday] = useState(0);
  const [totalFocusTime, setTotalFocusTime] = useState(0);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(25);
  const [customMinsText, setCustomMinsText] = useState("25");
  const [mode, setMode] = useState<"pomodoro" | "stopwatch">("pomodoro");
  const [pomodoroMode, setPomodoroMode] = useState<"work" | "break">("work");
  const [breakType, setBreakType] = useState<"short" | "long">("short");

  // Ambient Glow
  const [glowEnabled, setGlowEnabled] = useState(true);

  // Ambient Soundscapes
  const [selectedSoundId, setSelectedSoundId] = useState<string>("none");
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [likedSoundIds, setLikedSoundIds] = useState<string[]>([]);
  const [customTracks, setCustomTracks] = useState<any[]>([]);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Task Integration
  const [todoList, setTodoList] = useState<any[]>([]);
  const [habitList, setHabitList] = useState<any[]>([]);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  // Stopwatch
  const [swRunning, setSwRunning] = useState(false);
  const [swTime, setSwTime] = useState(0); // seconds
  const [swLaps, setSwLaps] = useState<number[]>([]);

  const isPlaying =
    (mode === "pomodoro" && pomodoroMode === "work" && isActive) ||
    (mode === "stopwatch" && swRunning);

  // Refs for tracking
  const soundRef = useRef<any>(null);
  const loadedSoundIdRef = useRef<string | null>(null);
  const isDraggingProgressRef = useRef<boolean>(false);

  const startTimeRef = useRef<number>(0);
  const elapsedBeforeStartRef = useRef<number>(0);
  const totalSessionTimeRef = useRef<number>(25 * 60);
  const loggedMinutesInCurrentSessionRef = useRef<number>(0);

  const swStartTimeRef = useRef<number>(0);
  const swElapsedBeforeStartRef = useRef<number>(0);

  // Load active tasks and habits from AsyncStorage
  const loadActiveTasks = async () => {
    try {
      const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];
        const incomplete = allTodos.filter((t) => !t.completed && !t.archived);
        setTodoList(incomplete);
      } else {
        setTodoList([]);
      }
    } catch {
      setTodoList([]);
    }

    try {
      const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const allHabits = (parsed.dailyHabits || []).filter((h: any) => !h.archived);
        setHabitList(allHabits);
      } else {
        setHabitList([]);
      }
    } catch {
      setHabitList([]);
    }
  };

  const handleToggleLike = async (soundId: string) => {
    let nextLiked: string[];
    if (likedSoundIds.includes(soundId)) {
      nextLiked = likedSoundIds.filter((id) => id !== soundId);
    } else {
      nextLiked = [...likedSoundIds, soundId];
    }
    setLikedSoundIds(nextLiked);
    try {
      await AsyncStorage.setItem("todoapp:focus:liked_sound_ids", JSON.stringify(nextLiked));
    } catch {}
  };

  const handleImportCustomTrack = async () => {
    try {
      const DocumentPicker = require("expo-document-picker");
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const newTrack = {
          id: `custom_${Date.now()}`,
          title: asset.name || "Custom Track",
          file: { uri: asset.uri },
        };
        const updated = [...customTracks, newTrack];
        setCustomTracks(updated);
        await AsyncStorage.setItem("todoapp:focus:custom_tracks", JSON.stringify(updated));
        handleSelectSound(newTrack.id);
      }
    } catch (err) {
      console.log("Error importing custom track:", err);
    }
  };

  const handleDeleteCustomTrack = async (id: string) => {
    const nextTracks = customTracks.filter((t) => t.id !== id);
    setCustomTracks(nextTracks);
    await AsyncStorage.setItem("todoapp:focus:custom_tracks", JSON.stringify(nextTracks));
    if (selectedSoundId === id) {
      handleSelectSound("none");
    }
  };

  const handleSelectSound = async (soundId: string) => {
    setSelectedSoundId(soundId);
    setPlayerCurrentTime(0);
    setPlayerDuration(0);
    try {
      await AsyncStorage.setItem("todoapp:focus:selected_sound_id", soundId);
    } catch {}
  };

  const handleAdjustVolume = async (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setSoundVolume(clamped);
    try {
      await AsyncStorage.setItem("todoapp:focus:sound_volume", String(clamped));
    } catch {}
  };

  const handlePrevTrack = () => {
    const allTracks = [...AMBIENT_SOUNDS, ...customTracks];
    if (isShuffle && allTracks.length > 1) {
      let rand = Math.floor(Math.random() * allTracks.length);
      while (allTracks[rand].id === selectedSoundId) {
        rand = Math.floor(Math.random() * allTracks.length);
      }
      handleSelectSound(allTracks[rand].id);
    } else {
      const currentIndex = allTracks.findIndex((s) => s.id === selectedSoundId);
      const prevIndex = (currentIndex - 1 + allTracks.length) % allTracks.length;
      handleSelectSound(allTracks[prevIndex].id);
    }
  };

  const handleNextTrack = () => {
    const allTracks = [...AMBIENT_SOUNDS, ...customTracks];
    if (isShuffle && allTracks.length > 1) {
      let rand = Math.floor(Math.random() * allTracks.length);
      while (allTracks[rand].id === selectedSoundId) {
        rand = Math.floor(Math.random() * allTracks.length);
      }
      handleSelectSound(allTracks[rand].id);
    } else {
      const currentIndex = allTracks.findIndex((s) => s.id === selectedSoundId);
      const nextIndex = (currentIndex + 1) % allTracks.length;
      handleSelectSound(allTracks[nextIndex].id);
    }
  };

  // Load stats and settings on mount/focus
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      AsyncStorage.getItem("todoapp:focus:selected_sound_id").then((val) => {
        if (val) {
          setSelectedSoundId(val);
        }
      });
      AsyncStorage.getItem("todoapp:focus:sound_volume").then((val) => {
        if (val !== null) {
          setSoundVolume(parseFloat(val));
        }
      });
      AsyncStorage.getItem("todoapp:focus:is_muted").then((val) => {
        if (val !== null) {
          setIsMuted(val === "true");
        }
      });
      AsyncStorage.getItem("todoapp:focus:liked_sound_ids").then((val) => {
        if (val) {
          try {
            setLikedSoundIds(JSON.parse(val));
          } catch {}
        }
      });
      AsyncStorage.getItem("todoapp:focus:custom_tracks").then((val) => {
        if (val) {
          try {
            setCustomTracks(JSON.parse(val));
          } catch {}
        }
      });
      AsyncStorage.getItem("todoapp:focus:is_shuffle").then((val) => {
        if (val !== null) {
          setIsShuffle(val === "true");
        }
      });
      AsyncStorage.getItem("todoapp:focus:is_repeat").then((val) => {
        if (val !== null) {
          setIsRepeat(val === "true");
        }
      });
      AsyncStorage.getItem("todoapp:focus:stats").then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.completedToday !== undefined) setCompletedToday(parsed.completedToday);
          if (parsed.totalFocusTime !== undefined) setTotalFocusTime(parsed.totalFocusTime);
        } else {
          setCompletedToday(0);
          setTotalFocusTime(0);
        }
      });
      AsyncStorage.getItem("todoapp:focus:glow_enabled").then((val) => {
        if (val !== null) {
          setGlowEnabled(val === "true");
        }
      });
      loadActiveTasks();
      syncTimerFromSessionState();
      syncStopwatchFromState();
      return () => {
        setIsScreenFocused(false);
      };
    }, [])
  );

  // AppState listening for background/kill resilience
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      setAppState(nextState);
      if (nextState === "active") {
        syncTimerFromSessionState();
        syncStopwatchFromState();
      } else if (nextState === "background" || nextState === "inactive") {
        if (isActive && mode === "pomodoro") {
          const elapsed = elapsedBeforeStartRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
          logPartialMinutes(elapsed);
          saveActiveSession(
            pomodoroMode,
            startTimeRef.current,
            totalSessionTime,
            elapsedBeforeStartRef.current,
            true,
            breakType,
            focusedTaskId
          );
        }
        if (swRunning && mode === "stopwatch") {
          saveStopwatchState(swStartTimeRef.current, swElapsedBeforeStartRef.current, true, swLaps);
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [isActive, pomodoroMode, totalSessionTime, breakType, focusedTaskId, mode, swRunning, swLaps]);

  // Ambient sound playback control
  useEffect(() => {
    let active = true;

    const shouldPlay =
      isScreenFocused &&
      appState === "active" &&
      selectedSoundId !== "none" &&
      ((mode === "pomodoro" && pomodoroMode === "work" && isActive) ||
        (mode === "stopwatch" && swRunning));

    const activeVolume = isMuted ? 0 : soundVolume;

    async function manageAudio() {
      // 1. If we shouldn't play, ensure any playing sound is paused/removed
      if (!shouldPlay) {
        if (soundRef.current) {
          const playerToRelease = soundRef.current;
          soundRef.current = null;
          loadedSoundIdRef.current = null;
          try {
            playerToRelease.pause();
            playerToRelease.remove();
          } catch (err) {
            console.log("Error releasing sound player:", err);
          }
        }
        return;
      }

      // 2. We should play! Find the sound asset
      const allTracks = [...AMBIENT_SOUNDS, ...customTracks];
      const ambientItem = allTracks.find((s) => s.id === selectedSoundId);
      if (!ambientItem || !ambientItem.file) {
        if (soundRef.current) {
          const playerToRelease = soundRef.current;
          soundRef.current = null;
          loadedSoundIdRef.current = null;
          try {
            playerToRelease.pause();
            playerToRelease.remove();
          } catch (err) {
            console.log("Error releasing sound player:", err);
          }
        }
        return;
      }

      // 3. If correct sound is already loaded, ensure it is playing
      if (soundRef.current && loadedSoundIdRef.current === selectedSoundId) {
        try {
          if (!soundRef.current.playing) {
            soundRef.current.play();
          }
        } catch (err) {
          console.log("Error resuming audio player:", err);
        }
        return;
      }

      // 4. If a different sound is loaded, release it first
      if (soundRef.current) {
        const playerToRelease = soundRef.current;
        soundRef.current = null;
        loadedSoundIdRef.current = null;
        try {
          playerToRelease.pause();
          playerToRelease.remove();
        } catch (err) {
          console.log("Error releasing previous audio player:", err);
        }
      }

      // 5. Load and play new sound using expo-audio
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });

        const player = createAudioPlayer(ambientItem.file);
        player.loop = true;
        player.volume = activeVolume;
        player.play();

        if (!active) {
          player.pause();
          player.remove();
          return;
        }

        soundRef.current = player;
        loadedSoundIdRef.current = selectedSoundId;
      } catch (err) {
        console.log("Error creating audio player:", err);
      }
    }

    manageAudio();

    return () => {
      active = false;
      if (soundRef.current) {
        const playerToRelease = soundRef.current;
        soundRef.current = null;
        loadedSoundIdRef.current = null;
        try {
          playerToRelease.pause();
          playerToRelease.remove();
        } catch (err) {
          console.log("Error cleaning up audio player:", err);
        }
      }
    };
  }, [isActive, pomodoroMode, swRunning, mode, selectedSoundId, isScreenFocused, appState, customTracks]);

  // Update player volume dynamically
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.volume = isMuted ? 0 : soundVolume;
    }
  }, [soundVolume, isMuted]);

  // Timer interval loop
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const elapsed = elapsedBeforeStartRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, totalSessionTimeRef.current - elapsed);
      setSessionTime(remaining);

      // Log partial minutes in real-time
      logPartialMinutes(elapsed);

      if (soundRef.current) {
        if (!isDraggingProgressRef.current) {
          setPlayerCurrentTime(soundRef.current.currentTime || 0);
        }
        setPlayerDuration(soundRef.current.duration || 0);
      }

      if (remaining === 0) {
        clearInterval(interval);
        handleTimerExpiration();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isActive]);

  // Stopwatch interval loop
  useEffect(() => {
    if (!swRunning) return;

    // Set reference start time based on current swTime to prevent background drift
    swStartTimeRef.current = Date.now() - swTime * 1000;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - swStartTimeRef.current) / 1000);
      setSwTime(elapsed);

      if (soundRef.current) {
        if (!isDraggingProgressRef.current) {
          setPlayerCurrentTime(soundRef.current.currentTime || 0);
        }
        setPlayerDuration(soundRef.current.duration || 0);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [swRunning]);

  // Resilient session state savers & loaders
  const saveActiveSession = async (
    type: "work" | "break",
    startTime: number,
    duration: number,
    elapsedBeforeStart: number,
    isActive: boolean,
    bType: "short" | "long",
    taskId: string | null
  ) => {
    try {
      await AsyncStorage.setItem(
        "todoapp:focus:current_session",
        JSON.stringify({
          type,
          startTime,
          duration,
          elapsedBeforeStart,
          isActive,
          breakType: bType,
          focusedTaskId: taskId,
          loggedMinutes: loggedMinutesInCurrentSessionRef.current,
          lastSaved: Date.now(),
        })
      );
    } catch {}
  };

  const clearActiveSession = async () => {
    try {
      await AsyncStorage.removeItem("todoapp:focus:current_session");
    } catch {}
  };

  const syncTimerFromSessionState = async () => {
    try {
      const raw = await AsyncStorage.getItem("todoapp:focus:current_session");
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session) return;

      const now = Date.now();
      let elapsed = session.elapsedBeforeStart;
      if (session.isActive) {
        elapsed += Math.floor((now - session.startTime) / 1000);
      }

      const duration = session.duration;
      const remaining = Math.max(0, duration - elapsed);

      setMode("pomodoro");
      setPomodoroMode(session.type);
      setBreakType(session.breakType || "short");
      setFocusedTaskId(session.focusedTaskId || null);
      setTotalSessionTime(duration);
      totalSessionTimeRef.current = duration;
      loggedMinutesInCurrentSessionRef.current = session.loggedMinutes || 0;

      if (remaining === 0) {
        setIsActive(false);
        setSessionTime(0);
        elapsedBeforeStartRef.current = 0;
        await clearActiveSession();

        if (session.type === "work") {
          const totalMinutes = Math.floor(duration / 60);
          const logged = loggedMinutesInCurrentSessionRef.current;
          const remainingMinutes = Math.max(0, totalMinutes - logged);
          if (remainingMinutes > 0) {
            await creditFocusTime(remainingMinutes);
          }
          void earnPebble("focus");
          await incrementCompletedSessions();
          AlertFinishWork(session.focusedTaskId);
        } else {
          AlertFinishBreak();
        }
      } else {
        setSessionTime(remaining);
        elapsedBeforeStartRef.current = session.elapsedBeforeStart;
        setIsActive(session.isActive);
        if (session.isActive) {
          startTimeRef.current = session.startTime;
        }
      }
    } catch {}
  };

  const saveStopwatchState = async (startTime: number, elapsed: number, running: boolean, laps: number[]) => {
    try {
      await AsyncStorage.setItem(
        "todoapp:focus:current_stopwatch",
        JSON.stringify({
          startTime,
          elapsedBeforeStart: elapsed,
          isRunning: running,
          laps,
        })
      );
    } catch {}
  };

  const clearStopwatchState = async () => {
    try {
      await AsyncStorage.removeItem("todoapp:focus:current_stopwatch");
    } catch {}
  };

  const syncStopwatchFromState = async () => {
    try {
      const raw = await AsyncStorage.getItem("todoapp:focus:current_stopwatch");
      if (!raw) return;
      const sw = JSON.parse(raw);
      if (!sw) return;

      setMode("stopwatch");
      setSwRunning(sw.isRunning);
      setSwLaps(sw.laps || []);

      if (sw.isRunning) {
        const now = Date.now();
        const elapsed = sw.elapsedBeforeStart + Math.floor((now - sw.startTime) / 1000);
        setSwTime(elapsed);
        swStartTimeRef.current = sw.startTime;
      } else {
        setSwTime(sw.elapsedBeforeStart);
      }
    } catch {}
  };

  const creditFocusTime = async (minutes: number) => {
    try {
      const raw = await AsyncStorage.getItem("todoapp:focus:stats");
      let completedTodayVal = 0;
      let totalFocusTimeVal = 0;
      if (raw) {
        const parsed = JSON.parse(raw);
        completedTodayVal = parsed.completedToday ?? 0;
        totalFocusTimeVal = parsed.totalFocusTime ?? 0;
      }
      const nextTotalFocusTime = totalFocusTimeVal + minutes;
      setTotalFocusTime(nextTotalFocusTime);
      await AsyncStorage.setItem(
        "todoapp:focus:stats",
        JSON.stringify({
          completedToday: completedTodayVal,
          totalFocusTime: nextTotalFocusTime,
        })
      );
      void syncWidgetData(nextTotalFocusTime).catch(() => {});
    } catch {}
  };

  const incrementCompletedSessions = async () => {
    try {
      const raw = await AsyncStorage.getItem("todoapp:focus:stats");
      let completedTodayVal = 0;
      let totalFocusTimeVal = 0;
      if (raw) {
        const parsed = JSON.parse(raw);
        completedTodayVal = parsed.completedToday ?? 0;
        totalFocusTimeVal = parsed.totalFocusTime ?? 0;
      }
      const nextCompleted = completedTodayVal + 1;
      setCompletedToday(nextCompleted);
      await AsyncStorage.setItem(
        "todoapp:focus:stats",
        JSON.stringify({
          completedToday: nextCompleted,
          totalFocusTime: totalFocusTimeVal,
        })
      );
    } catch {}
  };

  const logPartialMinutes = (totalElapsedSeconds: number) => {
    if (pomodoroMode !== "work") return;
    const totalMinutesElapsed = Math.floor(totalElapsedSeconds / 60);
    const newMinutesToLog = totalMinutesElapsed - loggedMinutesInCurrentSessionRef.current;
    if (newMinutesToLog > 0) {
      creditFocusTime(newMinutesToLog);
      loggedMinutesInCurrentSessionRef.current = totalMinutesElapsed;
    }
  };

  // Stopwatch Controller actions
  const swStartPause = () => {
    const nextRunning = !swRunning;
    setSwRunning(nextRunning);
    if (nextRunning) {
      const startTime = Date.now();
      swStartTimeRef.current = startTime;
      swElapsedBeforeStartRef.current = swTime;
      saveStopwatchState(startTime, swTime, true, swLaps);
    } else {
      saveStopwatchState(0, swTime, false, swLaps);
    }
  };

  const swReset = () => {
    setSwRunning(false);
    setSwTime(0);
    setSwLaps([]);
    clearStopwatchState();
  };

  const swLap = () => {
    const nextLaps = [swTime, ...swLaps];
    setSwLaps(nextLaps);
    saveStopwatchState(swRunning ? swStartTimeRef.current : 0, swTime, swRunning, nextLaps);
  };

  // Focus completion alerts & prompts
  const AlertFinishWork = (taskId: string | null) => {
    let taskTitle = "";
    let isHabit = false;
    let habitObj: any = null;

    if (taskId) {
      const todoObj = todoList.find((t) => t.id === taskId);
      if (todoObj) {
        taskTitle = todoObj.title;
      } else {
        habitObj = habitList.find((h) => h.id === taskId);
        if (habitObj) {
          taskTitle = habitObj.title;
          isHabit = true;
        }
      }
    }

    if (isHabit && habitObj) {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      
      const parseDateKey = (val: string) => {
        const [y, m, d] = val.split("-").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
      };
      const dayDiff = (from: string, to: string) => {
        return Math.floor((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / (24 * 60 * 60 * 1000));
      };

      const isEligibleForRecovery =
        !!habitObj.previousStreak &&
        habitObj.previousStreak > 0 &&
        !!habitObj.streakBrokenDate &&
        dayDiff(habitObj.streakBrokenDate, todayKey) <= 1;

      const sessionDurationMinutes = Math.round(totalSessionTime / 60);

      if (isEligibleForRecovery && totalSessionTime >= 10 * 60) {
        Alert.alert(
          "🎉 Focus Session Complete!",
          `Great work focusing on habit "${taskTitle}"! Your ${habitObj.previousStreak}-day streak has been successfully restored.`,
          [
            {
              text: "Awesome",
              onPress: async () => {
                try {
                  const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
                  if (rawHabits) {
                    const parsed = JSON.parse(rawHabits);
                    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
                    const updatedHabits = parsed.dailyHabits.map((h: any) => {
                      if (h.id === taskId) {
                        return {
                          ...h,
                          streak: h.previousStreak,
                          bestStreak: Math.max(h.bestStreak || 0, h.previousStreak),
                          lastCompletedDate: yesterdayKey,
                          previousStreak: undefined,
                          streakBrokenDate: undefined,
                        };
                      }
                      return h;
                    });
                    await AsyncStorage.setItem("todoapp:daily:v1", JSON.stringify({ ...parsed, dailyHabits: updatedHabits }));
                    emitStateChange("habits_changed");
                    emitStateChange("pebbles_changed");
                  }
                } catch (e) {
                  console.warn("Failed to auto-recover habit streak:", e);
                }
                setFocusedTaskId(null);
                transitionToBreak();
              }
            }
          ]
        );
      } else {
        Alert.alert(
          "🎉 Focus Session Complete!",
          `Great work focusing on habit "${taskTitle}" for ${sessionDurationMinutes} minutes!`,
          [
            {
              text: "Continue",
              onPress: () => {
                setFocusedTaskId(null);
                transitionToBreak();
              }
            }
          ]
        );
      }
    } else if (taskTitle) {
      Alert.alert(
        "🎉 Focus Session Complete!",
        `Great work! You focused on "${taskTitle}" for ${Math.round(totalSessionTime / 60)} minutes. Would you like to mark it as completed?`,
        [
          {
            text: "Mark Completed",
            onPress: async () => {
              await completeLinkedTask(taskId!);
              setFocusedTaskId(null);
              transitionToBreak();
            },
          },
          {
            text: "Keep Active",
            onPress: () => {
              transitionToBreak();
            },
          },
        ]
      );
    } else {
      Alert.alert("🎉 Focus Session Complete!", "Great work! Time for a short break.", [
        {
          text: "Start Break",
          onPress: () => {
            transitionToBreak();
          },
        },
        { text: "Dismiss" },
      ]);
    }
  };

  const AlertFinishBreak = () => {
    Alert.alert("🌸 Break Complete!", "Ready to get back to work?", [
      {
        text: "Start Focusing",
        onPress: () => {
          setPomodoroMode("work");
          const duration = showCustomInput ? customMinutes * 60 : 25 * 60;
          setSessionTime(duration);
          setTotalSessionTime(duration);
          totalSessionTimeRef.current = duration;
          loggedMinutesInCurrentSessionRef.current = 0;
          elapsedBeforeStartRef.current = 0;
          setIsActive(true);
          startTimeRef.current = Date.now();
        },
      },
      {
        text: "Later",
        onPress: () => {
          setPomodoroMode("work");
          const duration = showCustomInput ? customMinutes * 60 : 25 * 60;
          setSessionTime(duration);
          setTotalSessionTime(duration);
          totalSessionTimeRef.current = duration;
          loggedMinutesInCurrentSessionRef.current = 0;
          elapsedBeforeStartRef.current = 0;
          setIsActive(false);
        },
      },
    ]);
  };

  const transitionToBreak = () => {
    setPomodoroMode("break");
    const duration = breakType === "short" ? 5 * 60 : 15 * 60;
    setSessionTime(duration);
    setTotalSessionTime(duration);
    totalSessionTimeRef.current = duration;
    elapsedBeforeStartRef.current = 0;
    loggedMinutesInCurrentSessionRef.current = 0;
    setIsActive(false);
  };

  const handleTimerExpiration = async () => {
    setIsActive(false);
    elapsedBeforeStartRef.current = 0;
    await clearActiveSession();

    if (pomodoroMode === "work") {
      const totalMinutes = Math.floor(totalSessionTime / 60);
      const logged = loggedMinutesInCurrentSessionRef.current;
      const remainingMinutes = Math.max(0, totalMinutes - logged);
      if (remainingMinutes > 0) {
        await creditFocusTime(remainingMinutes);
      }
      void earnPebble("focus");
      await incrementCompletedSessions();
      AlertFinishWork(focusedTaskId);
    } else {
      AlertFinishBreak();
    }
  };

  const completeLinkedTask = async (taskId: string) => {
    try {
      const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      let updated = false;

      const updatedTodos = { ...state.todos };
      for (const listId in updatedTodos) {
        updatedTodos[listId] = updatedTodos[listId].map((todo: any) => {
          if (todo.id === taskId) {
            updated = true;
            return { ...todo, completed: true, lastUpdated: new Date().toISOString() };
          }
          return todo;
        });
      }

      if (updated) {
        state.todos = updatedTodos;
        await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
        emitStateChange("tasks_changed");
        await loadActiveTasks();
      }
    } catch {}
  };

  const handleStartPause = () => {
    const nextActive = !isActive;
    setIsActive(nextActive);
    if (nextActive) {
      startTimeRef.current = Date.now();
      void saveActiveSession(
        pomodoroMode,
        startTimeRef.current,
        totalSessionTime,
        elapsedBeforeStartRef.current,
        true,
        breakType,
        focusedTaskId
      );
    } else {
      const elapsedThisPeriod = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const newElapsed = elapsedBeforeStartRef.current + elapsedThisPeriod;
      elapsedBeforeStartRef.current = newElapsed;
      logPartialMinutes(newElapsed);
      void saveActiveSession(pomodoroMode, 0, totalSessionTime, newElapsed, false, breakType, focusedTaskId);
    }
  };

  const handleReset = () => {
    setIsActive(false);
    elapsedBeforeStartRef.current = 0;
    loggedMinutesInCurrentSessionRef.current = 0;
    void clearActiveSession();

    if (pomodoroMode === "work") {
      const duration = showCustomInput ? customMinutes * 60 : 25 * 60;
      setSessionTime(duration);
      setTotalSessionTime(duration);
      totalSessionTimeRef.current = duration;
    } else {
      const duration = breakType === "short" ? 5 * 60 : 15 * 60;
      setSessionTime(duration);
      setTotalSessionTime(duration);
      totalSessionTimeRef.current = duration;
    }
  };

  const selectDuration = (mins: number) => {
    if (isActive) return;
    setShowCustomInput(false);
    setSessionTime(mins * 60);
    setTotalSessionTime(mins * 60);
    totalSessionTimeRef.current = mins * 60;
    loggedMinutesInCurrentSessionRef.current = 0;
  };

  const selectCustomDuration = () => {
    if (isActive) return;
    setShowCustomInput(true);
    setSessionTime(customMinutes * 60);
    setTotalSessionTime(customMinutes * 60);
    totalSessionTimeRef.current = customMinutes * 60;
    loggedMinutesInCurrentSessionRef.current = 0;
  };

  const adjustCustomMinutes = (amount: number) => {
    if (isActive) return;
    const newMinutes = Math.min(180, Math.max(1, customMinutes + amount));
    setCustomMinutes(newMinutes);
    setCustomMinsText(String(newMinutes));
    setSessionTime(newMinutes * 60);
    setTotalSessionTime(newMinutes * 60);
    totalSessionTimeRef.current = newMinutes * 60;
    loggedMinutesInCurrentSessionRef.current = 0;
  };

  const handleCustomMinutesChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setCustomMinsText(cleaned);
  };

  const handleCustomMinutesSubmitOrBlur = () => {
    const val = parseInt(customMinsText, 10);
    const clamped = Math.max(1, Math.min(180, isNaN(val) ? 25 : val));
    setCustomMinutes(clamped);
    setCustomMinsText(String(clamped));
    setSessionTime(clamped * 60);
    setTotalSessionTime(clamped * 60);
    totalSessionTimeRef.current = clamped * 60;
  };

  const toggleGlow = async () => {
    const nextGlow = !glowEnabled;
    setGlowEnabled(nextGlow);
    await AsyncStorage.setItem("todoapp:focus:glow_enabled", String(nextGlow));
  };

  return {
    sessionTime,
    setSessionTime,
    isActive,
    setIsActive,
    totalSessionTime,
    setTotalSessionTime,
    completedToday,
    setCompletedToday,
    totalFocusTime,
    setTotalFocusTime,
    showCustomInput,
    setShowCustomInput,
    customMinutes,
    setCustomMinutes,
    customMinsText,
    setCustomMinsText,
    mode,
    setMode,
    pomodoroMode,
    setPomodoroMode,
    breakType,
    setBreakType,
    glowEnabled,
    setGlowEnabled,
    selectedSoundId,
    setSelectedSoundId,
    showMusicPlayer,
    setShowMusicPlayer,
    soundVolume,
    setSoundVolume,
    isMuted,
    setIsMuted,
    playerCurrentTime,
    setPlayerCurrentTime,
    playerDuration,
    setPlayerDuration,
    likedSoundIds,
    setLikedSoundIds,
    customTracks,
    setCustomTracks,
    isShuffle,
    setIsShuffle,
    isRepeat,
    setIsRepeat,
    todoList,
    setTodoList,
    habitList,
    setHabitList,
    focusedTaskId,
    setFocusedTaskId,
    showTaskPicker,
    setShowTaskPicker,
    swRunning,
    setSwRunning,
    swTime,
    setSwTime,
    swLaps,
    setSwLaps,
    isPlaying,
    soundRef,
    isDraggingProgressRef,
    handleToggleLike,
    handleImportCustomTrack,
    handleDeleteCustomTrack,
    handleSelectSound,
    handleAdjustVolume,
    handlePrevTrack,
    handleNextTrack,
    swStartPause,
    swReset,
    swLap,
    handleStartPause,
    handleReset,
    selectDuration,
    selectCustomDuration,
    adjustCustomMinutes,
    handleCustomMinutesChange,
    handleCustomMinutesSubmitOrBlur,
    toggleGlow,
    transitionToBreak,
    completeLinkedTask,
  };
}
