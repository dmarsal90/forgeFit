import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, View } from 'react-native';
import { PlannerRow, type DropHint } from '../../features/PlannerRow';
import { usePlanEditor } from '../../features/usePlanEditor';
import { WEEKDAYS } from '../../lib/onboarding';
import { todayIndex } from '../../lib/plan';
import type { Operation } from '../../lib/planOps';
import { dropAction, dropDay, targetsFor, type ActionKind } from '../../lib/planner';
import { Button, Card, Screen, Text } from '../../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../../ui/tokens';

type Pending = { op: Operation; summary: string; warning?: string };
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

export default function Planner() {
  const { plan, allowedDays, apply, undo, error, warnings } = usePlanEditor();
  const [selected, setSelected] = useState<number | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [drag, setDrag] = useState<{ from: number; y: number } | null>(null);
  const [done, setDone] = useState(false);
  const today = todayIndex();

  const nameAt = useCallback((d: number) => plan?.sessions.find((s) => s.day === d)?.name ?? 'descanso', [plan]);
  const reset = () => { setSelected(null); setAction(null); setPending(null); setDrag(null); };

  async function run(op: Operation) {
    const r = await apply(op);
    reset();
    setDone(r?.status === 'applied');
  }

  /** Pide confirmación si hay conflicto (intercambio) o el destino no está entre los días disponibles; si no, aplica. */
  function request(op: Operation, summary: string, to: number, needsConfirm: boolean) {
    setDrag(null);
    const outside = !allowedDays.includes(to);
    if (needsConfirm || outside) {
      setPending({ op, summary, warning: outside ? `${WEEKDAYS[to]} no está entre los días que marcaste como disponibles.` : undefined });
      return;
    }
    void run(op);
  }

  function choose(kind: ActionKind, from: number, to: number) {
    if (!plan) return;
    if (kind === 'swap') return request({ type: 'swap_sessions', a: from, b: to }, `Intercambiar ${WEEKDAYS[from]} (${nameAt(from)}) con ${WEEKDAYS[to]} (${nameAt(to)})`, to, true);
    if (kind === 'duplicate') return request({ type: 'duplicate_session', from, to }, `Duplicar ${nameAt(from)} en ${WEEKDAYS[to]}`, to, false);
    return request({ type: 'move_session', from, to }, `Mover ${nameAt(from)} a ${WEEKDAYS[to]}`, to, false);
  }

  function onDragEnd(from: number, translationY: number) {
    if (!plan) return;
    const to = dropDay(from, translationY);
    const kind = dropAction(plan, from, to);
    const hasSession = plan.sessions.some((s) => s.day === from);
    setDrag(null);
    if (kind === 'none') return;
    if (hasSession) return choose(kind === 'swap' ? 'swap' : 'move', from, to);
    // arrastrar un descanso sobre un día con sesión = cambiar el día de descanso
    if (kind === 'swap') request({ type: 'change_rest_day', rest: from, newRest: to }, `Descansar el ${WEEKDAYS[to]} en lugar del ${WEEKDAYS[from]}`, from, true);
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Screen>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text muted>← Volver</Text>
        </Pressable>
        <Text variant="title">Planificador semanal</Text>
        <Text muted>Organiza y reordena tus entrenamientos. Mantén pulsado y arrastra, o toca un día para ver las acciones.</Text>
        {plan === undefined ? <Text muted>Cargando…</Text> : plan === null ? <Text muted>Aún no tienes un plan guardado.</Text> : (
          <>
            {/* Confirmaciones y acciones arriba: así siempre están a la vista, sin bajar por la lista. */}
            {selected !== null && !pending ? (
              <Card style={{ gap: space.sm }}>
                <Text variant="subtitle">{WEEKDAYS[selected]}{sel ? ` · ${sel.name}` : ' · descanso'}</Text>
                {sel ? (
                  <>
                    {kinds.map(({ kind, label }) => (
                      <Button key={kind} variant={action === kind ? 'primary' : 'secondary'} label={label} onPress={() => setAction(action === kind ? null : kind)}
                        disabled={targetsFor(plan, selected, kind).length === 0} />
                    ))}
                    {action ? <Targets plan={plan} from={selected} kind={action} nameAt={nameAt} onPick={(to) => choose(action, selected, to)} /> : null}
                  </>
                ) : (
                  <>
                    <Text muted>Mover el descanso a otro día: la sesión de ese día ocupará este.</Text>
                    <Targets plan={plan} from={selected} kind="swap" nameAt={nameAt} onPick={(to) => request(
                      { type: 'change_rest_day', rest: selected, newRest: to }, `Descansar el ${WEEKDAYS[to]} en lugar del ${WEEKDAYS[selected]}`, selected, true)} />
                  </>
                )}
              </Card>
            ) : null}

            {pending ? (
              <Card style={{ gap: space.sm, borderColor: colors.accent }}>
                <Text variant="subtitle">Confirmar cambio</Text>
                <Text>{pending.summary}</Text>
                {pending.warning ? <Text variant="caption" style={{ color: colors.error }}>{pending.warning}</Text> : null}
                <Text variant="caption" muted>Se aplica a tu plan semanal, cada semana.</Text>
                <Button label="Aplicar cambio" icon="checkmark" onPress={() => run(pending.op)} />
                <Button variant="secondary" label="Cancelar" onPress={reset} />
              </Card>
            ) : null}

            {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
            {done && !error ? (
              <Card style={{ gap: space.sm }}>
                <Text accessibilityLiveRegion="polite">Cambio aplicado. El resto de tu plan sigue igual.</Text>
                {warnings.map((w) => <Text key={w.code + w.message} variant="caption" muted>• {w.message}</Text>)}
                <Button variant="secondary" label="Deshacer" icon="arrow-undo" onPress={async () => { await undo(); setDone(false); }} />
              </Card>
            ) : null}
            <View>
              {DAYS.map((d) => (
                <PlannerRow
                  key={d} day={d} session={plan.sessions.find((s) => s.day === d)} today={d === today}
                  selected={selected === d} dragOffset={drag && drag.from === d ? drag.y : null} hint={hintFor(d)}
                  onSelect={() => { setPending(null); setAction(null); setDone(false); setSelected(selected === d ? null : d); }}
                  onDragStart={() => { setSelected(null); setAction(null); setPending(null); setDone(false); setDrag({ from: d, y: 0 }); }}
                  onDragMove={(y) => setDrag((cur) => (cur ? { ...cur, y } : cur))}
                  onDragEnd={(y) => onDragEnd(d, y)}
                />
              ))}
            </View>

            <Text variant="caption" muted>Los cambios se aplican a tu plan semanal. Elegir una fecha o una semana concreta llegará con el calendario.</Text>
          </>
        )}
      </Screen>
    </GestureHandlerRootView>
  );
}

function Targets({ plan, from, kind, nameAt, onPick }: {
  plan: NonNullable<ReturnType<typeof usePlanEditor>['plan']>; from: number; kind: ActionKind; nameAt: (d: number) => string; onPick: (to: number) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {targetsFor(plan, from, kind).map((d) => (
        <Pressable
          key={d} onPress={() => onPick(d)} accessibilityRole="button"
          accessibilityLabel={`${WEEKDAYS[d]}${plan.sessions.some((s) => s.day === d) ? `, ${nameAt(d)}` : ', libre'}`}
          style={{ minWidth: MIN_TOUCH + 12, minHeight: MIN_TOUCH, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}
        >
          <Text variant="caption">{SHORT[d]}</Text>
          <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 70, fontSize: 10 }}>{plan.sessions.some((s) => s.day === d) ? nameAt(d) : 'libre'}</Text>
        </Pressable>
      ))}
    </View>
  );
}
