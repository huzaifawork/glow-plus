import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import { colors, spacing } from '../../theme';
import { formatDistance } from '../../utils/distance';

/**
 * "2.4 km" beside a salon's name  (R3.7)
 *
 * Renders **nothing** when there is no distance to show — which happens in two
 * legitimate situations and neither is an error:
 *
 *   · the user declined location, so nothing has a distance (R3.9), or
 *   · this salon has no registered coordinates (the spec's dependency note).
 *
 * Returning `null` rather than a dash or "— km" is deliberate: an empty slot
 * is quieter than a placeholder for information that was never promised, and
 * the card's layout does not depend on it being there.
 *
 * ⚠️ The number was computed on this device (`utils/distance.js`). The user's
 * coordinates are never sent anywhere — NF6.
 */
export default function DistanceBadge({ distanceKm, style }) {
  const label = formatDistance(distanceKm);
  if (!label) return null;

  return (
    <View style={[styles.row, style]}>
      <Text variant="caption" color={colors.inkFaint}>
        ◎
      </Text>
      <Text variant="small" color={colors.inkSoft} accessibilityLabel={`${label} away`}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
