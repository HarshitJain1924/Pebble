import { AppPlugin } from "./types";

class PluginManager {
  private plugins: AppPlugin[] = [];

  register(plugin: AppPlugin) {
    this.plugins.push(plugin);
    console.log(`Plugin registered: ${plugin.name}`);
  }

  getPlugins(): AppPlugin[] {
    return this.plugins;
  }

  // Trigger hooks across all enabled plugins
  async dispatchAppLoad() {
    for (const p of this.plugins) {
      if (p.enabled && p.onAppLoad) {
        try {
          await p.onAppLoad();
        } catch (e) {
          console.error(`Error in plugin ${p.name} onAppLoad:`, e);
        }
      }
    }
  }

  async dispatchTaskCreated(task: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onTaskCreated) {
        try {
          await p.onTaskCreated(task);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onTaskCreated:`, e);
        }
      }
    }
  }

  async dispatchTaskCompleted(task: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onTaskCompleted) {
        try {
          await p.onTaskCompleted(task);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onTaskCompleted:`, e);
        }
      }
    }
  }

  async dispatchTaskUncompleted(task: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onTaskUncompleted) {
        try {
          await p.onTaskUncompleted(task);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onTaskUncompleted:`, e);
        }
      }
    }
  }

  async dispatchTaskDeleted(taskId: string) {
    for (const p of this.plugins) {
      if (p.enabled && p.onTaskDeleted) {
        try {
          await p.onTaskDeleted(taskId);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onTaskDeleted:`, e);
        }
      }
    }
  }

  async dispatchSubtaskToggled(taskId: string, subtaskId: string, completed: boolean) {
    for (const p of this.plugins) {
      if (p.enabled && p.onSubtaskToggled) {
        try {
          await p.onSubtaskToggled(taskId, subtaskId, completed);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onSubtaskToggled:`, e);
        }
      }
    }
  }

  async dispatchSubtaskCreated(taskId: string, subtask: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onSubtaskCreated) {
        try {
          await p.onSubtaskCreated(taskId, subtask);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onSubtaskCreated:`, e);
        }
      }
    }
  }

  async dispatchHabitCompleted(habit: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onHabitCompleted) {
        try {
          await p.onHabitCompleted(habit);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onHabitCompleted:`, e);
        }
      }
    }
  }

  async dispatchHabitDeleted(habitId: string) {
    for (const p of this.plugins) {
      if (p.enabled && p.onHabitDeleted) {
        try {
          await p.onHabitDeleted(habitId);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onHabitDeleted:`, e);
        }
      }
    }
  }

  async dispatchProfileUpdated(profile: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onProfileUpdated) {
        try {
          await p.onProfileUpdated(profile);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onProfileUpdated:`, e);
        }
      }
    }
  }

  async dispatchSettingsUpdated(settings: any) {
    for (const p of this.plugins) {
      if (p.enabled && p.onSettingsUpdated) {
        try {
          await p.onSettingsUpdated(settings);
        } catch (e) {
          console.error(`Error in plugin ${p.name} onSettingsUpdated:`, e);
        }
      }
    }
  }
}

export const pluginManager = new PluginManager();
export default pluginManager;
