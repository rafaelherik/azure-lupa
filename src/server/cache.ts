import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Cached } from "../shared/types.js";
import { log } from "./log.js";

interface Entry {
  data: unknown;
  cachedAt: number;
  ttlMs: number;
}

export interface CacheOptions {
  dir?: string;
  defaultTtlMs?: number;
  maxMemoryEntries?: number;
  now?: () => number;
}

/**
 * Two-level cache: an in-memory LRU in front of JSON files on disk, so a second launch
 * of the app does not hit Azure again for data still within its TTL.
 */
export class Cache {
  readonly dir: string;
  private defaultTtlMs: number;
  private maxMemoryEntries: number;
  private now: () => number;
  private memory = new Map<string, Entry>();

  constructor(opts: CacheOptions = {}) {
    this.dir = opts.dir ?? join(homedir(), ".azure-lupa", "cache");
    this.defaultTtlMs = opts.defaultTtlMs ?? 15 * 60_000;
    this.maxMemoryEntries = opts.maxMemoryEntries ?? 500;
    this.now = opts.now ?? Date.now;
  }

  static key(namespace: string, parts: unknown): string {
    const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
    return `${namespace}-${hash}`;
  }

  private file(key: string) {
    return join(this.dir, `${key}.json`);
  }

  private remember(key: string, entry: Entry) {
    this.memory.delete(key);
    this.memory.set(key, entry);
    while (this.memory.size > this.maxMemoryEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  private fresh(entry: Entry) {
    return this.now() - entry.cachedAt < entry.ttlMs;
  }

  async get<T>(key: string): Promise<{ data: T; cachedAt: number } | undefined> {
    const mem = this.memory.get(key);
    if (mem && this.fresh(mem)) {
      this.remember(key, mem);
      return { data: mem.data as T, cachedAt: mem.cachedAt };
    }
    try {
      const entry = JSON.parse(await readFile(this.file(key), "utf8")) as Entry;
      if (this.fresh(entry)) {
        this.remember(key, entry);
        return { data: entry.data as T, cachedAt: entry.cachedAt };
      }
    } catch {
      // missing or unreadable cache file
    }
    return undefined;
  }

  async set(key: string, data: unknown, ttlMs = this.defaultTtlMs): Promise<number> {
    const entry: Entry = { data, cachedAt: this.now(), ttlMs };
    this.remember(key, entry);
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file(key), JSON.stringify(entry));
    } catch (err) {
      log.debug(`cache write failed: ${String(err)}`);
    }
    return entry.cachedAt;
  }

  /**
   * Return cached data, or load it, store it and return it.
   * `freshAfter` (epoch ms) rejects entries cached before it, which is how a user-triggered refresh
   * invalidates every view of a scope without enumerating cache keys.
   */
  async wrap<T>(key: string, load: () => Promise<T>, opts: { freshAfter?: number; ttlMs?: number } = {}): Promise<Cached<T>> {
    const hit = await this.get<T>(key);
    if (hit && hit.cachedAt >= (opts.freshAfter ?? 0)) {
      log.debug(`cache hit ${key}`);
      return { ...hit, fromCache: true };
    }
    const data = await load();
    const cachedAt = await this.set(key, data, opts.ttlMs);
    return { data, cachedAt, fromCache: false };
  }

  async clear() {
    this.memory.clear();
    await rm(this.dir, { recursive: true, force: true });
  }
}
