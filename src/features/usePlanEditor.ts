import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getAvailableDays } from '../db/onboarding';
import { getActivePlan, updateActivePlan } from '../db/plans';
import { moveSession, type Plan } from '../lib/plan';
import { useApp } from './AppContext';

/** Plan activo del perfil con la acción de mover una sesión a otro día (se guarda al instante). */
export function usePlanEditor() {
  const { db, profile } = useApp();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [allowedDays, setAllowedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    getActivePlan(db, profile.id).then(setPlan).catch(() => setPlan(null));
    getAvailableDays(db, profile.id).then((d) => d && setAllowedDays(d)).catch(() => {});
  }, [db, profile]));

  const move = useCallback(async (fromDay: number, toDay: number) => {
    if (!profile || !plan) return;
    try {
      const next = moveSession(plan, fromDay, toDay);
      await updateActivePlan(db, profile.id, next);
      setPlan(next);
      setError(null);
    } catch { setError('No se pudo cambiar el día. Inténtalo de nuevo.'); }
  }, [db, profile, plan]);

  return { plan, allowedDays, move, error };
}
