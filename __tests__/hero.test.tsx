import { fireEvent, render, screen } from '@testing-library/react-native';
import CreateProfile from '../src/app/onboarding/profile';
import { heroTargets } from '../src/lib/hero';

jest.mock('react-native-reanimated', () => {
  const { Image } = require('react-native');
  return {
    __esModule: true,
    default: { Image },
    Easing: { inOut: () => 0, cubic: 0 },
    useReducedMotion: () => false,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (v: unknown) => v,
  };
});
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => ({ db: {}, refresh: jest.fn() }) }));

describe('heroTargets', () => {
  it('sin elegir se ven los dos modelos', () => {
    expect(heroTargets(undefined)).toEqual({ both: 1, male: 0, female: 0 });
  });
  it('al elegir un modelo se muestra solo su ilustración de selección', () => {
    expect(heroTargets('male')).toEqual({ both: 0, male: 1, female: 0 });
    expect(heroTargets('female')).toEqual({ both: 0, male: 0, female: 1 });
  });
  it('el estilo es simétrico: en cada estado hay una sola capa opaca', () => {
    for (const m of [undefined, 'male', 'female'] as const) {
      const t = heroTargets(m);
      expect(t.both + t.male + t.female).toBe(1);
    }
  });
});

it('la pantalla de crear perfil se renderiza con la ilustración y permite elegir y quitar el modelo', async () => {
  await render(<CreateProfile />);
  expect(screen.getByText('Modelo de visualización 3D (opcional)')).toBeTruthy();
  expect(screen.queryByText('Quitar selección')).toBeNull();
  await fireEvent.press(screen.getByText('Femenino'));
  expect(screen.getByText('Quitar selección')).toBeTruthy();
  await fireEvent.press(screen.getByText('Quitar selección'));
  expect(screen.queryByText('Quitar selección')).toBeNull();
});
