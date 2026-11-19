import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { newId } from '../../db/id';
import { finishWorkout, loadWorkout, recordEvent, type Workout } from '../../db/workouts';
import { useApp } from '../../features/AppContext';
import { fmtWeight, kgToUnit, unitToKg } from '../../lib/units';
import { describeItem } from '../../features/PlanView';
import { reduce, stepKey, stepsOf, type Step, type WorkoutEvent } from '../../lib/workoutMachine';
import { Button, Card, Field, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, profile } = useApp();
  const unit = profile?.weightUnit ?? 'kg';
  const [w, setW] = useState<Workout | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ weight: '', reps: '', rir: '' });
  const [editing, setEditing] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadWorkout(db, id).then(setW).catch(() => setW(null)); }, [db, id, tick]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (w === undefined) return <Screen><Text muted>Cargando…</Text></Screen>;
  if (w === null) return <Screen><Text variant="title">Sesión no encontrada</Text><Button label="Volver" onPress={() => router.replace('/')} /></Screen>;

  const { session } = w;
  const state = reduce(session, w.events, now); // el tiempo se recalcula de las marcas en cada pintado
  const step = editing ?? state.current;
  const item = step ? session.blocks[step.block].items[step.item] : null;
  const block = step ? session.blocks[step.block] : null;
  const steps = stepsOf(session);
  const doneCount = Object.values(state.done).filter((d) => !d.skipped).length;

  async function send(e: WorkoutEvent, eventId?: string) {
    try { await recordEvent(db, id, e, { eventId }); setError(null); setTick((t) => t + 1); }
    catch { setError('No se pudo guardar. Inténtalo de nuevo.'); }
  }

  function pick(s: Step | null) {
    const d = s ? state.done[stepKey(s)] : undefined;
    setEditing(s);
    setForm({ weight: d?.weightKg === undefined ? '' : String(kgToUnit(d.weightKg, unit)), reps: d?.reps?.toString() ?? '', rir: d?.rir?.toString() ?? '' });
  }

  async function complete() {
    if (!step) return;
    const typed = num(form.weight);
    const weightKg = typed === undefined ? undefined : unitToKg(typed, unit);
    const reps = num(form.reps), rir = num(form.rir);
    if (reps === undefined || !Number.isInteger(reps) || reps < 0 || reps > 200) { setError('Indica las repeticiones (0–200).'); return; }
    if ((weightKg !== undefined && !(weightKg >= 0 && weightKg <= 1000)) || (rir !== undefined && !(Number.isInteger(rir) && rir >= 0 && rir <= 10))) { setError(`Revisa el peso (0–${kgToUnit(1000, unit)} ${unit}) y el RIR (0–10).`); return; }
    const base = { block: step.block, item: step.item, round: step.round, weightKg, reps, rir };
    if (editing) { await send({ type: 'correct', ...base }, await newId(db)); pick(null); return; }
    await send({ type: 'set_done', ...base }, `${id}:${stepKey(step)}`);
    setForm((f) => ({ ...f, reps: '' })); // el peso se conserva para la serie siguiente
  }

  const exName = (s: Step) => describeItem(session.blocks[s.block].items[s.item]).name;
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
          {rest ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="subtitle" accessibilityLiveRegion="polite">{remaining > 0 ? `Descanso ${mmss(remaining)}` : 'Descanso terminado'}</Text>
              <Button variant="secondary" label="Saltar descanso" onPress={() => send({ type: 'rest_end' })} />
            </Card>
          ) : null}

          {step && item && block ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="caption" muted>
                {editing ? 'Corregir serie · ' : ''}{block.type === 'superset' ? `Biserie · ${step.item === 0 ? 'A1' : 'A2'} · ronda ${step.round + 1}` : `Serie ${step.round + 1} de ${item.sets}`}
              </Text>
              <Text variant="title">{exName(step)}</Text>
              <Text muted>{item.repRange[0]}-{item.repRange[1]} repeticiones{item.rir !== undefined ? ` · RIR ${item.rir}` : ''}</Text>
              <Field label={`Peso (${unit})`} keyboardType="decimal-pad" value={form.weight} onChangeText={(v) => setForm((f) => ({ ...f, weight: v }))} />
              <Field label="Repeticiones" keyboardType="number-pad" value={form.reps} onChangeText={(v) => setForm((f) => ({ ...f, reps: v }))} />
              <Field label="RIR (opcional)" keyboardType="number-pad" value={form.rir} onChangeText={(v) => setForm((f) => ({ ...f, rir: v }))} />
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
