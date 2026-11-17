import { fireEvent, render, screen } from '@testing-library/react-native';
import Routines from '../src/app/(tabs)/routines';
import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  mockApp = { db, profile };
  return { db, profile };
}

it('sin plan ofrece generarlo en vez de decir «sin datos»', async () => {
  await setup();
  await render(<Routines />);
  expect(await screen.findByText('Generar plan')).toBeTruthy();
  expect(screen.queryByText('Sin datos todavía')).toBeNull();
});

it('con plan muestra la semana completa con los descansos y el detalle de las sesiones', async () => {
  const { db, profile } = await setup();
  await saveActivePlan(db, profile.id, {
    schemaVersion: 1, mode: 'local',
    sessions: [0, 2, 4].map((day) => ({
      day, name: 'Empuje', blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 }] }],
    })),
  }, null);
  await render(<Routines />);
  expect(await screen.findByText('Tu semana')).toBeTruthy();
  expect(screen.getAllByText('Descanso')).toHaveLength(4); // martes, jueves, sábado y domingo
  expect(screen.getByLabelText(/^Sábado \d+: descanso/)).toBeTruthy();
  expect(screen.getAllByText('Flexiones').length).toBeGreaterThan(0);
  expect(screen.getByText('Rehacer plan')).toBeTruthy();
});

it('ofrece abrir el planificador desde la semana', async () => {
  const { db, profile } = await setup();
  await saveActivePlan(db, profile.id, {
    schemaVersion: 1, mode: 'local',
    sessions: [{ day: 0, name: 'Empuje', blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 }] }] }],
  }, null);
  await render(<Routines />);
  await fireEvent.press(await screen.findByText('Planificar semana'));
  expect(mockPush).toHaveBeenCalledWith('/planner');
});
