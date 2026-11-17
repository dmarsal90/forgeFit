import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Planner from '../src/app/planner';
import { migrate } from '../src/db';
import { saveDraft } from '../src/db/onboarding';
import { getActivePlanState, listRevisions } from '../src/db/planEditing';
import { getInstances } from '../src/db/schedule';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import type { Plan } from '../src/lib/plan';
import { dropAction, dropDay, focusOf, ROW, targetsFor } from '../src/lib/planner';
import { addDays } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { GestureHandlerRootView: View, GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: () => ({}) };
});

const sess = (day: number, name: string, ex = 'pushup.floor') => ({
  day, name, blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: ex, sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 }] }],
});
// hoy = martes 17 de noviembre de 2026: el lunes 16 ya es pasado
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [sess(1, 'Empuje', 'incline_bench_press.db'), sess(2, 'Tracción', 'db_row.standing'), sess(4, 'Piernas', 'goblet_squat.db')] });
const view = (p: Plan) => p.sessions.map((s) => `${s.day}:${s.name}`);

async function setup(days = [1, 2, 3, 4, 5]) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveDraft(db, profile.id, 4, { days, minutes: 60 });
  await saveActivePlan(db, profile.id, plan(), null);
  mockApp = { db, profile };
  return { db, profile };
}
const week = async (db: ReturnType<typeof memoryDb>, profileId: string, from = '2026-11-16') =>
  (await getInstances(db, profileId, from, addDays(from, 6), '2026-11-17')).map((r) => `${r.date.slice(8)}:${r.session?.name ?? '-'}`);

beforeAll(() => {
  // solo se falsea la fecha: los temporizadores reales siguen funcionando para la base de datos y para waitFor
  jest.useFakeTimers({ now: new Date(2026, 10, 17, 10, 0), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterAll(() => jest.useRealTimers());

describe('lógica pura del planificador', () => {
  it('dropDay convierte el arrastre vertical en el día de destino, acotado a la semana', () => {
    expect(dropDay(2, 0)).toBe(2);
    expect(dropDay(2, ROW * 2)).toBe(4);
    expect(dropDay(2, -ROW)).toBe(1);
    expect(dropDay(5, ROW * 9)).toBe(6);
    expect(dropDay(1, -ROW * 9)).toBe(0);
    expect(dropDay(2, ROW * 0.4)).toBe(2); // un arrastre corto no cambia de día
  });
  it('targetsFor y dropAction distinguen mover, intercambiar y duplicar', () => {
    const p = plan();
    expect(targetsFor(p, 1, 'move')).toEqual([0, 3, 5, 6]);
    expect(targetsFor(p, 1, 'duplicate')).toEqual([0, 3, 5, 6]);
    expect(targetsFor(p, 1, 'swap')).toEqual([2, 4]);
    expect(dropAction(p, 1, 2)).toBe('swap');
    expect(dropAction(p, 1, 3)).toBe('move');
    expect(dropAction(p, 1, 1)).toBe('none');
  });
  it('focusOf resume los músculos principales de la sesión', () => {
    expect(focusOf(plan().sessions[0])).toEqual(expect.arrayContaining(['Pectoral', 'Deltoides']));
  });
});

it('muestra la semana con fechas: pasado, hoy, sesiones y descansos', async () => {
  await setup();
  await render(<Planner />);
  expect(await screen.findByLabelText(/^Lunes 16: descanso.*pasado/)).toBeTruthy();
  expect(screen.getByLabelText(/^Martes 17: Empuje.*hoy/)).toBeTruthy();
  expect(screen.getByLabelText(/^Miércoles 18: Tracción/)).toBeTruthy();
  expect(screen.getByLabelText(/^Domingo 22: descanso/)).toBeTruthy();
  expect(screen.getByText('16 nov – 22 nov')).toBeTruthy();
});

it('«Solo esta semana»: intercambia únicamente esas fechas y no toca el plan; se puede deshacer', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Martes 17: Empuje/));
  await fireEvent.press(screen.getByText('Intercambiar con…'));
  await fireEvent.press(screen.getByLabelText('Miércoles 18, Tracción'));
  expect(await screen.findByText('Confirmar cambio')).toBeTruthy();
  expect(await week(db, profile.id)).toEqual(['16:-', '17:Empuje', '18:Tracción', '19:-', '20:Piernas', '21:-', '22:-']); // nada sin confirmar
  await fireEvent.press(screen.getByText('Solo esta semana'));
  await waitFor(async () => expect(await week(db, profile.id)).toEqual(['16:-', '17:Tracción', '18:Empuje', '19:-', '20:Piernas', '21:-', '22:-']));
  expect((await getActivePlanState(db, profile.id))?.version).toBe(1); // plantilla intacta
  expect((await week(db, profile.id, '2026-11-23'))[1]).toBe('24:Empuje'); // la semana siguiente sigue igual
  await fireEvent.press(await screen.findByText('Deshacer'));
  await waitFor(async () => expect(await week(db, profile.id)).toEqual(['16:-', '17:Empuje', '18:Tracción', '19:-', '20:Piernas', '21:-', '22:-']));
});

it('«Todas las semanas»: cambia el plan (revisión nueva) y las semanas futuras lo siguen', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Martes 17: Empuje/));
  await fireEvent.press(screen.getByText('Intercambiar con…'));
  await fireEvent.press(screen.getByLabelText('Miércoles 18, Tracción'));
  await fireEvent.press(await screen.findByText('Todas las semanas (tu plan)'));
  await waitFor(async () => expect(view((await getActivePlanState(db, profile.id))!.plan)).toEqual(['1:Tracción', '2:Empuje', '4:Piernas']));
  expect((await listRevisions(db, profile.id)).map((r) => r.revision)).toEqual([2, 1]);
  expect((await week(db, profile.id, '2026-11-23'))[1]).toBe('24:Tracción');
  expect((await week(db, profile.id))[1]).toBe('17:Tracción'); // hoy también, porque aún no ha pasado
});

