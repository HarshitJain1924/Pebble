type EventType =
  | "tasks_changed"
  | "habits_changed"
  | "profile_changed"
  | "pebbles_changed"
  | "settings_changed"
  | "focus_changed"
  | "resources_changed"
  | "vault_changed"
  | "close_drawer"
  | "dashboard_filter_changed"
  | "zen_mode_toggle"
  | "review_day_open"
  | "checklists_changed"
  | "workspace_changed"
  | "workspace_mode_changed"
  | "workspace_segment_changed"
  | "workspace_segment_request"
  | "workspace_nav_mode_changed"
  | "open_quick_add";
type Listener = (emitterId?: string) => void;

const listeners: Record<EventType, Set<Listener>> = {
  tasks_changed: new Set<Listener>(),
  habits_changed: new Set<Listener>(),
  profile_changed: new Set<Listener>(),
  pebbles_changed: new Set<Listener>(),
  settings_changed: new Set<Listener>(),
  focus_changed: new Set<Listener>(),
  resources_changed: new Set<Listener>(),
  vault_changed: new Set<Listener>(),
  close_drawer: new Set<Listener>(),
  dashboard_filter_changed: new Set<Listener>(),
  zen_mode_toggle: new Set<Listener>(),
  review_day_open: new Set<Listener>(),
  checklists_changed: new Set<Listener>(),
  workspace_changed: new Set<Listener>(),
  workspace_mode_changed: new Set<Listener>(),
  workspace_segment_changed: new Set<Listener>(),
  workspace_segment_request: new Set<Listener>(),
  workspace_nav_mode_changed: new Set<Listener>(),
  open_quick_add: new Set<Listener>(),
};

/**
 * Register a listener for a global state change event.
 * Returns an unsubscribe function to cleanly clean up listeners in useEffect.
 */
export const addStateListener = (event: EventType, listener: Listener) => {
  listeners[event].add(listener);
  return () => {
    listeners[event].delete(listener);
  };
};

/**
 * Emit a global state change event to notify all active listeners.
 */
export const emitStateChange = (event: EventType, emitterId?: string) => {
  console.log(
    `📣 [EVENT EMITTED] "${event}" from "${emitterId || "unknown"}" - Notifying all listeners.`,
  );
  listeners[event].forEach((listener) => {
    try {
      listener(emitterId);
    } catch (e) {
      console.warn(`Error in state event listener for "${event}":`, e);
    }
  });
};
