import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ENV_LABELS, getInventory, listEnvironments } from '../../db/inventory';
import { getDrafts } from '../../db/onboarding';
import { saveActivePlan } from '../../db/plans';
import { useApp } from '../../features/AppContext';
import { PlanView } from '../../features/PlanView';
import { onboardingProgress } from '../../lib/onboarding';
import { moveSession, type Plan } from '../../lib/plan';
import { generatePlan, inputFromDrafts } from '../../lib/planEngine';
import { Button, Card, Choice, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

type Env = { id: string; kind: keyof typeof ENV_LABELS; available: number };
type Source = { status: 'loading' } | { status: 'missing'; reasons: string[]; step: number }
  | { status: 'ready'; drafts: Record<number, unknown>; envs: Env[]; envId: string };

export default function Proposal() {
  const { db, profile } = useApp();
  const [source, setSource] = useState<Source>({ status: 'loading' });
  const [have, setHave] = useState<Set<string> | null>(null);
  const [moved, setMoved] = useState<Plan | null>(null); // plan con los días que el usuario cambió a mano
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const drafts = await getDrafts(db, profile.id);
      const base = inputFromDrafts(drafts, new Set());
      const chosen = (drafts[5] as { environments?: string[] } | undefined)?.environments ?? [];
      const envs = (await listEnvironments(db, profile.id))
        .filter((e) => chosen.includes(e.kind) && e.available + e.unavailable > 0)
        .map((e) => ({ id: e.id, kind: e.kind, available: e.available }));
      if ('reasons' in base) return setSource({ status: 'missing', reasons: base.reasons, step: onboardingProgress(drafts).next });
      if (!envs.length) return setSource({ status: 'missing', reasons: ['Falta indicar tu equipamiento (etapa 6). Si no tienes nada, usa «No tengo equipamiento».'], step: 6 });
      const best = [...envs].sort((a, b) => b.available - a.available)[0];
      setSource({ status: 'ready', drafts, envs, envId: best.id });
    })().catch(() => setSource({ status: 'missing', reasons: ['No se pudo cargar tu información.'], step: 2 }));
  }, [db, profile]);

  const envId = source.status === 'ready' ? source.envId : null;
  useEffect(() => {
    if (!envId) return;
    let live = true;
    getInventory(db, envId).then((inv) => {
      if (live) setHave(new Set(Object.entries(inv).filter(([, s]) => s === 'available').map(([id]) => id)));
    }).catch(() => live && setError('No se pudo leer tu equipamiento.'));
    return () => { live = false; setHave(null); setMoved(null); };
  }, [db, envId]);

  const result = useMemo(() => {
    if (source.status !== 'ready' || !have) return null;
    const inp = inputFromDrafts(source.drafts, have);
    return 'input' in inp ? generatePlan(inp.input) : null;
  }, [source, have]);

  const accept = useCallback(async () => {
    if (!profile || !envId || !result || result.status !== 'ok') return;
    setSaving(true);
    try { await saveActivePlan(db, profile.id, moved ?? result.plan, envId); router.replace('/(tabs)'); }
    catch { setError('No se pudo guardar el plan. Inténtalo de nuevo.'); setSaving(false); }
  }, [db, profile, envId, result, moved]);

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.replace('/(tabs)')} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text muted>← Volver</Text>
    </Pressable>
  );

  if (!profile) return null;
  if (source.status === 'loading') return <Screen>{back}<Text muted>Preparando tu propuesta…</Text></Screen>;
  if (source.status === 'missing') {
    return (
      <Screen>
        {back}
        <Text variant="title">Falta información</Text>
        <Card style={{ gap: space.xs }}>{source.reasons.map((r) => <Text key={r}>{r}</Text>)}</Card>
        <Button label="Completar configuración" onPress={() => router.replace(`/onboarding/${source.step}`)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {back}
      <Text variant="title">Tu propuesta de plan</Text>
      {source.envs.length > 1 ? (
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          <Text variant="subtitle">Entorno</Text>
          {source.envs.map((e) => (
            <Choice key={e.id} label={ENV_LABELS[e.kind]} hint={`${e.available} equipos disponibles`} selected={e.id === source.envId}
              onPress={() => setSource({ ...source, envId: e.id })} />
          ))}
        </View>
      ) : null}

      {!result ? <Text muted>Calculando…</Text> : result.status === 'insufficient' ? (
        <Card style={{ gap: space.xs }}>
          <Text variant="subtitle">No se puede generar un plan todavía</Text>
          {result.reasons.map((r) => <Text key={r}>{r}</Text>)}
        </Card>
      ) : result.status === 'invalid' ? (
        <Card style={{ gap: space.xs }}>
          <Text variant="subtitle" style={{ color: colors.error }}>No se pudo generar un plan seguro con tus datos</Text>
          {result.validation.issues.filter((i) => i.severity === 'error').map((i) => <Text key={i.path + i.code} variant="caption" muted>{i.message}</Text>)}
        </Card>
      ) : (
        <>
          <Text muted>{result.plan.summary}</Text>
          {result.plan.warnings?.length ? (
            <Card style={{ gap: space.xs }}>
              <Text variant="subtitle">Avisos</Text>
              {result.plan.warnings.map((w) => <Text key={w} variant="caption" muted>• {w}</Text>)}
            </Card>
          ) : null}
          <PlanView
            plan={moved ?? result.plan} allowedDays={source.drafts[4] ? ((source.drafts[4] as { days?: number[] }).days ?? undefined) : undefined}
            onMove={(from, to) => setMoved(moveSession(moved ?? result.plan, from, to))}
          />
          <Text variant="caption" muted>Plan generado en tu dispositivo con tu equipo confirmado. Es una propuesta: no sustituye el consejo de un profesional y puedes rehacerlo cuando quieras.</Text>
          {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button label="Aceptar plan" icon="checkmark" disabled={saving} onPress={accept} />
        </>
      )}
      <Button variant="secondary" label="Editar mis respuestas" onPress={() => router.push('/onboarding/8')} />
    </Screen>
  );
}
