import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Planner from '../src/app/planner';
import { migrate } from '../src/db';
import { saveDraft } from '../src/db/onboarding';
import { getActivePlanState, listRevisions } from '../src/db/planEditing';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import type { Plan } from '../src/lib/plan';
import { dropAction, dropDay, focusOf, ROW, targetsFor } from '../src/lib/planner';
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
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [sess(0, 'Empuje', 'incline_bench_press.db'), sess(1, 'Tracción', 'db_row.standing'), sess(3, 'Piernas', 'goblet_squat.db')] });
const view = (p: Plan) => p.sessions.map((s) => `${s.day}:${s.name}`);

async function setup(days = [0, 1, 2, 3, 4]) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveDraft(db, profile.id, 4, { days, minutes: 60 });
  await saveActivePlan(db, profile.id, plan(), null);
  mockApp = { db, profile };
  return { db, profile };
}

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
    expect(targetsFor(p, 0, 'move')).toEqual([2, 4, 5, 6]);
    expect(targetsFor(p, 0, 'duplicate')).toEqual([2, 4, 5, 6]);
    expect(targetsFor(p, 0, 'swap')).toEqual([1, 3]);
    expect(dropAction(p, 0, 1)).toBe('swap');
    expect(dropAction(p, 0, 2)).toBe('move');
    expect(dropAction(p, 0, 0)).toBe('none');
  });
  it('focusOf resume los músculos principales de la sesión', () => {
    expect(focusOf(plan().sessions[0])).toEqual(expect.arrayContaining(['Pectoral', 'Deltoides']));
  });
});

it('muestra los siete días con su sesión o descanso', async () => {
  await setup();
  await render(<Planner />);
  expect(await screen.findByLabelText(/^Lunes: Empuje/)).toBeTruthy();
  expect(screen.getByLabelText(/^Martes: Tracción/)).toBeTruthy();
  expect(screen.getByLabelText(/^Miércoles: descanso/)).toBeTruthy();
  expect(screen.getByLabelText(/^Domingo: descanso/)).toBeTruthy();
});

it('intercambiar pide confirmación y, al aplicar, guarda una revisión sin tocar el resto', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Lunes: Empuje/));
  await fireEvent.press(screen.getByText('Intercambiar con…'));
  await fireEvent.press(screen.getByLabelText('Martes, Tracción'));
  expect(await screen.findByText('Confirmar cambio')).toBeTruthy();
  expect((await getActivePlanState(db, profile.id))?.version).toBe(1); // nada se aplica sin confirmar
  await fireEvent.press(screen.getByText('Aplicar cambio'));
  await waitFor(async () => expect(view((await getActivePlanState(db, profile.id))!.plan)).toEqual(['0:Tracción', '1:Empuje', '3:Piernas']));
  expect(await screen.findByText(/Cambio aplicado/)).toBeTruthy();
  expect((await listRevisions(db, profile.id)).map((r) => r.revision)).toEqual([2, 1]);
});

it('mover a un día libre disponible se aplica directamente y se puede deshacer', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Jueves: Piernas/));
  await fireEvent.press(screen.getByText('Mover a…'));
  await fireEvent.press(screen.getByLabelText('Miércoles, libre'));
  await waitFor(async () => expect(view((await getActivePlanState(db, profile.id))!.plan)).toEqual(['0:Empuje', '1:Tracción', '2:Piernas']));
  await fireEvent.press(await screen.findByText('Deshacer'));
  await waitFor(async () => expect(view((await getActivePlanState(db, profile.id))!.plan)).toEqual(['0:Empuje', '1:Tracción', '3:Piernas']));
  expect((await listRevisions(db, profile.id)).map((r) => r.revision)).toEqual([3, 2, 1]);
});

it('mover a un día no disponible pide confirmar y avisa', async () => {
  await setup([0, 1, 3]);
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Jueves: Piernas/));
  await fireEvent.press(screen.getByText('Mover a…'));
  await fireEvent.press(screen.getByLabelText('Sábado, libre'));
  expect(await screen.findByText('Confirmar cambio')).toBeTruthy();
  expect(screen.getByText(/Sábado no está entre los días que marcaste como disponibles/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancelar'));
  expect(screen.queryByText('Confirmar cambio')).toBeNull();
});

it('duplicar crea una copia en un día libre sin pisar nada', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Lunes: Empuje/));
  await fireEvent.press(screen.getByText('Duplicar a…'));
  await fireEvent.press(screen.getByLabelText('Miércoles, libre'));
  await waitFor(async () => expect(view((await getActivePlanState(db, profile.id))!.plan)).toEqual(['0:Empuje', '1:Tracción', '2:Empuje (copia)', '3:Piernas']));
});

it('un descanso se puede mover: la sesión de ese día ocupa el descanso', async () => {
  const { db, profile } = await setup();
  await render(<Planner />);
  await fireEvent.press(await screen.findByLabelText(/^Miércoles: descanso/));
  await fireEvent.press(screen.getByLabelText('Jueves, Piernas'));
  await fireEvent.press(await screen.findByText('Aplicar cambio'));
  await waitFor(async () => expect(view((await getActivePlanState(db, profile.id))!.plan)).toEqual(['0:Empuje', '1:Tracción', '2:Piernas']));
});
