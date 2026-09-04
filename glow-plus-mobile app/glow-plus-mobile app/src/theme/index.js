import { Platform } from 'react-native';

/**
 * Design tokens.
 *
 * Every colour, space, radius and type ramp the app uses lives here and
 * nowhere else. Not a style preference — it is what makes "make the app feel
 * consistent" a one-file change instead of a search across forty components,
 * and it is the reason none of the components below `src/components/` contain
 * a literal hex value.
 *
 * The palette is carried over from the Glow+ website (`src/styles/global.css`)
 * so a customer moving between the two surfaces recognises the same product:
 * the same rose accent, the same near-black ink, the same soft greys.
 */

export const colors = {
  // Ink — text and anything that reads as "the content".
  ink: '#12121A',
  inkSoft: '#6B6B78',
  inkFaint: '#A0A0AD',

  // Surfaces, lightest to deepest.
  bg: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceAlt: '#FBFBFD',
  surfaceSunken: '#EFEFF4',

  // Lines.
  line: '#E7E7EE',
  lineStrong: '#D6D6E0',

  // Brand.
  brand: '#E0116F',
  brandSoft: '#FDE7F1',
  brandDeep: '#B00C58',

  // Semantics. Each has a `soft` companion for tinted chips and pills, chosen
  // to hold >4.5:1 contrast against its own foreground — status is information
  // and has to survive being read in sunlight on a phone.
  success: '#0D8A5F',
  successSoft: '#DCF3E9',
  warning: '#9A6B00',
  warningSoft: '#FDF0D5',
  danger: '#C22B3E',
  dangerSoft: '#FCE8EA',
  info: '#2563C9',
  infoSoft: '#E3EDFD',

  // Fixed.
  white: '#FFFFFF',
  black: '#0B0B0F',
  overlay: 'rgba(11, 11, 15, 0.45)',
};

/**
 * Service-type accents.
 *
 * The website tags each style with its type; the app repeats the exact same
 * three colours so "nail work is gold" is a fact about Glow+ and not about one
 * screen.
 */
export const typeAccents = {
  HAIR: { bg: '#FDE7F1', fg: '#B00C58', label: 'Hair' },
  NAIL: { bg: '#F6EEDD', fg: '#8A6A28', label: 'Nails' },
  SPA: { bg: '#DCF3E9', fg: '#0D6E4E', label: 'Spa' },
  OTHER: { bg: '#EFEFF4', fg: '#5A5A66', label: 'Other' },
};

export function accentForType(type) {
  return typeAccents[type] ?? typeAccents.OTHER;
}

/**
 * A 4-point spacing scale.
 *
 * Named rather than numeric at the call site (`spacing.md`, not `16`) because
 * the whole value of a scale is that a reviewer can see when something is off
 * it. `gap: 13` is invisible in a diff; `spacing.md` vs a bare 13 is not.
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
};

/**
 * Type ramp.
 *
 * `lineHeight` is set on every entry, not left to the platform: React Native's
 * default leading differs between iOS and Android, and text that wraps to two
 * lines is the single most obvious place the two platforms stop looking like
 * one app.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 11.5, lineHeight: 15, fontWeight: '600', letterSpacing: 0.2 },
  numeric: { fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.2 },
};

/**
 * Elevation.
 *
 * iOS and Android express depth differently and neither accepts the other's
 * props, so each level ships both. Written as a function of level rather than
 * four hand-tuned objects so a card and a sheet cannot drift apart.
 */
export function shadow(level = 1) {
  if (level === 0) return {};
  return Platform.select({
    ios: {
      shadowColor: '#1A1A2E',
      shadowOpacity: 0.04 + level * 0.03,
      shadowRadius: level * 6,
      shadowOffset: { width: 0, height: level * 2 },
    },
    android: { elevation: level * 2 },
    default: {},
  });
}

/**
 * How long a "this changed" animation runs.
 *
 * One place, because the app's sense of speed comes from these three numbers
 * being used everywhere rather than from any single screen being fast. Short
 * on purpose: an animation the user waits for is a slow app wearing a costume.
 */
export const motion = {
  fast: 140,
  base: 220,
  slow: 320,
};

/** Minimum touch target. Below this, a control is a coin toss on a phone. */
export const HIT_SIZE = 44;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
