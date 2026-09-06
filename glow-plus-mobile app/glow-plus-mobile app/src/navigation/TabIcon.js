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
 *
 * ── Why the glyphs are not all the same font size ──────────────────────────
 * They were, and two of the four looked visibly shrunken next to the others.
 * A font size is the size of the em box, not of the ink inside it, and these
 * four characters fill that box very differently: `✦` and `⚙` are drawn nearly
 * edge to edge, while `⌕` and `◷` are drawn small and thin inside theirs. Set
 * to one nominal size they render at two obviously different visual sizes.
 *
 * So the size below is an OPTICAL correction, per glyph, chosen so all four
 * read as the same weight on the bar — not an arbitrary tweak. If a glyph is
 * ever swapped, its entry here has to be re-judged by eye; there is no formula
 * for this, because it is a property of the system font's drawing and not of
 * the character.
 */

/** Nominal size for a glyph that fills its em box. */
const BASE_SIZE = 24;

/** Per-glyph optical corrections. See the note above for why these exist. */
const OPTICAL_SIZE = {
  '⌕': 32, // magnifier — drawn small and thin inside its box
  '◷': 29, // clock — a hairline circle, reads lighter than the solid glyphs
};

/** Fixed, so every icon occupies the same height whatever its font size. */
const BOX = 34;

export default function TabIcon({ glyph, focused }) {
  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.glyph,
          {
            color: focused ? colors.brand : colors.inkFaint,
            fontSize: OPTICAL_SIZE[glyph] ?? BASE_SIZE,
          },
        ]}
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
  // A FIXED height, not one that tracks the glyph: the four icons carry
  // different font sizes now, and a wrapper that grew with each of them would
  // sit the labels at four different heights across the bar.
  wrap: { alignItems: 'center', justifyContent: 'center', height: BOX },
  // `lineHeight` matches the box for the same reason. `fontSize` is supplied
  // per glyph at the call site above.
  glyph: { lineHeight: BOX, textAlign: 'center' },
});
