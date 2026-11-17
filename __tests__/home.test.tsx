import { render, screen } from '@testing-library/react-native';
import Home from '../src/app/(tabs)/index';
import { migrate } from '../src/db';
import { saveDraft } from '../src/db/onboarding';
import { saveActivePlan } from '../src/db/plans';
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

it('sin onboarding invita a configurar el plan', async () => {
  await setup();
  await render(<Home />);
  expect(await screen.findByText('Configurar plan')).toBeTruthy();
  expect(screen.queryByText('Generar mi plan')).toBeNull();
});

it('con las 6 etapas guardadas ofrece generar el plan', async () => {
  const { db, profile } = await setup();
  for (const n of [2, 3, 4, 5, 6, 7]) await saveDraft(db, profile.id, n, {});
  await render(<Home />);
  expect(await screen.findByText('Generar mi plan')).toBeTruthy();
  expect(screen.getByText('Configuración lista')).toBeTruthy();
});

it('con un plan activo muestra la próxima sesión y sus ejercicios, no el vacío', async () => {
  const { db, profile } = await setup();
  await saveActivePlan(db, profile.id, {
    schemaVersion: 1, mode: 'local',
    sessions: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day, name: 'Empuje', blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 }] }],
    })),
  }, null);
  await render(<Home />);
  expect(await screen.findByText('Empuje')).toBeTruthy();
  expect(screen.getByText('Flexiones')).toBeTruthy();
  expect(screen.getByText('Ver mi plan')).toBeTruthy();
  expect(screen.queryByText('Configura tu plan')).toBeNull();
});
