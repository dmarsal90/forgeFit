# ForgeFit — TRD

Estado: borrador v1. Versiones verificadas con `npm view` el 2026-11-16.

## 1. Arquitectura
Un repositorio, una app Expo (React Native, TypeScript estricto) en la raíz; carpeta `wear/` reservada para la app Wear OS (Kotlin + Compose for Wear OS, proyecto Gradle independiente) en un incremento posterior.

```
src/app/         rutas expo-router (archivos = rutas)
src/ui/          design system (tokens, Text, Button, Card, Chip, Screen…)
src/features/    onboarding, profiles, equipment, plans, session, library, anatomy, progress
src/domain/      reglas puras sin I/O (rachas, validador de requisitos, motor local, A1/A2)
src/db/          conexión SQLite, migraciones, repositorios
src/lib/         zod schemas compartidos, utilidades
assets/          icono, splash, fuentes (de brand/)
```
Regla: `domain/` no importa React ni expo; es lo que se prueba con tests unitarios.

## 2. Stack y versiones
| Pieza | Versión | Nota |
|---|---|---|
| Expo SDK | ~58.0.25 | |
| React Native / React | 0.88.1 / 19.3.0 | arquitectura nueva |
| TypeScript | ~6.0.3 | `strict` |
| expo-router | ~58.0.31 | rutas tipadas |
| expo-sqlite | ~58.0.17 | persistencia local, consultas parametrizadas |
| zod | 4.6.x | validación en límites (formularios, IA, import JSON) |
| Fuente | Inter (`@expo-google-fonts/inter`) | licencia OFL; números tabulares |
| Tests | jest-expo ~58.0.14 + @testing-library/react-native 14 | |
| 3D (Fase 8) | three 0.187 + expo-gl ~58.0.4 + @react-three/fiber 9.8 (native) | **a verificar en Fase 8** con prueba en dispositivo antes de fijar; alternativa documentada si falla |
Dependencias nuevas se añaden por fase con su razón; no se instala nada de 3D/reloj en Fase 1.

Estado global: contexto React + repositorios SQLite (sin librería de estado extra). Alternativa descartada: Redux/Zustand (innecesario con SQLite como fuente de verdad).

## 3. Datos y offline
SQLite local es la única fuente de verdad. Migraciones SQL versionadas con `PRAGMA user_version`, cada una en transacción. Todas las tablas de actividad llevan `profile_id` con `ON DELETE CASCADE`. Esquema en `Backend-Schema.md`. Exportación JSON/CSV por perfil; backup/restauración con validación Zod. Sin backend en MVP.

## 4. Motores de plan
- **Local** (`domain/planner`): determinista, offline; entradas: perfil, entorno, inventario confirmado, catálogo.
- **Validador** independiente (`domain/validator`): requisitos allOf/anyOf, material, volumen, tiempo, frecuencia, restricciones, IDs existentes. Todo plan (local/IA/híbrido) pasa por él.
- **IA/híbrido**: proveedor configurable detrás de un **proxy propio** (las claves nunca en app/APK/logs); prompt compuesto en runtime desde `AI_PLAN_PROMPT_TEMPLATE.md`; solo campos consentidos; texto libre de usuario nunca como instrucción de sistema; respuesta con JSON Schema versionado + Zod + whitelist de IDs. Fallo ⇒ aviso y opción de motor local, sin cambio silencioso. No se declara integrado hasta probarse con proveedor real.

## 5. Sesión activa
Máquina de estados explícita (A1→A2→descanso→siguiente ronda) con eventos persistidos tras cada transición; tiempo calculado desde marcas temporales y pausas, no con contadores. Recuperación al reabrir.

## 6. Wear OS (incremento separado)
App Kotlin/Compose complementaria; Data Layer (MessageClient/DataClient) con eventos idempotentes (`sessionId, profileId, deviceId, eventId, eventVersion, timestamp`), ACK, reconciliación; Health Services con consentimiento; Health Connect solo para registros. Módulo nativo y development build (no Expo Go). Interfaz `WearableProvider` con capacidades detectables. No se declara compatibilidad por fabricante sin prueba.

## 7. Android y build
`expo prebuild` genera `android/` (ignorado en git); JDK 17 + Android SDK instalados en `~/dev-tools`. Si el build exige JDK más nuevo se actualiza (pendiente de verificar con AGP vigente). Iconos adaptativos por capas desde `brand/icons/android` (sin contorno en foreground).

## 8. Seguridad
Validación Zod en límites; SQL parametrizado; permisos mínimos (ninguno en Fase 1); `.env.example` sin valores; sin secretos en el repo; logs sin datos personales; datos sensibles solo locales salvo consentimiento; protección frente a prompt injection y respuestas adversarias.

## 9. Calidad
`npm run typecheck`, `npm run lint`, `npm test` en cada fase; pruebas de dominio (rachas, validador, A1/A2, perfiles aislados), integración de persistencia, navegación. Fixtures solo en `__tests__/`, nunca en el build. Pruebas en dispositivo/emulador cuando haya SDK de emulación; los resultados se documentan tal cual.

## 10. Riesgos técnicos
| Riesgo | Mitigación |
|---|---|
| 3D en RN/Expo (expo-gl+three) rendimiento/compatibilidad | Prototipo y medición en Fase 8; fallback técnico etiquetado, no sustituye el requisito |
| Sin activos GLB licenciados | Bloqueo reportado; no simular |
| Disco limitado en la máquina de desarrollo (~6 GB libres) | SDK mínimo; limpiar cachés Gradle |
| Wear OS sin dispositivo físico | Emulador Wear OS + pruebas unitarias del motor de sync |
