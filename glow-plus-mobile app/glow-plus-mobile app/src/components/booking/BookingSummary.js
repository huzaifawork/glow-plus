import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import SalonLogo from '../salon/SalonLogo';
import { colors, radius, spacing } from '../../theme';
import { formatDuration, formatLongDate, formatTime } from '../../utils/datetime';
import { formatAddress } from '../../utils/format';

/**
 * What the user is about to book, shown inside the confirmation sheet.
 *
 * Every field here is one the user chose on a different part of the flow —
 * the salon on Discover, the service on the salon screen, the date on the
 * strip, the time in the grid. By the time they reach the confirm button they
 * have made four choices across two screens, and a "Confirm?" with no recap
 * asks them to have kept all four in their head.
 *
 * The last row is the points the visit will earn once the salon completes it.
 * It says "once completed" on purpose: points are awarded by the salon
 * completing the booking, not by making it, and a customer told they have
 * earned 40 points at the moment of booking would be owed an explanation later.
 */
export default function BookingSummary({ salon, service, slot }) {
  const address = formatAddress(salon);

  return (
    <View style={styles.wrap}>
      <View style={styles.salonRow}>
        <SalonLogo name={salon.businessName} logoUrl={salon.logoUrl} size={44} />
        <View style={styles.salonText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {salon.businessName}
          </Text>
          {address ? (
            <Text variant="small" color={colors.inkSoft} numberOfLines={1}>
              {address}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rows}>
        <Row label="Service" value={service.name} />
        <Row label="When" value={`${formatLongDate(slot.startTime)} at ${formatTime(slot.startTime)}`} />
        <Row label="Duration" value={formatDuration(service.durationMinutes)} />
        <Row label="Points" value={`+${service.pointsPerVisit} once completed`} last />
      </View>
    </View>
  );
}

function Row({ label, value, last = false }) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <Text variant="small" color={colors.inkSoft}>
        {label}
      </Text>
      <Text variant="smallStrong" style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  salonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  salonText: { flex: 1, gap: 1 },
  rows: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  value: { flex: 1, textAlign: 'right' },
});
