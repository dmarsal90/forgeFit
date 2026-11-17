import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MonthPlanner from '../src/app/planner/month';
import { migrate } from '../src/db';
import { getActivePlanState } from '../src/db/planEditing';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { getInstances } from '../src/db/schedule';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

const sess = (day: number, name: string) => ({
  day, name, blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 }] }],
});
// hoy = martes 17 de noviembre de 2026; sesiones: martes Empuje, miércoles Tracción, viernes Piernas
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [sess(1, 'Empuje'), sess(2, 'Tracción'), sess(4, 'Piernas')] });

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan(), null);
  mockApp = { db, profile };
  return { db, profile };
}
const nov = async (db: ReturnType<typeof memoryDb>, profileId: string) =>
  (await getInstances(db, profileId, '2026-11-23', '2026-11-29', '2026-11-17')).map((r) => `${r.date.slice(8)}:${r.session?.name ?? '-'}`);

beforeAll(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 17, 10, 0), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterAll(() => jest.useRealTimers());

it('muestra el mes con hoy, el pasado, las sesiones y los descansos', async () => {
  await setup();
  await render(<MonthPlanner />);
  expect(await screen.findByText('noviembre 2026')).toBeTruthy();
  expect(screen.getByLabelText(/^Martes 17 de noviembre: Empuje, hoy/)).toBeTruthy();
  expect(screen.getByLabelText(/^Lunes 16 de noviembre: descanso, pasado/)).toBeTruthy();
  expect(screen.getByLabelText(/^Viernes 27 de noviembre: Piernas/)).toBeTruthy();
});

it('mover a una fecha libre afecta solo a esa fecha y se puede deshacer', async () => {
  const { db, profile } = await setup();
  await render(<MonthPlanner />);
  await fireEvent.press(await screen.findByLabelText(/^Martes 24 de noviembre: Empuje/));
  await fireEvent.press(screen.getByText('Mover a otra fecha'));
  await fireEvent.press(screen.getByLabelText(/^Jueves 26 de noviembre: descanso.*destino posible/));
  expect(await screen.findByText('Confirmar cambio')).toBeTruthy();
  expect(await nov(db, profile.id)).toEqual(['23:-', '24:Empuje', '25:Tracción', '26:-', '27:Piernas', '28:-', '29:-']); // nada sin confirmar
  await fireEvent.press(screen.getByText('Aplicar a esta fecha'));
  await waitFor(async () => expect(await nov(db, profile.id)).toEqual(['23:-', '24:-', '25:Tracción', '26:Empuje', '27:Piernas', '28:-', '29:-']));
  expect((await getActivePlanState(db, profile.id))?.version).toBe(1); // el plan semanal no cambia
  await fireEvent.press(await screen.findByText('Deshacer'));
  await waitFor(async () => expect(await nov(db, profile.id)).toEqual(['23:-', '24:Empuje', '25:Tracción', '26:-', '27:Piernas', '28:-', '29:-']));
});

it('intercambiar solo ofrece como destino otras fechas con sesión', async () => {
  const { db, profile } = await setup();
  await render(<MonthPlanner />);
  await fireEvent.press(await screen.findByLabelText(/^Martes 24 de noviembre: Empuje/));
  await fireEvent.press(screen.getByText('Intercambiar con otra fecha'));
  expect(screen.queryByLabelText(/^Jueves 26 de noviembre.*destino posible/)).toBeNull(); // libre: no vale para intercambiar
  await fireEvent.press(screen.getByLabelText(/^Miércoles 25 de noviembre: Tracción.*destino posible/));
  await fireEvent.press(await screen.findByText('Aplicar a esta fecha'));
  await waitFor(async () => expect(await nov(db, profile.id)).toEqual(['23:-', '24:Tracción', '25:Empuje', '26:-', '27:Piernas', '28:-', '29:-']));
});

it('un descanso se completa trayendo una sesión de otra fecha', async () => {
  const { db, profile } = await setup();
  await render(<MonthPlanner />);
  await fireEvent.press(await screen.findByLabelText(/^Jueves 26 de noviembre: descanso/));
  await fireEvent.press(screen.getByLabelText(/^Viernes 27 de noviembre: Piernas.*destino posible/));
  expect(await screen.findByText(/Traer Piernas/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Aplicar a esta fecha'));
  await waitFor(async () => expect(await nov(db, profile.id)).toEqual(['23:-', '24:Empuje', '25:Tracción', '26:Piernas', '27:-', '28:-', '29:-']));
});

it('el pasado y las sesiones realizadas no se pueden cambiar', async () => {
  const { db, profile } = await setup();
  await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-24'");
  await render(<MonthPlanner />);
  await fireEvent.press(await screen.findByLabelText(/^Lunes 16 de noviembre/));
  expect(await screen.findByText(/ya pasó o su sesión está realizada/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(/^Martes 24 de noviembre: Empuje.*realizado/));
  expect(screen.getByText(/ya pasó o su sesión está realizada/)).toBeTruthy();
  expect(screen.queryByText('Mover a otra fecha')).toBeNull();
  expect(await nov(db, profile.id)).toContain('24:Empuje');
});

it('se puede navegar entre meses', async () => {
  await setup();
  await render(<MonthPlanner />);
  await fireEvent.press(await screen.findByText('›'));
  expect(await screen.findByText('diciembre 2026')).toBeTruthy();
  await fireEvent.press(screen.getByText('‹'));
  await fireEvent.press(screen.getByText('‹'));
  expect(await screen.findByText('octubre 2026')).toBeTruthy();
});
