import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Routines from '../src/app/(tabs)/routines';
import { migrate } from '../src/db';
import { saveDraft } from '../src/db/onboarding';
import { getActivePlan, saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
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
  expect(screen.getByLabelText(/^Sábado: descanso/)).toBeTruthy();
  expect(screen.getAllByText('Flexiones').length).toBeGreaterThan(0);
  expect(screen.getByText('Rehacer plan')).toBeTruthy();
});

const twoSessions = {
  schemaVersion: 1 as const, mode: 'local' as const,
  sessions: [{ day: 0, name: 'Empuje' }, { day: 2, name: 'Tracción' }].map((s) => ({
    ...s, blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 }] }],
  })),
};

it('permite mover una sesión a otro día (intercambia si está ocupado) y lo guarda', async () => {
  const { db, profile } = await setup();
  await saveActivePlan(db, profile.id, twoSessions, null);
  await render(<Routines />);
  await fireEvent.press((await screen.findAllByText('Cambiar de día'))[0]); // tarjeta del lunes
  await fireEvent.press(screen.getByLabelText('Miércoles, intercambiar con Tracción'));
  await waitFor(async () => expect((await getActivePlan(db, profile.id))?.sessions.map((s) => [s.day, s.name])).toEqual([[0, 'Tracción'], [2, 'Empuje']]));
});

it('solo deja mover a los días que el usuario marcó como disponibles', async () => {
  const { db, profile } = await setup();
  await saveDraft(db, profile.id, 4, { days: [0, 2], minutes: 60 });
  await saveActivePlan(db, profile.id, twoSessions, null);
  await render(<Routines />);
  await fireEvent.press((await screen.findAllByText('Cambiar de día'))[0]);
  const friday = screen.getByLabelText(/^Viernes.*no disponible/);
  expect(friday.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(friday);
  expect((await getActivePlan(db, profile.id))?.sessions.map((s) => s.day)).toEqual([0, 2]);
});
