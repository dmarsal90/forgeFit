import { fmtWeight, kgToUnit, unitToKg } from '../src/lib/units';

it('kg no cambia y lb convierte en los dos sentidos', () => {
  expect(kgToUnit(60, 'kg')).toBe(60);
  expect(kgToUnit(100, 'lb')).toBe(220.5);
  expect(unitToKg(220.462, 'lb')).toBeCloseTo(100, 2);
  expect(unitToKg(135, 'lb')).toBeCloseTo(61.235, 2);
  expect(fmtWeight(61.2349, 'lb')).toBe('135 lb');
  expect(fmtWeight(20, 'kg')).toBe('20 kg');
});
