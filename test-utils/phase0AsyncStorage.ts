import AsyncStorage from "@react-native-async-storage/async-storage";

type AsyncStorageMock = typeof AsyncStorage & {
  __INTERNAL_MOCK_STORAGE__: Record<string, string>;
};

export const phase0Storage = AsyncStorage as AsyncStorageMock;

export async function resetPhase0Storage(): Promise<void> {
  await phase0Storage.clear();
  jest.clearAllMocks();
}

export async function readStoredJson<T>(key: string): Promise<T | null> {
  const raw = await phase0Storage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
