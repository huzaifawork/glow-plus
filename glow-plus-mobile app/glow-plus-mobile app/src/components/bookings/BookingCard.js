import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Card from '../ui/Card';
import Text from '../ui/Text';
import Button from '../ui/Button';
import SalonLogo from '../salon/SalonLogo';
import StatusPill from './StatusPill';
import { colors, spacing } from '../../theme';
import { formatDuration, formatLongDate, formatTime, relativeTime } from '../../utils/datetime';
import { canCancel, statusInfo } from '../../utils/format';

/**
 * One appointment  (R4.1, R4.2, R4.3, R3.11)
 *
 * The layout puts the **time** first and largest. A customer opening My
 * Bookings is asking "when am I due?", not "what did I book" — they know what
 * they booked. The service and salon are the supporting line.
 *
 * **Cancel is only rendered when the server would accept it** (`canCancel` —
 * pending or confirmed, R4.3). A button that produces a 400 is worse than no
 * button: it teaches the user that the app is unreliable rather than that the
 * action was never available.
 *
 * The status hint under the pill is the sentence that turns a state into an
 * expectation — "The salon has your request and will confirm shortly" answers
 * the question a pending booking actually raises.
 */
function BookingCard({ booking, onCancel, cancelling = false, highlighted = false }) {
  const info = statusInfo(booking.status);
  const cancellable = canCancel(booking.status) && Boolean(onCancel);
  const upcoming = new Date(booking.startTime).getTime() > Date.now();

  return (
    <Card
      style={[styles.card, highlighted && styles.highlighted]}
      accessibilityLabel={`${booking.style?.name} at ${booking.merchant?.businessName}, ${formatLongDate(
        booking.startTime,
      )} at ${formatTime(booking.startTime)}, ${info.label}`}
    >
      <View style={styles.head}>
        <View style={styles.when}>
          <Text variant="h2">{formatTime(booking.startTime)}</Text>
          <Text variant="small" color={colors.inkSoft}>
            {formatLongDate(booking.startTime)}
          </Text>
          {upcoming && (booking.status === 'CONFIRMED' || booking.status === 'PENDING') ? (
            <Text variant="caption" color={colors.brandDeep}>
              {relativeTime(booking.startTime)}
            </Text>
          ) : null}
        </View>

        <StatusPill status={booking.status} short />
      </View>

      <View style={styles.salonRow}>
        <SalonLogo
          name={booking.merchant?.businessName ?? 'Salon'}
          logoUrl={booking.merchant?.logoUrl}
          size={40}
        />
        <View style={styles.salonText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {booking.style?.name ?? 'Appointment'}
          </Text>
          <Text variant="small" color={colors.inkSoft} numberOfLines={1}>
            {booking.merchant?.businessName ?? 'Salon'}
            {booking.style?.durationMinutes
              ? ` · ${formatDuration(booking.style.durationMinutes)}`
              : ''}
          </Text>
        </View>
      </View>

      {info.hint ? (
        <Text variant="small" color={colors.inkFaint}>
          {info.hint}
        </Text>
      ) : null}

      {booking.notes ? (
        <View style={styles.notes}>
          <Text variant="caption" color={colors.inkFaint}>
            YOUR NOTE
          </Text>
          <Text variant="small" color={colors.inkSoft}>
            {booking.notes}
          </Text>
        </View>
      ) : null}

      {cancellable ? (
        <Button
          title="Cancel appointment"
          variant="danger"
          size="sm"
          loading={cancelling}
          onPress={() => onCancel(booking)}
          accessibilityHint="Opens a confirmation before cancelling"
        />
      ) : null}
    </Card>
  );
}

export default memo(BookingCard);

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  // Used when the user arrives from a push notification about this booking —
  // it is what makes the deep link land ON something rather than near it.
  highlighted: { borderColor: colors.brand, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  when: { gap: 1 },
  salonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  salonText: { flex: 1, gap: 1 },
  notes: {
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
