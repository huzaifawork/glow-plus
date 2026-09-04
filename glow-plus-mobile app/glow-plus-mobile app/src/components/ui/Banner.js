import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, radius, spacing } from '../../theme';
import { toneColors } from '../../utils/format';

/**
 * An inline strip that explains a condition affecting the whole screen.
 *
 * Used for the two things the user needs told without being interrupted:
 * demo mode being on (R5.1 — an evaluator must never wonder whether the data
 * is real), and the device being offline (NF4).
 *
 * A banner and not a toast, deliberately: both of those conditions PERSIST,
 * and a message that disappears after three seconds is the wrong shape for a
 * state that is still true a minute later.
 */
export default function Banner({ tone = 'info', icon, title, message, action, onAction, style }) {
  const { bg, fg } = toneColors(tone);

  return (
    <View
      accessible
      accessibilityRole="alert"
      style={[styles.wrap, { backgroundColor: bg }, style]}
    >
      {icon ? (
        <Text variant="bodyStrong" color={fg}>
          {icon}
        </Text>
      ) : null}

      <View style={styles.text}>
        <Text variant="smallStrong" color={fg}>
          {title}
        </Text>
        {message ? (
          <Text variant="small" color={fg} style={styles.message}>
            {message}
          </Text>
        ) : null}
      </View>

      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text variant="smallStrong" color={fg} style={styles.action}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: 1 },
  message: { opacity: 0.9 },
  action: { textDecorationLine: 'underline' },
});
