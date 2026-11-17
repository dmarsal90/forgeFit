import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, View } from 'react-native';
import { PlannerRow, type DropHint } from '../../features/PlannerRow';
import { usePlanEditor } from '../../features/usePlanEditor';
import { useWeek } from '../../features/useSchedule';
import { WEEKDAYS } from '../../lib/onboarding';
import type { Operation } from '../../lib/planOps';
import { dropAction, dropDay, targetsFor, weekSessions, type ActionKind } from '../../lib/planner';
import { addDays, diffDays, toDateKey, weekStart, type DateKey, type ScheduleOp } from '../../lib/schedule';
import { Button, Card, Screen, Text } from '../../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../../ui/tokens';

type Pending = { summary: string; warning?: string; template: Operation; dated: ScheduleOp };
type Last = 'template' | 'dated';
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const SHORT = WEEKDAYS.map((d) => d.slice(0, 3));
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pretty = (k: DateKey) => `${Number(k.slice(8))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;

export default function Planner() {
  const editor = usePlanEditor();
  const week = useWeek();
  const [selected, setSelected] = useState<number | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [drag, setDrag] = useState<{ from: number; y: number } | null>(null);
  const [done, setDone] = useState<{ last: Last; warnings: string[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const today = toDateKey();

  const rows = week.rows;
  const dates = useMemo(() => DAYS.map((d) => addDays(week.start, d)), [week.start]);
  const plan = useMemo(() => (rows ? weekSessions(rows) : null), [rows]);
  const isPast = useCallback((d: number) => dates[d] < today, [dates, today]);
  const nameAt = useCallback((d: number) => plan?.sessions.find((s) => s.day === d)?.name ?? 'descanso', [plan]);
  const reset = () => { setSelected(null); setAction(null); setPending(null); setDrag(null); };
  const dayName = (d: number) => `${WEEKDAYS[d]} ${Number(dates[d].slice(8))}`;

  async function run(scope: 'week' | 'all', p: Pending) {
    setMessage(null);
    if (scope === 'week') {
      const r = await week.applyDated(p.dated);
      reset();
      if (r?.status === 'applied') setDone({ last: 'dated', warnings: r.warnings.map((w) => w.message) });
      else setMessage(r?.status === 'rejected' ? r.reason : 'No se pudo aplicar el cambio. Inténtalo de nuevo.');
    } else {
      const r = await editor.apply(p.template);
      await week.reload();
      reset();
      if (r?.status === 'applied') setDone({ last: 'template', warnings: r.warnings.map((w) => w.message) });
      else setMessage(r?.status === 'rejected' ? r.reason : 'No se pudo aplicar el cambio. Inténtalo de nuevo.');
    }
  }

  /** Siempre se pide confirmar y elegir el alcance (sin ninguno preseleccionado); si el destino no está disponible se avisa. */
  function request(p: Pending, to: number) {
    setDrag(null);
    const outside = !editor.allowedDays.includes(to);
    setPending({ ...p, warning: outside ? `${WEEKDAYS[to]} no está entre los días que marcaste como disponibles.` : undefined });
  }

  function choose(kind: ActionKind, from: number, to: number) {
    if (isPast(from) || isPast(to)) return;
    const [df, dt] = [dates[from], dates[to]];
    if (kind === 'swap') return request({ summary: `Intercambiar ${dayName(from)} (${nameAt(from)}) con ${dayName(to)} (${nameAt(to)})`, template: { type: 'swap_sessions', a: from, b: to }, dated: { type: 'swap', from: df, to: dt } }, to);
    if (kind === 'duplicate') return request({ summary: `Duplicar ${nameAt(from)} en ${dayName(to)}`, template: { type: 'duplicate_session', from, to }, dated: { type: 'duplicate', from: df, to: dt } }, to);
    return request({ summary: `Mover ${nameAt(from)} a ${dayName(to)}`, template: { type: 'move_session', from, to }, dated: { type: 'move', from: df, to: dt } }, to);
  }

  function changeRest(rest: number, newRest: number) {
    if (isPast(rest) || isPast(newRest)) return;
    request({
      summary: `Descansar el ${dayName(newRest)} y entrenar ${nameAt(newRest)} el ${dayName(rest)}`,
      template: { type: 'change_rest_day', rest, newRest }, dated: { type: 'move', from: dates[newRest], to: dates[rest] },
    }, rest);
  }

  function onDragEnd(from: number, translationY: number) {
    if (!plan) return;
    const to = dropDay(from, translationY);
    const kind = dropAction(plan, from, to);
    const hasSession = plan.sessions.some((s) => s.day === from);
    setDrag(null);
    if (kind === 'none') return;
    if (hasSession) return choose(kind === 'swap' ? 'swap' : 'move', from, to);
    if (kind === 'swap') changeRest(from, to); // arrastrar un descanso sobre un día con sesión = cambiar el día de descanso
  }

  const hintFor = (d: number): DropHint => {
    if (!drag || !plan) return 'none';
    const to = dropDay(drag.from, drag.y);
    return d === to && to !== drag.from ? (dropAction(plan, drag.from, to) === 'swap' ? 'swap' : 'move') : 'none';
  };

  const sel = selected !== null && plan ? plan.sessions.find((s) => s.day === selected) : undefined;
  const kinds: { kind: ActionKind; label: string }[] = [
    { kind: 'move', label: 'Mover a…' }, { kind: 'swap', label: 'Intercambiar con…' }, { kind: 'duplicate', label: 'Duplicar a…' },
  ];
  const futureTargets = (from: number, kind: ActionKind) => (plan ? targetsFor(plan, from, kind).filter((d) => !isPast(d)) : []);
  const range = `${pretty(dates[0])} – ${pretty(dates[6])}`;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Screen>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text muted>← Volver</Text>
        </Pressable>
        <Text variant="title">Planificador semanal</Text>
        <Text muted>Mantén pulsado y arrastra, o toca un día para ver las acciones.</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Button variant="secondary" label="‹" onPress={() => { reset(); setDone(null); week.shift(-1); }} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text variant="subtitle" accessibilityLiveRegion="polite">{range}</Text>
            {week.start !== weekStart(today) ? <Pressable accessibilityRole="button" onPress={() => { reset(); setDone(null); week.shift(Math.round(diffDays(week.start, weekStart(today)) / 7)); }}><Text variant="caption" style={{ color: colors.accent }}>Ir a esta semana</Text></Pressable> : <Text variant="caption" muted>Esta semana</Text>}
          </View>
          <Button variant="secondary" label="›" onPress={() => { reset(); setDone(null); week.shift(1); }} />
        </View>

        {rows === undefined ? <Text muted>Cargando…</Text> : rows.length === 0 ? <Text muted>Aún no tienes un plan guardado.</Text> : (
          <>
            {/* Confirmaciones y acciones arriba: así siempre están a la vista, sin bajar por la lista. */}
            {selected !== null && !pending ? (
              <Card style={{ gap: space.sm }}>
                <Text variant="subtitle">{dayName(selected)}{sel ? ` · ${sel.name}` : ' · descanso'}</Text>
                {sel ? (
                  <>
                    {kinds.map(({ kind, label }) => (
                      <Button key={kind} variant={action === kind ? 'primary' : 'secondary'} label={label} onPress={() => setAction(action === kind ? null : kind)} disabled={futureTargets(selected, kind).length === 0} />
                    ))}
                    {action ? <Targets targets={futureTargets(selected, action)} dates={dates} plan={plan!} nameAt={nameAt} onPick={(to) => choose(action, selected, to)} /> : null}
                  </>
                ) : (
                  <>
                    <Text muted>Mover el descanso a otro día: la sesión de ese día ocupará este.</Text>
                    <Targets targets={futureTargets(selected, 'swap')} dates={dates} plan={plan!} nameAt={nameAt} onPick={(to) => changeRest(selected, to)} />
                  </>
                )}
              </Card>
            ) : null}

            {pending ? (
              <Card style={{ gap: space.sm, borderColor: colors.accent }}>
                <Text variant="subtitle">Confirmar cambio</Text>
                <Text>{pending.summary}</Text>
                {pending.warning ? <Text variant="caption" style={{ color: colors.error }}>{pending.warning}</Text> : null}
                <Text variant="caption" muted>¿A qué quieres aplicarlo?</Text>
                <Button label="Solo esta semana" icon="calendar-outline" onPress={() => run('week', pending)} />
                <Button variant="secondary" label="Todas las semanas (tu plan)" icon="repeat" onPress={() => run('all', pending)} />
                <Button variant="ghost" label="Cancelar" onPress={reset} />
              </Card>
            ) : null}

            {message || editor.error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{message ?? editor.error}</Text> : null}
            {done ? (
              <Card style={{ gap: space.sm }}>
                <Text accessibilityLiveRegion="polite">Cambio aplicado. El resto de tu plan sigue igual.</Text>
                {done.warnings.map((w) => <Text key={w} variant="caption" muted>• {w}</Text>)}
                <Button variant="secondary" label="Deshacer" icon="arrow-undo" onPress={async () => {
                  if (done.last === 'dated') await week.undoDated(); else { await editor.undo(); await week.reload(); }
                  setDone(null);
                }} />
              </Card>
            ) : null}

            <View>
              {DAYS.map((d) => (
                <PlannerRow
                  key={dates[d]} day={d} dateNumber={Number(dates[d].slice(8))} past={isPast(d)} session={plan!.sessions.find((s) => s.day === d)} today={dates[d] === today}
                  selected={selected === d} dragOffset={drag && drag.from === d ? drag.y : null} hint={hintFor(d)}
                  onSelect={() => { setPending(null); setAction(null); setDone(null); setSelected(selected === d ? null : d); }}
                  onDragStart={() => { setSelected(null); setAction(null); setPending(null); setDone(null); setDrag({ from: d, y: 0 }); }}
                  onDragMove={(y) => setDrag((cur) => (cur ? { ...cur, y } : cur))}
                  onDragEnd={(y) => onDragEnd(d, y)}
                />
              ))}
            </View>
            <Text variant="caption" muted>«Solo esta semana» cambia únicamente estas fechas; «Todas las semanas» cambia tu plan semanal. Los días pasados y las sesiones realizadas no se pueden mover.</Text>
          </>
        )}
      </Screen>
    </GestureHandlerRootView>
  );
}

function Targets({ targets, dates, plan, nameAt, onPick }: {
  targets: number[]; dates: DateKey[]; plan: ReturnType<typeof weekSessions>; nameAt: (d: number) => string; onPick: (to: number) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {targets.map((d) => {
        const busy = plan.sessions.some((s) => s.day === d);
        return (
          <Pressable
            key={d} onPress={() => onPick(d)} accessibilityRole="button" accessibilityLabel={`${WEEKDAYS[d]} ${Number(dates[d].slice(8))}${busy ? `, ${nameAt(d)}` : ', libre'}`}
            style={{ minWidth: MIN_TOUCH + 12, minHeight: MIN_TOUCH, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}
          >
            <Text variant="caption">{SHORT[d]} {Number(dates[d].slice(8))}</Text>
            <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 70, fontSize: 10 }}>{busy ? nameAt(d) : 'libre'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
