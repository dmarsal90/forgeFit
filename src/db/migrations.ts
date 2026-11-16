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
];
