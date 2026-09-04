import React from 'react';
import { StyleSheet, View } from 'react-native';
import Pill from '../ui/Pill';
import { Skeleton } from '../ui/Skeleton';
import { radius } from '../../theme';
import { availabilityLabel } from '../../utils/format';

/**
 * "Fully booked today" / "3 spots left today" / "Closed today" / "Not bookable yet"
 *
 * ── R3.5 ───────────────────────────────────────────────────────────────────
 * *"The app must show, for each salon in the directory, whether that salon is
 * fully booked or has availability on the currently selected date, before the
 * user selects a specific service."*
 *
 * *"...the indicator must show one of 'Fully booked today,' 'N spots left
 * today,' 'Closed today,' or an appropriate not-yet-bookable state, and must
 * update whenever the user changes the selected date. **This must be computed
 * centrally (by the same logic used everywhere else in the platform) rather
 * than calculated independently inside the app**, so the app and any other
 * Glow+ surface never disagree about whether a salon is full."*
 *
 * ⚠️ **This component contains no availability logic whatsoever, and that is
 * the requirement.** It receives the `capacity` object that
 * `GET /merchants/:id/capacity?date=` returned and renders `capacity.state`.
 * There is no branch here on seat counts, opening hours or booking lists —
 * deriving the label from those would be exactly the "calculated
 * independently inside the app" that R3.5 forbids, and the app would
 * eventually disagree with the website about whether a salon is full.
 *
 * While the capacity request is in flight it shows a skeleton rather than an
 * optimistic guess, because a wrong answer that later corrects itself is worse
 * than a visibly pending one — the user may have already decided.
 */
export default function AvailabilityPill({ capacity, loading = false, isToday = true, size = 'md' }) {
  if (loading && !capacity) {
    return (
      <View style={styles.wrap}>
        <Skeleton width={124} height={size === 'sm' ? 22 : 28} radius={radius.pill} />
      </View>
    );
  }

  // `null` (as opposed to `undefined`) means the capacity request was made and
  // failed. Rendering nothing is the honest answer — "Checking…" would be a
  // spinner that never resolves, and a guess would be worse. The card keeps
  // its name, distance and services, and stays bookable.
  if (capacity === null) return null;

  const { label, tone } = availabilityLabel(capacity, { isToday });
  return <Pill label={label} tone={tone} dot size={size} />;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});
