import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PlanHistory from '../src/app/plan/history';
import { migrate } from '../src/db';
import { applyPlanOperation, getActivePlanState, listRevisions } from '../src/db/planEditing';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

const item = (id: string) => ({ exerciseVariantId: id, sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 });
const sess = (day: number, name: string) => ({ day, name, blocks: [{ type: 'single' as const, items: [item('pushup.floor')] }] });
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [sess(0, 'A'), sess(2, 'B')] });

async function seed(edit = true) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan(), null);
  if (edit) await applyPlanOperation(db, profile.id, { operationId: 'op-1', baseVersion: 1, op: { type: 'swap_sessions', a: 0, b: 2 } });
  mockApp = { db, profile };
  return { db, profile };
}

it('lista las versiones con su autor y marca la actual', async () => {
  await seed();
  await render(<PlanHistory />);
  expect(await screen.findByText('v2 · Plan actual')).toBeTruthy();
  expect(screen.getByText('Generada por ForgeFit')).toBeTruthy();
  expect(screen.getByText('Editada por ti')).toBeTruthy();
  expect(screen.queryByText('Comparar y restaurar v2')).toBeNull();
});

it('compara con el plan actual, restaura como versión nueva y se puede deshacer', async () => {
  const { db, profile } = await seed();
  await render(<PlanHistory />);
  await fireEvent.press(await screen.findByRole('button', { name: /Comparar y restaurar v1/ }));
  expect(await screen.findByText(/A: Miércoles → Lunes/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /Restaurar esta versión/ }));
  expect(await screen.findByText('Versión restaurada como v3.')).toBeTruthy();
  expect((await listRevisions(db, profile.id)).map((r) => r.revision)).toEqual([3, 2, 1]);
  expect((await getActivePlanState(db, profile.id))!.plan.sessions.map((s) => s.name)).toEqual(['A', 'B']);
  await fireEvent.press(screen.getByRole('button', { name: /Deshacer/ }));
  await waitFor(async () => expect((await listRevisions(db, profile.id)).map((r) => r.revision)).toEqual([4, 3, 2, 1]));
  expect((await getActivePlanState(db, profile.id))!.plan.sessions.map((s) => s.name)).toEqual(['B', 'A']);
});

it('sin plan guardado lo dice y no rompe', async () => {
  const db = memoryDb();
  await migrate(db);
  mockApp = { db, profile: await createProfile(db, { alias: 'Ana' }) };
  await render(<PlanHistory />);
  expect(await screen.findByText('Aún no tienes un plan guardado.')).toBeTruthy();
});
