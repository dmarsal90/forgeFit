import { EXERCISES } from '../data/exercises';
import { findVariant } from './exercises';
import type { PlanSession } from './plan';
import { isDateKey, toDateKey, weekdayOf, type DateKey } from './schedule';
import { eventSchema, type Pain, type Timed, type WorkoutEvent } from './workoutMachine';

// Importación del CSV que exporta ForgeFit (`sessionsToCsv`): una fila por serie, pesos en kg.
export const MAX_IMPORT_CHARS = 5_000_000;
export const MAX_IMPORT_ROWS = 50_000;
const COLUMNS = ['fecha', 'sesion', 'ejercicio', 'variante', 'serie', 'peso_kg', 'repeticiones', 'rir', 'molestia'];
const MAX_ISSUES = 5;
const MAX_ITEMS = 12; // bloques por sesión
const MAX_SETS = 10; // series por ejercicio

/** CSV (RFC 4180): comillas dobles, comas y saltos de línea dentro de celdas. Lanza si quedan comillas sin cerrar. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const endRow = () => { row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') endRow();
    else if (c !== '\r') cell += c;
  }
  if (quoted) throw new Error('comillas sin cerrar');
  if (cell !== '' || row.length) endRow();
  return rows;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const byName = new Map<string, string>();
for (const ex of EXERCISES) for (const v of ex.variants) { const k = `${norm(ex.es)}|${norm(v.es)}`; if (!byName.has(k)) byName.set(k, v.id); }
/** El export neutraliza las celdas que empiezan por = + - @: se quita ese apóstrofo. */
const unquote = (c: string) => c.replace(/^'(?=[=+\-@\t\r])/, '');

export type SetRow = { variantId: string; serie: number; weightKg?: number; reps?: number; rir?: number; pain?: Pain };
export type ParsedSession = { date: DateKey; name: string; sets: SetRow[] };
export type ParseResult = { ok: true; sessions: ParsedSession[]; ignoredRows: number; unknown: string[]; issues: string[] } | { ok: false; error: string };

const int = (c: string, min: number, max: number) => (/^\d+$/.test(c) && Number(c) >= min && Number(c) <= max ? Number(c) : null);
const num = (c: string, max: number) => (/^\d+(\.\d+)?$/.test(c) && Number(c) <= max ? Number(c) : null);

export function parseSessionsCsv(text: string, today: DateKey = toDateKey()): ParseResult {
  let rows: string[][];
  try { rows = parseCsv(text); } catch { return { ok: false, error: 'El archivo no es un CSV válido (comillas sin cerrar).' }; }
  if (!rows.length || rows[0].map(norm).join(',') !== COLUMNS.join(',')) return { ok: false, error: `No es un CSV de sesiones de ForgeFit: la primera fila debe ser «${COLUMNS.join(',')}».` };
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: `Demasiadas filas (máximo ${MAX_IMPORT_ROWS}).` };

  const groups = new Map<string, ParsedSession>();
  const unknown = new Set<string>(), issues: string[] = [];
  let ignoredRows = 0;
  const bad = (line: number, why: string) => { ignoredRows++; if (issues.length < MAX_ISSUES) issues.push(`Línea ${line}: ${why}`); };

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    if (r.length !== COLUMNS.length) return bad(line, 'número de columnas incorrecto');
    const [date, session, ex, variant, serie, kg, reps, rir, pain] = r.map((c) => unquote(c.trim()));
    if (!isDateKey(date) || date > today) return bad(line, 'fecha no válida o futura');
    const variantId = findVariant(variant) ? variant : byName.get(`${norm(ex)}|${norm(variant)}`);
    if (!variantId) { ignoredRows++; unknown.add(`${ex} / ${variant}`); return; }
    const row: SetRow = { variantId, serie: int(serie, 1, 50) ?? 0 };
    if (!row.serie) return bad(line, 'serie no válida');
    if (kg !== '') { const v = num(kg, 1000); if (v === null) return bad(line, 'peso no válido'); row.weightKg = v; }
    if (reps !== '') { const v = int(reps, 0, 200); if (v === null) return bad(line, 'repeticiones no válidas'); row.reps = v; }
    if (rir !== '') { const v = int(rir, 0, 10); if (v === null) return bad(line, 'RIR no válido'); row.rir = v; }
    const p = norm(pain);
    if (p !== '' && p !== 'molestia' && p !== 'dolor') return bad(line, 'molestia no válida');
    if (p) row.pain = p === 'dolor' ? 'pain' : 'discomfort';
    const name = session.slice(0, 60) || 'Sesión importada';
    const key = `${date}|${name}`;
    const g = groups.get(key) ?? { date, name, sets: [] };
    g.sets.push(row);
    groups.set(key, g);
  });

  const sessions: ParsedSession[] = [];
  for (const g of groups.values()) {
    const per = new Map<string, number>();
    for (const s of g.sets) per.set(s.variantId, (per.get(s.variantId) ?? 0) + 1);
    if (per.size > MAX_ITEMS || Math.max(...per.values()) > MAX_SETS) { ignoredRows += g.sets.length; if (issues.length < MAX_ISSUES) issues.push(`«${g.name}» (${g.date}): demasiados ejercicios o series para una sesión`); continue; }
    sessions.push(g);
  }
  return { ok: true, sessions, ignoredRows, unknown: [...unknown], issues };
}

/** Clave de duplicado: fecha, nombre y las series (ejercicio, peso, repeticiones), sin importar el orden. */
export function sessionKey(date: DateKey, name: string, sets: readonly { variantId: string; weightKg?: number; reps?: number }[]): string {
  return `${date}|${name}|${sets.map((s) => `${s.variantId}:${s.weightKg ?? ''}:${s.reps ?? ''}`).sort().join(';')}`;
}

/** Sesión terminada: un bloque simple por ejercicio (en orden de aparición), series por `serie`, a las 10:00 del día y una por minuto. */
export function buildImported(p: ParsedSession): { session: PlanSession; events: Timed[]; startedAt: number; endedAt: number } {
  const order = [...new Set(p.sets.map((s) => s.variantId))];
  const [y, m, d] = p.date.split('-').map(Number);
  const startedAt = new Date(y, m - 1, d, 10, 0).getTime();
  const events: Timed[] = [{ at: startedAt, event: { type: 'start' } }];
  const blocks = order.map((variantId, block) => {
    const sets = p.sets.filter((s) => s.variantId === variantId).sort((a, b) => a.serie - b.serie);
    sets.forEach((s, round) => {
      const event: WorkoutEvent = { type: 'set_done', block, item: 0, round, weightKg: s.weightKg, reps: s.reps, rir: s.rir, pain: s.pain };
      events.push({ at: startedAt + events.length * 60_000, event: eventSchema.parse(event) });
    });
    const reps = sets.map((s) => s.reps ?? 0).filter((r) => r > 0);
    const lo = reps.length ? Math.min(...reps) : 1, hi = reps.length ? Math.max(...reps) : 1;
    return { type: 'single' as const, items: [{ exerciseVariantId: variantId, sets: sets.length, repRange: [Math.min(lo, 100), Math.min(hi, 100)] as [number, number], restSeconds: 60 }] };
  });
  const endedAt = startedAt + events.length * 60_000;
  events.push({ at: endedAt, event: { type: 'finish' } });
  return { session: { day: weekdayOf(p.date), name: p.name, blocks }, events, startedAt, endedAt };
}
