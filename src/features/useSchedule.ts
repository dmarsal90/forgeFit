import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { newId } from '../db/id';
import { applyScheduleOperation, getInstances, undoScheduleOperation, type ScheduleResult } from '../db/schedule';
import { addDays, addMonths, monthGrid, monthOf, toDateKey, weekStart, type DateKey, type Instance, type ScheduleOp } from '../lib/schedule';
import { useApp } from './AppContext';

/** Cambios por fecha (no tocan la plantilla) y su «deshacer», compartidos por la vista de semana y la de mes. */
function useDatedOps(reload: () => Promise<void>) {
  const { db, profile } = useApp();
  const [lastOp, setLastOp] = useState<string | null>(null);

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

  return { applyDated, undoDated };
}

/** Una semana (lunes–domingo) del calendario con fechas del plan activo, con navegación entre semanas. */
export function useWeek() {
  const { db, profile } = useApp();
  const [start, setStart] = useState<DateKey>(() => weekStart(toDateKey()));
  const [rows, setRows] = useState<Instance[] | undefined>(undefined);

  const load = useCallback(async (from: DateKey) => {
    if (!profile) return;
    try { setRows(await getInstances(db, profile.id, from, addDays(from, 6))); } catch { setRows([]); }
  }, [db, profile]);
  const reload = useCallback(() => load(start), [load, start]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const shift = useCallback((weeks: number) => {
    const next = addDays(start, weeks * 7);
    setStart(next);
    setRows(undefined);
    load(next);
  }, [start, load]);

  return { start, rows, shift, reload, ...useDatedOps(reload) };
}

/** Un mes completo (semanas de lunes a domingo que lo cubren) del calendario con fechas. */
export function useMonth() {
  const { db, profile } = useApp();
  const [month, setMonth] = useState<DateKey>(() => monthOf(toDateKey()));
  const [rows, setRows] = useState<Instance[] | undefined>(undefined);

  const load = useCallback(async (m: DateKey) => {
    if (!profile) return;
    const grid = monthGrid(m);
    try { setRows(await getInstances(db, profile.id, grid[0][0], grid[grid.length - 1][6])); } catch { setRows([]); }
  }, [db, profile]);
  const reload = useCallback(() => load(month), [load, month]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const shift = useCallback((months: number) => {
    const next = addMonths(month, months);
    setMonth(next);
    setRows(undefined);
    load(next);
  }, [month, load]);

  return { month, rows, shift, reload, ...useDatedOps(reload) };
}
