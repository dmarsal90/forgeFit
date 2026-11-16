# ForgeFit — AppFlow

Referencias de pantalla: ver `UI-UX-Brief.md`. Los ejemplos de las capturas no son valores por defecto.

## 1. Mapa de rutas (expo-router)
```
/                     → redirige según estado
/welcome              bienvenida (sin perfiles)
/profiles             selector de perfiles
/onboarding/[step]    etapas 1–8 (profile, goals, experience, availability, environments, equipment, preferences, review)
/(tabs)/index         Inicio
/(tabs)/routines      Rutinas (plan/calendario)
/(tabs)/exercises     Ejercicios (biblioteca)
/(tabs)/progress      Progreso / Rendimiento
/(tabs)/more          Más (perfiles, entornos, reloj, datos, ajustes)
/exercise/[id]        detalle · /exercise/[id]/anatomy
/session/[id]         entrenamiento activo · /session/[id]/rest
/plan/proposal        propuesta editable · /plan/mode (local/IA/híbrido)
/equipment/...        catálogo, ficha, inventario por entorno
/watch                conectar reloj (incremento separado)
```

## 2. Arranque
```mermaid
flowchart TD
  A[Arranque] --> B{¿Hay perfiles activos?}
  B -- No --> W[/welcome: Comenzar/]
  W --> O[/onboarding/profile/]
  B -- Sí, uno activo recordado --> H[Inicio]
  B -- Sí, varios sin activo --> P[/profiles/]
  P --> H
  O -->|perfil guardado| H
  H --> C{¿Plan activo?}
  C -- No --> E[Estado vacío: Configura tu plan]
  C -- Sí --> D[Tarjeta del día, semana, progreso real]
```
Reglas: primera ejecución = 0 perfiles; nunca se preselecciona opción alguna; el perfil activo solo se recuerda tras elegirlo el usuario.

## 3. Onboarding (8 etapas, pausable)
```mermaid
flowchart LR
  1[Perfil] --> 2[Objetivos] --> 3[Experiencia] --> 4[Disponibilidad] --> 5[Entornos] --> 6[Equipamiento] --> 7[Preferencias] --> 8[Revisión y modo]
  8 -->|aprobar| S[(guardar plan)]
  8 -->|editar| 1
```
Cada etapa: Volver, Guardar progreso (borrador por perfil), Omitir (opcionales), validación Zod con errores accesibles. Solo alias es imprescindible. Plan no se genera hasta haber objetivo y disponibilidad suficientes; alternativa «crear manualmente».

## 4. Generación de plan
```mermaid
flowchart TD
  M[Elegir modo: local / IA / híbrido] --> L{¿IA o híbrido?}
  L -- Sí --> K{¿Consentimiento + red + proveedor?}
  K -- No --> F[Ofrecer motor local; sin cambio silencioso]
  K -- Sí --> G[Prompt runtime + datos consentidos]
  L -- No --> X[Motor local]
  G --> V[Validador local: schema, IDs, requisitos, límites]
  X --> V
  V -->|inválido| R[Rechazar/reparar con traza]
  V -->|válido| U[Vista previa editable + razones]
  U -->|aprobar| S[(guardar con versión y trazabilidad)]
```

## 5. Sesión activa y biseries
```mermaid
stateDiagram-v2
  [*] --> Pendiente
  Pendiente --> A1: iniciar
  A1 --> A2: completar serie A1
  A2 --> Descanso: completar serie A2
  Descanso --> A1: ronda siguiente
  Descanso --> Resumen: última ronda
  A1 --> Pausa: pausar
  A2 --> Pausa
  Descanso --> Pausa
  Pausa --> A1: reanudar
  A1 --> A2: saltar / reordenar
  Resumen --> [*]
```
Cada transición se persiste (evento + marcas de tiempo). Cierre accidental ⇒ al reabrir se ofrece reanudar. Corrección de serie permitida con traza. Ejercicio individual = bloque con un solo miembro.

## 6. Calendario y rachas
Estados de `scheduled_sessions`: programada, completada, pendiente, omitida, reprogramada; días: descanso planificado, descanso extraordinario. Racha semanal: semana cumplida si todas las sesiones vencidas están realizadas o válidamente reprogramadas; descansos neutros; semana sin sesiones pausa; reprogramaciones auditadas en `session_reschedules`. Mensajes sin culpa.

## 7. Reloj (incremento separado)
Estados: no compatible · detectado · permisos pendientes · conectado · sincronizando · desconectado. El móvil funciona íntegro sin reloj. El perfil activo es el único cuyos datos llegan al reloj vinculado.

## 8. Estados transversales
Vacío, carga (skeleton), error recuperable, sin conexión (IA), permisos revocados (salud) con texto accesible alternativo a todo visual (3D, gráficos).
