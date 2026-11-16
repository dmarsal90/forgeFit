# ForgeFit — Backend / Esquema SQLite

Sin servidor en MVP. SQLite local (`expo-sqlite`), migraciones SQL versionadas (`PRAGMA user_version`), `PRAGMA foreign_keys=ON`, una transacción por migración. IDs: texto (UUID v4 generado en app) salvo catálogos con ID estable legible. Fechas: ISO-8601 UTC en texto + zona horaria del perfil donde afecte al calendario. Campos comunes en tablas sincronizables/auditables: `source`, `external_id`, `revision`, `updated_at`, `deleted_at`.

## Migración 001 (Fase 1)
```sql
profiles(id PK, alias NOT NULL, anatomical_model TEXT NULL CHECK(anatomical_model IN ('male','female')),
         birth_year INTEGER NULL, height_cm REAL NULL, units TEXT NULL, timezone TEXT NULL,
         archived_at TEXT NULL, created_at NOT NULL, updated_at NOT NULL)
app_state(key PK, value)            -- p.ej. active_profile_id (solo tras elección expresa)
```
Todas las columnas personales son `NULL` por defecto; ningún `DEFAULT` con datos de persona.

## Entidades por fase
**Perfiles/onboarding:** `profile_preferences`, `training_goals`, `onboarding_drafts(profile_id, step, data_json)`, `user_consents(profile_id, kind, granted_at, revoked_at, version)`.
**Equipamiento y entornos:** `equipment_catalog(id, family, name_es, name_en, aliases_json, attributes_json, source)`, `equipment_variants`, `equipment_attributes`, `training_environments(id, profile_id, kind, name)`, `environment_inventory(environment_id, equipment_id, variant_id, state CHECK IN ('available','unavailable','unknown'), attributes_json, location, updated_at)`. Estado ausente de fila = desconocido.
**Ejercicios:** `exercises(id, movement_pattern, difficulty, precautions_json)`, `exercise_variants`, `exercise_requirements(exercise_variant_id, op CHECK IN ('allOf','anyOf','optional'), equipment_id, constraints_json)`, `muscles`, `exercise_muscles(role CHECK IN ('primary','secondary'))`, `media_assets(id, kind, license, attribution, path)`.
**Planes:** `training_plans(profile_id, mode, prompt_version, model, status)`, `plan_days`, `exercise_blocks`, `superset_members`, `planned_sets`, `plan_generation_requests`, `plan_generation_results`, `ai_provider_configs(id, name, endpoint)` (sin claves; las credenciales viven en el proxy), `recommendations`.
**Calendario y rachas:** `scheduled_sessions(id, profile_id, plan_day_id, date, status)`, `session_reschedules(id, scheduled_session_id, from_date, to_date, reason, at)`, `rest_days(profile_id, date, kind CHECK IN ('planned','extraordinary'))`, `streak_snapshots` (caché recalculable).
**Sesiones:** `workout_sessions(id, profile_id, scheduled_session_id, status, started_at, ended_at)`, `session_events(id, session_id, seq, type, at, payload_json)` (fuente del estado canónico y de pausas), `exercise_sets/performed_sets(session_id, block_id, set_index, weight_kg, reps, rir, notes, completed_at)`, `rest_events`.
**Reloj:** `wearable_devices`, `profile_device_links`, `device_capabilities`, `health_permissions`, `sync_events(event_id UNIQUE, ...)`, `sync_cursors`, `external_health_records(source, external_id UNIQUE)`.
**Auditoría:** `audit_log(profile_id, entity, entity_id, action, at, diff_json)`.
Toda tabla de actividad: `profile_id NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` + índice.

## Reglas
- Eliminar un perfil borra en cascada todos sus datos (verificado con test).
- Validación Zod antes de escribir; consultas siempre parametrizadas.
- Importación/exportación JSON versionada (`schemaVersion`), CSV para sesiones/series; la importación valida completa antes de aplicar y es transaccional.
- Catálogo ampliable sin despliegue: filas con `source` (`builtin|user|import`).
- Datos de salud/IA solo con consentimiento registrado en `user_consents`.

## Backend futuro (opcional, no montar ahora)
Proxy IA sin estado (credenciales, límites, sin persistir perfiles). Sincronización multi-dispositivo y cuentas: fuera de MVP.
