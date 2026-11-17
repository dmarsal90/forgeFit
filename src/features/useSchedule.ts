import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { newId } from '../db/id';
import { applyScheduleOperation, getInstances, undoScheduleOperation, type ScheduleResult } from '../db/schedule';
import { addDays, toDateKey, weekStart, type DateKey, type Instance, type ScheduleOp } from '../lib/schedule';
import { useApp } from './AppContext';

/** Una semana (lunes–domingo) del calendario con fechas del plan activo, con navegación entre semanas y cambios por fecha. */
export function useWeek() {
  const { db, profile } = useApp();
  const [start, setStart] = useState<DateKey>(() => weekStart(toDateKey()));
  const [rows, setRows] = useState<Instance[] | undefined>(undefined);
  const [lastOp, setLastOp] = useState<string | null>(null);

  const reload = useCallback(async (from: DateKey = start) => {
    if (!profile) return;
    try { setRows(await getInstances(db, profile.id, from, addDays(from, 6))); } catch { setRows([]); }
  }, [db, profile, start]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const shift = useCallback((weeks: number) => {
    const next = addDays(start, weeks * 7);
    setStart(next);
    setRows(undefined);
    reload(next);
  }, [start, reload]);

  /** Aplica un cambio solo a esas fechas (no toca la plantilla). */
  const applyDated = useCallback(async (op: ScheduleOp): Promise<ScheduleResult | null> => {
    if (!profile) return null;
    const operationId = await newId(db);
    const r = await applyScheduleOperation(db, profile.id, { operationId, op }).catch(() => null);
    if (r?.status === 'applied') setLastOp(operationId);
    await reload();
    return r;
  }, [db, profile, reload]);

  const undoDated = useCallback(async (): Promise<ScheduleResult | null> => {
    if (!profile || !lastOp) return null;
    const r = await undoScheduleOperation(db, profile.id, { operationId: await newId(db), undoOf: lastOp }).catch(() => null);
    if (r?.status === 'applied') setLastOp(null);
    await reload();
    return r;
  }, [db, profile, lastOp, reload]);

  return { start, rows, shift, reload, applyDated, undoDated };
}
