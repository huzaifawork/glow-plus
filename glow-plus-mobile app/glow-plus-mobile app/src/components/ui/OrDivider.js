import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, spacing } from '../../theme';

/**
 * A hairline rule with a word in it — the separator between "sign in with the
 * form above" and "sign in with Google below".
 *
 * `accessibilityElementsHidden` / `importantForAccessibility` rather than a
 * readable label: a screen reader announcing "or" between two buttons adds
 * nothing a user moving through the controls does not already have, and the
 * rules either side are decoration. The buttons themselves carry the meaning.
 */
export default function OrDivider({ label = 'or' }) {
  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.rule} />
      <Text variant="small" color={colors.inkSoft}>
        {label}
      </Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
