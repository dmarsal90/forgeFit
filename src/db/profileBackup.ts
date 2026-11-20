import { z } from 'zod';
import { planSchema, sessionSchema } from '../lib/plan';
import { eventSchema } from '../lib/workoutMachine';
import { findVariant } from '../lib/exercises';
import { STEPS, validateStep } from '../lib/onboarding';
import { applyEquipment, equipmentBackupSchema, exportEquipment, unknownEquipment } from './equipmentBackup';
import { newId } from './id';
import type { Db } from './index';
import { ENV_LABELS, ensureEnvironment, type EnvKind } from './inventory';

/** Copia completa de un perfil (versión 1). Los ids son locales al archivo: al restaurar se regeneran. */
const kinds = Object.keys(ENV_LABELS) as [EnvKind, ...EnvKind[]];
const iso = z.string().min(10).max(40);
const id = z.string().min(1).max(64);

const scheduled = z.object({
  id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(['training', 'rest']), status: z.enum(['scheduled', 'completed', 'skipped']),
  origin: z.enum(['template', 'override']), session: sessionSchema.nullable(), revision: z.number().int().min(1),
}).refine((s) => (s.kind === 'training') === (s.session !== null), { message: 'Una sesión de entreno lleva su definición y un descanso no' });

const plan = z.object({
  id, environmentKind: z.enum(kinds).nullable(), mode: z.enum(['local', 'ai', 'hybrid']), status: z.enum(['active', 'archived']),
  planVersion: z.number().int().min(1), createdAt: iso, plan: planSchema,
  revisions: z.array(z.object({ revision: z.number().int().min(1), author: z.enum(['engine', 'user', 'ai']), reason: z.string().max(500).nullable(), definition: planSchema, createdAt: iso })).min(1).max(500),
  scheduled: z.array(scheduled).max(3000),
});

const workout = z.object({
  id, scheduledSessionId: id.nullable(), startedAt: z.number().int().min(0), endedAt: z.number().int().min(0).nullable(), snapshot: sessionSchema,
  events: z.array(z.object({ seq: z.number().int().min(0), at: z.number().int().min(0), event: eventSchema })).max(2000),
});

export const profileBackupSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('forgefit-profile'),
  exportedAt: iso,
  profile: z.object({
    alias: z.string().trim().min(1).max(40), anatomicalModel: z.enum(['male', 'female']).nullable(),
    birthYear: z.number().int().min(1900).max(2100).nullable(), heightCm: z.number().min(50).max(300).nullable(), weightUnit: z.enum(['kg', 'lb']),
  }),
  drafts: z.record(z.string().regex(/^[1-8]$/), z.record(z.string(), z.unknown())),
  equipment: equipmentBackupSchema,
  plans: z.array(plan).max(50),
  workouts: z.array(workout).max(5000),
});
export type ProfileBackup = z.infer<typeof profileBackupSchema>;

const parseJson = (s: string) => JSON.parse(s) as unknown;

/**
 * Lee todo lo del perfil y lo valida contra su propio esquema: si algo guardado no lo cumple, falla en vez de generar un archivo
 * que luego no se pueda restaurar. Solo se exportan sesiones terminadas (una abierta se queda en el móvil de origen).
 */
