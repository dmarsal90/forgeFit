import { router } from 'expo-router';
import { View } from 'react-native';
import { useApp } from '../../features/AppContext';
import { PlanView } from '../../features/PlanView';
import { usePlanEditor } from '../../features/usePlanEditor';
import { useWeek } from '../../features/useSchedule';
import { WEEKDAYS } from '../../lib/onboarding';
import { toDateKey } from '../../lib/schedule';
import { Button, Card, EmptyState, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

export default function RoutinesScreen() {
  const { profile } = useApp();
  const { plan } = usePlanEditor();
  const week = useWeek();

  const today = toDateKey();
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
            {(week.rows ?? []).map((r) => {
              const name = WEEKDAYS[(new Date(`${r.date}T00:00:00Z`).getUTCDay() + 6) % 7];
              const isToday = r.date === today;
              const num = Number(r.date.slice(8));
              return (
                <View key={r.date} style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityLabel={`${name} ${num}: ${r.session ? r.session.name : 'descanso'}${isToday ? ', hoy' : ''}`}>
                  <Text style={{ color: isToday ? colors.accent : colors.text }}>{name} {num}{isToday ? ' · hoy' : ''}</Text>
                  <Text muted={!r.session}>{r.session ? r.session.name : 'Descanso'}</Text>
                </View>
              );
            })}
            <Text variant="caption" muted>Los días de descanso son parte del plan y no rompen tu racha.</Text>
            <Button variant="secondary" label="Planificar semana" icon="calendar-outline" onPress={() => router.push('/planner')} />
          </Card>
          <PlanView plan={plan} onEdit={(day) => router.push({ pathname: '/plan/edit', params: { day: String(day) } })} />
          <Button variant="secondary" label="Rehacer plan" onPress={() => router.push('/plan/proposal')} />
        </>
      )}
    </Screen>
  );
}
