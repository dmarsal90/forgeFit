import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getDrafts } from '../../db/onboarding';
import { getActivePlan } from '../../db/plans';
import { getNextInstance } from '../../db/schedule';
import { useApp } from '../../features/AppContext';
import { describeItem } from '../../features/PlanView';
import { onboardingProgress, WEEKDAYS } from '../../lib/onboarding';
import type { Plan } from '../../lib/plan';
import { toDateKey, weekdayOf, type Instance } from '../../lib/schedule';
import { Button, Card, EmptyState, Screen, Text } from '../../ui/components';
import { space } from '../../ui/tokens';

export default function Home() {
  const { db, profile } = useApp();
  const [progress, setProgress] = useState<ReturnType<typeof onboardingProgress> | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [next, setNext] = useState<Instance | null>(null);

  // Al volver a Inicio (p. ej. tras guardar o aceptar un plan) se relee el estado del perfil activo.
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    getDrafts(db, profile.id).then((d) => setProgress(onboardingProgress(d))).catch(() => setProgress(null));
    getActivePlan(db, profile.id).then(setPlan).catch(() => setPlan(null));
    getNextInstance(db, profile.id).then(setNext).catch(() => setNext(null));
  }, [db, profile]));

  const started = !!progress && progress.done > 0;
  const ready = !!progress && progress.done === progress.total;

  return (
    <Screen tab>
      <Text variant="display">Hola{profile ? `, ${profile.alias}` : ''}</Text>
      {plan && next?.session ? (
        <Card style={{ gap: space.sm }}>
          <Text variant="caption" muted>{next.date === toDateKey() ? 'Hoy' : `Próxima sesión · ${WEEKDAYS[weekdayOf(next.date)]} ${Number(next.date.slice(8))}`}</Text>
          <Text variant="title">{next.session.name}</Text>
          {next.session.blocks.flatMap((b) => b.items).slice(0, 5).map((it, i) => (
            <Text key={i} muted>{describeItem(it).name}</Text>
          ))}
          <Button label="Ver mi plan" variant="secondary" onPress={() => router.push('/plan')} />
        </Card>
      ) : (
        <EmptyState
          icon={ready ? 'checkmark-circle-outline' : 'flash-outline'}
          title={ready ? 'Configuración lista' : 'Configura tu plan'}
          body={ready
            ? 'Tus respuestas están guardadas en este dispositivo. Genera tu plan cuando quieras.'
            : 'Aún no tienes un plan. Cuando lo crees, aquí verás tu sesión de hoy y tu progreso real.'}
        >
          {started ? <Text muted accessibilityLiveRegion="polite">{progress.done} de {progress.total} etapas guardadas</Text> : null}
          {ready ? <Button label="Generar mi plan" disabled={!profile} onPress={() => router.push('/plan/proposal')} /> : null}
          <Button
            label={!started ? 'Configurar plan' : ready ? 'Revisar mi configuración' : 'Continuar configuración'}
            variant={ready ? 'secondary' : 'primary'} disabled={!profile}
            onPress={() => router.push(`/onboarding/${started ? progress.next : 2}`)}
          />
        </EmptyState>
      )}
    </Screen>
  );
}
