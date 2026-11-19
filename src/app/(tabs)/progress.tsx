import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { getProgressStats, getStrength, type ProgressStats } from '../../db/stats';
import { useApp } from '../../features/AppContext';
import type { ExerciseStrength } from '../../lib/strength';
import { fmtWeight } from '../../lib/units';
import { Card, EmptyState, Screen, Text } from '../../ui/components';
import { colors, radius, space } from '../../ui/tokens';

export default function ProgressScreen() {
  const { db, profile } = useApp();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [strength, setStrength] = useState<ExerciseStrength[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    getProgressStats(db, profile.id).then(setStats).catch(() => setStats(null));
    getStrength(db, profile.id).then(setStrength).catch(() => setStrength([]));
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
  const { streakWeeks, week, completedTotal, volumeKg, pendingOverdue, muscles } = stats;
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
        <Text muted>Volumen: {fmtWeight(volumeKg, profile?.weightUnit ?? 'kg')} (peso × repeticiones)</Text>
      </Card>
      <Card style={{ gap: space.xs }}>
        <Text variant="caption" muted>Total</Text>
        <Text variant="subtitle">{completedTotal} {completedTotal === 1 ? 'sesión completada' : 'sesiones completadas'}</Text>
        {pendingOverdue ? <Text muted>{pendingOverdue} {pendingOverdue === 1 ? 'sesión pendiente' : 'sesiones pendientes'}. Puedes retomar tu plan cuando quieras.</Text> : null}
      </Card>
      {muscles.length ? (
        <Card style={{ gap: space.sm }}>
          <Text variant="caption" muted>Series por músculo esta semana</Text>
          {muscles.map((m) => (
            <View key={m.muscle} accessible accessibilityLabel={`${m.label}: ${m.done} de ${m.planned} series`} style={{ gap: space.xs }}>
              <Text>{m.label}: {m.done} / {m.planned}</Text>
              <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
                <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.accent, width: `${m.planned ? Math.min(100, (m.done / m.planned) * 100) : 100}%` }} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      {strength.length ? (
        <Card style={{ gap: space.xs }}>
          <Text variant="caption" muted>Fuerza (1RM estimado)</Text>
          {strength.slice(0, 10).map((x) => {
            const first = x.points[0], last = x.points[x.points.length - 1];
            const delta = last.e1rm - first.e1rm;
            const unit = profile?.weightUnit ?? 'kg';
            const fmt = (kg: number) => fmtWeight(kg, unit);
            const trend = x.points.length < 2 ? 'primer registro' : `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} desde el inicio`;
            return (
              <Pressable key={x.exerciseId} accessibilityRole="button" accessibilityState={{ expanded: open === x.exerciseId }}
                accessibilityLabel={`${x.name}: ${fmt(last.e1rm)}, ${trend}`} onPress={() => setOpen(open === x.exerciseId ? null : x.exerciseId)}
                style={{ minHeight: 48, justifyContent: 'center' }}>
                <Text variant="subtitle">{x.name}: {fmt(last.e1rm)}</Text>
                <Text muted>{trend}</Text>
                {open === x.exerciseId ? [...x.points].reverse().map((p) => (
                  <Text key={p.at} muted>{new Date(p.at).toLocaleDateString()}: {fmt(p.kg)} × {p.reps} → {fmt(p.e1rm)}</Text>
                )) : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
