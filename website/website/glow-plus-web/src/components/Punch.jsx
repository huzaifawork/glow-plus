import { useEffect, useState } from 'react';

/**
 * The shared visual signature — port of renderPunch().
 *
 * The original appended the dots empty, then filled them inside a
 * requestAnimationFrame so the CSS transition on `.dot.filled` actually ran
 * (staggered by the 45ms-per-dot transitionDelay). Rendering unfilled first and
 * flipping on the next frame keeps that animation intact.
 */
export default function Punch({ total, filled, small = false, id }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(false);
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
  }, [total, filled, small]);

  const n = Math.max(total, 1);

  return (
    <div
      className={small ? 'punch small' : 'punch'}
      data-small={small ? '1' : undefined}
      id={id}
    >
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className={
            'dot' + (small ? ' small' : '') + (armed && i < filled ? ' filled' : '')
          }
          style={{ transitionDelay: i * 45 + 'ms' }}
        />
      ))}
    </div>
  );
}
