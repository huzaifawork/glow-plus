import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';

/**
 * The punch-card dots — "3 of 5 visits", drawn.
 *
 * The same visual the Glow+ website uses (`src/components/Punch.jsx`), so a
 * customer who has seen their progress in a browser recognises it here. That
 * continuity is why it is dots rather than only a bar.
 *
 * **It falls back to a bar above ~12 steps**, and the caller decides — a
 * points-based rule with `triggerValue: 300` would otherwise draw three
 * hundred circles, each about a pixel wide. `MAX_DOTS` is exported so the
 * reward card can make that choice rather than guessing.
 */
export const MAX_DOTS = 12;

export default function PunchDots({ total, filled, size = 12, color = colors.brand }) {
  const dots = Array.from({ length: total }, (_, i) => i < filled);

  return (
    <View
      style={styles.row}
      // The row carries one label; the individual dots are decoration and are
      // hidden, or a screen reader announces twelve anonymous views.
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${filled} of ${total} complete`}
    >
      {dots.map((isFilled, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isFilled ? color : 'transparent',
              borderColor: isFilled ? color : colors.lineStrong,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  dot: { borderWidth: 1.5 },
});
