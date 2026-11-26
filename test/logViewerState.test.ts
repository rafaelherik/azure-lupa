import { expect, it, vi } from "vitest";
import { latestRun } from "../src/web/lib/latestRun.js";
import { parse, serialize } from "../src/web/lib/state.js";

function delayed<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it("round-trips Log Viewer navigation before and after scoping without persisting viewer inputs", () => {
  const unscoped = parse("?view=logs");
  expect(unscoped.view).toBe("logs");
  expect(serialize(unscoped)).toBe("?view=logs");
  const scoped = parse("?tenant=t&subs=one,two&view=logs&rgs=inventory-only");
  expect(scoped.subscriptionIds).toEqual(["one", "two"]);
  expect(parse(serialize(scoped))).toEqual(scoped);
  expect(parse("?view=dashboard").view).toBe("dashboard");
  expect(parse("").view).toBe("resources");
});

it.each(["success", "failure"] as const)("ignores stale %s even if the transport ignores abort", async (outcome) => {
  const run = latestRun();
  const callbacks = { success: vi.fn(), failure: vi.fn() };
  const a = delayed<string>();
  const b = delayed<string>();
  const first = vi.fn(() => a.promise);
  const old = run.start(first, callbacks);
  const current = run.start(() => b.promise, callbacks);
  expect(first).toHaveBeenCalledWith(expect.objectContaining({ aborted: true }));
  b.resolve("resource B");
  await current;
  if (outcome === "success") a.resolve("resource A");
  else a.reject(new Error("resource A"));
  await old;
  expect(callbacks.success.mock.calls).toEqual([["resource B"]]);
  expect(callbacks.failure).not.toHaveBeenCalled();
});

it("explicitly clears and aborts an active run on input change or unmount", async () => {
  const run = latestRun();
  const callbacks = { success: vi.fn(), failure: vi.fn() };
  const pending = delayed<string>();
  const request = vi.fn(() => pending.promise);
  const done = run.start(request, callbacks);
  run.clear();
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ aborted: true }));
  pending.resolve("old scope");
  await done;
  expect(callbacks.success).not.toHaveBeenCalled();
  expect(callbacks.failure).not.toHaveBeenCalled();
});
