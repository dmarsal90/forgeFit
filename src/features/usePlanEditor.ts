import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { newId } from '../db/id';
import { getAvailableDays } from '../db/onboarding';
import { applyPlanOperation, getActivePlanState, undoLast, type EditResult } from '../db/planEditing';
import type { Plan } from '../lib/plan';
import type { Operation } from '../lib/planOps';
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

  const settle = useCallback(async (r: EditResult | null): Promise<EditResult | null> => {
    if (r?.status === 'applied') { setPlan(r.plan); setVersion(r.version); setWarnings(r.warnings); setError(null); return r; }
    if (r?.status === 'stale') { await load(); setError('El plan cambió mientras lo editabas. Revisa y vuelve a intentarlo.'); return r; }
    setError(r?.status === 'rejected' ? r.reason : 'No se pudo aplicar el cambio. Inténtalo de nuevo.');
    return r;
  }, [load]);

  /** Aplica una operación al plan activo y deja el resultado (plan, versión, avisos) listo para la pantalla. */
  const apply = useCallback(async (op: Operation, reason?: string): Promise<EditResult | null> => {
    if (!profile || !plan) return null;
    const r = await applyPlanOperation(db, profile.id, { operationId: await newId(db), baseVersion: version, op, reason }).catch(() => null);
    return settle(r);
  }, [db, profile, plan, version, settle]);

  const undo = useCallback(async (): Promise<EditResult | null> => {
    if (!profile || !plan) return null;
    const r = await undoLast(db, profile.id, { operationId: await newId(db), baseVersion: version }).catch(() => null);
    return settle(r);
  }, [db, profile, plan, version, settle]);

  return { plan, version, allowedDays, apply, undo, error, warnings };
}
