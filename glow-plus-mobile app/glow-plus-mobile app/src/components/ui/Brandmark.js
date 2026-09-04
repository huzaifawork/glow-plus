import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors, radius, shadow } from '../../theme';

/**
 * The Glow+ mark.
 *
 * Drawn rather than imported as an image, for two reasons: it renders at any
 * size without a second asset, and it appears on the first frame of a cold
 * start — an `<Image>` here would leave a hole in the login screen for however
 * long the bundler takes to resolve it, which is the first thing a user sees
 * of the app.
 */
export default function Brandmark({ size = 48, style }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Glow Plus"
      style={[
        styles.mark,
        shadow(2),
        { width: size, height: size, borderRadius: size * 0.32 },
        style,
      ]}
    >
      <Text
        style={{ fontSize: size * 0.46, fontWeight: '800', color: colors.white, lineHeight: size * 0.56 }}
      >
        G
      </Text>
      <View
        style={[
          styles.plus,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size * 0.17,
            right: -size * 0.06,
            bottom: -size * 0.06,
          },
        ]}
      >
        <Text style={{ fontSize: size * 0.22, fontWeight: '800', color: colors.white }}>+</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  plus: {
    position: 'absolute',
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
