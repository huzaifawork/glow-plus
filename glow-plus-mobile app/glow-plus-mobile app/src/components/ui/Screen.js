import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';

/**
 * The outermost element of every screen.
 *
 * It exists to make one decision in one place: **which edges get a safe-area
 * inset**. Getting that wrong is the most common way a React Native app looks
 * broken — a header under the notch, or a doubled inset that leaves a band of
 * dead space at the top of one tab and not another.
 *
 * The rule here: a screen inside the tab navigator takes only the TOP edge,
 * because the tab bar already owns the bottom one. A screen presented modally
 * or pushed over the tabs takes both. `edges` is therefore explicit at every
 * call site rather than defaulted to something that is right most of the time.
 */
export default function Screen({
  children,
  edges = ['top'],
  style,
  background = colors.bg,
  padded = false,
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: background }]}>
      <View style={[styles.body, padded && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  padded: { paddingHorizontal: 16 },
});
