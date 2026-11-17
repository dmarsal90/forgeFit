import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { migrate } from '../src/db';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { saveDraft } from '../src/db/onboarding';
import { getActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import Proposal from '../src/app/plan/proposal';
import { memoryDb } from '../test-utils/sqlite';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

async function withProfile(drafts: Record<number, unknown>, equipment: string[] = []) {
  const db = memoryDb();
  await migrate(db);
  const p = await createProfile(db, { alias: 'Ana' });
  for (const [step, data] of Object.entries(drafts)) await saveDraft(db, p.id, Number(step), data);
  if (equipment.length) {
    const env = await ensureEnvironment(db, p.id, 'gym');
    for (const id of equipment) await setItemState(db, env, id, 'available');
  }
  mockApp = { db, profile: p };
  return { db, p };
}
const complete = {
  2: { primaryGoal: 'muscle' }, 3: { level: 'intermediate' }, 4: { days: [0, 2, 4], minutes: 60 }, 5: { environments: ['gym'] }, 6: {}, 7: {},
};

beforeEach(() => { mockReplace.mockClear(); mockPush.mockClear(); });

it('con onboarding incompleto dice qué falta y lleva a completarlo', async () => {
  await withProfile({ 2: { primaryGoal: 'muscle' } });
  await render(<Proposal />);
  expect(await screen.findByText(/Falta completar: Tu experiencia/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Completar configuración'));
  expect(mockReplace).toHaveBeenCalledWith('/onboarding/3');
});

it('sin equipamiento indicado no genera plan: pide la etapa 6', async () => {
  await withProfile(complete);
  await render(<Proposal />);
  expect(await screen.findByText(/Falta indicar tu equipamiento/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Completar configuración'));
  expect(mockReplace).toHaveBeenCalledWith('/onboarding/6');
});

it('con datos y equipo muestra la propuesta y al aceptar guarda el plan activo', async () => {
  const { db, p } = await withProfile(complete, ['dumbbells_fixed_hex', 'bench_adjustable', 'pullup_bar_multigrip', 'leg_press_45_plate']);
  await render(<Proposal />);
  expect(await screen.findByText('Tu propuesta de plan')).toBeTruthy();
  expect(await screen.findByText('Aceptar plan')).toBeTruthy();
  expect(screen.getAllByText(/descanso \d+ s/).length).toBeGreaterThan(3);
  expect(await getActivePlan(db, p.id)).toBeNull(); // la propuesta no se guarda hasta aceptarla

  await fireEvent.press(screen.getByText('Aceptar plan'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  const saved = await getActivePlan(db, p.id);
  expect(saved?.sessions.length).toBe(3);
  expect(saved?.mode).toBe('local');
});

it('permite mover un día antes de aceptar y se guarda el plan con el cambio', async () => {
  const { db, p } = await withProfile(complete, ['dumbbells_fixed_hex', 'bench_adjustable', 'pullup_bar_multigrip', 'leg_press_45_plate']);
  await render(<Proposal />);
  await fireEvent.press((await screen.findAllByText('Cambiar de día'))[0]); // sesión del lunes
  await fireEvent.press(screen.getByLabelText(/^Miércoles, intercambiar con/));
  await fireEvent.press(screen.getByText('Aceptar plan'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  const saved = await getActivePlan(db, p.id);
  expect(saved?.sessions.map((s) => s.day)).toEqual([0, 2, 4]);
  expect(saved?.sessions.map((s) => s.name)).toEqual(['Tracción', 'Empuje', 'Piernas']); // lunes y miércoles intercambiados
});
