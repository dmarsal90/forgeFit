import { Image, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Screen, Text } from '../ui/components';
import { space } from '../ui/tokens';

export default function Welcome() {
  return (
    <Screen scroll={false} style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
        <Image source={require('../../assets/images/mark.png')} style={{ width: 120, height: 120 }} accessibilityLabel="Logotipo de ForgeFit" />
        <Text variant="display">ForgeFit</Text>
        <Text muted style={{ textAlign: 'center' }}>Tu entrenador personal de fuerza y rendimiento</Text>
      </View>
      <Button label="Comenzar" icon="arrow-forward" onPress={() => router.push('/onboarding/profile')} />
    </Screen>
  );
}
