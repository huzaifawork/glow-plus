import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, HIT_SIZE, spacing } from '../../theme';

/**
 * The title block at the top of a tab screen.
 *
 * The tab screens use this instead of React Navigation's own header, because
 * a large left-aligned title that scrolls with the content is the pattern both
 * platforms have converged on, and the navigator's header is a fixed bar. The
 * pushed screens (Salon, Booking) DO use the navigator's header — they need a
 * back button and a native swipe-back gesture, which this cannot provide.
 *
 * `accessibilityRole="header"` puts the title in the screen reader's rotor.
 */
export default function ScreenHeader({ title, subtitle, right, onPressRight, rightLabel, style }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.text}>
        <Text variant="display" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color={colors.inkSoft} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? (
        <Pressable
          onPress={onPressRight}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={rightLabel}
          style={styles.right}
        >
          {right}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  text: { flex: 1, gap: spacing.xs },
  right: {
    minWidth: HIT_SIZE,
    minHeight: HIT_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
