import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { colors, type } from '../../theme';

/**
 * Every piece of text in the app.
 *
 * The reason this wrapper exists is `allowFontScaling` and `maxFontSizeMultiplier`.
 * React Native's default is to scale text with the OS accessibility setting
 * without limit, and a user on iOS's largest Dynamic Type setting gets a 300%
 * multiplier — which turns a two-line card into a six-line one and pushes
 * buttons off screen. Scaling is kept ON (turning it off is an accessibility
 * regression), but capped, and the cap is a single number here instead of a
 * prop forty components would have to remember.
 *
 * `variant` maps to the theme's type ramp, so no screen writes a `fontSize`.
 */
export default function Text({
  children,
  variant = 'body',
  color = colors.ink,
  align,
  style,
  numberOfLines,
  ...rest
}) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      numberOfLines={numberOfLines}
      style={[type[variant] ?? type.body, { color }, align ? { textAlign: align } : null, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

export const textStyles = StyleSheet.create({
  /** For a label above a value — used by stat blocks and form fields alike. */
  overline: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
