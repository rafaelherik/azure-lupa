/** Request identity is independent of cancellation: a transport may ignore abort. */
export function latestRun() {
  let active: AbortController | undefined;

  function clear() {
    const previous = active;
    active = undefined;
    previous?.abort();
  }

  return {
    clear,
    async start<T>(
      request: (signal: AbortSignal) => Promise<T>,
      callbacks: {
        success: (result: T) => void;
        failure: (error: unknown) => void;
      },
    ) {
      clear();
      const run = new AbortController();
      active = run;
      try {
        const result = await request(run.signal);
        if (active === run) callbacks.success(result);
      } catch (error) {
        if (active === run) callbacks.failure(error);
      } finally {
        if (active === run) active = undefined;
      }
    },
  };
}
