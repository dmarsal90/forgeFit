import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { newId } from '../../db/id';
import { applySessionEdit, getEditorContext, undoDateSessionEdit, undoLast, type SessionEditResult } from '../../db/planEditing';
import { getInstances } from '../../db/schedule';
import { useApp } from '../../features/AppContext';
import { describeItem } from '../../features/PlanView';
import { LIMITATION_LABEL, MUSCLE_IDS, WEEKDAYS } from '../../lib/onboarding';
import type { Plan, PlanSession } from '../../lib/plan';
import { newIssues, type PlanContext } from '../../lib/planValidator';
import { addableExercises, suggestReplacements } from '../../lib/replacements';
import { weekdayOf } from '../../lib/schedule';
import { applySessionOps, diffSessions, SessionOpError, type SessionOp } from '../../lib/sessionOps';
import { Button, Card, Field, Screen, Text } from '../../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../../ui/tokens';

const REST = [30, 45, 60, 90, 120, 150, 180, 240];
const RIR = [0, 1, 2, 3, 4];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type Pos = { block: number; item: number };

function Chip({ label, selected, onPress, a11y }: { label: string; selected: boolean; onPress: () => void; a11y?: string }) {
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={a11y ?? label}
      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: colors.surfaceAlt }}
    >
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = (sign: string, delta: number, name: string, disabled: boolean) => (
    <Pressable onPress={() => onChange(value + delta)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${name} ${label}`} accessibilityState={{ disabled }}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.4 : 1 }}>
      <Text variant="subtitle">{sign}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {btn('−', -1, 'Disminuir', value <= min)}
        <Text variant="subtitle" accessibilityLiveRegion="polite" style={{ minWidth: 28, textAlign: 'center' }}>{value}</Text>
        {btn('+', 1, 'Aumentar', value >= max)}
      </View>
    </View>
  );
}

export default function EditSession() {
  const { db, profile } = useApp();
  const params = useLocalSearchParams<{ day?: string; date?: string }>();
  const date = params.date;
  const day = date ? weekdayOf(date) : Number(params.day);

  const [loaded, setLoaded] = useState<{ plan: Plan; version: number; ctx: PlanContext | null; base: PlanSession | null; templateHasDay: boolean } | null | undefined>(undefined);
  const [ops, setOps] = useState<SessionOp[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Pos | null>(null);
  const [replacing, setReplacing] = useState<Pos | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ scope: 'template' | 'date'; operationId: string; version: number; warnings: string[] } | null>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const ec = await getEditorContext(db, profile.id);
      if (!ec) return setLoaded(null);
      const tplSession = ec.plan.sessions.find((s) => s.day === day) ?? null;
      let base = tplSession;
      if (date) base = (await getInstances(db, profile.id, date, date))[0]?.session ?? null;
      setLoaded({ plan: ec.plan, version: ec.version, ctx: ec.ctx, base, templateHasDay: !!tplSession });
      setName(base?.name ?? '');
    })().catch(() => setLoaded(null));
  }, [db, profile, date, day]);

  const base = loaded?.base ?? null;
  const validationCtx = loaded?.ctx ?? null;
  const allOps = useMemo<SessionOp[]>(() => (base && name.trim() && name.trim() !== base.name ? [...ops, { type: 'rename_session', name }] : ops), [ops, name, base]);
  const draft = useMemo(() => { if (!base) return null; try { return applySessionOps(base, allOps); } catch { return base; } }, [base, allOps]);
  const changes = useMemo(() => (base && draft ? diffSessions(base, draft) : []), [base, draft]);
  const issues = useMemo(() => {
    if (!base || !draft || !validationCtx) return { errors: [], warnings: [] };
    const wrap = (s: PlanSession): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [{ ...s, day }] });
    return newIssues(wrap(base), wrap(draft), validationCtx);
  }, [base, draft, validationCtx, day]);

  /** Añade una operación al borrador solo si es aplicable: si no, se explica el motivo y el borrador queda como estaba. */
  const push = useCallback((op: SessionOp) => {
    if (!base) return;
    const last = ops[ops.length - 1];
    const merge = op.type === 'update_prescription' && last?.type === 'update_prescription' && last.block === op.block && last.item === op.item;
    const next = merge ? [...ops.slice(0, -1), { ...last, ...op }] : [...ops, op];
    try { applySessionOps(base, next); } catch (e) { setError(e instanceof SessionOpError ? e.message : 'Ese cambio no es válido'); return; }
    setError(null);
    setOps(next);
  }, [base, ops]);

  async function save(scope: 'template' | 'date') {
    if (!profile || !loaded) return;
    const operationId = await newId(db);
    const target = scope === 'template' ? { kind: 'template' as const, day, baseVersion: loaded.version } : { kind: 'date' as const, date: date as string };
    const r: SessionEditResult = await applySessionEdit(db, profile.id, { operationId, ops: allOps, target }).catch(() => ({ status: 'rejected', reason: 'No se pudo guardar. Inténtalo de nuevo.', issues: [] }) as SessionEditResult);
    if (r.status === 'applied') { setSaved({ scope, operationId, version: r.version, warnings: r.warnings.map((w) => w.message) }); setError(null); return; }
    setError(r.status === 'stale' ? 'El plan cambió mientras lo editabas. Vuelve a abrir el editor.' : r.status === 'rejected' ? r.reason : 'No se pudo guardar. Inténtalo de nuevo.');
  }

  async function undo() {
    if (!profile || !saved) return;
    const r = saved.scope === 'template'
      ? await undoLast(db, profile.id, { operationId: await newId(db), baseVersion: saved.version })
      : await undoDateSessionEdit(db, profile.id, { operationId: await newId(db), undoOf: saved.operationId });
    if (r.status === 'applied') router.back(); else setError('No se pudo deshacer el cambio.');
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text muted>← Volver</Text>
    </Pressable>
  );

  if (loaded === undefined) return <Screen>{back}<Text muted>Cargando…</Text></Screen>;
  if (!loaded || !base || !draft) return <Screen>{back}<Text variant="title">Editar sesión</Text><Text muted>Esa sesión ya no existe o aún no tienes un plan guardado.</Text></Screen>;

  const sessionIds = draft.blocks.flatMap((b) => b.items.map((i) => i.exerciseVariantId));
  const ctx = loaded.ctx;

  if (saved) {
    return (
      <Screen>
        <Text variant="title">Cambios guardados</Text>
        <Card style={{ gap: space.sm }}>
          <Text accessibilityLiveRegion="polite">{saved.scope === 'template' ? 'Se aplicaron a todas las semanas de tu plan.' : `Se aplicaron solo al ${date}.`}</Text>
          {saved.warnings.map((w) => <Text key={w} variant="caption" muted>• {w}</Text>)}
        </Card>
        {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button variant="secondary" label="Deshacer" icon="arrow-undo" onPress={undo} />
        <Button label="Listo" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (reviewing) {
    return (
      <Screen>
        <Pressable accessibilityRole="button" accessibilityLabel="Seguir editando" onPress={() => setReviewing(false)} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}><Text muted>← Seguir editando</Text></Pressable>
        <Text variant="title">Revisar cambios</Text>
        <Card style={{ gap: space.xs }}>
          <Text variant="subtitle">Resumen</Text>
          {changes.length ? changes.map((c) => <Text key={c}>• {c}</Text>) : <Text muted>Sin cambios.</Text>}
        </Card>
        {issues.errors.length ? (
          <Card style={{ gap: space.xs, borderColor: colors.error }}>
            <Text variant="subtitle" style={{ color: colors.error }}>No se puede guardar</Text>
            {issues.errors.map((i) => <Text key={i.code + i.message} variant="caption">• {i.message}</Text>)}
          </Card>
        ) : null}
        {issues.warnings.length ? (
          <Card style={{ gap: space.xs }}>
            <Text variant="subtitle">Avisos</Text>
            {issues.warnings.map((i) => <Text key={i.code + i.message} variant="caption" muted>• {i.message}</Text>)}
          </Card>
        ) : null}
        {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Text muted>¿A qué quieres aplicarlo?</Text>
        {date ? <Button label="Solo esta fecha" icon="calendar-outline" disabled={issues.errors.length > 0 || !changes.length} onPress={() => save('date')} /> : null}
        <Button variant={date ? 'secondary' : 'primary'} label={`Todas las semanas (${WEEKDAYS[day]})`} icon="repeat" disabled={issues.errors.length > 0 || !changes.length || !loaded.templateHasDay} onPress={() => save('template')} />
        {!loaded.templateHasDay ? <Text variant="caption" muted>Tu plan semanal no tiene sesión los {WEEKDAYS[day].toLowerCase()}: solo se puede cambiar esta fecha.</Text> : null}
      </Screen>
    );
  }

  const row = (bi: number, ii: number, label?: string) => {
    const it = draft.blocks[bi].items[ii];
    const d = describeItem(it);
    const open = editing?.block === bi && editing.item === ii;
    const block = draft.blocks[bi];
    const nextSingle = block.type === 'single' && draft.blocks[bi + 1]?.type === 'single';
    return (
      <Card key={`${bi}-${ii}`} style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {label ? <Text variant="subtitle" style={{ color: colors.accent }}>{label}</Text> : null}
          <View style={{ flex: 1 }}>
            <Text variant="subtitle">{d.name}</Text>
            <Text variant="caption" muted>{`${it.sets} series · ${it.repRange[0]}-${it.repRange[1]} reps · ${mmss(it.restSeconds)} descanso${it.rir !== undefined ? ` · RIR ${it.rir}` : ''}`}</Text>
            {it.notes ? <Text variant="caption" muted>Nota: {it.notes}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Chip label={open ? 'Cerrar' : 'Ajustar'} selected={open} a11y={`${open ? 'Cerrar' : 'Ajustar'} ${d.name}`} onPress={() => setEditing(open ? null : { block: bi, item: ii })} />
          <Chip label="Reemplazar" selected={replacing?.block === bi && replacing.item === ii} a11y={`Reemplazar ${d.name}`} onPress={() => { setAdding(false); setReplacing(replacing?.block === bi && replacing.item === ii ? null : { block: bi, item: ii }); }} />
          {ii === 0 ? <Chip label="Subir" selected={false} a11y={`Subir ${d.name}`} onPress={() => bi > 0 && push({ type: 'reorder_exercise', from: bi, to: bi - 1 })} /> : null}
          {ii === 0 ? <Chip label="Bajar" selected={false} a11y={`Bajar ${d.name}`} onPress={() => bi < draft.blocks.length - 1 && push({ type: 'reorder_exercise', from: bi, to: bi + 1 })} /> : null}
          {block.type === 'single' ? <Chip label="Duplicar" selected={false} a11y={`Duplicar ${d.name}`} onPress={() => push({ type: 'duplicate_exercise', block: bi })} /> : null}
          {nextSingle ? <Chip label="Biserie con el siguiente" selected={false} a11y={`Agrupar ${d.name} con el siguiente en biserie`} onPress={() => push({ type: 'group_superset', block: bi })} /> : null}
          {block.type === 'superset' && ii === 0 ? <Chip label="Separar biserie" selected={false} onPress={() => push({ type: 'split_superset', block: bi })} /> : null}
          <Chip label="Quitar" selected={false} a11y={`Quitar ${d.name}`} onPress={() => { setEditing(null); setReplacing(null); push({ type: 'remove_exercise', block: bi, item: ii }); }} />
        </View>

        {open ? (
          <View style={{ gap: space.md }}>
            <Stepper label="Series" value={it.sets} min={1} max={10} onChange={(v) => push({ type: 'update_prescription', block: bi, item: ii, sets: v })} />
            <Stepper label="Repeticiones mínimas" value={it.repRange[0]} min={1} max={it.repRange[1]} onChange={(v) => push({ type: 'update_prescription', block: bi, item: ii, repRange: [v, it.repRange[1]] })} />
            <Stepper label="Repeticiones máximas" value={it.repRange[1]} min={it.repRange[0]} max={40} onChange={(v) => push({ type: 'update_prescription', block: bi, item: ii, repRange: [it.repRange[0], v] })} />
            <View style={{ gap: space.xs }}>
              <Text>Descanso</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {REST.map((s) => <Chip key={s} label={mmss(s)} selected={it.restSeconds === s} a11y={`Descanso ${mmss(s)}`} onPress={() => push({ type: 'update_prescription', block: bi, item: ii, restSeconds: s })} />)}
              </ScrollView>
            </View>
            <View style={{ gap: space.xs }}>
              <Text>Repeticiones en reserva (opcional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Chip label="Sin indicar" selected={it.rir === undefined} onPress={() => push({ type: 'update_prescription', block: bi, item: ii, rir: null })} />
                {RIR.map((r) => <Chip key={r} label={`RIR ${r}`} selected={it.rir === r} onPress={() => push({ type: 'update_prescription', block: bi, item: ii, rir: r })} />)}
              </View>
            </View>
            <Field label="Notas (opcional)" value={it.notes ?? ''} maxLength={200} onChangeText={(t) => push({ type: 'update_prescription', block: bi, item: ii, notes: t })} />
          </View>
        ) : null}

        {replacing?.block === bi && replacing.item === ii ? (
          <View style={{ gap: space.sm }}>
            <Text variant="subtitle">Reemplazos equivalentes</Text>
            {!ctx ? <Text muted>Completa tu configuración (objetivos, experiencia y disponibilidad) para ver reemplazos.</Text>
              : suggestReplacements(it.exerciseVariantId, ctx, sessionIds).map((c) => (
                <Pressable key={c.variantId} accessibilityRole="button" accessibilityLabel={`Usar ${c.exercise.es} en su lugar`}
                  onPress={() => { push({ type: 'replace_exercise', block: bi, item: ii, variantId: c.variantId }); setReplacing(null); }}
                  style={{ minHeight: MIN_TOUCH, padding: space.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}>
                  <Text>{c.exercise.es}</Text>
                  <Text variant="caption" muted>{c.variantLabel} · {c.reason}</Text>
                </Pressable>
              ))}
            {ctx && suggestReplacements(it.exerciseVariantId, ctx, sessionIds).length === 0 ? <Text muted>No hay equivalentes con tu equipo y tus precauciones.</Text> : null}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen>
      {back}
      <Text variant="title">Editar sesión</Text>
      <Text muted>{date ? `${WEEKDAYS[day]} ${date.slice(8)}` : `${WEEKDAYS[day]} (cada semana)`}. Ajusta ejercicios, series, repeticiones y descansos.</Text>
      <Field label="Nombre de la sesión" value={name} onChangeText={setName} maxLength={60} />

      {draft.blocks.map((b, bi) => b.type === 'superset' ? (
        <View key={bi} style={{ gap: space.sm, borderWidth: 1.5, borderColor: colors.accent, borderRadius: radius.card, padding: space.sm }}>
          <Text variant="caption" style={{ color: colors.accent }}>Biserie (A + B)</Text>
          {row(bi, 0, 'A')}
          {row(bi, 1, 'B')}
        </View>
      ) : row(bi, 0))}

      <Button variant="secondary" label="Añadir ejercicio" icon="add-circle-outline" onPress={() => { setReplacing(null); setAdding(!adding); }} />
      {adding ? (
        <Card style={{ gap: space.sm }}>
          <Text variant="subtitle">Añadir ejercicio</Text>
          {!ctx ? <Text muted>Completa tu configuración (objetivos, experiencia y disponibilidad) para ver ejercicios compatibles.</Text> : (
            <>
              <Field label="Buscar ejercicio" value={query} onChangeText={setQuery} autoCorrect={false} placeholder="Ej.: remo, sentadilla" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                <Chip label="Todos" selected={muscle === null} onPress={() => setMuscle(null)} />
                {MUSCLE_IDS.map((m) => <Chip key={m} label={cap(LIMITATION_LABEL[m] ?? m)} selected={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />)}
              </ScrollView>
              {addableExercises(ctx, { query, muscle: muscle ?? undefined, sessionIds }).slice(0, 25).map((c) => (
                <Pressable key={c.variantId} accessibilityRole="button" accessibilityLabel={`Añadir ${c.exercise.es}`}
                  onPress={() => { push({ type: 'add_exercise', variantId: c.variantId }); setAdding(false); setQuery(''); }}
                  style={{ minHeight: MIN_TOUCH, padding: space.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}>
                  <Text>{c.exercise.es}</Text>
                  <Text variant="caption" muted>{c.variantLabel} · {c.reason}</Text>
                </Pressable>
              ))}
            </>
          )}
        </Card>
      ) : null}

      {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button label={`Revisar cambios${changes.length ? ` (${changes.length})` : ''}`} icon="arrow-forward" disabled={changes.length === 0} onPress={() => { setEditing(null); setReplacing(null); setAdding(false); setReviewing(true); }} />
    </Screen>
  );
}
