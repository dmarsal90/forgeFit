import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { getActivePlan } from '../../db/plans';
import { useApp } from '../../features/AppContext';
import { PlanView } from '../../features/PlanView';
import type { Plan } from '../../lib/plan';
import { Button, Screen, Text } from '../../ui/components';

export default function ActivePlan() {
  const { db, profile } = useApp();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);

  useEffect(() => {
    if (!profile) return;
    getActivePlan(db, profile.id).then(setPlan).catch(() => setPlan(null));
  }, [db, profile]);

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.replace('/(tabs)')} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="title">Tu plan</Text>
      {plan === undefined ? <Text muted>Cargando…</Text> : plan === null ? <Text muted>Aún no tienes un plan guardado.</Text> : (
        <>
          <Text muted>{plan.summary}</Text>
          <PlanView plan={plan} />
        </>
      )}
      <Button variant="secondary" label={plan ? 'Rehacer plan' : 'Generar plan'} onPress={() => router.push('/plan/proposal')} />
    </Screen>
  );
}
