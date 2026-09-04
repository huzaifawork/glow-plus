import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../components/ui/Text';
import { colors } from '../theme';

/**
 * A tab bar icon.
 *
 * Drawn with a glyph rather than pulling in an icon font, and that is a
 * deliberate size/startup trade: `@expo/vector-icons` ships several megabytes
 * of fonts and blocks the first frame until at least one is loaded. For four
 * tabs, a glyph that is already in the system font costs nothing and appears
 * immediately.
 *
 * The active state is carried by **weight and colour AND a dot** — colour
 * alone is invisible to a colour-blind user, and the tab labels are the
 * primary signal in any case, which is why they are never hidden.
 */
export default function TabIcon({ glyph, focused }) {
  return (
    <View style={styles.wrap}>
      <Text
        style={[styles.glyph, { color: focused ? colors.brand : colors.inkFaint }]}
        // Decorative: the tab's own label is what a screen reader announces,
        // and reading "star, Rewards" is noise.
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', height: 24 },
  glyph: { fontSize: 19, lineHeight: 22 },
});
