import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { PlanView } from '../../features/PlanView';
import { usePlanEditor } from '../../features/usePlanEditor';
import { Button, Screen, Text } from '../../ui/components';
import { colors } from '../../ui/tokens';

export default function ActivePlan() {
  const { plan, allowedDays, move, error } = usePlanEditor();

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.replace('/(tabs)')} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="title">Tu plan</Text>
      {plan === undefined ? <Text muted>Cargando…</Text> : plan === null ? <Text muted>Aún no tienes un plan guardado.</Text> : (
        <>
          <Text muted>{plan.summary}</Text>
          <Text variant="caption" muted>Puedes cambiar una sesión de día; se guarda al instante.</Text>
          {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
          <PlanView plan={plan} onMove={move} allowedDays={allowedDays} />
        </>
      )}
      <Button variant="secondary" label={plan ? 'Rehacer plan' : 'Generar plan'} onPress={() => router.push('/plan/proposal')} />
    </Screen>
  );
}
