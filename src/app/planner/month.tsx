import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMonth } from '../../features/useSchedule';
import { WEEKDAYS } from '../../lib/onboarding';
import type { ActionKind } from '../../lib/planner';
import { monthGrid, toDateKey, weekdayOf, type DateKey, type Instance, type ScheduleOp } from '../../lib/schedule';
import { Button, Card, Screen, Text } from '../../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../../ui/tokens';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
type Pending = { summary: string; op: ScheduleOp };

const dayLabel = (k: DateKey) => `${WEEKDAYS[weekdayOf(k)]} ${Number(k.slice(8))} de ${MONTHS[Number(k.slice(5, 7)) - 1]}`;

export default function MonthPlanner() {
  const m = useMonth();
  const today = toDateKey();
  const [selected, setSelected] = useState<DateKey | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byDate = useMemo(() => new Map((m.rows ?? []).map((r) => [r.date, r])), [m.rows]);
  const grid = useMemo(() => monthGrid(m.month), [m.month]);
  const reset = () => { setSelected(null); setAction(null); setPending(null); };
  const sel = selected ? byDate.get(selected) : undefined;
  const movable = (r?: Instance) => !!r && r.date >= today && r.status === 'scheduled';

  /** Fechas válidas como destino: mover/duplicar a un día libre, intercambiar con otra sesión; solo de hoy en adelante. */
  const isTarget = (d: DateKey) => {
    const r = byDate.get(d);
    if (!selected || !action || !r || d === selected || !movable(r)) return false;
    return action === 'swap' ? !!r.session : !r.session;
  };
  // un descanso seleccionado se completa trayendo una sesión de otra fecha
  const isSource = (d: DateKey) => !!selected && !sel?.session && d !== selected && movable(byDate.get(d)) && !!byDate.get(d)?.session;

  function pick(d: DateKey) {
    if (!selected) return;
    if (sel?.session && action && isTarget(d)) {
      const op: ScheduleOp = { type: action, from: selected, to: d };
      const verb = action === 'move' ? 'Mover' : action === 'swap' ? 'Intercambiar' : 'Duplicar';
      setPending({ op, summary: action === 'swap' ? `Intercambiar ${dayLabel(selected)} (${sel.session.name}) con ${dayLabel(d)} (${byDate.get(d)?.session?.name})` : `${verb} ${sel.session.name} de ${dayLabel(selected)} a ${dayLabel(d)}` });
    } else if (!sel?.session && isSource(d)) {
      setPending({ op: { type: 'move', from: d, to: selected }, summary: `Traer ${byDate.get(d)?.session?.name} de ${dayLabel(d)} a ${dayLabel(selected)}` });
    }
  }

  async function confirm(p: Pending) {
    setMessage(null);
    const r = await m.applyDated(p.op);
    reset();
    if (r?.status === 'applied') setDone(r.warnings.map((w) => w.message));
    else setMessage(r?.status === 'rejected' ? r.reason : 'No se pudo aplicar el cambio. Inténtalo de nuevo.');
  }

  const kinds: { kind: ActionKind; label: string }[] = [
    { kind: 'move', label: 'Mover a otra fecha' }, { kind: 'swap', label: 'Intercambiar con otra fecha' }, { kind: 'duplicate', label: 'Duplicar en otra fecha' },
  ];
  const monthIdx = Number(m.month.slice(5, 7)) - 1;

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="title">Calendario</Text>
      <Text muted>Toca una fecha para ver sus acciones. Aquí los cambios afectan solo a esa fecha.</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <Button variant="secondary" label="‹" onPress={() => { reset(); setDone(null); m.shift(-1); }} />
        <Text variant="subtitle" accessibilityLiveRegion="polite">{MONTHS[monthIdx]} {m.month.slice(0, 4)}</Text>
        <Button variant="secondary" label="›" onPress={() => { reset(); setDone(null); m.shift(1); }} />
      </View>

      {m.rows === undefined ? <Text muted>Cargando…</Text> : m.rows.length === 0 ? <Text muted>Aún no tienes un plan guardado.</Text> : (
        <>
          {selected && !pending ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="subtitle">{dayLabel(selected)}{sel?.session ? ` · ${sel.session.name}` : ' · descanso'}</Text>
              {!movable(sel) ? <Text muted>Esta fecha ya pasó o su sesión está realizada: no se puede cambiar.</Text>
                : sel?.session ? (
                  <>
                    {kinds.map(({ kind, label }) => <Button key={kind} variant={action === kind ? 'primary' : 'secondary'} label={label} onPress={() => setAction(action === kind ? null : kind)} />)}
                    {action ? <Text variant="caption" muted>Elige la fecha de destino en el calendario.</Text> : null}
                  </>
                ) : <Text muted>Toca otra fecha con sesión para traerla a este día de descanso.</Text>}
            </Card>
          ) : null}

          {pending ? (
            <Card style={{ gap: space.sm, borderColor: colors.accent }}>
              <Text variant="subtitle">Confirmar cambio</Text>
              <Text>{pending.summary}</Text>
              <Text variant="caption" muted>Solo afecta a esas fechas; tu plan semanal no cambia.</Text>
              <Button label="Aplicar a esta fecha" icon="checkmark" onPress={() => confirm(pending)} />
              <Button variant="ghost" label="Cancelar" onPress={reset} />
            </Card>
          ) : null}

          {message ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{message}</Text> : null}
          {done ? (
            <Card style={{ gap: space.sm }}>
              <Text accessibilityLiveRegion="polite">Cambio aplicado.</Text>
              {done.map((w) => <Text key={w} variant="caption" muted>• {w}</Text>)}
              <Button variant="secondary" label="Deshacer" icon="arrow-undo" onPress={async () => { await m.undoDated(); setDone(null); }} />
            </Card>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {INITIALS.map((d, i) => <View key={d} style={{ flex: 1, alignItems: 'center' }} accessibilityElementsHidden><Text variant="caption" muted>{d}</Text></View>)}
          </View>
          <View style={{ gap: 4 }}>
            {grid.map((week) => (
              <View key={week[0]} style={{ flexDirection: 'row', gap: 4 }}>
                {week.map((d) => {
                  const r = byDate.get(d);
                  const inMonth = d.slice(0, 7) === m.month.slice(0, 7);
                  const target = isTarget(d) || isSource(d);
                  const isSelected = d === selected;
                  const past = d < today;
                  return (
                    <Pressable
                      key={d} onPress={() => (target ? pick(d) : (setPending(null), setAction(null), setDone(null), setSelected(isSelected ? null : d)))}
                      disabled={!r}
                      accessibilityRole="button" accessibilityState={{ selected: isSelected, disabled: !r }}
                      accessibilityLabel={`${dayLabel(d)}: ${r?.session ? r.session.name : 'descanso'}${d === today ? ', hoy' : ''}${past ? ', pasado' : ''}${r?.status === 'completed' ? ', realizado' : ''}${target ? ', destino posible' : ''}`}
                      style={{
                        flex: 1, minHeight: MIN_TOUCH + 18, borderRadius: radius.button, alignItems: 'center', paddingVertical: 4,
                        backgroundColor: r?.session ? colors.surface : colors.surfaceAlt, opacity: inMonth ? (past ? 0.55 : 1) : 0.3,
                        borderWidth: isSelected || target ? 1.5 : 1, borderColor: isSelected || target ? colors.accent : colors.border, borderStyle: target ? 'dashed' : 'solid',
                      }}
                    >
                      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: d === today ? colors.accent : 'transparent' }}>
                        <Text variant="caption" style={{ color: d === today ? colors.onAccent : colors.text }}>{Number(d.slice(8))}</Text>
                      </View>
                      <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10, maxWidth: '100%' }}>{r?.session ? r.session.name.slice(0, 6) : ' '}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
