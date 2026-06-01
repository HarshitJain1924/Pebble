import * as Haptics from "expo-haptics";
import { AppPlugin } from "./types";

export const hapticPlugin: AppPlugin = {
  name: "HapticFeedback",
  enabled: true,

  onAppLoad() {
    console.log("Haptic feedback plugin initialized.");
  },

  onTaskCreated() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onTaskCompleted() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onTaskUncompleted() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onTaskDeleted() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onSubtaskToggled(_taskId, _subtaskId, completed) {
    if (completed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((err) =>
        console.warn("Haptics warning:", err)
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
        console.warn("Haptics warning:", err)
      );
    }
  },

  onSubtaskCreated() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onHabitCompleted() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onHabitDeleted() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onProfileUpdated() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },

  onSettingsUpdated() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn("Haptics warning:", err)
    );
  },
};
export default hapticPlugin;
