import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import { accentForType, radius, spacing } from '../../theme';

/**
 * "Hair · Nails · Spa" — what a salon actually does, on its directory card.
 *
 * The types come from `styleTypes` on the directory response, which the
 * platform added specifically so a card could show this **without one request
 * per salon** (it was costing 41 requests for a 40-salon page). Reproducing
 * that N+1 here by fetching each salon's menu to draw three words would undo
 * the fix.
 *
 * The colours are the same three the website uses, from the shared theme, so
 * "nail work is gold" is a fact about Glow+ rather than about one screen.
 */
export default function ServiceTypeTags({ types = [], max = 3, style }) {
  if (!types.length) return null;

  const shown = types.slice(0, max);
  const extra = types.length - shown.length;

  return (
    <View style={[styles.row, style]}>
      {shown.map((t) => {
        const accent = accentForType(t);
        return (
          <View key={t} style={[styles.tag, { backgroundColor: accent.bg }]}>
            <Text variant="caption" color={accent.fg}>
              {accent.label}
            </Text>
          </View>
        );
      })}
      {extra > 0 ? (
        <View style={[styles.tag, styles.extra]}>
          <Text variant="caption" color={accentForType('OTHER').fg}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  extra: { backgroundColor: accentForType('OTHER').bg },
});