it('los días pasados no se pueden tocar', async () => {
  await setup();
  await render(<Planner />);
  const monday = await screen.findByLabelText(/^Lunes 16: descanso/);
  expect(monday.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(monday);
  expect(screen.queryByText(/descanso$/)).toBeNull();
});

it('mover a un día no disponible avisa antes de confirmar', async () => {
  await setup([1, 2, 4]);
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Viernes 20: Piernas/));
  await fireEvent.press(screen.getByText('Mover a…'));
  await fireEvent.press(screen.getByLabelText('Sábado 21, libre'));
  expect(await screen.findByText('Confirmar cambio')).toBeTruthy();
  expect(screen.getByText(/Sábado no está entre los días que marcaste como disponibles/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancelar'));
  expect(screen.queryByText('Confirmar cambio')).toBeNull();
});

it('duplicar crea una copia en un día libre solo esta semana', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Martes 17: Empuje/));
  await fireEvent.press(screen.getByText('Duplicar a…'));
  await fireEvent.press(screen.getByLabelText('Jueves 19, libre'));
  await fireEvent.press(await screen.findByText('Solo esta semana'));
  await waitFor(async () => expect(await week(db, profile.id)).toEqual(['16:-', '17:Empuje', '18:Tracción', '19:Empuje (copia)', '20:Piernas', '21:-', '22:-']));
});

it('un descanso se puede mover: la sesión de ese día ocupa el descanso', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Jueves 19: descanso/));
  await fireEvent.press(screen.getByLabelText('Martes 17, Empuje'));
  await fireEvent.press(await screen.findByText('Solo esta semana'));
  await waitFor(async () => expect(await week(db, profile.id)).toEqual(['16:-', '17:-', '18:Tracción', '19:Empuje', '20:Piernas', '21:-', '22:-']));
});

it('se puede navegar a la semana siguiente y volver', async () => {
  await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByText('›'));
  expect(await screen.findByText('23 nov – 29 nov')).toBeTruthy();
  expect(screen.getByLabelText(/^Martes 24: Empuje/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Ir a esta semana'));
  expect(await screen.findByText('16 nov – 22 nov')).toBeTruthy();
});
