import { router } from 'expo-router';
import { Button, EmptyState, Screen, Text } from '../../ui/components';
import { useApp } from '../../features/AppContext';

export default function Home() {
  const { profile } = useApp();
  return (
    <Screen>
      <Text variant="display">Hola{profile ? `, ${profile.alias}` : ''}</Text>
      <EmptyState icon="flash-outline" title="Configura tu plan" body="Aún no tienes un plan. Cuando lo crees, aquí verás tu sesión de hoy y tu progreso real.">
        <Button label="Configurar plan" variant="secondary" disabled={!profile} onPress={() => router.push('/onboarding/2')} />
      </EmptyState>
    </Screen>
  );
}