export async function exportProfile(db: Db, profileId: string, now = new Date()): Promise<ProfileBackup> {
  const p = await db.getFirstAsync<{ alias: string; anatomical_model: 'male' | 'female' | null; birth_year: number | null; height_cm: number | null; weight_unit: 'kg' | 'lb' }>(
    'SELECT alias, anatomical_model, birth_year, height_cm, weight_unit FROM profiles WHERE id = ?', [profileId]);
  if (!p) throw new Error('Perfil no encontrado');

  const draftRows = await db.getAllAsync<{ step: number; data_json: string }>('SELECT step, data_json FROM onboarding_drafts WHERE profile_id = ? ORDER BY step', [profileId]);
  const drafts: Record<string, unknown> = {};
  for (const r of draftRows) drafts[String(r.step)] = parseJson(r.data_json);

  const planRows = await db.getAllAsync<{ id: string; kind: EnvKind | null; mode: string; status: string; plan_version: number; plan_json: string; created_at: string }>(
    `SELECT t.id, e.kind, t.mode, t.status, t.plan_version, t.plan_json, t.created_at FROM training_plans t
     LEFT JOIN training_environments e ON e.id = t.environment_id WHERE t.profile_id = ? ORDER BY t.created_at, t.rowid`, [profileId]);
  const plans = [];
  for (const t of planRows) {
    const revisions = await db.getAllAsync<{ revision: number; author: string; reason: string | null; definition_json: string; created_at: string }>(
      'SELECT revision, author, reason, definition_json, created_at FROM plan_revisions WHERE plan_id = ? ORDER BY revision', [t.id]);
    const days = await db.getAllAsync<{ id: string; date: string; kind: string; status: string; origin: string; session_json: string | null; revision: number }>(
      'SELECT id, date, kind, status, origin, session_json, revision FROM scheduled_sessions WHERE plan_id = ? ORDER BY date', [t.id]);
    plans.push({
      id: t.id, environmentKind: t.kind, mode: t.mode, status: t.status, planVersion: t.plan_version, createdAt: t.created_at, plan: parseJson(t.plan_json),
      revisions: revisions.map((r) => ({ revision: r.revision, author: r.author, reason: r.reason, definition: parseJson(r.definition_json), createdAt: r.created_at })),
      scheduled: days.map((d) => ({ id: d.id, date: d.date, kind: d.kind, status: d.status, origin: d.origin, session: d.session_json ? parseJson(d.session_json) : null, revision: d.revision })),
    });
  }

  const workoutRows = await db.getAllAsync<{ id: string; scheduled_session_id: string | null; started_at: number; ended_at: number | null; snapshot_json: string }>(
    "SELECT id, scheduled_session_id, started_at, ended_at, snapshot_json FROM workout_sessions WHERE profile_id = ? AND status = 'finished' ORDER BY started_at", [profileId]);
  const workouts = [];
  for (const w of workoutRows) {
    const events = await db.getAllAsync<{ seq: number; at: number; event_json: string }>('SELECT seq, at, event_json FROM session_events WHERE session_id = ? ORDER BY seq', [w.id]);
    workouts.push({
      id: w.id, scheduledSessionId: w.scheduled_session_id, startedAt: w.started_at, endedAt: w.ended_at, snapshot: parseJson(w.snapshot_json),
      events: events.map((e) => ({ seq: e.seq, at: e.at, event: parseJson(e.event_json) })),
    });
  }

  return profileBackupSchema.parse({
    schemaVersion: 1, kind: 'forgefit-profile', exportedAt: now.toISOString(),
    profile: { alias: p.alias, anatomicalModel: p.anatomical_model, birthYear: p.birth_year, heightCm: p.height_cm, weightUnit: p.weight_unit },
    drafts, equipment: await exportEquipment(db, profileId), plans, workouts,
  });
}

// shortcut: tope de tamaño fijo (≈ miles de sesiones); si alguien lo supera hay que trocear el archivo o comprimirlo.
export const MAX_PROFILE_BACKUP_CHARS = 20_000_000;

/** El archivo listo para guardar; falla si no cabría al restaurarlo. */
export async function exportProfileJson(db: Db, profileId: string): Promise<string> {
  const text = JSON.stringify(await exportProfile(db, profileId));
  if (text.length > MAX_PROFILE_BACKUP_CHARS) throw new Error('La copia es demasiado grande');
  return text;
}

export type RestoreResult =
  | { ok: true; profileId: string; alias: string; plans: number; workouts: number; droppedDrafts: number }
  | { ok: false; error: string };

const fail = (error: string): RestoreResult => ({ ok: false, error });
const dup = (xs: readonly (string | number)[]) => new Set(xs).size !== xs.length;

/** Reglas que el esquema no expresa: una copia que las rompa se rechaza entera antes de escribir nada. */
function semanticError(b: ProfileBackup): string | null {
  const unknown = unknownEquipment(b.equipment);
  if (unknown) return unknown;
  if (b.plans.filter((p) => p.status === 'active').length > 1) return 'La copia tiene más de un plan activo.';
  const scheduledIds = b.plans.flatMap((p) => p.scheduled.map((d) => d.id));
  if (dup(scheduledIds) || dup(b.workouts.map((w) => w.id))) return 'La copia repite identificadores.';
  for (const p of b.plans) {
    if (dup(p.revisions.map((r) => r.revision)) || dup(p.scheduled.map((d) => d.date))) return 'La copia repite revisiones o fechas de un plan.';
    const missing = p.plan.sessions.flatMap((s) => s.blocks.flatMap((x) => x.items)).find((i) => !findVariant(i.exerciseVariantId));
    if (missing) return `El plan usa un ejercicio desconocido: ${missing.exerciseVariantId}.`;
  }
  if (b.workouts.some((w) => dup(w.events.map((e) => e.seq)))) return 'La copia repite eventos de un entreno.';
  return null;
}

