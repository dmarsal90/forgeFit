import { fireEvent, render, screen } from '@testing-library/react-native';
import WorkoutScreen from '../src/app/workout/[id]';
import { migrate } from '../src/db';
import { saveDraft } from '../src/db/onboarding';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { setAttributes } from '../src/db/equipmentAttributes';
import { setPlates } from '../src/db/equipmentPlates';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { finishWorkout, loadWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { toDateKey } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));
let mockId = '';

const item = (id: string, sets: number) => ({ exerciseVariantId: id, sets, repRange: [8, 12] as [number, number], restSeconds: 60 });
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: 'Pecho', blocks: [{ type: 'superset' as const, items: [item('pushup.floor', 2), item('pushup.floor', 2)] }] })) };

it('biserie: completa A1 y A2, descansa, corrige una serie y termina la sesión', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());

  await render(<WorkoutScreen />);
  expect(await screen.findByText(/Biserie · A1 · ronda 1/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '20');
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText(/Biserie · A2 · ronda 1/)).toBeTruthy();
  expect(screen.queryByText(/Descanso/)).toBeNull(); // sin descanso entre A1 y A2
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '9');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText(/Descanso/)).toBeTruthy(); // la ronda 1 terminó
  for (let i = 0; i < 2; i++) { // ronda 2: A1 y A2
    await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '8');
    await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  }
  expect(await screen.findByText('Completaste todas las series')).toBeTruthy();

  await fireEvent.press(screen.getAllByRole('button', { name: /Corregir/ })[0]);
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '12');
  await fireEvent.press(screen.getByRole('button', { name: /Guardar corrección/ }));
  expect(await screen.findByText(/× 12 \(corregida\)/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: /Terminar sesión/ }));
  expect(await screen.findByText('Sesión terminada')).toBeTruthy();
  expect((await loadWorkout(db, mockId))?.status).toBe('finished');
});

it('pide repeticiones antes de completar una serie', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());
  await render(<WorkoutScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText('Indica las repeticiones (0–200).')).toBeTruthy();
});

it('con el perfil en libras pide y muestra libras, pero guarda kilos', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana', weightUnit: 'lb' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());

  await render(<WorkoutScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Peso (lb)'), '135');
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText(/135 lb × 10/)).toBeTruthy();
  const done = (await loadWorkout(db, mockId))!.events.map((e) => e.event).find((e) => e.type === 'set_done');
  expect(done && 'weightKg' in done && done.weightKg).toBeCloseTo(61.235, 2);
});

it('marcar molestia o dolor en una serie lo guarda solo para esa serie y se puede quitar', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());
  await render(<WorkoutScreen />);

  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByText('Dolor'));
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A1: dolor
  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '9');
  await fireEvent.press(screen.getByText('Molestia'));
  await fireEvent.press(screen.getByText('Molestia')); // pulsar otra vez la quita
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A2: nada
  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '8');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A1 ronda 2: la marca no se arrastra

  const done = (await loadWorkout(db, mockId))!.state.done;
  expect(done['0.0.0'].pain).toBe('pain');
  expect(done['0.1.0'].pain).toBeUndefined();
  expect(done['0.0.1'].pain).toBeUndefined();
});

it('«Máquina ocupada» sustituye el ejercicio solo desde ahí, sin tocar el plan, y se puede volver al original', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  for (const [step, data] of Object.entries({ 2: { primaryGoal: 'muscle' }, 3: { level: 'intermediate' }, 4: { days: [0, 2, 4], minutes: 60 }, 5: { environments: ['gym'] }, 6: {}, 7: {} })) await saveDraft(db, profile.id, Number(step), data);
  const gym = await ensureEnvironment(db, profile.id, 'gym');
  for (const e of ['dumbbells_fixed_hex', 'bench_adjustable']) await setItemState(db, gym, e, 'available');
  await saveActivePlan(db, profile.id, plan, gym);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());
  await render(<WorkoutScreen />);

  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A1 con el ejercicio del plan
  await fireEvent.press(await screen.findByRole('button', { name: 'Máquina ocupada' }));
  const options = await screen.findAllByRole('button', { name: /^Usar / });
  await fireEvent.press(options[0]);
  await fireEvent.press(await screen.findByRole('button', { name: 'Máquina ocupada' }));
  expect(await screen.findByRole('button', { name: /^Volver a / })).toBeTruthy(); // con una sustitución activa se ofrece deshacerla
  await fireEvent.press(screen.getByRole('button', { name: 'Máquina ocupada' })); // cierra la lista
  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '8');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A2 ya con la alternativa

  const w = (await loadWorkout(db, mockId))!;
  const chosen = w.state.variants['0.1'];
  expect(chosen).toBeTruthy();
  expect(chosen).not.toBe('pushup.floor');
  expect(w.state.done['0.0.0'].variantId).toBeUndefined(); // la serie anterior sigue siendo del plan
  expect(w.state.done['0.1.0'].variantId).toBe(chosen);
  expect(w.session.blocks.flatMap((b) => b.items.map((i) => i.exerciseVariantId))).toEqual(['pushup.floor', 'pushup.floor']); // el plan congelado intacto
});

