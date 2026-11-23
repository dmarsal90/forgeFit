import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Vibration, View } from 'react-native';
import { newId } from '../../db/id';
import { getRecords } from '../../db/stats';
import { addSet, type VariantRecord } from '../../lib/records';
import { loadPlateInfo, loadSuggestions, type PlateInfo } from '../../db/progression';
import { finishWorkout, loadReplacements, loadWorkout, recordEvent, type Workout } from '../../db/workouts';
import { useApp } from '../../features/AppContext';
import { warmupSets } from '../../lib/warmup';
import type { Candidate } from '../../lib/replacements';
import { platesPerSide, type PlateResult, type PlateStock } from '../../lib/plates';
import type { PlanSession } from '../../lib/plan';
import type { Suggestion } from '../../lib/progression';
import { fmtWeight, kgToUnit, unitToKg } from '../../lib/units';
import { describeItem } from '../../features/PlanView';
import { reduce, stepKey, stepsOf, variantOf, type Pain, type Step, type WorkoutEvent } from '../../lib/workoutMachine';
import { Button, Card, Choice, Field, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

// El cálculo de discos se rehace en cada pintado (hay un reloj que repinta cada segundo): solo se recalcula si cambian sus datos.
let lastMontage: { key: string; result: PlateResult } | null = null;
function montageFor(targetKg: number, info: { barKg: number; stock: PlateStock[] }): PlateResult {
  const key = `${targetKg}|${info.barKg}|${info.stock.map((p) => `${p.kg}x${p.pairs}`).join(',')}`;
  if (lastMontage?.key !== key) lastMontage = { key, result: platesPerSide(targetKg, info.barKg, info.stock) };
  return lastMontage.result;
}

// El plan congelado no se modifica: la variante que sustituye a otra solo cambia lo que se ve y se calcula en la sesión.
function effectiveSession(session: PlanSession, variants: Record<string, string>): PlanSession {
  return { ...session, blocks: session.blocks.map((b, bi) => ({ ...b, items: b.items.map((it, ii) => (variants[`${bi}.${ii}`] ? { ...it, exerciseVariantId: variants[`${bi}.${ii}`] } : it)) })) } as PlanSession;
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, profile } = useApp();
  const unit = profile?.weightUnit ?? 'kg';
  const [w, setW] = useState<Workout | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState<{ weight?: string; reps: string; rir: string; pain?: Pain }>({ reps: '', rir: '' }); // weight sin tocar (undefined) = el valor por defecto de la serie
  const [editing, setEditing] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sug, setSug] = useState<Record<string, Suggestion>>({});
  const [plateInfo, setPlateInfo] = useState<Record<string, PlateInfo>>({});
  const [records, setRecords] = useState<Record<string, VariantRecord> | null>(null); // null = aún sin cargar: no se avisa de récords
  const [banner, setBanner] = useState<string | null>(null);
  const [options, setOptions] = useState<Candidate[] | null>(null); // «máquina ocupada»: alternativas abiertas

  useEffect(() => { loadWorkout(db, id).then(setW).catch(() => setW(null)); }, [db, id, tick]);
  // Las sugerencias salen de las sesiones anteriores: se calculan una vez al abrir la sesión, no en cada serie.
  useEffect(() => {
    if (!profile || !w) return;
    getRecords(db, profile.id).then(setRecords).catch(() => setRecords(null));
    const eff = effectiveSession(w.session, w.state.variants); // con las sustituciones hechas en la sesión
    loadSuggestions(db, profile.id, eff, unit).then(setSug).catch(() => setSug({}));
    loadPlateInfo(db, profile.id, eff).then(setPlateInfo).catch(() => setPlateInfo({}));
  }, [db, profile, unit, w?.id, JSON.stringify(w?.state.variants)]); // eslint-disable-line react-hooks/exhaustive-deps
  // La pantalla no se apaga mientras la sesión está activa (si no, la cuenta atrás y la serie en curso se pierden de vista).
  const running = w?.state.status === 'active';
  useEffect(() => {
    if (!running) return;
    activateKeepAwakeAsync('workout').catch(() => {}); // sin soporte: la sesión sigue igual, solo se apaga la pantalla
    return () => { deactivateKeepAwake('workout').catch(() => {}); };
  }, [running]);
  // Aviso al acabar el descanso: una sola vibración por descanso (se identifica por su inicio), también si se ajusta a 0.
  const buzzed = useRef<number | null>(null);
  const liveRest = w && w.state.status === 'active' ? w.state.rest : null;
  useEffect(() => {
    if (!liveRest || buzzed.current === liveRest.startedAt || now - liveRest.startedAt < liveRest.seconds * 1000) return;
    buzzed.current = liveRest.startedAt;
    Vibration.vibrate(400);
  }, [liveRest, now]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (w === undefined) return <Screen><Text muted>Cargando…</Text></Screen>;
  if (w === null) return <Screen><Text variant="title">Sesión no encontrada</Text><Button label="Volver" onPress={() => router.replace('/')} /></Screen>;

  const planned = w.session;
  const state = reduce(planned, w.events, now); // el tiempo se recalcula de las marcas en cada pintado
  const session = effectiveSession(planned, state.variants);
  const step = editing ?? state.current;
  const item = step ? session.blocks[step.block].items[step.item] : null;
  const block = step ? session.blocks[step.block] : null;
  const steps = stepsOf(session);
  // Peso por defecto de la serie: el de la serie anterior del mismo ejercicio; en la primera, el sugerido por la progresión.
  const prevKg = step && step.round > 0 ? state.done[stepKey({ ...step, round: step.round - 1 })]?.weightKg : undefined;
  const defaultKg = prevKg ?? (step?.round === 0 && item ? (sug[item.exerciseVariantId]?.phase?.weightKg ?? sug[item.exerciseVariantId]?.weightKg) : undefined);
  const weightText = form.weight ?? (defaultKg === undefined ? '' : String(kgToUnit(defaultKg, unit)));
  // Qué discos poner por lado para el peso que hay escrito (solo con barra de peso conocido y discos indicados).
  const info = item ? plateInfo[item.exerciseVariantId] : undefined;
  const typedKg = num(weightText);
  const montage = info && 'stock' in info && typedKg !== undefined && Number.isFinite(typedKg) && typedKg > 0 ? montageFor(unitToKg(typedKg, unit), info) : null;
  const plateText = info && 'hint' in info ? info.hint : !montage ? null
    : montage.status === 'ok' ? `Por lado: ${montage.perSide.length ? montage.perSide.map((p) => `${p.count > 1 ? `${p.count}×` : ''}${p.label ?? fmtWeight(p.kg, unit)}`).join(' + ') : 'solo la barra'}`
    : montage.status === 'below_bar' ? 'Ese peso es menos que la barra.'
    : montage.status === 'impossible' ? `No se puede montar con tus discos. Más cerca: ${[montage.below, montage.above].filter((m) => m).map((m) => fmtWeight(m!.totalKg, unit)).join(' o ')}.`
    : null;
  // Calentamiento: solo antes de la primera serie de trabajo del ejercicio, hacia el peso que hay escrito.
  const stepKg = info && 'stock' in info && info.stock.length ? 2 * Math.min(...info.stock.map((p) => p.kg)) : unitToKg(unit === 'lb' ? 5 : 2.5, unit);
  const warmups = step ? state.warmups.filter((x) => x.block === step.block && x.item === step.item) : [];
  const ramp = step && !editing && step.round === 0 && typedKg !== undefined && typedKg > 0
    ? warmupSets(unitToKg(typedKg, unit), { barKg: info && 'stock' in info ? info.barKg : undefined, stepKg }) : [];
  const nextWarm = ramp[warmups.length];
  const doneCount = Object.values(state.done).filter((d) => !d.skipped).length;

  async function send(e: WorkoutEvent, eventId?: string) {
    try { await recordEvent(db, id, e, { eventId }); setError(null); setTick((t) => t + 1); }
    catch { setError('No se pudo guardar. Inténtalo de nuevo.'); }
  }

  function pick(s: Step | null) {
    const d = s ? state.done[stepKey(s)] : undefined;
    setEditing(s);
    setForm({ weight: s ? (d?.weightKg === undefined ? '' : String(kgToUnit(d.weightKg, unit))) : undefined, reps: d?.reps?.toString() ?? '', rir: d?.rir?.toString() ?? '', pain: d?.pain });
  }

  async function complete() {
    if (!step) return;
    const typed = num(weightText);
    const weightKg = typed === undefined ? undefined : unitToKg(typed, unit);
    const reps = num(form.reps), rir = num(form.rir);
    if (reps === undefined || !Number.isInteger(reps) || reps < 0 || reps > 200) { setError('Indica las repeticiones (0–200).'); return; }
    if ((weightKg !== undefined && !(weightKg >= 0 && weightKg <= 1000)) || (rir !== undefined && !(Number.isInteger(rir) && rir >= 0 && rir <= 10))) { setError(`Revisa el peso (0–${kgToUnit(1000, unit)} ${unit}) y el RIR (0–10).`); return; }
    const base = { block: step.block, item: step.item, round: step.round, weightKg, reps, rir, pain: form.pain };
    if (editing) { await send({ type: 'correct', ...base }, await newId(db)); pick(null); return; }
    await send({ type: 'set_done', ...base }, `${id}:${stepKey(step)}`);
    if (records && form.pain !== 'pain' && item) { // el récord se compara con el historial y con las series ya hechas hoy
      const vid = item.exerciseVariantId;
      const r = addSet(records[vid], { kg: weightKg, reps, at: now });
      setRecords({ ...records, [vid]: r.rec });
      setBanner(r.broken ? '¡Nuevo récord!' : null);
    } else setBanner(null);
    setForm((f) => ({ ...f, weight: undefined, reps: '', pain: undefined })); // cada serie parte de su peso por defecto; la molestia es de cada serie
  }

  // Una serie ya hecha conserva el ejercicio con el que se hizo, aunque después se sustituya.
  const exName = (s: Step) => describeItem({ ...session.blocks[s.block].items[s.item], exerciseVariantId: variantOf(planned, state.done, stepKey(s)) ?? session.blocks[s.block].items[s.item].exerciseVariantId }).name;
  const stepName = (s: Step) => describeItem(session.blocks[s.block].items[s.item]).name; // la serie que toca ahora usa la variante vigente
  const original = step ? planned.blocks[step.block].items[step.item].exerciseVariantId : null;
  async function openOptions() {
    if (!profile || !item) return;
    try { setOptions(await loadReplacements(db, profile.id, item.exerciseVariantId, session.blocks.flatMap((b) => b.items.map((i) => i.exerciseVariantId)))); }
    catch { setError('No se pudieron cargar las alternativas.'); }
  }
  async function substitute(variantId: string) {
    if (!step) return;
    await send({ type: 'substitute', block: step.block, item: step.item, variantId });
    setOptions(null);
    setForm((f) => ({ ...f, weight: undefined })); // el peso por defecto es el del nuevo ejercicio
  }
  const header = <Text variant="title">{session.name}</Text>;

  if (state.status === 'finished') {
    const volume = Object.values(state.done).reduce((a, d) => a + (d.skipped ? 0 : (d.weightKg ?? 0) * (d.reps ?? 0)), 0);
    return (
      <Screen>
        {header}
        <Card style={{ gap: space.xs }}>
          <Text variant="subtitle" accessibilityLiveRegion="polite">Sesión terminada</Text>
          <Text>Tiempo activo: {mmss(state.activeMs)}</Text>
          <Text>Series completadas: {doneCount} de {steps.length}</Text>
          <Text>Volumen (peso × repeticiones): {Math.round(kgToUnit(volume, unit))} {unit}</Text>
        </Card>
        <Button label="Volver al inicio" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const rest = state.status === 'active' ? state.rest : null;
  const remaining = rest ? rest.seconds * 1000 - (now - rest.startedAt) : 0;

  return (
    <Screen>
      {header}
      <Text muted accessibilityLabel={`Tiempo activo ${mmss(state.activeMs)}`}>{state.status === 'paused' ? 'En pausa · ' : ''}{mmss(state.activeMs)} · {doneCount}/{steps.length} series</Text>
      {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}

      {state.status === 'paused' ? (
        <Button label="Reanudar" icon="play" onPress={() => send({ type: 'resume' })} />
      ) : (
        <>
          {banner ? <Text variant="subtitle" accessibilityLiveRegion="polite" style={{ color: colors.accent }}>{banner}</Text> : null}
          {rest ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="subtitle" accessibilityLiveRegion="polite">{remaining > 0 ? `Descanso ${mmss(remaining)}` : 'Descanso terminado'}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}><Button variant="secondary" label="Quitar 15 s" onPress={() => send({ type: 'rest_adjust', seconds: -15 })} /></View>
                <View style={{ flex: 1 }}><Button variant="secondary" label="Añadir 15 s" onPress={() => send({ type: 'rest_adjust', seconds: 15 })} /></View>
              </View>
              <Button variant="secondary" label="Saltar descanso" onPress={() => send({ type: 'rest_end' })} />
            </Card>
          ) : null}

          {step && item && block ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="caption" muted>
                {editing ? 'Corregir serie · ' : ''}{block.type === 'superset' ? `Biserie · ${step.item === 0 ? 'A1' : 'A2'} · ronda ${step.round + 1}` : `Serie ${step.round + 1} de ${item.sets}`}
              </Text>
              <Text variant="title">{stepName(step)}</Text>
              <Text muted>{item.repRange[0]}-{item.repRange[1]} repeticiones{item.rir !== undefined ? ` · RIR ${item.rir}` : ''}</Text>
              {!editing && sug[item.exerciseVariantId] && sug[item.exerciseVariantId].kind !== 'none' ? (
                <View style={{ gap: space.xs }} accessible accessibilityLabel={`Sugerencia: ${sug[item.exerciseVariantId].message} ${sug[item.exerciseVariantId].reason}${sug[item.exerciseVariantId].phase ? ` ${sug[item.exerciseVariantId].phase!.text}` : ''}`}>
                  <Text variant="subtitle">Sugerencia: {sug[item.exerciseVariantId].message}</Text>
                  <Text variant="caption" muted>{sug[item.exerciseVariantId].reason}</Text>
                  {sug[item.exerciseVariantId].phase ? <Text>{sug[item.exerciseVariantId].phase!.text}</Text> : null}
                </View>
              ) : null}
              <Field label={`Peso (${unit})`} keyboardType="decimal-pad" value={weightText} onChangeText={(v) => setForm((f) => ({ ...f, weight: v }))} />
              {plateText ? <Text accessibilityLiveRegion="polite" muted={montage?.status !== 'ok'}>{plateText}</Text> : null}
              {ramp.length ? (
                <View style={{ gap: space.xs }}>
                  <Text variant="subtitle">Calentamiento</Text>
                  {ramp.map((r, n) => (
                    <Text key={n} muted={n >= warmups.length} accessibilityLabel={`Calentamiento ${n + 1}: ${fmtWeight(r.weightKg, unit)} por ${r.reps} repeticiones${n < warmups.length ? ', hecho' : ''}`}>
                      {n < warmups.length ? '✓ ' : ''}{fmtWeight(r.weightKg, unit)} × {r.reps}
                    </Text>
                  ))}
                  {nextWarm ? <Button variant="secondary" label={`Calentamiento ${warmups.length + 1} hecho`} onPress={() => send({ type: 'warmup', block: step!.block, item: step!.item, weightKg: nextWarm.weightKg, reps: nextWarm.reps }, `${id}:w${step!.block}.${step!.item}.${warmups.length}`)} /> : null}
                </View>
              ) : null}
              <Field label="Repeticiones" keyboardType="number-pad" value={form.reps} onChangeText={(v) => setForm((f) => ({ ...f, reps: v }))} />
              <Field label="RIR (opcional)" keyboardType="number-pad" value={form.rir} onChangeText={(v) => setForm((f) => ({ ...f, rir: v }))} />
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: space.sm }}>
                {([['discomfort', 'Molestia'], ['pain', 'Dolor']] as const).map(([value, label]) => (
                  <View key={value} style={{ flex: 1 }}>
                    <Choice label={label} selected={form.pain === value} onPress={() => setForm((f) => ({ ...f, pain: f.pain === value ? undefined : value }))} />
                  </View>
                ))}
              </View>
              {!editing ? (
                <>
                  <Button variant="ghost" label="Máquina ocupada" onPress={() => (options ? setOptions(null) : openOptions())} />
                  {options ? (
                    <View style={{ gap: space.xs }}>
                      {original && item.exerciseVariantId !== original ? <Button variant="secondary" label={`Volver a ${describeItem({ ...item, exerciseVariantId: original }).name}`} onPress={() => substitute(original)} /> : null}
                      {options.length ? options.map((c) => (
                        <View key={c.variantId} style={{ gap: space.xs }}>
                          <Button variant="secondary" label={`Usar ${c.exercise.es} · ${c.variantLabel}`} onPress={() => substitute(c.variantId)} />
                          <Text variant="caption" muted>{c.reason}</Text>
                        </View>
                      )) : <Text muted>No hay alternativas con tu equipo.</Text>}
                    </View>
                  ) : null}
                </>
              ) : null}
              <Button label={editing ? 'Guardar corrección' : 'Completar serie'} icon="checkmark" onPress={complete} />
              {editing
                ? <Button variant="ghost" label="Cancelar corrección" onPress={() => pick(null)} />
                : <Button variant="ghost" label="Saltar serie" onPress={() => send({ type: 'skip', block: step.block, item: step.item, round: step.round }, `${id}:${stepKey(step)}`)} />}
            </Card>
          ) : (
            <Card style={{ gap: space.sm }}>
              <Text variant="subtitle">Completaste todas las series</Text>
              <Button label="Terminar sesión" icon="flag" onPress={() => finishWorkout(db, id).then(() => setTick((t) => t + 1)).catch(() => setError('No se pudo terminar la sesión.'))} />
            </Card>
          )}
          <Button variant="secondary" label="Pausar" icon="pause" onPress={() => send({ type: 'pause' })} />
        </>
      )}

      {steps.filter((s) => state.done[stepKey(s)]).map((s) => {
        const d = state.done[stepKey(s)];
        return (
          <View key={stepKey(s)} style={{ gap: space.xs }}>
            <Text>{exName(s)} · serie {s.round + 1}: {d.skipped ? 'saltada' : `${d.weightKg === undefined ? '–' : fmtWeight(d.weightKg, unit)} × ${d.reps ?? '–'}${d.corrected ? ' (corregida)' : ''}`}</Text>
            {state.status === 'active' && !editing ? <Button variant="ghost" label={`Corregir ${exName(s)} serie ${s.round + 1}`} onPress={() => pick(s)} /> : null}
          </View>
        );
      })}
      {state.status === 'active' && state.current ? <Button variant="ghost" label="Terminar sesión ahora" onPress={() => finishWorkout(db, id).then(() => setTick((t) => t + 1)).catch(() => setError('No se pudo terminar la sesión.'))} /> : null}
    </Screen>
  );
}
