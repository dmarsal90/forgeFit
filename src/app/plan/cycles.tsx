import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { createCycle, endActiveCycle, getActiveCycle, type Cycle } from '../../db/cycles';
import { useApp } from '../../features/AppContext';
import { CYCLE_TEMPLATES, cyclePosition, loadLabel } from '../../lib/cycles';
import { toDateKey } from '../../lib/schedule';
import { Button, Card, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

export default function Cycles() {
  const { db, profile } = useApp();
  const [cycle, setCycle] = useState<Cycle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!profile) return;
    getActiveCycle(db, profile.id).then(setCycle, () => setCycle(null));
  }, [db, profile, tick]);

  async function act(run: () => Promise<unknown>) {
    try { await run(); setError(null); setTick((t) => t + 1); } catch { setError('No se pudo guardar. Inténtalo de nuevo.'); }
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text muted>← Volver</Text>
    </Pressable>
  );
  if (cycle === undefined) return <Screen>{back}<Text muted>Cargando…</Text></Screen>;

  const pos = cycle ? cyclePosition(cycle.startDate, cycle.blocks, toDateKey()) : null;
  const total = cycle ? cycle.blocks[cycle.blocks.length - 1].weekTo : 0;
  const week = pos?.state === 'running' ? pos.week : 0;
  return (
    <Screen>
      {back}
      <Text variant="title">Periodización</Text>
      {cycle && pos ? (
        <>
          <Card style={{ gap: space.sm }}>
            <Text variant="subtitle">{cycle.name}</Text>
            <Text accessibilityLiveRegion="polite">
              {pos.state === 'running' ? `Semana ${pos.week} de ${pos.total} · ${pos.block.goal}` : pos.state === 'upcoming' ? `Empieza en ${pos.startsIn} ${pos.startsIn === 1 ? 'semana' : 'semanas'}` : 'Ciclo terminado'}
            </Text>
            <View accessible accessibilityRole="progressbar" accessibilityLabel={`Semana ${week} de ${total}`} style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: total }, (_, i) => <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < week ? colors.accent : colors.border }} />)}
            </View>
            {cycle.blocks.map((b) => {
              const current = pos.state === 'running' && b.weekFrom <= pos.week && pos.week <= b.weekTo;
              return (
                <View key={b.weekFrom} accessible accessibilityLabel={`${b.weekFrom === b.weekTo ? `Semana ${b.weekFrom}` : `Semanas ${b.weekFrom} a ${b.weekTo}`}: ${b.goal}, ${loadLabel(b.loadModifier)}${current ? ', ahora' : ''}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: current ? colors.accent : colors.text }}>{b.weekFrom === b.weekTo ? `Semana ${b.weekFrom}` : `Semanas ${b.weekFrom}–${b.weekTo}`} · {b.goal}</Text>
                  <Text muted>{loadLabel(b.loadModifier)}</Text>
                </View>
              );
            })}
            <Text variant="caption" muted>La carga es orientativa: ajusta la sugerencia de peso, no cambia tu plan ni tus entrenos registrados.</Text>
          </Card>
          {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button variant="secondary" label="Terminar ciclo" onPress={() => act(() => endActiveCycle(db, profile!.id))} />
        </>
      ) : (
        <>
          <Text muted>Organiza tus semanas en bloques, con una semana de descarga al final. Elige un ciclo; empieza esta semana.</Text>
          {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
          {CYCLE_TEMPLATES.map((t) => (
            <Card key={t.key} style={{ gap: space.xs }}>
              <Text variant="subtitle">{t.name}</Text>
              <Text muted>{t.blocks.map((b) => b.goal).join(' → ')}</Text>
              <Button label="Empezar este ciclo" disabled={!profile} onPress={() => act(() => createCycle(db, profile!.id, { name: t.name, startDate: toDateKey(), blocks: t.blocks }))} />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
