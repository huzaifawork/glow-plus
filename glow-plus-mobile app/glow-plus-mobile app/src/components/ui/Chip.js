import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Text from './Text';
import { colors, radius, spacing } from '../../theme';

/**
 * A selectable filter chip — the city filter (R3.10), the sort toggle (R3.7),
 * the "has availability" switch (R3.8).
 *
 * `accessibilityRole="button"` with `accessibilityState={{ selected }}` rather
 * than a plain button: a screen reader then announces "Toronto, selected"
 * instead of just "Toronto", which is the only way a non-sighted user can tell
 * which filters are on. Colour alone cannot carry that.
 */
export default function Chip({ label, selected = false, onPress, disabled = false, style, testID }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        variant="smallStrong"
        color={selected ? colors.white : colors.ink}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  unselected: { backgroundColor: colors.surface, borderColor: colors.line },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
