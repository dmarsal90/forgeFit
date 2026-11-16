import { EmptyState, Screen, Text } from '../../ui/components';

export default function RoutinesScreen() {
  return (
    <Screen>
      <Text variant="title">Rutinas</Text>
      <EmptyState icon="calendar-outline" title="Sin datos todavía" body="Cuando tengas un plan, verás aquí tus días de entrenamiento y descanso." />
    </Screen>
  );
}
