import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getDrafts } from '../../db/onboarding';
import { useApp } from '../../features/AppContext';
import { onboardingProgress } from '../../lib/onboarding';
import { Button, EmptyState, Screen, Text } from '../../ui/components';

export default function Home() {
  const { db, profile } = useApp();
  const [progress, setProgress] = useState<ReturnType<typeof onboardingProgress> | null>(null);

  // Al volver a Inicio (p. ej. tras «Guardar y salir») se relee el progreso del perfil activo.
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    getDrafts(db, profile.id).then((d) => setProgress(onboardingProgress(d))).catch(() => setProgress(null));
  }, [db, profile]));

  const started = !!progress && progress.done > 0;
  const label = !started ? 'Configurar plan' : progress.done === progress.total ? 'Revisar mi configuración' : 'Continuar configuración';
  return (
    <Screen>
      <Text variant="display">Hola{profile ? `, ${profile.alias}` : ''}</Text>
      <EmptyState icon="flash-outline" title="Configura tu plan" body="Aún no tienes un plan. Cuando lo crees, aquí verás tu sesión de hoy y tu progreso real.">
        {started ? <Text muted accessibilityLiveRegion="polite">{progress.done} de {progress.total} etapas guardadas</Text> : null}
        <Button label={label} variant="secondary" disabled={!profile} onPress={() => router.push(`/onboarding/${started ? progress.next : 2}`)} />
      </EmptyState>
    </Screen>
  );
}
