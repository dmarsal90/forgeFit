import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Pressable, View } from 'react-native';
import { WEEKDAYS } from '../lib/onboarding';
import type { PlanSession } from '../lib/plan';
import { focusOf } from '../lib/planner';
import { Text } from '../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../ui/tokens';

export type DropHint = 'none' | 'move' | 'swap';

/** Fila de un día (sesión o descanso). Pulsación larga + arrastre vertical; pulsar abre las acciones por botones (alternativa accesible). */
export function PlannerRow({ day, session, today, selected, dragOffset, hint, onSelect, onDragStart, onDragMove, onDragEnd }: {
  day: number; session?: PlanSession; today: boolean; selected: boolean; dragOffset: number | null; hint: DropHint;
  onSelect: () => void; onDragStart: () => void; onDragMove: (translationY: number) => void; onDragEnd: (translationY: number) => void;
}) {
  const dragging = dragOffset !== null;
  const pan = usePanGesture({
    runOnJS: true,
    activateAfterLongPress: 220,
    onActivate: () => onDragStart(),
    onUpdate: (e) => onDragMove(e.translationY),
    onDeactivate: (e) => onDragEnd(e.translationY),
  });
  const focus = session ? focusOf(session).join(' · ') : 'Recuperación';
  const label = `${WEEKDAYS[day]}: ${session ? `${session.name}, ${focus}` : 'descanso'}${today ? ', hoy' : ''}`;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{
          transform: [{ translateY: dragOffset ?? 0 }, { scale: dragging ? 1.03 : 1 }], zIndex: dragging ? 10 : 0, elevation: dragging ? 8 : 0,
          marginBottom: space.sm,
        }}
      >
        <Pressable
          onPress={onSelect} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}
          accessibilityHint="Abre las acciones para mover, intercambiar o duplicar. También puedes mantener pulsado y arrastrar."
          style={{
            minHeight: ROW_HEIGHT, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md,
            backgroundColor: session ? colors.surface : colors.surfaceAlt,
            borderWidth: hint !== 'none' || selected || dragging ? 1.5 : 1,
            borderColor: hint !== 'none' || selected || dragging ? colors.accent : colors.border,
            borderStyle: hint === 'move' ? 'dashed' : 'solid',
          }}
        >
          <View style={{ minWidth: 52, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: today ? colors.accent : colors.border }}>
            <Text variant="caption" style={{ color: today ? colors.onAccent : colors.text }}>{WEEKDAYS[day].slice(0, 3)}</Text>
          </View>
          <Ionicons name={session ? 'barbell-outline' : 'bed-outline'} size={26} color={session ? colors.accent : colors.textMuted} />
          <View style={{ flex: 1 }}>
            {hint === 'move' ? <Text style={{ color: colors.accent }}>Soltar aquí</Text> : hint === 'swap' ? <Text style={{ color: colors.accent }}>Intercambiar</Text> : (
              <>
                <Text numberOfLines={1}>{session ? session.name : 'Descanso'}</Text>
                <Text variant="caption" muted numberOfLines={1}>{focus}</Text>
              </>
            )}
          </View>
          <Ionicons name="reorder-two-outline" size={26} color={colors.textMuted} accessibilityElementsHidden />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const ROW_HEIGHT = Math.max(MIN_TOUCH, 64);
