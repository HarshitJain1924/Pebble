type EventType = "tasks_changed" | "habits_changed";
type Listener = () => void;

const listeners: Record<EventType, Set<Listener>> = {
  tasks_changed: new Set<Listener>(),
  habits_changed: new Set<Listener>(),
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
export const emitStateChange = (event: EventType) => {
  console.log(`📣 [EVENT EMITTED] "${event}" - Notifying all listeners.`);
  listeners[event].forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn(`Error in state event listener for "${event}":`, e);
    }
  });
};
