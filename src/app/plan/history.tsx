import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { newId } from '../../db/id';
import { getActivePlanState, getRevisionPlan, listRevisions, restoreRevision, undoLast } from '../../db/planEditing';
import { useApp } from '../../features/AppContext';
import { diffPlans } from '../../lib/planDiff';
import { Button, Card, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

type Rev = Awaited<ReturnType<typeof listRevisions>>[number];
const AUTHOR = { engine: 'Generada por ForgeFit', user: 'Editada por ti', ai: 'Editada con IA' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PlanHistory() {
  const { db, profile } = useApp();
  const [revs, setRevs] = useState<Rev[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<{ revision: number; changes: string[] } | null>(null);
  const [done, setDone] = useState<{ version: number; warnings: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [list, state] = await Promise.all([listRevisions(db, profile.id), getActivePlanState(db, profile.id)]);
      setRevs(list); setCurrent(state?.version ?? 0);
    })().catch(() => setRevs([]));
  }, [db, profile, tick]);

  async function compare(revision: number) {
    if (!profile) return;
    const [old, now] = await Promise.all([getRevisionPlan(db, profile.id, revision), getActivePlanState(db, profile.id)]);
    if (!old || !now) { setError('No se pudo cargar esa versión.'); return; }
    setError(null);
    setPicked({ revision, changes: diffPlans(now.plan, old) });
  }

  async function restore() {
    if (!profile || !picked) return;
    const r = await restoreRevision(db, profile.id, { operationId: await newId(db), revision: picked.revision, baseVersion: current }).catch(() => null);
    if (r?.status === 'applied') { setDone({ version: r.version, warnings: r.warnings.map((w) => w.message) }); setPicked(null); setError(null); reload(); return; }
    setError(r?.status === 'stale' ? 'El plan cambió mientras mirabas. Vuelve a abrir el historial.' : r?.status === 'rejected' ? r.reason : 'No se pudo restaurar. Inténtalo de nuevo.');
  }

  async function undo() {
    if (!profile || !done) return;
    const r = await undoLast(db, profile.id, { operationId: await newId(db), baseVersion: done.version }).catch(() => null);
    if (r?.status === 'applied') { setDone(null); reload(); } else setError('No se pudo deshacer la restauración.');
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text muted>← Volver</Text>
    </Pressable>
  );

  if (revs === null) return <Screen>{back}<Text muted>Cargando…</Text></Screen>;
  if (!revs.length) return <Screen>{back}<Text variant="title">Historial de versiones</Text><Text muted>Aún no tienes un plan guardado.</Text></Screen>;

  if (picked) {
    const rev = revs.find((r) => r.revision === picked.revision);
    return (
      <Screen>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver al historial" onPress={() => { setPicked(null); setError(null); }} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text muted>← Volver al historial</Text>
        </Pressable>
        <Text variant="title">Restaurar v{picked.revision}</Text>
        <Text muted>{rev ? `${AUTHOR[rev.author]} · ${when(rev.created_at)}` : ''}</Text>
        <Card style={{ gap: space.xs }}>
          <Text variant="subtitle">Lo que cambiaría respecto a tu plan actual</Text>
          {picked.changes.length ? picked.changes.map((c) => <Text key={c}>• {c}</Text>) : <Text muted>Es idéntica al plan actual.</Text>}
        </Card>
        <Text variant="caption" muted>Se creará una versión nueva; ninguna versión ni entrenamiento registrado se elimina.</Text>
        {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button label="Restaurar esta versión" icon="time-outline" onPress={restore} disabled={!picked.changes.length} />
      </Screen>
    );
  }

  return (
    <Screen>
      {back}
      <Text variant="title">Historial de versiones</Text>
      <Text muted>Consulta, compara y restaura versiones anteriores de tu plan.</Text>
      {done ? (
        <Card style={{ gap: space.sm }}>
          <Text accessibilityLiveRegion="polite">Versión restaurada como v{done.version}.</Text>
          {done.warnings.map((w) => <Text key={w} variant="caption" muted>• {w}</Text>)}
          <Button variant="secondary" label="Deshacer" icon="arrow-undo" onPress={undo} />
        </Card>
      ) : null}
      {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
      {revs.map((r) => {
        const isCurrent = r.revision === current;
        return (
          <Card key={r.revision} style={{ gap: space.xs, borderColor: isCurrent ? colors.accent : colors.border }}>
            <Text variant="subtitle">{`v${r.revision}${isCurrent ? ' · Plan actual' : ''}`}</Text>
            <Text>{AUTHOR[r.author]}</Text>
            <Text variant="caption" muted>{[r.reason, when(r.created_at)].filter(Boolean).join(' · ')}</Text>
            {isCurrent ? null : <Button variant="secondary" label={`Comparar y restaurar v${r.revision}`} onPress={() => compare(r.revision)} />}
          </Card>
        );
      })}
    </Screen>
  );
}
