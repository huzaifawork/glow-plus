import { useCallback, useEffect, useRef, useState } from 'react';
import { getSalonCapacity } from '../api/client';

/**
 * The availability indicator for every salon on screen  (R3.5)
 *
 * *"The app must show, for each salon in the directory, whether that salon is
 * fully booked or has availability on the currently selected date, before the
 * user selects a specific service"* — and it *"must update whenever the user
 * changes the selected date"*.
 *
 * That is one request per salon per date, because capacity depends on the
 * salon's hours, its seat count and its live bookings — there is no bulk
 * endpoint and inventing one would not change the work the server does. So the
 * job of this hook is to make N requests cheap and non-blocking:
 *
 *  · **Cached by `salonId|date`.** Scrolling back up, or returning to a date,
 *    costs nothing. The cache is a ref, so filling it never re-renders.
 *  · **In-flight requests are deduplicated.** A `FlatList` can mount, unmount
 *    and remount the same row while the user flicks; without this, one salon
 *    would be asked three times.
 *  · **Only for the salons actually passed in.** The screen passes the
 *    VISIBLE ids (from `onViewableItemsChanged`), so a 100-salon directory
 *    costs about eight requests, not a hundred.
 *  · **Failures are silent and cached as `null`.** A capacity request failing
 *    must not take down the directory — the card falls back to no pill, and
 *    the salon is still browsable and bookable. R3.5 is an enhancement to a
 *    list that has to work without it.
 *
 * ⚠️ The app does not compute availability. It asks. See `AvailabilityPill`.
 */
export default function useSalonCapacities(salonIds, date) {
  const [capacities, setCapacities] = useState({});

  const cache = useRef(new Map());
  const inFlight = useRef(new Map());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * A date change invalidates every answer.
   *
   * The cache is keyed by date so old entries are simply unreachable rather
   * than wrong — but the RENDERED map has to be emptied, or the previous
   * date's pills stay on screen while the new ones load, which is R3.5's
   * "must update whenever the user changes the selected date" failing in the
   * most misleading way available: showing a confident, wrong answer.
   */
  useEffect(() => {
    setCapacities({});
  }, [date]);

  useEffect(() => {
    if (!salonIds?.length || !date) return;

    for (const id of salonIds) {
      const key = `${id}|${date}`;
      if (cache.current.has(key) || inFlight.current.has(key)) continue;

      const promise = getSalonCapacity(id, date)
        .then((capacity) => {
          cache.current.set(key, capacity);
          if (alive.current) setCapacities((prev) => ({ ...prev, [id]: capacity }));
          return capacity;
        })
        .catch(() => {
          // Cached as null so a salon whose capacity genuinely 404s (it was
          // suspended between the directory load and now) is not retried on
          // every scroll.
          cache.current.set(key, null);
          // ...and PUBLISHED as null, not merely cached. `isLoading` tests for
          // `undefined`, so a failure that only touched the cache would leave
          // the card's pill pulsing forever. Null is a real answer here: the
          // card renders no pill and stays fully browsable and bookable.
          if (alive.current) setCapacities((prev) => ({ ...prev, [id]: null }));
          return null;
        })
        .finally(() => {
          inFlight.current.delete(key);
        });

      inFlight.current.set(key, promise);
    }

    // Anything already cached is published immediately — this is what makes
    // scrolling back up instant rather than re-flashing skeletons.
    //
    // Returning `prev` UNCHANGED when there is nothing new is load-bearing:
    // this effect re-runs whenever the visible rows change, and a fresh object
    // every time would re-render the whole list on every scroll tick even
    // though not one pill had changed. React bails out of a state update that
    // returns the identical reference, so this costs nothing when it finds
    // nothing.
    setCapacities((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of salonIds) {
        const key = `${id}|${date}`;
        if (cache.current.has(key) && !(id in prev)) {
          next[id] = cache.current.get(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [salonIds, date]);

  /** Pull-to-refresh must re-ask, not re-read the cache. */
  const invalidate = useCallback(() => {
    cache.current.clear();
    setCapacities({});
  }, []);

  const isLoading = useCallback(
    (salonId) => capacities[salonId] === undefined,
    [capacities],
  );

  return { capacities, isLoading, invalidate };
}
