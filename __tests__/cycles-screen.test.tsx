import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Cycles from '../src/app/plan/cycles';
import { migrate } from '../src/db';
import { createCycle, getActiveCycle } from '../src/db/cycles';
import { createProfile, isRotating } from '../src/db/profiles';
import { CYCLE_TEMPLATES, blocksError, loadLabel } from '../src/lib/cycles';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

async function seed() {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  mockApp = { db, profile };
  return { db, profile };
}

it('las plantillas son ciclos válidos y la carga se etiqueta con signo', () => {
  for (const t of CYCLE_TEMPLATES) expect(blocksError(t.blocks)).toBeNull();
  expect([0.6, 1, 1.05].map(loadLabel)).toEqual(['Carga −40 %', 'Carga normal', 'Carga +5 %']);
});

it('sin ciclo ofrece plantillas; al empezar una muestra la semana 1 con sus bloques; terminar vuelve a las plantillas', async () => {
  const { db, profile } = await seed();
  await render(<Cycles />);
  expect(await screen.findByText('Hipertrofia (8 semanas)')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('Empezar este ciclo')[0]);
  expect(await screen.findByText('Semana 1 de 8 · Volumen progresivo')).toBeTruthy();
  expect(screen.getByLabelText('Semana 1 de 8')).toBeTruthy();
  expect(screen.getByLabelText('Semana 8: Descarga, Carga −40 %')).toBeTruthy();
  expect(screen.getByLabelText('Semanas 1 a 3: Volumen progresivo, Carga normal, ahora')).toBeTruthy();
  expect((await getActiveCycle(db, profile.id))?.name).toBe('Hipertrofia (8 semanas)');
  await fireEvent.press(screen.getByText('Terminar ciclo'));
  expect(await screen.findAllByText('Empezar este ciclo')).toHaveLength(CYCLE_TEMPLATES.length);
  expect(await getActiveCycle(db, profile.id)).toBeNull();
});

it('un ciclo que aún no ha empezado o ya acabó lo dice', async () => {
  const { db, profile } = await seed();
  await createCycle(db, profile.id, { name: 'Futuro', startDate: '2026-12-07', blocks: [{ weekFrom: 1, weekTo: 2, goal: 'Base', loadModifier: 1 }] });
  const view = await render(<Cycles />);
  expect(await screen.findByText('Empieza en 3 semanas')).toBeTruthy();
  view.unmount();
  await createCycle(db, profile.id, { name: 'Pasado', startDate: '2026-10-05', blocks: [{ weekFrom: 1, weekTo: 2, goal: 'Base', loadModifier: 1 }] });
  await render(<Cycles />);
  expect(await screen.findByText('Ciclo terminado')).toBeTruthy();
});

it('la rutina rotativa se activa y desactiva desde la pantalla, por perfil', async () => {
  const { db, profile } = await seed();
  const other = await createProfile(db, { alias: 'Beto' });
  await render(<Cycles />);
  const toggle = await screen.findByRole('checkbox', { name: /Rutina rotativa/ });
  expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
  await fireEvent.press(toggle);
  await waitFor(async () => expect(await isRotating(db, profile.id)).toBe(true));
  expect(await isRotating(db, other.id)).toBe(false);
  expect((await screen.findByRole('checkbox', { name: /Rutina rotativa/ })).props.accessibilityState).toMatchObject({ checked: true });
  await fireEvent.press(screen.getByRole('checkbox', { name: /Rutina rotativa/ }));
  await waitFor(async () => expect(await isRotating(db, profile.id)).toBe(false));
});
