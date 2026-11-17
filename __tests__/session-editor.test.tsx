import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EditSession from '../src/app/plan/edit';
import { migrate } from '../src/db';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { saveDraft } from '../src/db/onboarding';
import { getActivePlanState } from '../src/db/planEditing';
import { createProfile } from '../src/db/profiles';
import { getInstances } from '../src/db/schedule';
import type { Plan, PlanSession } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
let mockParams: Record<string, string> = { day: '1' };
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ router: { back: (...a: unknown[]) => mockBack(...a) }, useLocalSearchParams: () => mockParams }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

const item = (id: string, sets = 3, repRange: [number, number] = [8, 12], restSeconds = 60) => ({ exerciseVariantId: id, sets, repRange, restSeconds });
const empuje = (): PlanSession => ({ day: 1, name: 'Empuje', blocks: [{ type: 'single', items: [item('pushup.floor')] }, { type: 'single', items: [item('db_fly.flat')] }] });
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [empuje()] });
const GYM = ['dumbbells_fixed_hex', 'bench_adjustable', 'pec_deck_fly', 'cable_crossover_dual_adjustable', 'cable_att_handle_single'];

async function seed(minutes = 60) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  const env = await ensureEnvironment(db, profile.id, 'gym');
  for (const id of GYM) await setItemState(db, env, id, 'available');
  await db.runAsync("INSERT INTO training_plans (id, profile_id, environment_id, mode, status, plan_json, created_at) VALUES ('p1', ?, ?, 'local', 'active', ?, '2026-11-16T12:00:00.000Z')", [profile.id, env, JSON.stringify(plan())]);
  await db.runAsync("INSERT INTO plan_revisions (id, plan_id, revision, author, definition_json, created_at) VALUES ('r1', 'p1', 1, 'engine', ?, 'now')", [JSON.stringify(plan())]);
  for (const [step, data] of Object.entries({ 2: { primaryGoal: 'muscle' }, 3: { level: 'intermediate' }, 4: { days: [0, 1, 2, 3, 4], minutes }, 7: { jointLimitations: [] } })) await saveDraft(db, profile.id, Number(step), data);
  mockApp = { db, profile };
  return { db, profile };
}
const ids = (s: PlanSession) => s.blocks.flatMap((b) => b.items.map((i) => i.exerciseVariantId));
const tplSession = async (db: ReturnType<typeof memoryDb>, profileId: string) => (await getActivePlanState(db, profileId))!.plan.sessions[0];

beforeAll(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 17, 10, 0), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => { mockBack.mockClear(); mockParams = { day: '1' }; });

it('muestra los ejercicios de la sesión con su prescripción', async () => {
  await seed();
  await render(<EditSession />);
  expect(await screen.findByText('Flexiones')).toBeTruthy();
  expect(screen.getByText('Aperturas con mancuernas')).toBeTruthy();
  expect(screen.getAllByText(/3 series · 8-12 reps · 1:00 descanso/).length).toBe(2);
  expect(screen.getByRole('button', { name: /Revisar cambios/ }).props.accessibilityState.disabled).toBe(true); // sin cambios no se puede guardar
});

it('ajustar series, revisar el resumen, guardar para todas las semanas y deshacer', async () => {
  const { db, profile } = await seed();
  await render(<EditSession />);
  await fireEvent.press(await screen.findByLabelText('Ajustar Flexiones'));
  await fireEvent.press(screen.getByLabelText('Aumentar Series'));
  await fireEvent.press(screen.getByLabelText('Descanso 1:30'));
  await fireEvent.press(screen.getByText('RIR 2'));
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  expect(await screen.findByText('Revisar cambios')).toBeTruthy();
  expect(screen.getByText(/Flexiones: 3×8-12, descanso 60 s → 4×8-12, descanso 90 s, RIR 2/)).toBeTruthy();
  expect((await getActivePlanState(db, profile.id))?.version).toBe(1); // nada se guarda antes de confirmar
  await fireEvent.press(screen.getByText(/^Todas las semanas/));
  expect(await screen.findByText('Cambios guardados')).toBeTruthy();
  expect((await tplSession(db, profile.id)).blocks[0].items[0]).toMatchObject({ sets: 4, restSeconds: 90, rir: 2 });
  await fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect((await tplSession(db, profile.id)).blocks[0].items[0]).toMatchObject({ sets: 3, restSeconds: 60 });
});

it('reemplazar ofrece equivalentes con el equipo disponible y se refleja en el resumen', async () => {
  const { db, profile } = await seed();
  await render(<EditSession />);
  await fireEvent.press(await screen.findByLabelText('Reemplazar Aperturas con mancuernas'));
  await fireEvent.press(await screen.findByLabelText('Usar Aperturas en pec deck en su lugar'));
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  expect(await screen.findByText(/Reemplazado: Aperturas con mancuernas → Aperturas en pec deck/)).toBeTruthy();
  await fireEvent.press(screen.getByText(/^Todas las semanas/));
  await waitFor(async () => expect(ids(await tplSession(db, profile.id))).toEqual(['pushup.floor', 'pec_deck.machine']));
});

