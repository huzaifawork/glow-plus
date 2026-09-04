import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, HIT_SIZE, spacing } from '../../theme';

/**
 * A single row inside a grouped list — the shape Settings is built from.
 *
 * Kept separate from `Card` because the two have opposite jobs: a card is an
 * object you can act on, a row is one line of a form. Merging them would mean
 * a `variant` prop deciding whether there are borders between children, which
 * is how one component becomes two components in a trench coat.
 */
export default function ListRow({
  title,
  subtitle,
  value,
  onPress,
  right,
  danger = false,
  first = false,
  last = false,
  disabled = false,
}) {
  const content = (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.text}>
        <Text variant="body" color={danger ? colors.danger : colors.ink}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color={colors.inkSoft}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="small" color={colors.inkSoft} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}

      {right}
      {onPress && !right ? (
        <Text variant="body" color={colors.inkFaint}>
          ›
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) {
    return <View style={[first && styles.first, last && styles.last]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled }}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [
        first && styles.first,
        last && styles.last,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: HIT_SIZE + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // Inset so the divider starts where the text does, which is what makes a
  // grouped list read as one block rather than a stack of separate strips.
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  text: { flex: 1, gap: 1 },
  value: { maxWidth: 160 },
  first: { borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  last: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceAlt },
  disabled: { opacity: 0.5 },
});
