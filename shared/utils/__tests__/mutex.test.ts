import { withLock, withLocks, getLockCount } from "../mutex";

describe("mutex", () => {
  beforeEach(() => {
    // Ensure map is empty before each test
    expect(getLockCount()).toBe(0);
  });

  afterEach(() => {
    // Ensure map is empty after each test to verify no leaks
    expect(getLockCount()).toBe(0);
  });

  it("returns to empty after normal usage (1 caller)", async () => {
    let executed = false;
    await withLock("test_key_1", async () => {
      executed = true;
      expect(getLockCount()).toBe(1);
    });
    expect(executed).toBe(true);
  });

  it("returns to empty after callback failure", async () => {
    const error = new Error("Test Error");
    await expect(
      withLock("test_key_fail", async () => {
        expect(getLockCount()).toBe(1);
        throw error;
      })
    ).rejects.toThrow(error);
  });

  it("two waiters do not cause premature cleanup", async () => {
    let executionOrder: number[] = [];
    let inside1 = false;
    
    const p1 = withLock("test_key_2", async () => {
      inside1 = true;
      // Yield to allow p2 to queue up
      await new Promise(resolve => setTimeout(resolve, 10));
      executionOrder.push(1);
    });

    const p2 = withLock("test_key_2", async () => {
      // If p1 cleaned up prematurely, this might fail or not be blocked correctly
      // But actually, we just want to ensure it runs strictly after p1
      expect(inside1).toBe(true);
      expect(executionOrder).toContain(1);
      executionOrder.push(2);
    });

    await Promise.all([p1, p2]);
    expect(executionOrder).toEqual([1, 2]);
  });

  it("duplicate keys do not deadlock", async () => {
    let executed = false;
    const p = withLocks(["test_key_3", "test_key_3"], async () => {
      executed = true;
    });

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 100));
    await expect(Promise.race([p, timeout])).resolves.not.toThrow();
    expect(executed).toBe(true);
  });

  it("multiple keys clean up correctly", async () => {
    let executed = false;
    await withLocks(["test_key_A", "test_key_B", "test_key_C"], async () => {
      executed = true;
      expect(getLockCount()).toBe(3);
    });
    expect(executed).toBe(true);
  });

  it("concurrent unrelated keys do not interfere", async () => {
    let executedA = false;
    let executedB = false;

    const pA = withLock("unrelated_A", async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executedA = true;
    });

    const pB = withLock("unrelated_B", async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executedB = true;
    });

    await Promise.all([pA, pB]);
    expect(executedA).toBe(true);
    expect(executedB).toBe(true);
  });

  it("prevents execution overlap for the same key", async () => {
    let active = 0;
    
    const task = async () => {
      active++;
      expect(active).toBe(1); // Should never be > 1
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
    };

    const promises = Array.from({ length: 5 }).map(() => withLock("overlap_key", task));
    await Promise.all(promises);
  });
});
