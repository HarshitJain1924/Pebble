type EventType =
  | "tasks_changed"
  | "habits_changed"
  | "profile_changed"
  | "pebbles_changed"
  | "settings_changed"
  | "focus_changed";
type Listener = (emitterId?: string) => void;

const listeners: Record<EventType, Set<Listener>> = {
  tasks_changed: new Set<Listener>(),
  habits_changed: new Set<Listener>(),
  profile_changed: new Set<Listener>(),
  pebbles_changed: new Set<Listener>(),
  settings_changed: new Set<Listener>(),
  focus_changed: new Set<Listener>(),
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
