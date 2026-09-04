import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import { accentForType, colors, radius, spacing } from '../../theme';
import { formatDate, relativeTime } from '../../utils/datetime';

/**
 * One past visit  (R2.4)
 *
 * *"The app must display a list of the user's most recent visits at each
 * salon, including the service received."*
 *
 * The service name is therefore the primary text, not the date — the
 * requirement names it explicitly, and it is what a customer scanning their
 * history is actually looking for ("when did I last have a silk press?").
 *
 * `expired` is shown rather than hidden. The platform expires points after a
 * year (its T25) and keeps the visit in history, so a visit that no longer
 * counts toward a reward still happened. Dropping it would make the list
 * silently disagree with the customer's memory; greying it and saying why
 * explains the points total instead of contradicting it.
 */
export default function VisitRow({ visit, last = false }) {
  const accent = accentForType(visit.styleType);

  return (
    <View
      style={[styles.row, !last && styles.divider]}
      accessible
      accessibilityLabel={`${visit.styleName}, ${formatDate(visit.visitDate)}, ${
        visit.pointsEarned
      } points${visit.expired ? ', expired' : ''}`}
    >
      <View style={[styles.dot, { backgroundColor: accent.bg }]}>
        <Text variant="caption" color={accent.fg}>
          {accent.label.slice(0, 1)}
        </Text>
      </View>

      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1} color={visit.expired ? colors.inkSoft : colors.ink}>
          {visit.styleName}
        </Text>
        <Text variant="small" color={colors.inkFaint}>
          {formatDate(visit.visitDate)} · {relativeTime(visit.visitDate)}
        </Text>
      </View>

      <View style={styles.points}>
        <Text
          variant="smallStrong"
          color={visit.expired ? colors.inkFaint : colors.brandDeep}
          style={visit.expired && styles.struck}
        >
          +{visit.pointsEarned}
        </Text>
        {visit.expired ? (
          <Text variant="caption" color={colors.inkFaint}>
            expired
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  points: { alignItems: 'flex-end' },
  struck: { textDecorationLine: 'line-through' },
});
