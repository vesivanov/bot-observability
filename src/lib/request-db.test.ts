import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  close: vi.fn(async () => {}),
}));
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => mocks.callbacks.push(callback) }));
vi.mock("./db", () => ({ createDbClient: () => ({ close: mocks.close }) }));
import { getRequestDb } from "./request-db";

afterEach(() => vi.useRealTimers());

it("registers cleanup after each response without closing another active request", async () => {
  vi.useFakeTimers();
  const first = getRequestDb("test-database");
  const second = getRequestDb("test-database");
  expect(second).toBe(first);
  expect(mocks.callbacks).toHaveLength(2);
  await mocks.callbacks[0]();
  await vi.advanceTimersByTimeAsync(10000);
  expect(mocks.close).not.toHaveBeenCalled();
  const lastResponse = mocks.callbacks[1]();
  await vi.advanceTimersByTimeAsync(4999);
  expect(mocks.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await lastResponse;
  expect(mocks.close).toHaveBeenCalledOnce();
});
