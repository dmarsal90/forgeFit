import { router } from 'expo-router';
import { Button, Screen, Text } from '../../ui/components';

export default function MoreScreen() {
  return (
    <Screen tab>
      <Text variant="title">Más</Text>
      <Button label="Perfiles" icon="people-outline" variant="secondary" onPress={() => router.push('/profiles')} />
      <Text variant="caption" muted>Entornos, reloj y datos llegarán en fases posteriores.</Text>
    </Screen>
  );
}
