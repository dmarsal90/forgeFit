import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { getActivePlan } from '../../db/plans';
import { useApp } from '../../features/AppContext';
import { PlanView } from '../../features/PlanView';
import { WEEKDAYS } from '../../lib/onboarding';
import { todayIndex, type Plan } from '../../lib/plan';
import { Button, Card, EmptyState, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

export default function RoutinesScreen() {
  const { db, profile } = useApp();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    getActivePlan(db, profile.id).then(setPlan).catch(() => setPlan(null));
  }, [db, profile]));

  const today = todayIndex();
  return (
    <Screen>
      <Text variant="title">Rutinas</Text>
      {plan === undefined ? null : plan === null ? (
        <EmptyState icon="calendar-outline" title="Aún no tienes un plan" body="Genera uno con tus respuestas y verás aquí tus días de entrenamiento y descanso.">
          <Button label="Generar plan" disabled={!profile} onPress={() => router.push('/plan/proposal')} />
        </EmptyState>
      ) : (
        <>
          <Card style={{ gap: space.sm }}>
            <Text variant="subtitle">Tu semana</Text>
            {WEEKDAYS.map((name, day) => {
              const s = plan.sessions.find((x) => x.day === day);
              return (
                <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityLabel={`${name}: ${s ? s.name : 'descanso'}${day === today ? ', hoy' : ''}`}>
                  <Text style={{ color: day === today ? colors.accent : colors.text }}>{name}{day === today ? ' · hoy' : ''}</Text>
                  <Text muted={!s}>{s ? s.name : 'Descanso'}</Text>
                </View>
              );
            })}
            <Text variant="caption" muted>Los días de descanso son parte del plan y no rompen tu racha.</Text>
          </Card>
          <PlanView plan={plan} />
          <Button variant="secondary" label="Rehacer plan" onPress={() => router.push('/plan/proposal')} />
        </>
      )}
    </Screen>
  );
}
