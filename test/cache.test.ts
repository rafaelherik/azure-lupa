import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Cache } from "../src/server/cache.js";

let dir: string;
afterEach(() => rm(dir, { recursive: true, force: true }));

async function makeCache(now: { t: number }) {
  dir = await mkdtemp(join(tmpdir(), "lupa-cache-"));
  return new Cache({ dir, defaultTtlMs: 1000, now: () => now.t });
}

describe("Cache", () => {
  it("serves fresh entries and reloads after TTL", async () => {
    const clock = { t: 0 };
    const cache = await makeCache(clock);
    let calls = 0;
    const load = async () => ++calls;
    expect((await cache.wrap("k", load)).data).toBe(1);
    expect((await cache.wrap("k", load)).fromCache).toBe(true);
    clock.t = 1500;
    expect((await cache.wrap("k", load)).data).toBe(2);
  });

  it("persists to disk across instances", async () => {
    const clock = { t: 0 };
    const a = await makeCache(clock);
    await a.set("k", { v: 1 });
    const b = new Cache({ dir, defaultTtlMs: 1000, now: () => clock.t });
    expect(await b.get("k")).toEqual({ data: { v: 1 }, cachedAt: 0 });
  });

  it("freshAfter rejects entries cached before it", async () => {
    const clock = { t: 0 };
    const cache = await makeCache(clock);
    await cache.set("k", "old");
    clock.t = 10;
    expect((await cache.wrap("k", async () => "new", { freshAfter: 5 })).data).toBe("new");
    expect((await cache.wrap("k", async () => "newer", { freshAfter: 5 })).data).toBe("new");
  });

  it("concurrent calls for one key share a single load", async () => {
    const cache = await makeCache({ t: 0 });
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load = async () => {
      calls++;
      await gate;
      return calls;
    };
    const a = cache.wrap("k", load);
    const b = cache.wrap("k", load);
    release();
    expect((await a).data).toBe(1);
    expect((await b).data).toBe(1);
    expect(calls).toBe(1);
  });

  it("a refresh joining an in-flight call does not accept an older hit", async () => {
    const clock = { t: 0 };
    const cache = await makeCache(clock);
    await cache.set("k", "old");
    clock.t = 10;
    const plain = cache.wrap("k", async () => "unused");
    const fresh = cache.wrap("k", async () => "new", { freshAfter: 5 });
    expect((await plain).data).toBe("old");
    expect((await fresh).data).toBe("new");
  });

  it("memory: false keeps the value on disk only", async () => {
    const clock = { t: 0 };
    const cache = await makeCache(clock);
    await cache.wrap("big", async () => ({ v: 1 }), { memory: false });
    expect((cache as unknown as { memory: Map<string, unknown> }).memory.has("big")).toBe(false);
    expect((await cache.wrap("big", async () => ({ v: 2 }), { memory: false })).data).toEqual({ v: 1 });
  });

  it("keys are stable for equal input", () => {
    expect(Cache.key("x", { a: 1 })).toBe(Cache.key("x", { a: 1 }));
    expect(Cache.key("x", { a: 1 })).not.toBe(Cache.key("x", { a: 2 }));
  });
});
