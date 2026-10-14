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

  it("keys are stable for equal input", () => {
    expect(Cache.key("x", { a: 1 })).toBe(Cache.key("x", { a: 1 }));
    expect(Cache.key("x", { a: 1 })).not.toBe(Cache.key("x", { a: 2 }));
  });
});
