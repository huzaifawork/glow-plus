import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, spacing } from '../../theme';

/**
 * The heading above a group of rows.
 *
 * `accessibilityRole="header"` is the reason this is a component rather than a
 * styled `<Text>`: it puts the title into the screen reader's heading rotor,
 * which is how a VoiceOver user skips between sections instead of swiping
 * through every card in a list.
 */
export default function SectionHeader({ title, subtitle, count, action, onAction, style }) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titles}>
        <View style={styles.titleRow}>
          <Text variant="h3" accessibilityRole="header">
            {title}
          </Text>
          {typeof count === 'number' ? (
            <View style={styles.count}>
              <Text variant="caption" color={colors.inkSoft}>
                {count}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text variant="small" color={colors.inkSoft}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Text variant="smallStrong" color={colors.brand}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 11,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
  },
});
