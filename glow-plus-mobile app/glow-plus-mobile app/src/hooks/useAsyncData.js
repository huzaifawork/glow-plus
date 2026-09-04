import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch, loading, error, refresh — the four things every screen needs.
 *
 * Written once because otherwise every screen writes it slightly differently,
 * and the differences are always in the same two places:
 *
 * **1. Not setting state after unmount.** A user who taps a salon and
 * immediately goes back leaves a request in flight; resolving it into a
 * `setState` on an unmounted component is React's most familiar warning, and
 * on a slow connection it happens constantly. The `alive` ref is checked
 * before every write.
 *
 * **2. Not letting a stale response overwrite a fresh one.** Type "bl", then
 * "bloom": two requests, and the first can land second. `requestId` means only
 * the newest response is allowed to set state — without it the list would
 * show results for a query the user has already finished typing past. This is
 * the bug that makes search feel broken and is almost never reproducible on a
 * developer's wifi.
 *
 * `refreshing` is separate from `loading` on purpose: pull-to-refresh (R2.5,
 * R4.4) must NOT replace the list with a skeleton — the user is already
 * looking at content and it should stay put while the spinner runs.
 */
export default function useAsyncData(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);

  const alive = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode = 'load') => {
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      if (mode !== 'refresh') setError(null);

      try {
        const result = await fetcher();
        if (!alive.current || id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!alive.current || id !== requestId.current) return;
        setError(err);
        // `data` is deliberately NOT cleared. A refresh that fails should
        // leave the user looking at the last good data with an error beside
        // it, not at an empty screen — especially on the tab they were already
        // reading.
      } finally {
        if (alive.current && id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    run('load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  /** R2.5 / R4.4 — "manually refresh this screen to pull the latest data". */
  const refresh = useCallback(() => run('refresh'), [run]);
  const retry = useCallback(() => run('load'), [run]);

  return { data, error, loading, refreshing, refresh, retry, setData };
}
