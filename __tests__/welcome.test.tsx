import { render, screen } from '@testing-library/react-native';
import Welcome from '../src/app/welcome';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

it('la bienvenida no saluda a nadie ni muestra datos', async () => {
  await render(<Welcome />);
  expect(screen.getByText('Comenzar')).toBeTruthy();
  expect(screen.queryByText(/Hola/)).toBeNull();
});
