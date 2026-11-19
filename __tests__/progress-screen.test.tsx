import { fireEvent, render, screen } from '@testing-library/react-native';
import ProgressScreen from '../src/app/(tabs)/progress';
import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { toDateKey } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

const item = { exerciseVariantId: 'a', sets: 1, repRange: [8, 12] as [number, number], restSeconds: 60 };
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: `D${day}`, blocks: [{ type: 'single' as const, items: [item] }] })) };

async function setup(finish: boolean) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  if (finish) await finishWorkout(db, await startWorkout(db, profile.id, toDateKey()));
  mockApp = { db, profile };
}

it('sin plan ni sesiones muestra el estado vacío, sin cifras de muestra', async () => {
  const db = memoryDb();
  await migrate(db);
  mockApp = { db, profile: await createProfile(db, { alias: 'Ana' }) };
  await render(<ProgressScreen />);
  expect(await screen.findByText('Sin datos todavía')).toBeTruthy();
});

it('con una sesión completada muestra racha, semana y total', async () => {
  await setup(true);
  await render(<ProgressScreen />);
  expect(await screen.findByText('1 sesión completada')).toBeTruthy();
  expect(screen.getByText(/^Racha$/)).toBeTruthy();
  expect(screen.getByText(/^1 de \d sesiones$/)).toBeTruthy();
});

it('muestra la fuerza por ejercicio en la unidad del perfil y despliega el historial', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana', weightUnit: 'lb' });
  const bench = { exerciseVariantId: 'bench_press.barbell', sets: 1, repRange: [6, 10] as [number, number], restSeconds: 60 };
  await saveActivePlan(db, profile.id, { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: `D${day}`, blocks: [{ type: 'single' as const, items: [bench] }] })) }, null);
  await ensureHorizon(db, profile.id, toDateKey());
  const id = await startWorkout(db, profile.id, toDateKey());
  await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 60, reps: 10 });
  await finishWorkout(db, id);
  mockApp = { db, profile };
  await render(<ProgressScreen />);
  // 60 kg × 10 reps → 80 kg estimados = 176.4 lb
  const row = await screen.findByLabelText('Press de banca plano: 176.4 lb, primer registro');
  fireEvent.press(row);
  expect(await screen.findByText(/132\.3 lb × 10 → 176\.4 lb/)).toBeTruthy();
});
