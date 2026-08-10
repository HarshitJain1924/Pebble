/**
 * mutex.ts
 * ────────────────────────
 * A simple in-memory Mutex to serialize asynchronous operations by key.
 * Used to prevent Read-Modify-Write race conditions in AsyncStorage repositories.
 */

const locks = new Map<string, Promise<void>>();

/**
 * Executes a task exclusively for the given key.
 * All tasks for the same key are queued and executed sequentially.
 */
export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  locks.set(key, previous.then(() => current).catch(() => current));

  try {
    await previous;
    return await task();
  } finally {
    release!();
    // Clean up the map if this is the last promise in the chain
    if (locks.get(key) === current) {
      locks.delete(key);
    }
  }
}
