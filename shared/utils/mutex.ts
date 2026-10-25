/**
 * mutex.ts
 * ────────────────────────
 * A simple in-memory Mutex to serialize asynchronous operations by key.
 * Used to prevent Read-Modify-Write race conditions in AsyncStorage repositories.
 */

const locks = new Map<string, Promise<void>>();

export function getLockCount(): number {
  return locks.size;
}

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

  const next = previous.then(() => current).catch(() => current);
  locks.set(key, next);

  try {
    await previous;
    return await task();
  } finally {
    release!();
    // Clean up the map if this is the last promise in the chain
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  }
}

/**
 * Executes a task exclusively for multiple keys, acquiring them in sorted order to prevent deadlocks.
 */
export async function withLocks<T>(keys: string[], task: () => Promise<T>): Promise<T> {
  const uniqueKeys = Array.from(new Set(keys)).sort();
  if (uniqueKeys.length === 0) return task();

  const acquireLocks = (index: number): Promise<T> => {
    if (index >= uniqueKeys.length) return task();
    return withLock(uniqueKeys[index], () => acquireLocks(index + 1));
  };

  return acquireLocks(0);
}