it('añadir ejercicio: busca entre los compatibles y no ofrece los que no se pueden hacer', async () => {
  const { db, profile } = await seed();
  await render(<EditSession />);
  await fireEvent.press(await screen.findByText('Añadir ejercicio'));
  await fireEvent.changeText(screen.getByLabelText('Buscar ejercicio'), 'sentadilla');
  expect(screen.queryByLabelText('Añadir Sentadilla trasera')).toBeNull(); // sin rack ni barra no es posible
  await fireEvent.changeText(screen.getByLabelText('Buscar ejercicio'), 'diamante');
  await fireEvent.press(await screen.findByLabelText('Añadir Flexiones diamante'));
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  await fireEvent.press(await screen.findByText(/^Todas las semanas/));
  await waitFor(async () => expect(ids(await tplSession(db, profile.id))).toContain('diamond_pushup.floor'));
});

it('agrupar en biserie, separar y quitar; no deja la sesión sin ejercicios', async () => {
  await seed();
  await render(<EditSession />);
  await fireEvent.press(await screen.findByLabelText('Agrupar Flexiones con el siguiente en biserie'));
  expect(await screen.findByText('Biserie (A + B)')).toBeTruthy();
  await fireEvent.press(screen.getByText('Separar biserie'));
  expect(screen.queryByText('Biserie (A + B)')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Quitar Aperturas con mancuernas'));
  expect(screen.queryByText('Aperturas con mancuernas')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Quitar Flexiones'));
  expect(await screen.findByText('Una sesión necesita al menos un ejercicio')).toBeTruthy();
  expect(screen.getByText('Flexiones')).toBeTruthy(); // el borrador sigue intacto
});

it('subir, bajar y duplicar reordenan sin perder nada', async () => {
  const { db, profile } = await seed();
  await render(<EditSession />);
  await fireEvent.press(await screen.findByLabelText('Bajar Flexiones'));
  await fireEvent.press(screen.getAllByLabelText('Duplicar Flexiones')[0]);
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  expect((await screen.findAllByText(/Orden de los ejercicios modificado|Añadido: Flexiones/)).length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByText(/^Todas las semanas/));
  await waitFor(async () => expect(ids(await tplSession(db, profile.id))).toEqual(['db_fly.flat', 'pushup.floor', 'pushup.floor']));
});

it('renombrar la sesión', async () => {
  const { db, profile } = await seed();
  await render(<EditSession />);
  await fireEvent.changeText(await screen.findByLabelText('Nombre de la sesión'), 'Pecho y hombro');
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  expect(await screen.findByText('• Nombre: «Empuje» → «Pecho y hombro»')).toBeTruthy();
  await fireEvent.press(screen.getByText(/^Todas las semanas/));
  await waitFor(async () => expect((await tplSession(db, profile.id)).name).toBe('Pecho y hombro'));
});

it('un cambio que no cabe en el tiempo disponible bloquea el guardado y lo explica', async () => {
  await seed(30);
  await render(<EditSession />);
  for (let i = 0; i < 8; i++) await fireEvent.press(screen.getAllByLabelText('Duplicar Flexiones')[0]);
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  expect(await screen.findByText('No se puede guardar')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Todas las semanas/ }).props.accessibilityState.disabled).toBe(true);
});

it('«Solo esta fecha» edita únicamente esa fecha y no cambia el plan semanal', async () => {
  mockParams = { date: '2026-11-24' };
  const { db, profile } = await seed();
  await render(<EditSession />);
  await fireEvent.changeText(await screen.findByLabelText('Nombre de la sesión'), 'Empuje corto');
  await fireEvent.press(screen.getByText(/^Revisar cambios/));
  await fireEvent.press(await screen.findByText('Solo esta fecha'));
  expect(await screen.findByText('Cambios guardados')).toBeTruthy();
  expect((await getActivePlanState(db, profile.id))?.version).toBe(1);
  expect((await getInstances(db, profile.id, '2026-11-24', '2026-11-24', '2026-11-17'))[0].session?.name).toBe('Empuje corto');
  expect((await getInstances(db, profile.id, '2026-12-01', '2026-12-01', '2026-11-17'))[0].session?.name).toBe('Empuje');
});

it('si la sesión no existe, lo dice en vez de fallar', async () => {
  mockParams = { day: '5' };
  await seed();
  await render(<EditSession />);
  expect(await screen.findByText(/Esa sesión ya no existe/)).toBeTruthy();
});