/**
 * Restaura una copia completa como un perfil NUEVO: nunca pisa ni fusiona con uno existente y todos los ids se regeneran.
 * Todo o nada: valida primero y escribe en una sola transacción. No cambia el perfil activo.
 */
export async function importProfile(db: Db, text: string): Promise<RestoreResult> {
  if (text.length > MAX_PROFILE_BACKUP_CHARS) return fail('El archivo es demasiado grande.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('El archivo no es un JSON válido.'); }
  const parsed = profileBackupSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return fail(`Formato no válido${i.path.length ? ` en «${i.path.join('.')}»` : ''}: se espera una copia completa de ForgeFit versión 1.`);
  }
  const b = parsed.data;
  const bad = semanticError(b);
  if (bad) return fail(bad);

  const now = new Date().toISOString();
  const result = { profileId: '', alias: '', droppedDrafts: 0 };
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      // Si el alias ya existe se añade «(restaurado)», con número si hace falta, para no confundir perfiles.
      let alias = b.profile.alias;
      for (let n = 1; await tx.getFirstAsync('SELECT 1 FROM profiles WHERE alias = ?', [alias]); n++) {
        alias = `${b.profile.alias.slice(0, 20)} (restaurado${n > 1 ? ` ${n}` : ''})`;
      }
      const profileId = await newId(tx);
      result.profileId = profileId; result.alias = alias;
      await tx.runAsync('INSERT INTO profiles (id, alias, anatomical_model, birth_year, height_cm, weight_unit, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [profileId, alias, b.profile.anatomicalModel, b.profile.birthYear, b.profile.heightCm, b.profile.weightUnit, now, now]);

      // Un borrador que ya no cumple las reglas de su etapa se descarta (la etapa vuelve a pedirse) y se cuenta.
      for (const [step, data] of Object.entries(b.drafts)) {
        const n = Number(step);
        if (!STEPS[n] || !validateStep(n, data as never).data) { result.droppedDrafts++; continue; }
        await tx.runAsync('INSERT INTO onboarding_drafts (profile_id, step, data_json, updated_at) VALUES (?,?,?,?)', [profileId, n, JSON.stringify(data), now]);
      }

      await applyEquipment(tx, profileId, b.equipment, now);

      const scheduledMap = new Map<string, string>();
      for (const p of b.plans) {
        const planId = await newId(tx);
        const envId = p.environmentKind ? await ensureEnvironment(tx, profileId, p.environmentKind) : null;
        await tx.runAsync('INSERT INTO training_plans (id, profile_id, environment_id, mode, status, plan_json, created_at, plan_version) VALUES (?,?,?,?,?,?,?,?)',
          [planId, profileId, envId, p.mode, p.status, JSON.stringify(p.plan), p.createdAt, p.planVersion]);
        for (const r of p.revisions) {
          await tx.runAsync('INSERT INTO plan_revisions (id, plan_id, revision, author, reason, definition_json, created_at) VALUES (?,?,?,?,?,?,?)',
            [await newId(tx), planId, r.revision, r.author, r.reason, JSON.stringify(r.definition), r.createdAt]);
        }
        for (const d of p.scheduled) {
          const id = await newId(tx);
          scheduledMap.set(d.id, id);
          await tx.runAsync('INSERT INTO scheduled_sessions (id, profile_id, plan_id, date, kind, status, origin, session_json, revision) VALUES (?,?,?,?,?,?,?,?,?)',
            [id, profileId, planId, d.date, d.kind, d.status, d.origin, d.session ? JSON.stringify(d.session) : null, d.revision]);
        }
      }

      for (const w of b.workouts) {
        const id = await newId(tx);
        await tx.runAsync("INSERT INTO workout_sessions (id, profile_id, scheduled_session_id, status, started_at, ended_at, snapshot_json) VALUES (?,?,?,'finished',?,?,?)",
          [id, profileId, w.scheduledSessionId ? scheduledMap.get(w.scheduledSessionId) ?? null : null, w.startedAt, w.endedAt, JSON.stringify(w.snapshot)]);
        for (const e of w.events) {
          await tx.runAsync('INSERT INTO session_events (id, session_id, seq, at, event_json) VALUES (?,?,?,?,?)', [await newId(tx), id, e.seq, e.at, JSON.stringify(e.event)]);
        }
      }
    });
  } catch {
    return fail('No se pudo restaurar. No se creó ningún perfil.');
  }
  return { ok: true, ...result, plans: b.plans.length, workouts: b.workouts.length };
}
