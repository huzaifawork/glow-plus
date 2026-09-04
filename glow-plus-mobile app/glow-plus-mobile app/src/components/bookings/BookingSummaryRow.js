import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import SalonLogo from '../salon/SalonLogo';
import StatusPill from './StatusPill';
import { colors, radius, spacing } from '../../theme';
import { formatLongDate, formatTime } from '../../utils/datetime';

/**
 * A compact recap of one booking, for the cancel confirmation.
 *
 * The point of it is a single sentence: **a user with three appointments must
 * never have to trust that they tapped the right one** before confirming
 * something they cannot undo. "Cancel this appointment?" with two buttons and
 * no recap is a coin toss dressed as a safeguard.
 *
 * Deliberately smaller and quieter than `BookingCard` — inside a sheet it is
 * supporting information, not the subject of the screen, and reusing the full
 * card would put a second Cancel button inside the cancel confirmation.
 */
export default function BookingSummaryRow({ booking }) {
  return (
    <View style={styles.wrap}>
      <SalonLogo
        name={booking.merchant?.businessName ?? 'Salon'}
        logoUrl={booking.merchant?.logoUrl}
        size={44}
      />

      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {booking.style?.name ?? 'Appointment'}
        </Text>
        <Text variant="small" color={colors.inkSoft} numberOfLines={1}>
          {booking.merchant?.businessName}
        </Text>
        <Text variant="small" color={colors.ink}>
          {formatLongDate(booking.startTime)} at {formatTime(booking.startTime)}
        </Text>
      </View>

      <StatusPill status={booking.status} size="sm" short />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  text: { flex: 1, gap: 1 },
});
