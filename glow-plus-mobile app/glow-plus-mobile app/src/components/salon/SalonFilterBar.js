import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Chip from '../ui/Chip';
import Text from '../ui/Text';
import { colors, spacing } from '../../theme';

/**
 * The controls that turn a directory into "a nearby salon that can take me".
 *
 * ── R3.8 ───────────────────────────────────────────────────────────────────
 * *"The app must be able to combine distance with the availability indicator
 * from R3.5, so a user can specifically find a nearby salon that is not fully
 * booked, rather than the nearest salon regardless of whether it can take
 * them."*
 *
 * That is why **Nearest** and **Has availability** sit on the same row and are
 * independent toggles rather than a single "sort by" menu: the requirement is
 * that the two COMBINE, in one flow, without the user leaving the list. The
 * acceptance criterion says it again — *"sees salons sorted by distance, and
 * can further narrow that list to salons that currently have availability, in
 * a single flow."*
 *
 * ── R3.9 ───────────────────────────────────────────────────────────────────
 * *"If the user declines to share their location ... the app must still allow
 * full use of the salon directory without distance-based sorting — location
 * access must be an enhancement, not a requirement to use the app."*
 *
 * So **Nearest is disabled, not hidden**, when there is no location, and it
 * carries a short reason. A control that vanishes leaves the user wondering
 * whether the feature exists; one that is visibly unavailable, with a line of
 * text saying why and a way to enable it, is a state they can act on. Every
 * other control on this bar stays fully live.
 */
export default function SalonFilterBar({
  sort,
  onSortChange,
  availableOnly,
  onAvailableOnlyChange,
  cities = [],
  city,
  onCityChange,
  locationAvailable,
  locationHint,
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label="Nearest"
          selected={sort === 'distance'}
          disabled={!locationAvailable}
          onPress={() => onSortChange(sort === 'distance' ? 'name' : 'distance')}
          testID="filter-nearest"
        />
        <Chip
          label="Has availability"
          selected={availableOnly}
          onPress={() => onAvailableOnlyChange(!availableOnly)}
          testID="filter-available"
        />

        {cities.length > 0 ? <View style={styles.rule} /> : null}

        {cities.map((c) => (
          <Chip
            key={c}
            label={c}
            selected={city === c}
            // Tapping the selected city clears it — a filter you cannot turn
            // off without hunting for a Clear button is a trap.
            onPress={() => onCityChange(city === c ? null : c)}
          />
        ))}
      </ScrollView>

      {!locationAvailable && locationHint ? (
        <Text variant="small" color={colors.inkSoft} style={styles.hint}>
          {locationHint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl },
  rule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: spacing.xs,
    backgroundColor: colors.lineStrong,
  },
  hint: { paddingHorizontal: spacing.xl },
});
