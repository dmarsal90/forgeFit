export const colors = {
  bg: '#101318',
  surface: '#222A33',
  surfaceAlt: '#1A2027',
  accent: '#B8F36B',
  accentPressed: '#9FD955',
  onAccent: '#101318',
  text: '#E8EDF2',
  textMuted: '#98A3AE',
  border: '#343D47',
  disabled: '#2C343D',
  onDisabled: '#98A3AE',
  error: '#FF8A80',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { card: 16, button: 14, pill: 999 } as const;
export const MIN_TOUCH = 48;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
} as const;
