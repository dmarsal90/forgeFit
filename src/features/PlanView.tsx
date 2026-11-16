import { View } from 'react-native';
import { findVariant } from '../lib/exercises';
import { WEEKDAYS } from '../lib/onboarding';
import type { Plan, PlanItem } from '../lib/plan';
import { estimateMinutes } from '../lib/planValidator';
import { Card, Text } from '../ui/components';
import { space } from '../ui/tokens';

export function describeItem(it: PlanItem) {
  const found = findVariant(it.exerciseVariantId);
  const seconds = it.effortGuidance?.startsWith('Segundos');
  return {
    name: found?.ex.es ?? it.exerciseVariantId,
    detail: `${found?.variant.es ?? ''} · ${it.sets} × ${it.repRange[0]}-${it.repRange[1]}${seconds ? ' s' : ''} · descanso ${it.restSeconds} s`,
  };
}

/** Lista de sesiones del plan (solo lectura); se usa en la propuesta y en el plan guardado. */
export function PlanView({ plan }: { plan: Plan }) {
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
        </Card>
      ))}
    </View>
  );
}
