import { useEffect, useState } from 'react';

/**
 * A value that settles before anything acts on it.
 *
 * Used by the search box (R3.10). Without it, "bloom" is five keystrokes and
 * therefore five requests to `GET /merchants` — four of which are already
 * obsolete before they arrive, and all five of which count against the
 * platform's rate limiter for the whole IP. On a NAT'd office or café wifi
 * that is a real way for one person's typing to 429 everybody else.
 *
 * 300 ms is the usual sweet spot: long enough that normal typing produces one
 * request, short enough that the list does not feel like it lags behind the
 * keyboard.
 *
 * The text input itself stays uncontrolled-feeling and instant — only the
 * FETCH is debounced. Debouncing the input value would make the keyboard feel
 * broken, which is the classic misapplication of this hook.
 */
export default function useDebouncedValue(value, delay = 300) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
