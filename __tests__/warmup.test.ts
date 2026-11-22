import { warmupSets } from '../src/lib/warmup';

it('rampa 50 % y 70 % ajustada a la rejilla de la barra', () => {
  expect(warmupSets(100, { barKg: 20, stepKg: 5 })).toEqual([{ weightKg: 50, reps: 5 }, { weightKg: 70, reps: 3 }]);
});
it('sin barra usa el escalón dado; nunca baja de la barra ni repite carga ni llega al peso de trabajo', () => {
  expect(warmupSets(60, { stepKg: 2.5 })).toEqual([{ weightKg: 30, reps: 5 }, { weightKg: 42.5, reps: 3 }]);
  expect(warmupSets(30, { barKg: 20, stepKg: 5 })).toEqual([{ weightKg: 20, reps: 5 }]); // 50 % y 70 % caen en la barra o en el peso de trabajo
  expect(warmupSets(20, { barKg: 20, stepKg: 5 })).toEqual([]);
  expect(warmupSets(10, { barKg: 20, stepKg: 5 })).toEqual([]);
  expect(warmupSets(50, { stepKg: 0 })).toEqual([]);
});
