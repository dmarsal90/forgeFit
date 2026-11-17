import type { Plan, PlanSession } from '../src/lib/plan';
import {
  addDays, addMonths, applyScheduleOp, buildInstances, datesOfWeek, diffDays, isDateKey, monthGrid, ScheduleError, toDateKey, weekdayOf, weekStart,
  type Instance,
} from '../src/lib/schedule';

const sess = (day: number, name: string): PlanSession => ({
  day, name, blocks: [{ type: 'single', items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12], restSeconds: 60 }] }],
});
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [sess(0, 'A'), sess(2, 'B'), sess(4, 'C')] };

describe('fechas de calendario', () => {
  it('claves válidas y semana de lunes a domingo', () => {
    expect(isDateKey('2026-11-17')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('17/11/2026')).toBe(false);
    expect(weekdayOf('2026-11-16')).toBe(0); // lunes
    expect(weekdayOf('2026-11-22')).toBe(6); // domingo
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(datesOfWeek('2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  });
  it('sumar días y meses cruza fin de mes, de año y años bisiestos', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(diffDays('2026-11-16', '2026-11-23')).toBe(7);
  });
  it('no depende del horario de verano: las semanas siempre tienen 7 días distintos', () => {
    for (const start of ['2026-03-23', '2026-10-26', '2026-11-02']) expect(new Set(datesOfWeek(start)).size).toBe(7);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // fin de marzo (cambio de hora en Europa)
  });
  it('toDateKey usa el día local, sin zona ni hora', () => {
    expect(toDateKey(new Date(2026, 10, 17, 23, 59))).toBe('2026-11-17');
    expect(toDateKey(new Date(2026, 10, 17, 0, 1))).toBe('2026-11-17');
  });
  it('monthGrid devuelve semanas completas que cubren el mes', () => {
    const g = monthGrid('2026-11-17');
    expect(g[0][0]).toBe('2026-10-26'); // el 1 de noviembre es domingo: la primera semana empieza el lunes 26 de octubre
    expect(g.length).toBe(6);
    expect(g[5][0]).toBe('2026-11-30'); // y el 30 de noviembre (lunes) abre la última
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
});

describe('instancias desde la plantilla', () => {
  it('genera entrenamiento o descanso según el día de la semana', () => {
    const r = buildInstances(plan, '2026-11-16', '2026-11-22', 1);
    expect(r.map((i) => [i.date, i.kind, i.session?.name ?? null])).toEqual([
      ['2026-11-16', 'training', 'A'], ['2026-11-17', 'rest', null], ['2026-11-18', 'training', 'B'], ['2026-11-19', 'rest', null],
      ['2026-11-20', 'training', 'C'], ['2026-11-21', 'rest', null], ['2026-11-22', 'rest', null],
    ]);
    expect(r.every((i) => i.status === 'scheduled' && i.origin === 'template' && i.revision === 1)).toBe(true);
  });
  it('las instancias son copias: cambiar una no altera la plantilla', () => {
    const r = buildInstances(plan, '2026-11-16', '2026-11-16', 1);
    r[0].session!.name = 'X';
    expect(plan.sessions[0].name).toBe('A');
  });
});

describe('operaciones entre dos fechas', () => {
  const [mon, tue, wed] = buildInstances(plan, '2026-11-16', '2026-11-18', 1);
  const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ScheduleError ? e.code : 'other'; } return 'none'; };
  it('mover deja el origen en descanso y marca ambas como cambios manuales', () => {
    const [from, to] = applyScheduleOp(mon, tue, { type: 'move', from: mon.date, to: tue.date });
    expect([from.kind, from.origin, to.kind, to.session?.name, to.origin]).toEqual(['rest', 'override', 'training', 'A', 'override']);
  });
  it('intercambiar permuta las sesiones', () => {
    const [x, y] = applyScheduleOp(mon, wed, { type: 'swap', from: mon.date, to: wed.date });
    expect([x.session?.name, y.session?.name]).toEqual(['B', 'A']);
  });
  it('duplicar conserva el origen y crea una copia con otro nombre', () => {
    const [x, y] = applyScheduleOp(mon, tue, { type: 'duplicate', from: mon.date, to: tue.date });
    expect([x.session?.name, x.origin, y.session?.name]).toEqual(['A', 'template', 'A (copia)']);
  });
  it('rechaza pisar sesiones, mover descansos, mismo día y fechas desconocidas', () => {
    expect(code(() => applyScheduleOp(mon, wed, { type: 'move', from: mon.date, to: wed.date }))).toBe('destination_occupied');
    expect(code(() => applyScheduleOp(mon, wed, { type: 'duplicate', from: mon.date, to: wed.date }))).toBe('destination_occupied');
    expect(code(() => applyScheduleOp(tue, mon, { type: 'move', from: tue.date, to: mon.date }))).toBe('no_session');
    expect(code(() => applyScheduleOp(mon, tue, { type: 'swap', from: mon.date, to: tue.date }))).toBe('no_session');
    expect(code(() => applyScheduleOp(mon, mon, { type: 'move', from: mon.date, to: mon.date }))).toBe('same_day');
    expect(code(() => applyScheduleOp(mon, undefined, { type: 'move', from: mon.date, to: '2030-01-01' }))).toBe('unknown_date');
  });
  it('una sesión completada o saltada es un registro: no se mueve ni se pisa', () => {
    const done: Instance = { ...mon, status: 'completed' };
    expect(code(() => applyScheduleOp(done, tue, { type: 'move', from: mon.date, to: tue.date }))).toBe('completed');
    expect(code(() => applyScheduleOp(wed, { ...tue, status: 'skipped' }, { type: 'move', from: wed.date, to: tue.date }))).toBe('completed');
  });
  it('no muta las instancias originales', () => {
    applyScheduleOp(mon, wed, { type: 'swap', from: mon.date, to: wed.date });
    expect([mon.session?.name, wed.session?.name, mon.origin]).toEqual(['A', 'B', 'template']);
  });
});
