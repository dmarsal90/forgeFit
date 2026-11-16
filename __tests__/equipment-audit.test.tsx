import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { migrate } from '../src/db';
import { getInventory, ensureEnvironment } from '../src/db/inventory';
import { saveDraft } from '../src/db/onboarding';
import { createProfile } from '../src/db/profiles';
import { EquipmentAudit } from '../src/features/EquipmentAudit';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

const noop = () => {};

it('sin entornos elegidos pide elegirlos primero', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  mockApp = { db, profile: a };
  await render(<EquipmentAudit profileId={a.id} onNext={noop} onExit={noop} onBack={noop} onPickEnvironments={noop} />);
  expect(await screen.findByText('Elegir entornos')).toBeTruthy();
});

it('busca un banco prone, lo marca como disponible y lo guarda solo en ese entorno', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  await saveDraft(db, a.id, 5, { environments: ['home', 'gym'] });
  mockApp = { db, profile: a };
  await render(<EquipmentAudit profileId={a.id} onNext={noop} onExit={noop} onBack={noop} onPickEnvironments={noop} />);

  await fireEvent.changeText(await screen.findByLabelText('Buscar equipo'), 'prone');
  expect(await screen.findByText('Banco prone o de pecho apoyado (boca abajo)')).toBeTruthy();
  expect(screen.queryByText('Banco plano fijo')).toBeNull();

  await fireEvent.press(screen.getByText('Tengo'));
  const home = await ensureEnvironment(db, a.id, 'home');
  const gym = await ensureEnvironment(db, a.id, 'gym');
  await waitFor(async () => expect(await getInventory(db, home)).toEqual({ bench_prone: 'available' }));
  expect(await getInventory(db, gym)).toEqual({});
});
