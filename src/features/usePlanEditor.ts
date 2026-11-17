import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { newId } from '../db/id';
import { getAvailableDays } from '../db/onboarding';
import { applyPlanOperation, getActivePlanState } from '../db/planEditing';
import type { Plan } from '../lib/plan';
import type { Issue } from '../lib/planValidator';
import { useApp } from './AppContext';

/** Plan activo del perfil con la acción de mover una sesión a otro día (revisión nueva, validada y con control de versión). */
export function usePlanEditor() {
  const { db, profile } = useApp();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [version, setVersion] = useState(1);
  const [allowedDays, setAllowedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Issue[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const state = await getActivePlanState(db, profile.id);
      setPlan(state ? state.plan : null);
      setVersion(state?.version ?? 1);
    } catch { setPlan(null); }
    getAvailableDays(db, profile.id).then((d) => d && setAllowedDays(d)).catch(() => {});
  }, [db, profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Mueve la sesión de `fromDay` a `toDay`: si ese día ya tiene sesión se intercambian. */
  const move = useCallback(async (fromDay: number, toDay: number) => {
    if (!profile || !plan || fromDay === toDay) return;
    const occupied = plan.sessions.some((s) => s.day === toDay);
    const r = await applyPlanOperation(db, profile.id, {
      operationId: await newId(db), baseVersion: version,
      op: occupied ? { type: 'swap_sessions', a: fromDay, b: toDay } : { type: 'move_session', from: fromDay, to: toDay },
    }).catch(() => null);
    if (r?.status === 'applied') { setPlan(r.plan); setVersion(r.version); setWarnings(r.warnings); setError(null); return; }
    if (r?.status === 'stale') { await load(); setError('El plan cambió mientras lo editabas. Revisa y vuelve a intentarlo.'); return; }
    setError(r?.status === 'rejected' ? r.reason : 'No se pudo cambiar el día. Inténtalo de nuevo.');
  }, [db, profile, plan, version, load]);

  return { plan, version, allowedDays, move, error, warnings };
}
