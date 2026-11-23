import { buildImported, MAX_IMPORT_CHARS, parseSessionsCsv, sessionKey, type ParsedSession } from '../lib/csvImport';
import { toDateKey } from '../lib/schedule';
import { variantOf } from '../lib/workoutMachine';
import { newId } from './id';
import type { Db } from './index';
import { loadFinishedWorkouts } from './stats';

export type ImportPreview = { sessions: number; sets: number; duplicates: number; ignoredRows: number; unknown: string[]; issues: string[] };
type Analysis = { ok: true; fresh: ParsedSession[]; preview: ImportPreview } | { ok: false; error: string };

async function analyze(db: Db, profileId: string, text: string): Promise<Analysis> {
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: 'El archivo es demasiado grande.' };
  if (!(await db.getFirstAsync('SELECT 1 FROM profiles WHERE id = ? AND archived_at IS NULL', [profileId]))) return { ok: false, error: 'Perfil no encontrado.' };
  const parsed = parseSessionsCsv(text);
  if (!parsed.ok) return parsed;
  const seen = new Set((await loadFinishedWorkouts(db, profileId, 100_000)).map((w) => sessionKey(toDateKey(new Date(w.at)), w.session.name,
    Object.entries(w.done).filter(([, d]) => !d.skipped).flatMap(([k, d]) => { const variantId = variantOf(w.session, w.done, k); return variantId ? [{ variantId, weightKg: d.weightKg, reps: d.reps }] : []; }))));
  const fresh: ParsedSession[] = [];
  let duplicates = 0;
  for (const s of parsed.sessions) {
    if (seen.has(sessionKey(s.date, s.name, s.sets))) { duplicates++; continue; }
    fresh.push(s);
  }
  return { ok: true, fresh, preview: { sessions: fresh.length, sets: fresh.reduce((n, s) => n + s.sets.length, 0), duplicates, ignoredRows: parsed.ignoredRows, unknown: parsed.unknown, issues: parsed.issues } };
}

/** Qué se importaría, sin escribir nada. */
export async function previewSessionsCsv(db: Db, profileId: string, text: string): Promise<{ ok: true; preview: ImportPreview } | { ok: false; error: string }> {
  const a = await analyze(db, profileId, text);
  return a.ok ? { ok: true, preview: a.preview } : a;
}

/**
 * Importa el historial como sesiones terminadas del perfil, sin tocar su plan ni su calendario. Las sesiones que ya existen
 * (misma fecha, nombre y series) se omiten. Todo o nada: una sola transacción.
 */
export async function importSessionsCsv(db: Db, profileId: string, text: string): Promise<{ ok: true; preview: ImportPreview } | { ok: false; error: string }> {
  const a = await analyze(db, profileId, text);
  if (!a.ok) return a;
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const s of a.fresh) {
        const w = buildImported(s);
        const id = await newId(tx);
        await tx.runAsync("INSERT INTO workout_sessions (id, profile_id, scheduled_session_id, status, started_at, ended_at, snapshot_json) VALUES (?,?,NULL,'finished',?,?,?)",
          [id, profileId, w.startedAt, w.endedAt, JSON.stringify(w.session)]);
        for (const [i, e] of w.events.entries()) await tx.runAsync('INSERT INTO session_events (id, session_id, seq, at, event_json) VALUES (?,?,?,?,?)', [await newId(tx), id, i + 1, e.at, JSON.stringify(e.event)]);
      }
    });
  } catch { return { ok: false, error: 'No se pudo importar. No se guardó ninguna sesión.' }; }
  return a;
}
