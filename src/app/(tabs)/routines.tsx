import { router } from 'expo-router';
import { View } from 'react-native';
import { useApp } from '../../features/AppContext';
import { PlanView } from '../../features/PlanView';
import { usePlanEditor } from '../../features/usePlanEditor';
import { WEEKDAYS } from '../../lib/onboarding';
import { todayIndex } from '../../lib/plan';
import { Button, Card, EmptyState, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

export default function RoutinesScreen() {
  const { profile } = useApp();
  const { plan, allowedDays, move, error } = usePlanEditor();

  const today = todayIndex();
  return (
    <Screen tab>
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
          {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
          <PlanView plan={plan} onMove={move} allowedDays={allowedDays} />
          <Button variant="secondary" label="Rehacer plan" onPress={() => router.push('/plan/proposal')} />
        </>
      )}
    </Screen>
  );
}
