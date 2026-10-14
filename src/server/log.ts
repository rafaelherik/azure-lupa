let verbose = false;

export const log = {
  setVerbose(value: boolean) {
    verbose = value;
  },
  debug(msg: string) {
    if (verbose) console.error(`\x1b[2m[lupa] ${msg}\x1b[0m`);
  },
  info(msg: string) {
    console.error(msg);
  },
};
