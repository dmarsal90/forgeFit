import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { findVariant } from '../lib/exercises';
import { WEEKDAYS } from '../lib/onboarding';
import type { Plan, PlanItem } from '../lib/plan';
import { estimateMinutes } from '../lib/planValidator';
import { Button, Card, Text } from '../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../ui/tokens';

export function describeItem(it: PlanItem) {
  const found = findVariant(it.exerciseVariantId);
  const seconds = it.effortGuidance?.startsWith('Segundos');
  return {
    name: found?.ex.es ?? it.exerciseVariantId,
    detail: `${found?.variant.es ?? ''} · ${it.sets} × ${it.repRange[0]}-${it.repRange[1]}${seconds ? ' s' : ''} · descanso ${it.restSeconds} s`,
  };
}

const SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function DayPicker({ plan, from, allowed, onPick }: { plan: Plan; from: number; allowed: readonly number[]; onPick: (to: number) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" muted>Elige el nuevo día. Si ya tiene una sesión, se intercambian.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {SHORT.map((label, day) => {
          const other = plan.sessions.find((x) => x.day === day);
          const current = day === from;
          const enabled = current || allowed.includes(day);
          return (
            <Pressable
              key={day} disabled={!enabled || current} onPress={() => onPick(day)}
              accessibilityRole="button" accessibilityState={{ selected: current, disabled: !enabled }}
              accessibilityLabel={`${WEEKDAYS[day]}${current ? ', día actual' : other ? `, intercambiar con ${other.name}` : ''}${enabled ? '' : ', no disponible'}`}
              style={{
                minWidth: MIN_TOUCH + 4, minHeight: MIN_TOUCH, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center',
                borderWidth: current ? 1.5 : 1, borderColor: current ? colors.accent : colors.border, backgroundColor: colors.surfaceAlt, opacity: enabled ? 1 : 0.4,
              }}
            >
              <Text variant="caption">{label}</Text>
              <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 52, fontSize: 10 }}>{other && !current ? other.name : current ? '✓' : '—'}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Lista de sesiones del plan. Con `onMove` cada sesión permite cambiar de día (solo a días disponibles). */
export function PlanView({ plan, onMove, onEdit, allowedDays = [0, 1, 2, 3, 4, 5, 6] }: {
  plan: Plan; onMove?: (fromDay: number, toDay: number) => void; onEdit?: (day: number) => void; allowedDays?: readonly number[];
}) {
  const [picking, setPicking] = useState<number | null>(null);
  return (
    <View style={{ gap: space.md }}>
      {plan.sessions.map((s) => (
        <Card key={s.day} style={{ gap: space.sm }}>
          <View>
            <Text variant="subtitle">{WEEKDAYS[s.day]} · {s.name}</Text>
            <Text variant="caption" muted>~{estimateMinutes(s)} min</Text>
          </View>
          {s.blocks.flatMap((b) => b.items).map((it, i) => {
            const d = describeItem(it);
            return (
              <View key={`${it.exerciseVariantId}-${i}`}>
                <Text>{d.name}</Text>
                <Text variant="caption" muted>{d.detail}</Text>
              </View>
            );
          })}
          {onEdit ? <Button variant="ghost" label="Editar sesión" icon="create-outline" onPress={() => onEdit(s.day)} /> : null}
          {onMove ? (picking === s.day
            ? <DayPicker plan={plan} from={s.day} allowed={allowedDays} onPick={(to) => { setPicking(null); onMove(s.day, to); }} />
            : <Button variant="ghost" label="Cambiar de día" icon="swap-horizontal" onPress={() => setPicking(s.day)} />) : null}
        </Card>
      ))}
    </View>
  );
}
