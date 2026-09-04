import { DefaultTheme } from '@react-navigation/native';
import { colors } from './index';

/**
 * React Navigation's own palette.
 *
 * Without this, the navigator paints its own default background — a pure white
 * — behind and between screens. The app's ground is `colors.bg` (a warm
 * off-white), so every push animation would show a white flash at the edges of
 * the incoming screen. Two-line fix, very visible bug.
 */
export const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    notification: colors.brand,
  },
};

export default navigationTheme;
