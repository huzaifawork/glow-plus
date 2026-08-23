import { useEffect, useState } from 'react';

/**
 * Runs an async loader and returns its result, re-running whenever `deps`
 * change. The prototype re-read storage inside each render*() call; pairing
 * this with AppContext's `dataVersion` reproduces that read-after-write
 * behaviour without any of the manual re-render plumbing.
 */
export function useAsyncData(loader, deps, initial) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(loader()).then((value) => {
      if (!cancelled) setData(value);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
