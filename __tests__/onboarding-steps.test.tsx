import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { migrate } from '../src/db';
import { getDrafts, hasConsent, saveDraft } from '../src/db/onboarding';
import { createProfile } from '../src/db/profiles';
import { onboardingProgress, summarize, validateStep } from '../src/lib/onboarding';
import OnboardingStep from '../src/app/onboarding/[step]';
import { memoryDb } from '../test-utils/sqlite';

const mockReplace = jest.fn();
let mockApp: unknown;
let mockStep = '2';
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) }, useLocalSearchParams: () => ({ step: mockStep }) }));
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

describe('etapas 5–7 y resumen', () => {
  it('entornos: al menos uno; equipamiento y precauciones son opcionales', () => {
    expect(validateStep(5, { environments: [] }).errors.environments).toBeTruthy();
    expect(validateStep(5, { environments: ['home'] }).data).not.toBeNull();
    expect(validateStep(5, { environments: ['mars'] }).data).toBeNull();
    expect(validateStep(6, {}).data).not.toBeNull();
    expect(validateStep(7, { jointLimitations: ['elbow'], muscleLimitations: ['hamstrings'] }).data).not.toBeNull();
    expect(validateStep(7, { jointLimitations: ['hamstrings'] }).data).toBeNull(); // un músculo no es una articulación
  });
  it('summarize muestra etiquetas legibles y omite lo vacío', () => {
    expect(summarize(4, { days: [0, 2], minutes: 45 })).toEqual(['Días en que puedes entrenar: Lunes, Miércoles', 'Minutos por sesión: 45 min']);
    expect(summarize(3, { level: 'beginner' })).toEqual(['Experiencia entrenando con pesas: Principiante']);
  });
});

it('el consentimiento de IA nace desactivado y solo se registra si se marca; se revoca al desmarcar', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  mockApp = { db, profile: a };
  mockStep = '7';
  await render(<OnboardingStep />);

  await fireEvent.press(screen.getByText('Guardar y salir'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(await hasConsent(db, a.id, 'ai_plan')).toBe(false);

  await fireEvent.press(screen.getByText('Permitir proponer mi plan con IA'));
  await fireEvent.press(screen.getByText('Guardar y salir'));
  await waitFor(async () => expect(await hasConsent(db, a.id, 'ai_plan')).toBe(true));

  await fireEvent.press(screen.getByText('Permitir proponer mi plan con IA'));
  await fireEvent.press(screen.getByText('Guardar y salir'));
  await waitFor(async () => expect(await hasConsent(db, a.id, 'ai_plan')).toBe(false));
});

it('onboardingProgress cuenta las etapas guardadas y propone la primera pendiente', () => {
  expect(onboardingProgress({})).toEqual({ done: 0, total: 6, next: 2 });
  expect(onboardingProgress({ 2: {}, 3: {}, 5: {} })).toEqual({ done: 3, total: 6, next: 4 });
  expect(onboardingProgress({ 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} })).toEqual({ done: 6, total: 6, next: 8 });
});

it('etapa 6: marcar un equipo y «Guardar y salir» guarda y vuelve a Inicio; «Continuar» pasa a la 7', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  await saveDraft(db, a.id, 5, { environments: ['gym'] });
  mockApp = { db, profile: a };
  mockStep = '6';
  mockReplace.mockClear();
  await render(<OnboardingStep />);

  await fireEvent.press(await screen.findByLabelText(/^Pecho,/)); // los grupos nacen plegados
  await fireEvent.press(await screen.findByLabelText('Tengo: Banco plano fijo'));
  await fireEvent.press(screen.getByText('Guardar y salir'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect((await getDrafts(db, a.id))[6]).toEqual({});

  mockReplace.mockClear();
  await fireEvent.press(screen.getByText('Continuar'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding/7'));
});
