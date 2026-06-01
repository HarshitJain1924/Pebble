export interface AppPlugin {
  name: string;
  enabled: boolean;

  // App Lifecycle
  onAppLoad?(): Promise<void> | void;

  // Task Hooks
  onTaskCreated?(task: any): Promise<void> | void;
  onTaskCompleted?(task: any): Promise<void> | void;
  onTaskUncompleted?(task: any): Promise<void> | void;
  onTaskDeleted?(taskId: string): Promise<void> | void;
  onSubtaskToggled?(taskId: string, subtaskId: string, completed: boolean): Promise<void> | void;
  onSubtaskCreated?(taskId: string, subtask: any): Promise<void> | void;

  // Habit Hooks
  onHabitCompleted?(habit: any): Promise<void> | void;
  onHabitDeleted?(habitId: string): Promise<void> | void;

  // Settings & Profile
  onProfileUpdated?(profile: any): Promise<void> | void;
  onSettingsUpdated?(settings: any): Promise<void> | void;
}
