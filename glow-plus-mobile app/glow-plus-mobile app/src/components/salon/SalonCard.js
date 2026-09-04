import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Card from '../ui/Card';
import Text from '../ui/Text';
import SalonLogo from './SalonLogo';
import DistanceBadge from './DistanceBadge';
import AvailabilityPill from './AvailabilityPill';
import ServiceTypeTags from './ServiceTypeTags';
import { colors, spacing } from '../../theme';
import { availabilityLabel, formatAddress, plural } from '../../utils/format';

/**
 * One salon in the directory  (R3.1, R3.5, R3.7, R3.11)
 *
 * **`memo`, and it is load-bearing.** The Discover screen re-renders on every
 * keystroke in the search box and every time one salon's capacity resolves.
 * Without memoisation, typing "bloom" re-renders forty cards five times —
 * which is the difference between a list that feels instant and one that
 * stutters. The props are all primitives or stable objects, so the default
 * shallow compare is correct here.
 *
 * The card composes small components rather than drawing everything itself:
 * `SalonLogo` owns the R3.12 placeholder, `AvailabilityPill` owns the R3.5
 * indicator, `DistanceBadge` owns the R3.7 label. Each is independently
 * testable and reused by the salon detail screen.
 *
 * The whole card is ONE accessible element with a composed label, because a
 * screen reader user swiping through a list wants "Bloom Hair Studio, 2.4
 * kilometres away, 3 spots left today" as one stop — not five.
 */
function SalonCard({ salon, capacity, capacityLoading, isToday = true, onPress }) {
  const address = formatAddress(salon);
  const availability = availabilityLabel(capacity, { isToday });

  const a11yLabel = [
    salon.businessName,
    address,
    salon.distanceKm != null ? `${salon.distanceKm.toFixed(1)} kilometres away` : null,
    capacity ? availability.label : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens this salon to choose a service"
      style={styles.card}
    >
      <View style={styles.head}>
        <SalonLogo name={salon.businessName} logoUrl={salon.logoUrl} size={52} />

        <View style={styles.headText}>
          <Text variant="h3" numberOfLines={1}>
            {salon.businessName}
          </Text>

          <View style={styles.metaRow}>
            {address ? (
              <Text variant="small" color={colors.inkSoft} numberOfLines={1} style={styles.address}>
                {address}
              </Text>
            ) : null}
            <DistanceBadge distanceKm={salon.distanceKm} />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <AvailabilityPill capacity={capacity} loading={capacityLoading} isToday={isToday} />
        <ServiceTypeTags types={salon.styleTypes} />
      </View>

      {salon.seats > 1 ? (
        <Text variant="caption" color={colors.inkFaint}>
          {salon.seats} {plural(salon.seats, 'chair', 'chairs')}
          {salon.styleCount ? ` · ${salon.styleCount} ${plural(salon.styleCount, 'service', 'services')}` : ''}
        </Text>
      ) : null}
    </Card>
  );
}

export default memo(SalonCard);

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  address: { flexShrink: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
});
