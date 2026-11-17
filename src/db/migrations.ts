// Cada migración corre en una transacción; el índice + 1 es el valor de PRAGMA user_version.
export const migrations: string[] = [
  `CREATE TABLE profiles (
     id TEXT PRIMARY KEY NOT NULL,
     alias TEXT NOT NULL,
     anatomical_model TEXT CHECK (anatomical_model IN ('male','female')),
     birth_year INTEGER,
     height_cm REAL,
     archived_at TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
  `CREATE TABLE onboarding_drafts (
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     step INTEGER NOT NULL CHECK (step BETWEEN 1 AND 8),
     data_json TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (profile_id, step)
   );
   CREATE TABLE user_consents (
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     version INTEGER NOT NULL,
     granted_at TEXT NOT NULL,
     revoked_at TEXT,
     PRIMARY KEY (profile_id, kind)
   );`,
  `CREATE TABLE training_environments (
     id TEXT PRIMARY KEY NOT NULL,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('home','gym','outdoor','travel')),
     name TEXT NOT NULL,
     created_at TEXT NOT NULL,
     UNIQUE (profile_id, kind)
   );
   -- Estado ausente de fila = desconocido («sin indicar»); solo se guardan las confirmaciones.
   CREATE TABLE environment_inventory (
     environment_id TEXT NOT NULL REFERENCES training_environments(id) ON DELETE CASCADE,
     equipment_id TEXT NOT NULL,
     state TEXT NOT NULL CHECK (state IN ('available','unavailable')),
     updated_at TEXT NOT NULL,
     PRIMARY KEY (environment_id, equipment_id)
   );`,
  // shortcut: el plan se guarda como JSON validado (planSchema); normalizar a días/bloques/series cuando la sesión activa (Fase 5) lo necesite.
  `CREATE TABLE training_plans (
     id TEXT PRIMARY KEY NOT NULL,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     environment_id TEXT REFERENCES training_environments(id) ON DELETE SET NULL,
     mode TEXT NOT NULL CHECK (mode IN ('local','ai','hybrid')),
     status TEXT NOT NULL CHECK (status IN ('active','archived')),
     plan_json TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE UNIQUE INDEX one_active_plan_per_profile ON training_plans(profile_id) WHERE status = 'active';`,
  // V8-A1: revisiones inmutables del plan, versión (ETag) y registro idempotente de operaciones.
  `ALTER TABLE training_plans ADD COLUMN plan_version INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE plan_revisions (
     id TEXT PRIMARY KEY NOT NULL,
     plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
     revision INTEGER NOT NULL,
     author TEXT NOT NULL CHECK (author IN ('engine','user','ai')),
     reason TEXT,
     definition_json TEXT NOT NULL,
     created_at TEXT NOT NULL,
     UNIQUE (plan_id, revision)
   );
   -- Inmutable: una revisión no se edita nunca (el borrado solo ocurre en cascada al eliminar el perfil).
   CREATE TRIGGER plan_revisions_immutable BEFORE UPDATE ON plan_revisions BEGIN SELECT RAISE(ABORT, 'plan_revisions es inmutable'); END;
   CREATE TABLE plan_operations (
     operation_id TEXT PRIMARY KEY NOT NULL,
     plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     params_json TEXT NOT NULL,
     origin TEXT NOT NULL CHECK (origin IN ('user','ai')),
     base_version INTEGER NOT NULL,
     applied_revision INTEGER NOT NULL,
     created_at TEXT NOT NULL
   );
   INSERT INTO plan_revisions (id, plan_id, revision, author, reason, definition_json, created_at)
     SELECT lower(hex(randomblob(16))), id, 1, 'engine', NULL, plan_json, created_at FROM training_plans;`,
  // V8-A2: calendario con fechas (instancias derivadas de la plantilla) y registro de reprogramaciones.
  // Fechas = días de calendario locales «AAAA-MM-DD» (sin zona): viajar no corre ni duplica días.
  `CREATE TABLE scheduled_sessions (
     id TEXT PRIMARY KEY NOT NULL,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
     date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
     kind TEXT NOT NULL CHECK (kind IN ('training','rest')),
     status TEXT NOT NULL CHECK (status IN ('scheduled','completed','skipped')),
     origin TEXT NOT NULL CHECK (origin IN ('template','override')),
     session_json TEXT,
     revision INTEGER NOT NULL,
     UNIQUE (plan_id, date),
     CHECK ((kind = 'training') = (session_json IS NOT NULL))
   );
   CREATE INDEX scheduled_sessions_profile_date ON scheduled_sessions (profile_id, date);
   CREATE TABLE session_reschedules (
     id TEXT PRIMARY KEY NOT NULL,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
     operation_id TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('move','swap','duplicate','undo')),
     from_date TEXT NOT NULL,
     to_date TEXT NOT NULL,
     before_json TEXT NOT NULL,
     at TEXT NOT NULL
   );`,
  // Fase 5: sesión activa. El estado se deriva de los eventos (solo se añaden); `snapshot_json` congela la
  // sesión al empezar, así editar o restaurar el plan después nunca reescribe lo ya entrenado.
  `CREATE TABLE workout_sessions (
     id TEXT PRIMARY KEY NOT NULL,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     scheduled_session_id TEXT REFERENCES scheduled_sessions(id) ON DELETE SET NULL,
     status TEXT NOT NULL CHECK (status IN ('active','finished')),
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     snapshot_json TEXT NOT NULL
   );
   CREATE INDEX workout_sessions_profile ON workout_sessions (profile_id, status);
   CREATE TABLE session_events (
     id TEXT PRIMARY KEY NOT NULL,
     session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
     seq INTEGER NOT NULL,
     at INTEGER NOT NULL,
     event_json TEXT NOT NULL,
     UNIQUE (session_id, seq)
   );
   -- Inmutable: una corrección es un evento nuevo (el borrado solo ocurre en cascada al eliminar el perfil).
   CREATE TRIGGER session_events_immutable BEFORE UPDATE ON session_events BEGIN SELECT RAISE(ABORT, 'session_events es inmutable'); END;`,
];
