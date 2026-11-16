import { EmptyState, Screen, Text } from '../../ui/components';

export default function ProgressScreen() {
  return (
    <Screen>
      <Text variant="title">Progreso</Text>
      <EmptyState icon="stats-chart-outline" title="Sin datos todavía" body="Aún no hay sesiones registradas. Tus métricas aparecerán cuando completes entrenamientos." />
    </Screen>
  );
}
