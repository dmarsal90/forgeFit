import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { migrate } from '../src/db';
import { getDrafts } from '../src/db/onboarding';
import { createProfile } from '../src/db/profiles';
import { validateStep } from '../src/lib/onboarding';
import OnboardingStep from '../src/app/onboarding/[step]';
import { memoryDb } from '../test-utils/sqlite';

const mockReplace = jest.fn();
let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) }, useLocalSearchParams: () => ({ step: '2' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

describe('validación de etapas', () => {
  it('objetivos: el principal es obligatorio y no puede repetirse como secundario', () => {
    expect(validateStep(2, {}).errors.primaryGoal).toBeTruthy();
    expect(validateStep(2, { primaryGoal: 'strength', secondaryGoals: ['strength'] }).errors.secondaryGoals).toBeTruthy();
    expect(validateStep(2, { primaryGoal: 'strength', secondaryGoals: ['muscle'] }).data).not.toBeNull();
  });
  it('experiencia: el nivel es obligatorio, la técnica no', () => {
    expect(validateStep(3, {}).errors.level).toBeTruthy();
    expect(validateStep(3, { level: 'beginner' }).data).toEqual({ level: 'beginner' });
  });
  it('disponibilidad: pide al menos un día y un tiempo válido', () => {
    expect(validateStep(4, { days: [], minutes: 45 }).errors.days).toBeTruthy();
    expect(validateStep(4, { days: [0], minutes: 5 }).errors.minutes).toBeTruthy();
    expect(validateStep(4, { days: [0, 2], minutes: 45 }).data).not.toBeNull();
  });
});

it('guarda el borrador solo del perfil activo y avanza; sin elegir no guarda nada', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  mockApp = { db, profile: a };
  await render(<OnboardingStep />);

  await fireEvent.press(screen.getByText('Continuar'));
  expect(await screen.findByText('Elige un objetivo principal')).toBeTruthy();
  expect(await getDrafts(db, a.id)).toEqual({});

  await fireEvent.press(screen.getAllByText('Ganar fuerza')[0]);
  await fireEvent.press(screen.getByText('Continuar'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding/3'));
  expect(await getDrafts(db, a.id)).toEqual({ 2: { primaryGoal: 'strength' } });
  expect(await getDrafts(db, b.id)).toEqual({});
});
