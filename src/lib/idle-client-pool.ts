type Closable = { close(): Promise<void> };

// One bounded idle window per pool entry, not a timer per query. Callers hold
// a lease until their entire response (including streamed sections) completes.
export function createIdleClientPool<T extends Closable>(factory: (key: string) => T, idleMs = 5000) {
  type Entry = { client: T; users: number; timer?: ReturnType<typeof setTimeout>; resume?: () => void };
  const entries = new Map<string, Entry>();

  return {
    acquire(key: string) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { client: factory(key), users: 0 };
        entries.set(key, entry);
      }
      const current = entry;
      if (current.timer) {
        clearTimeout(current.timer);
        current.timer = undefined;
        current.resume?.();
        current.resume = undefined;
      }
      current.users++;
      let released = false;
      return {
        client: current.client,
        release(): Promise<void> {
          if (released) return Promise.resolve();
          released = true;
          current.users--;
          if (current.users !== 0) return Promise.resolve();
          return new Promise<void>((resolve, reject) => {
            current.resume = resolve;
            current.timer = setTimeout(() => {
              // Remove before close starts: a new request must not acquire a
              // connection pool that is already shutting down.
              entries.delete(key);
              current.timer = undefined;
              current.resume = undefined;
              Promise.resolve().then(() => current.client.close()).then(resolve, reject);
            }, idleMs);
          });
        },
      };
    },
  };
}
