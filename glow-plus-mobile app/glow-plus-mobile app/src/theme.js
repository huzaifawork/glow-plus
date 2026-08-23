export const colors = {
  black: '#000000',
  ink: '#1d1d1f',
  inkSoft: '#86868b',
  inkFaint: '#d2d2d7',
  white: '#ffffff',
  surface: '#f5f5f7',
  surface2: '#fbfbfd',
  accent: '#0071e3',
  rose: '#e0116f',
  gold: '#a9813f',
  sage: '#0d8a5f',
  line: '#e5e5ea',
};

export const typeTagColors = {
  HAIR: { bg: '#fde6f0', fg: colors.rose },
  NAIL: { bg: '#f4ecdd', fg: colors.gold },
  SPA: { bg: '#dcf3e9', fg: colors.sage },
  OTHER: { bg: colors.surface, fg: colors.inkSoft },
};

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export const typography = {
  h1: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15.5, fontWeight: '400' },
  caption: { fontSize: 12.5, fontWeight: '600' },
  mono: { fontSize: 15, fontWeight: '700' },
};
