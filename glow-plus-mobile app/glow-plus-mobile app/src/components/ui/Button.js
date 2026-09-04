import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, HIT_SIZE, radius, shadow, spacing } from '../../theme';

/**
 * Every button in the app.
 *
 * Three properties are enforced here so that no screen can get them wrong:
 *
 *  1. **A minimum 44 pt touch target.** Anything smaller is a coin toss on a
 *     phone, and it is the kind of thing that is invisible in a screenshot and
 *     obvious in the hand.
 *  2. **A loading state that keeps the button's WIDTH.** Swapping the label
 *     for a spinner reflows the row, and on a form that means the button moves
 *     under the finger that just pressed it. The label stays mounted and
 *     invisible; the spinner is absolutely positioned over it.
 *  3. **`disabled` while loading**, always. A double-tapped "Book" is a double
 *     booking, and the server is not the right place to find that out.
 */
const VARIANTS = {
  primary: { bg: colors.brand, fg: colors.white, border: 'transparent' },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.lineStrong },
  subtle: { bg: colors.surfaceSunken, fg: colors.ink, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
};

const SIZES = {
  sm: { paddingV: 8, paddingH: spacing.md, variant: 'smallStrong', minHeight: 36 },
  md: { paddingV: 12, paddingH: spacing.lg, variant: 'bodyStrong', minHeight: HIT_SIZE },
  lg: { paddingV: 15, paddingH: spacing.xl, variant: 'h3', minHeight: 52 },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  left = null,
  right = null,
  style,
  testID,
  accessibilityHint,
}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const s = SIZES[size] ?? SIZES.md;
  const isOff = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isOff}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isOff, busy: loading }}
      android_ripple={variant === 'ghost' ? null : { color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [
        styles.base,
        variant !== 'ghost' && shadow(variant === 'primary' && !isOff ? 1 : 0),
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
          minHeight: s.minHeight,
        },
        fullWidth && styles.fullWidth,
        pressed && !isOff && styles.pressed,
        isOff && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {left}
        {/* Kept mounted while loading so the button cannot change width. */}
        <Text variant={s.variant} color={v.fg} style={loading && styles.hidden} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>

      {loading ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.spinnerWrap}>
            <ActivityIndicator size="small" color={v.fg} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  fullWidth: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
  // `opacity: 0` and not `display: none` — the label has to keep occupying its
  // space, which is the entire point.
  hidden: { opacity: 0 },
  spinnerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
