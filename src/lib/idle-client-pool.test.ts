import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdleClientPool } from "./idle-client-pool";

afterEach(() => vi.useRealTimers());

describe("idle client pool", () => {
  it("reuses a client during the idle window and eventually closes it", async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => {});
    const factory = vi.fn(() => ({ close }));
    const pool = createIdleClientPool(factory);
    const first = pool.acquire("db");
    const firstRelease = first.release();
    await vi.advanceTimersByTimeAsync(4000);
    const second = pool.acquire("db");
    await firstRelease;
    expect(second.client).toBe(first.client);
    expect(close).not.toHaveBeenCalled();
    const secondRelease = second.release();
    await vi.advanceTimersByTimeAsync(5000);
    await secondRelease;
    expect(close).toHaveBeenCalledOnce();
    pool.acquire("db");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("does not close while another streamed request still holds a lease", async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => {});
    const pool = createIdleClientPool(() => ({ close }));
    const first = pool.acquire("db");
    const second = pool.acquire("db");
    await first.release();
    await first.release(); // release is idempotent
    await vi.advanceTimersByTimeAsync(10000);
    expect(close).not.toHaveBeenCalled();
    const done = second.release();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(close).toHaveBeenCalledOnce();
  });

  it("never reuses a client whose asynchronous shutdown has begun", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const factory = vi.fn(() => ({ close: () => new Promise<void>(resolve => { finish = resolve; }) }));
    const pool = createIdleClientPool(factory);
    const first = pool.acquire("db");
    const done = first.release();
    await vi.advanceTimersByTimeAsync(5000);
    const second = pool.acquire("db");
    expect(second.client).not.toBe(first.client);
    finish();
    await done;
  });

  it("separates database configurations and propagates cleanup failures", async () => {
    vi.useFakeTimers();
    const pool = createIdleClientPool(() => ({ close: async () => { throw new Error("close failed"); } }));
    const first = pool.acquire("one");
    const second = pool.acquire("two");
    expect(first.client).not.toBe(second.client);
    const assertion = expect(first.release()).rejects.toThrow("close failed");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});
