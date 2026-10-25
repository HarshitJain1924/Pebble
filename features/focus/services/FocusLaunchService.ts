import AsyncStorage from "@react-native-async-storage/async-storage";
import { emitStateChange } from "@/services/events/state-events";
import { router } from "expo-router";

export interface LaunchFocusSessionParams {
  targetId: string;
  durationSeconds: number;
}

/**
 * Canonical helper to launch Focus Mode for a specific Task or Habit.
 *
 * Execution semantics:
 * 1. Clears any active stopwatch state to prevent mode collision.
 * 2. Persists the active session to Pebble's canonical session storage
 *    (`todoapp:focus:current_session`) with `isActive: true`, the target ID,
 *    and the computed duration (in seconds).
 * 3. Emits `focus_changed` so `useFocusState` synchronizes immediately.
 * 4. Navigates to `/focus` to reveal the Focus Cockpit.
 */
export async function launchFocusSession({
  targetId,
  durationSeconds,
}: LaunchFocusSessionParams): Promise<void> {
  const sessionObj = {
    type: "work",
    startTime: Date.now(),
    duration: durationSeconds,
    elapsedBeforeStart: 0,
    isActive: true,
    breakType: "short",
    focusedTaskId: targetId,
    loggedMinutes: 0,
    lastSaved: Date.now(),
  };

  // 1. Clear any active stopwatch state
  await AsyncStorage.removeItem("todoapp:focus:current_stopwatch");

  // 2. Persist active focus session
  await AsyncStorage.setItem(
    "todoapp:focus:current_session",
    JSON.stringify(sessionObj),
  );

  // 3. Notify listeners
  emitStateChange("focus_changed", "FocusLaunchService");

  // 4. Navigate to canonical Focus tab
  router.navigate("/focus");
}
