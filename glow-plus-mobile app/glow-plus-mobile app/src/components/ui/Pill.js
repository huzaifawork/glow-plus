import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from './Text';
import { radius, spacing } from '../../theme';
import { toneColors } from '../../utils/format';

/**
 * A small tinted label: a booking's status, a salon's availability, a service
 * type.
 *
 * The `dot` is not decoration. Tone alone encodes meaning by colour, which is
 * invisible to a colour-blind user and to anyone reading the screen in direct
 * sun — so a status pill also carries a filled dot whose PRESENCE, and the
 * word beside it, carry the same information. That is why the label is never
 * optional and never abbreviated to an icon.
 */
export default function Pill({ label, tone = 'neutral', dot = false, size = 'md', style }) {
  const { bg, fg } = toneColors(tone);
  const small = size === 'sm';

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: bg },
        small ? styles.pillSm : styles.pillMd,
        style,
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text variant={small ? 'caption' : 'smallStrong'} color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    gap: spacing.xs + 2,
  },
  pillMd: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  pillSm: { paddingHorizontal: spacing.sm, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
