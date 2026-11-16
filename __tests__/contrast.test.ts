import { colors } from '../src/ui/tokens';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('contraste WCAG AA', () => {
  it.each([
    ['text', 'bg'], ['text', 'surface'], ['textMuted', 'bg'], ['textMuted', 'surface'],
    ['textMuted', 'surfaceAlt'], ['onAccent', 'accent'], ['onAccent', 'accentPressed'],
    ['error', 'bg'], ['error', 'surface'], ['onDisabled', 'disabled'], ['accent', 'bg'],
  ] as const)('%s sobre %s ≥ 4.5:1', (fg, bg) => {
    expect(ratio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it('borde sobre fondo ≥ 1.3 (separación visible, no textual)', () => {
    expect(ratio(colors.border, colors.bg)).toBeGreaterThan(1.3);
  });
});
