import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../../theme';

/**
 * The surface almost everything in this app sits on.
 *
 * When `onPress` is given it becomes a `Pressable` and grows a press state;
 * otherwise it stays a plain `View`. That branch is here rather than at each
 * call site so a tappable card and a static one are guaranteed to have
 * identical geometry — the commonest way a list ends up with rows that are one
 * pixel different from each other.
 *
 * **The press feedback is a scale, not an opacity.** Fading a card out under
 * the finger dims its text as well and reads as "disabled" for the ~120 ms it
 * lasts; a 0.98 scale reads as "pressed" and costs nothing, because
 * `transform` is handled by the native driver and never touches JS.
 */
export default function Card({
  children,
  onPress,
  onLongPress,
  style,
  padding = spacing.lg,
  elevation = 1,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}) {
  const base = [
    styles.card,
    shadow(elevation),
    { padding },
    disabled && styles.disabled,
    style,
  ];

  if (!onPress) {
    return (
      <View style={base} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      // `android_ripple` in addition to the scale: Android users expect a
      // ripple, and its absence is one of the small things that makes a
      // cross-platform app feel like an iOS app running on a Pixel.
      android_ripple={{ color: 'rgba(224, 17, 111, 0.08)' }}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    backgroundColor: colors.surfaceAlt,
  },
  disabled: { opacity: 0.55 },
});
