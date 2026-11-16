# ForgeFit — Plan de implementación

## 1. Fases
| # | Fase | Contenido | Hecho cuando |
|---|---|---|---|
| 0 | Auditoría y 6 documentos | Repo vacío; recursos importados | docs coherentes y revisados |
| 1 | Design system + navegación + onboarding vacío | tokens, componentes base, tabs, bienvenida, crear perfil, Inicio vacío/con perfil, SQLite migración 001, iconos/splash | typecheck+lint+tests OK; export Android OK; instalación limpia = 0 datos |
| 2 | Onboarding 8 etapas y perfiles múltiples | selector, borradores, consentimientos | perfiles aislados (test) |
| 3 | Catálogo y entornos | equipamiento, inventario por entorno, búsqueda, JSON | tests de inventario V7 |
| 4 | Ejercicios + validador + motor local | requisitos ALL/ANY | batería de tests de §3 |
| 5 | Sesión y biseries | máquina A1/A2, descanso, recuperación | tests de estado y recuperación |
| 6 | Calendario y rachas | reglas puras | tests de §3 |
| 7 | Biblioteca y vídeos | requiere medios licenciados | — |
| 8 | Anatomía 3D | GLB real; **bloqueo si no hay activo licenciado** | prueba en dispositivo |
| 9 | Progreso/rendimiento | datos reales | — |
| 10 | IA/híbrido | proxy, schema, consentimiento | pruebas adversarias |
| 11 | QA y build Android | APK debug/release | resultados documentados |
| 12 | Wear OS (incremento) | app Kotlin, Data Layer | emulador + dispositivo real |
(El orden numérico final puede ajustarse; el prompt fija 0→10 y Wear OS como incremento separado.)

## 2. Fase 1 — tareas
1. Scaffold Expo en raíz (sin demo del template). 2. Tokens + fuentes Inter + `contrast.test`. 3. Componentes base. 4. Tabs inferiores y rutas vacías con `EmptyState`. 5. Capa SQLite + migración 001 + repositorio de perfiles + Zod. 6. Bienvenida y Crear perfil (alias requerido; modelo, edad, estatura opcionales y vacíos). 7. Inicio: sin perfil → CTA; con perfil → saludo + «Configura tu plan», sin métricas. 8. Iconos adaptativos y splash desde `brand/`. 9. Tests y verificación.
Dependencias nuevas: `expo-sqlite` (persistencia), `zod` (validación), `@expo-google-fonts/inter` (tipografía), `jest-expo`+`@testing-library/react-native`+`jest` (tests).

## 3. Pruebas obligatorias (por fase correspondiente)
Fin de semana de descanso; descanso entre sesiones; reprogramación; sesión omitida; cambio de plan; zona horaria; semana sin entrenos; cambio de perfil; gimnasio sin máquinas; polea simple no habilita crossover; banco sin rack no habilita press pesado; pec deck inverso separado; casa sin equipo; dos entornos; accesorios; IA con ID inventado/ignora restricciones/JSON malformado/fallo de red/prompt injection; cambio de modo; perfiles aislados; sincronización de reloj (motor).

## 4. Matriz pantalla → referencia → componente → test
Estado: ✅ implementado · ⏳ pendiente.
| Pantalla | Referencia | Componente | Test | Estado |
|---|---|---|---|---|
| Bienvenida | v5 01 | `app/welcome` | render + 0 preselección | ⏳ F1 |
| Crear perfil | v5 02/03 | `app/onboarding/profile` | validación + persistencia | ⏳ F1 |
| Inicio sin plan | v5 07 | `app/(tabs)/index` | estados vacío/perfil | ⏳ F1 |
| Objetivo / Días / Plan propuesto | v5 04–06 | — | — | ⏳ F2/F4 |
| Entrenamiento / Descanso | v5 08, ind. 03/04 | — | — | ⏳ F5 |
| Anatomía / Músculos | v5 09, ind. 05/08 | — | — | ⏳ F8 |
| Biblioteca / Detalle | ind. 06/07 | — | — | ⏳ F7 |
| Progreso / Rendimiento | v5 10, ind. 09/10 | — | — | ⏳ F9 |
| Reloj móvil / Wear | v5 11/12, reloj 01–03 | — | — | ⏳ F12 |
| V7 01–06 | v7 individuales | — | — | ⏳ F2/F3/F10 |
Se actualiza al cerrar cada fase.

## 5. Desviaciones frente a las capturas
Registro vivo. Previstas: no mostrar selecciones/datos de muestra; no pedir peso en Datos personales (el prompt prohíbe exigir datos corporales); «Definición» se presentará como preferencia general sin metas de grasa; el check de «Iniciar sesión» de la bienvenida se omite (no hay cuentas).

## 6. Matriz de riesgos
| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Sin GLB licenciado | Alta | Alto | Reportar bloqueo; evaluar activo CC/licenciado o encargo |
| 3D inestable en gama media | Media | Alto | Prototipo temprano, LOD, medición |
| Disco insuficiente para build | Media | Medio | SDK mínimo, limpiar cachés |
| JDK 17 insuficiente para AGP vigente | Baja | Bajo | Verificar en primer build; cambiar |
| Calidad de plan | Media | Alto | Reglas conservadoras, validador, revisión humana |
| Wear OS sin hardware real | Alta | Medio | Emulador + tests; no declarar compatibilidad |
| IA: fuga de datos / prompt injection | Media | Alto | Consentimiento granular, proxy, Zod, whitelist |

## 7. Revisión de coherencia (Fase 0)
- PRD ↔ AppFlow: onboarding de 8 etapas, modos de plan y rachas coinciden.
- TRD ↔ Backend-Schema: SQLite+migraciones, `profile_id` en toda actividad, IA sin claves en cliente.
- UI-UX-Brief ↔ prompt: tokens exactos y matriz de referencias completa (V5, V7, originales).
- Plan ↔ TRD: dependencias de Fase 1 coinciden con §2 del TRD; 3D/reloj fuera de Fase 1.
Puntos abiertos que requieren decisión humana más adelante: proveedor IA y hosting del proxy; origen de activos 3D y vídeos; nombre/ID de paquete Android (`applicationId`).
