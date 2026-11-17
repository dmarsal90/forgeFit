import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getProgressStats, type ProgressStats } from '../../db/stats';
import { useApp } from '../../features/AppContext';
import { Card, EmptyState, Screen, Text } from '../../ui/components';
import { space } from '../../ui/tokens';

export default function ProgressScreen() {
  const { db, profile } = useApp();
  const [stats, setStats] = useState<ProgressStats | null>(null);

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    getProgressStats(db, profile.id).then(setStats).catch(() => setStats(null));
  }, [db, profile]));

  // Sin sesiones completadas no se muestran cifras de muestra.
  if (!stats || (stats.completedTotal === 0 && stats.week.planned === 0)) {
    return (
      <Screen tab>
        <Text variant="title">Progreso</Text>
        <EmptyState icon="stats-chart-outline" title="Sin datos todavía" body="Aún no hay sesiones registradas. Tus métricas aparecerán cuando completes entrenamientos." />
      </Screen>
    );
  }
  const { streakWeeks, week, completedTotal, volumeKg, pendingOverdue } = stats;
  return (
    <Screen tab>
      <Text variant="title">Progreso</Text>
      <Card style={{ gap: space.xs }}>
        <Text variant="caption" muted>Racha</Text>
        <Text variant="title" accessibilityLabel={`${streakWeeks} semanas seguidas con el plan cumplido`}>{streakWeeks} {streakWeeks === 1 ? 'semana' : 'semanas'}</Text>
        <Text muted>Una semana cuenta cuando completas todas las sesiones que tocaban. Los descansos no la rompen.</Text>
      </Card>
      <Card style={{ gap: space.xs }}>
        <Text variant="caption" muted>Esta semana</Text>
        <Text variant="subtitle">{week.done} de {week.planned} sesiones</Text>
        <Text muted>Volumen: {volumeKg} kg (peso × repeticiones)</Text>
      </Card>
      <Card style={{ gap: space.xs }}>
        <Text variant="caption" muted>Total</Text>
        <Text variant="subtitle">{completedTotal} {completedTotal === 1 ? 'sesión completada' : 'sesiones completadas'}</Text>
        {pendingOverdue ? <Text muted>{pendingOverdue} {pendingOverdue === 1 ? 'sesión pendiente' : 'sesiones pendientes'} de semanas anteriores. Puedes retomar tu plan cuando quieras.</Text> : null}
      </Card>
    </Screen>
  );
}