describe('sugerencia de progresión', () => {
  const benchPlan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: 'Pecho', blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10] as [number, number], restSeconds: 60 }] }] })) };

  async function open(withHistory: boolean) {
    const db = memoryDb();
    await migrate(db);
    const profile = await createProfile(db, { alias: 'Ana' });
    await saveActivePlan(db, profile.id, benchPlan, null);
    await db.runAsync("UPDATE training_plans SET created_at = '2026-11-01T08:00:00'");
    await ensureHorizon(db, profile.id, toDateKey(), toDateKey());
    if (withHistory) {
      const old = await startWorkout(db, profile.id, toDateKey(new Date(Date.now() - 86_400_000)), Date.now() - 86_400_000);
      for (const round of [0, 1, 2]) await recordEvent(db, old, { type: 'set_done', block: 0, item: 0, round, weightKg: 60, reps: 10 });
      await finishWorkout(db, old);
    }
    mockApp = { db, profile };
    mockId = await startWorkout(db, profile.id, toDateKey());
    await render(<WorkoutScreen />);
  }

  it('muestra qué hacer y por qué, y rellena el peso sugerido (editable) solo en la primera serie', async () => {
    await open(true);
    expect(await screen.findByText('Sugerencia: Sube a 62.5 kg.')).toBeTruthy();
    expect(screen.getByText(/Hiciste 10 repeticiones con 60 kg en todas las series/)).toBeTruthy();
    expect(screen.getByLabelText('Peso (kg)').props.value).toBe('62.5');

    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '60'); // la sugerencia se puede ignorar
    await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '8');
    await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
    await screen.findByText(/Serie 2 de 3/);
    expect(screen.getByLabelText('Peso (kg)').props.value).toBe('60'); // la siguiente serie parte de lo que hiciste
    expect((await loadWorkout((((mockApp as { db: never }).db)), mockId))!.state.done['0.0.0']).toMatchObject({ weightKg: 60, reps: 8 });
  });

  it('sin historial no muestra sugerencia ni rellena el peso', async () => {
    await open(false);
    expect(await screen.findByText(/Serie 1 de 3/)).toBeTruthy();
    expect(screen.queryByText(/Sugerencia/)).toBeNull();
    expect(screen.getByLabelText('Peso (kg)').props.value).toBe('');
  });

  it('aceptar la sugerencia (completar con el peso rellenado) guarda ese peso', async () => {
    await open(true);
    await screen.findByText('Sugerencia: Sube a 62.5 kg.');
    await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '6');
    await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
    await screen.findByText(/Serie 2 de 3/);
    expect((await loadWorkout((mockApp as { db: never }).db, mockId))!.state.done['0.0.0'].weightKg).toBe(62.5);
  });
});

describe('discos por lado', () => {
  const benchPlan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: 'Pecho', blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10] as [number, number], restSeconds: 60 }] }] })) };

  async function open(unit: 'kg' | 'lb', plates: { unit: 'kg' | 'lb'; value: number; pairs: number }[], barKg?: number) {
    const db = memoryDb();
    await migrate(db);
    const profile = await createProfile(db, { alias: 'Ana', weightUnit: unit });
    const gym = await ensureEnvironment(db, profile.id, 'gym');
    await setItemState(db, gym, 'barbell_olympic_20', 'available');
    await setItemState(db, gym, 'plates_olympic_iron', 'available');
    if (barKg !== undefined) await setAttributes(db, gym, 'barbell_olympic_20', { minKg: null, maxKg: null, stepKg: null, barKg, unit });
    await setPlates(db, gym, 'plates_olympic_iron', plates);
    await saveActivePlan(db, profile.id, benchPlan, gym);
    await db.runAsync("UPDATE training_plans SET created_at = '2026-11-01T08:00:00'");
    await ensureHorizon(db, profile.id, toDateKey(), toDateKey());
    mockApp = { db, profile };
    mockId = await startWorkout(db, profile.id, toDateKey());
    await render(<WorkoutScreen />);
    await screen.findByText(/Serie 1 de 3/);
  }
  const KG_SET = [20, 15, 10, 5, 2.5, 1.25].map((value) => ({ unit: 'kg' as const, value, pairs: 2 }));
  const LB_SET = [45, 35, 25, 10, 5, 2.5].map((value) => ({ unit: 'lb' as const, value, pairs: 2 }));

  it('dice qué discos poner por lado al escribir el peso, y avisa si no se puede montar', async () => {
    await open('kg', KG_SET);
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '62.5');
    expect(await screen.findByText('Por lado: 20 kg + 1.25 kg')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '20');
    expect(await screen.findByText('Por lado: solo la barra')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '63');
    expect(await screen.findByText('No se puede montar con tus discos. Más cerca: 62.5 kg o 65 kg.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '15');
    expect(await screen.findByText('Ese peso es menos que la barra.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '');
    expect(screen.queryByText(/Por lado/)).toBeNull();
  });

  it('discos en lb con el perfil en lb: 135 lb con barra de 45 lb = un disco de 45 por lado', async () => {
    await open('lb', LB_SET, 45 * 0.45359237);
    await fireEvent.changeText(screen.getByLabelText('Peso (lb)'), '135');
    expect(await screen.findByText('Por lado: 45 lb')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (lb)'), '100');
    expect(await screen.findByText('Por lado: 25 lb + 2.5 lb')).toBeTruthy();
  });

  it('discos en kg y en lb a la vez con el perfil en kg: cada peso se monta con los discos que lo cuadran', async () => {
    await open('kg', [...KG_SET, ...LB_SET]);
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '100');
    expect(await screen.findByText('Por lado: 2×20 kg')).toBeTruthy(); // 40 kg por lado: dos discos de 20 (menos discos)
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '60.82');
    expect(await screen.findByText('Por lado: 45 lb')).toBeTruthy(); // 20 kg + 2 × 45 lb
  });

  it('sin discos indicados dice qué falta en vez de callar', async () => {
    await open('kg', []);
    expect(await screen.findByText('Indica tus discos en su ficha para ver qué poner en cada lado.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '60');
    expect(screen.queryByText(/Por lado|No se puede montar/)).toBeNull();
  });
});
