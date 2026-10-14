import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { Command, Option } from "commander";
import open from "open";
import { buildApp } from "./app.js";
import { Cache } from "./cache.js";
import { log } from "./log.js";

const exec = promisify(execFile);

interface CliOptions {
  port: string;
  open: boolean;
  cacheTtl: string;
  clearCache?: boolean;
  verbose?: boolean;
  token?: string;
}

async function preflight() {
  try {
    const { stdout } = await exec("az", ["account", "show", "--query", "user.name", "-o", "tsv"], {
      shell: process.platform === "win32",
    });
    return stdout.trim();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") {
      log.info("Azure CLI (az) was not found. Install it: https://aka.ms/azure-cli");
    } else {
      log.info("You are not logged in to the Azure CLI. Run `az login` and try again.");
      if (e.stderr) log.debug(e.stderr);
    }
    process.exit(1);
  }
}

async function main() {
  const program = new Command()
    .name("azure-lupa")
    .description("Browse your Azure inventory locally using your Azure CLI login")
    .option("-p, --port <port>", "port to listen on", "4517")
    .option("--no-open", "do not open the browser")
    .option("--cache-ttl <minutes>", "how long Azure responses are cached", "15")
    .option("--clear-cache", "delete the local cache before starting")
    .option("-v, --verbose", "log Azure calls and cache hits")
    .addOption(new Option("--token <token>", "fixed session token (development)").hideHelp())
    .parse();
  const opts = program.opts<CliOptions>();
  log.setVerbose(Boolean(opts.verbose));

  const user = await preflight();
  const cache = new Cache({ defaultTtlMs: Number(opts.cacheTtl) * 60_000 });
  if (opts.clearCache) {
    await cache.clear();
    log.info("Cache cleared.");
  }

  const token = opts.token ?? randomBytes(16).toString("hex");
  const app = await buildApp({ cache, token });

  let port = Number(opts.port);
  for (let attempt = 0; ; attempt++) {
    try {
      await app.listen({ host: "127.0.0.1", port });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt >= 10) throw err;
      port++;
    }
  }

  const url = `http://127.0.0.1:${port}/#token=${token}`;
  log.info(`\n  🔎 azure-lupa  signed in as ${user}\n\n  ${url}\n\n  Cache: ${cache.dir}\n  Press Ctrl+C to stop.\n`);
  if (opts.open) await open(url).catch(() => undefined);

  const shutdown = () => void app.close().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
