// DuckDB-Wasm, started on first use. The wasm and its worker come from jsDelivr, pinned to the
// installed package version, so the JS API and the engine always match; extensions are never fetched.

import { AsyncDuckDB, VoidLogger, getJsDelivrBundles, selectBundle } from "@duckdb/duckdb-wasm";
import type { SqlConn } from "./engine";

let connection: Promise<SqlConn> | undefined;

/** A same-origin object URL for `parts`; the caller revokes it. */
const blobUrl = (parts: BlobPart[], type: string) => URL.createObjectURL(new Blob(parts, { type }));

async function start(): Promise<SqlConn> {
  const bundle = await selectBundle(getJsDelivrBundles());
  const urls: string[] = [];
  let worker: Worker | undefined;
  try {
    // Download the wasm here rather than in the worker: a failed fetch inside the worker never
    // reaches the page (instantiate() would wait forever), while here it rejects, and a proxy's
    // error page shows up as a bad status instead of a wasm compile error.
    const res = await fetch(bundle.mainModule);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${bundle.mainModule}`);
    const wasmUrl = blobUrl([await res.arrayBuffer()], "application/wasm");
    // Browsers refuse a cross-origin Worker URL; a same-origin Blob that imports the script is allowed.
    const workerUrl = blobUrl([`importScripts(${JSON.stringify(bundle.mainWorker)});`], "text/javascript");
    urls.push(wasmUrl, workerUrl);
    worker = new Worker(workerUrl);
    // If the worker script cannot be fetched, its error event is the only signal.
    const failed = new Promise<never>((_, reject) =>
      worker!.addEventListener("error", (e) => reject(new Error(e.message || "DuckDB worker failed")), {
        once: true,
      }),
    );
    const db = new AsyncDuckDB(new VoidLogger(), worker);
    await Promise.race([db.instantiate(wasmUrl, bundle.pthreadWorker), failed]);
    await db.open({ query: { castBigIntToDouble: true } });
    const conn = await db.connect();
    // Everything the engine needs is in the core build; never fetch from extensions.duckdb.org.
    await conn.query("SET autoinstall_known_extensions = false");
    await conn.query("SET autoload_known_extensions = false");
    return {
      query: async <T>(sql: string) => (await conn.query(sql)).toArray().map((r) => r.toJSON() as T),
      insert: (name, ipc) => conn.insertArrowFromIPCStream(ipc, { name }),
    };
  } catch (err) {
    worker?.terminate();
    throw new Error(
      "Couldn't load the DuckDB engine from cdn.jsdelivr.net. Check your internet connection or proxy, then retry.",
      { cause: err },
    );
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}

export function duckdb(): Promise<SqlConn> {
  connection ??= start().catch((err: unknown) => {
    connection = undefined;
    throw err;
  });
  return connection;
}
