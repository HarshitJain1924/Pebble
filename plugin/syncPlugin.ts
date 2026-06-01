import { AppPlugin } from "./types";

// This plugin is a template ready for future backend integration.
// To connect to a backend:
// 1. Install axios/fetch/apollo-client.
// 2. Implement the functions below to sync local changes to your database.
export const syncPlugin: AppPlugin = {
  name: "BackendSync",
  enabled: true,

  onAppLoad() {
    console.log("Backend sync plugin template active.");
    // Example: fetch initial data from server and merge with local storage
  },

  onTaskCreated(task) {
    console.log("[BackendSync] Task created: syncing to backend...", task);
    // Example: fetch('/api/tasks', { method: 'POST', body: JSON.stringify(task) })
  },

  onTaskCompleted(task) {
    console.log("[BackendSync] Task completed: syncing completion...", task.id);
    // Example: fetch(`/api/tasks/${task.id}/complete`, { method: 'POST' })
  },

  onTaskUncompleted(task) {
    console.log("[BackendSync] Task uncompleted: syncing reversion...", task.id);
  },

  onTaskDeleted(taskId) {
    console.log("[BackendSync] Task deleted: syncing deletion...", taskId);
    // Example: fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  },

  onSubtaskToggled(taskId, subtaskId, completed) {
    console.log(`[BackendSync] Subtask ${subtaskId} of task ${taskId} toggled to ${completed}: syncing status...`);
  },

  onSubtaskCreated(taskId, subtask) {
    console.log(`[BackendSync] Subtask created under task ${taskId}: syncing...`, subtask);
  },

  onHabitCompleted(habit) {
    console.log("[BackendSync] Habit completed: syncing check-in and streak...", habit);
  },

  onHabitDeleted(habitId) {
    console.log("[BackendSync] Habit deleted: syncing deletion...", habitId);
  },

  onProfileUpdated(profile) {
    console.log("[BackendSync] Profile updated: syncing changes...", profile);
  },

  onSettingsUpdated(settings) {
    console.log("[BackendSync] Settings updated: syncing choices...", settings);
  },
};
export default syncPlugin;
