import { currentStreak, weekStatus, type DayRow } from '../src/lib/streak';

// Lunes 2026-11-02 … domingo 2026-11-08; 09–15; 16–22.
const T = (date: string, status: DayRow['status'] = 'completed'): DayRow => ({ date, kind: 'training', status });
const R = (date: string): DayRow => ({ date, kind: 'rest', status: 'scheduled' });

it('semana de lunes a viernes con fin de semana libre: el descanso es neutro y la racha se mantiene', () => {
  const week = (days: string[]) => [...days.map((d) => T(d)), ...['2026-11-07', '2026-11-08'].map(R)];
  const w1 = week(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  const w2 = week(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  expect(currentStreak([...w1, ...w2], '2026-11-16')).toBe(2);
});

it('una sesión vencida sin realizar o saltada corta la racha; la semana en curso abierta no cuenta ni rompe', () => {
  const prev = [T('2026-11-02'), T('2026-11-04', 'scheduled')];
  expect(weekStatus(prev, '2026-11-12')).toBe('missed');
  expect(currentStreak([...prev, T('2026-11-09')], '2026-11-12')).toBe(1); // la actual cumplida cuenta; la anterior fallida corta ahí
  expect(currentStreak([T('2026-11-09'), T('2026-11-10', 'scheduled')], '2026-11-12')).toBe(0); // vencida en la semana en curso
  expect(currentStreak([T('2026-11-02'), T('2026-11-04'), T('2026-11-09'), T('2026-11-13', 'scheduled')], '2026-11-12')).toBe(1);
  expect(weekStatus([T('2026-11-02', 'skipped')], '2026-11-12')).toBe('missed');
});

it('una semana sin sesiones pausa el contador y una sin datos devuelve 0', () => {
  expect(currentStreak([T('2026-11-02'), R('2026-11-10'), T('2026-11-16')], '2026-11-17')).toBe(2);
  expect(weekStatus([R('2026-11-10')], '2026-11-17')).toBe('empty');
  expect(currentStreak([], '2026-11-17')).toBe(0);
});
