import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import { colors, radius, shadow, spacing } from '../../theme';
import { formatPoints, plural } from '../../utils/format';

/**
 * The number at the top of the Rewards screen  (R2.1)
 *
 * *"The app must display the user's total loyalty points across every salon
 * they have visited."*
 *
 * Dark on light, and the only dark surface in the app, because this is the one
 * thing on the screen that the user opened the app to see. Everything else on
 * Rewards is a breakdown of this number.
 *
 * The two secondary stats exist to make the total meaningful: a bare "340"
 * says nothing about whether that is a lot, but "340 points · 2 salons · 1
 * reward ready" tells the user what to do next.
 */
export default function PointsSummary({ totalPoints, salonCount, readyCount }) {
  return (
    <View
      style={[styles.card, shadow(2)]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${formatPoints(totalPoints)} points across ${salonCount} ${plural(
        salonCount,
        'salon',
        'salons',
      )}${readyCount ? `, ${readyCount} ${plural(readyCount, 'reward', 'rewards')} ready to claim` : ''}`}
    >
      <Text variant="caption" color={colors.inkFaint} style={styles.overline}>
        TOTAL POINTS
      </Text>

      <Text variant="numeric" color={colors.white}>
        {formatPoints(totalPoints)}
      </Text>

      <View style={styles.statsRow}>
        <Stat value={salonCount} label={plural(salonCount, 'salon', 'salons')} />
        <View style={styles.rule} />
        <Stat
          value={readyCount}
          label={readyCount === 1 ? 'reward ready' : 'rewards ready'}
          highlight={readyCount > 0}
        />
      </View>
    </View>
  );
}

function Stat({ value, label, highlight = false }) {
  return (
    <View style={styles.stat}>
      <Text variant="h3" color={highlight ? colors.brand : colors.white}>
        {value}
      </Text>
      <Text variant="small" color={colors.inkFaint}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.black,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  overline: { letterSpacing: 1.2 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs + 2 },
  rule: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
