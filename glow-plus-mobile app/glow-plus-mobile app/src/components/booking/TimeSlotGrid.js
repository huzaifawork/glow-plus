import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import SlotChip from './SlotChip';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/StateView';
import { colors, radius, spacing } from '../../theme';
import { salonHourOf } from '../../utils/datetime';

/**
 * The available appointment times  (R3.3)
 *
 * *"The app must let a user select a date and see the actual available
 * appointment times for a chosen service at a chosen salon, computed from that
 * salon's real business hours and existing bookings — **not a fixed or assumed
 * schedule**."*
 *
 * ⚠️ **There is no slot generation anywhere in this app.** The array rendered
 * here came from `GET /bookings/availability`, which reads the salon's
 * `BusinessHours`, its seat count and its existing bookings. The temptation
 * this component exists to resist is "9 to 5 every half hour" — which is
 * exactly the fixed schedule the requirement rules out, and which would offer
 * customers times the server then refuses.
 *
 * The only thing done to the server's list is **grouping it by part of day**,
 * which is presentation: forty chips in one block is a wall, and "Morning /
 * Afternoon / Evening" is how people describe when they want an appointment.
 */
const BUCKETS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 17 },
  { key: 'evening', label: 'Evening', until: 24 },
];

export default function TimeSlotGrid({
  slots,
  loading,
  selected,
  onSelect,
  closed = false,
  noService = false,
}) {
  const groups = useMemo(() => {
    const out = BUCKETS.map((b) => ({ ...b, slots: [] }));
    for (const slot of slots ?? []) {
      // The hour is read in the SALON's timezone, via the same helper the chip
      // labels use. `new Date(iso).getHours()` would be the DEVICE's zone, so
      // on a phone set to another country a slot printed as "2:30 PM" could
      // sit under the "Evening" heading.
      const hour = salonHourOf(slot.startTime);
      const bucket = out.find((b) => hour < b.until) ?? out[out.length - 1];
      bucket.slots.push(slot);
    }
    return out.filter((b) => b.slots.length > 0);
  }, [slots]);

  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        {[0, 1].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width={84} height={46} radius={radius.md} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (noService) {
    return (
      <EmptyState
        icon="✂"
        title="Choose a service first"
        message="Pick what you'd like done and we'll show you when this salon can fit you in."
      />
    );
  }

  if (closed) {
    return (
      <EmptyState
        icon="◷"
        title="Closed on this day"
        message="This salon isn't open on the date you picked. Try another day on the strip above."
      />
    );
  }

  if (!slots?.length) {
    return (
      <EmptyState
        icon="◷"
        title="Fully booked"
        message="Every appointment for this service is taken on this date. Try another day."
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text variant="caption" color={colors.inkFaint} style={styles.groupLabel}>
            {group.label.toUpperCase()}
          </Text>
          <View style={styles.grid}>
            {group.slots.map((slot) => (
              <SlotChip
                key={slot.startTime}
                slot={slot}
                selected={selected?.startTime === slot.startTime}
                onPress={() => onSelect(slot)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  group: { gap: spacing.sm },
  groupLabel: { letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skeletonWrap: { gap: spacing.sm },
  skeletonRow: { flexDirection: 'row', gap: spacing.sm },
});
