# ForgeFit — PRD

Estado: borrador v1 (Fase 0). Fuentes: `PROMPT_MAESTRO_V7.md`, `V5_VISUAL_REFERENCE.md`, `V7_VISUAL_REFERENCE.md`, `PROFILES_PLANS_STREAKS.md`.

## 1. Visión
Entrenador personal de fuerza y rendimiento para Android, local-first y sin cuentas. Genera planes explicables a partir del material que la persona tiene de verdad, registra sesiones (incluidas biseries) y muestra progreso y anatomía 3D. Complemento opcional para reloj Wear OS.

## 2. Público
Personas que entrenan con pesas en casa o gimnasio, desde principiantes a avanzadas; varias personas pueden compartir un mismo dispositivo (perfiles independientes). Incluye menores: con cautela y sin objetivos de pérdida de grasa ni ideales corporales.

## 3. Principios no negociables
1. **Cero datos preseleccionados.** Instalación limpia: sin perfil, modelo, edad, estatura, objetivo, días, entorno, equipo, modo de generación, proveedor IA, consentimiento ni plan. Las capturas son ejemplos visuales, nunca valores por defecto.
2. **Solo ejercicios viables** con el equipamiento confirmado (lógica ALL/ANY). «No marcado» ≠ «confirmado ausente».
3. **Plan = propuesta editable + confirmación humana.** Nunca cargas máximas ni ignorar dolor/recuperación.
4. **Privacidad local.** Sin cuentas, sin backend en MVP. IA externa solo con consentimiento granular y revocable; nunca con claves en la app.
5. **Rachas por cumplimiento de sesiones programadas;** los descansos programados son neutros.
6. El modelo 3D es preferencia de representación; no determina rutina, capacidad ni sexo biológico. Los somatotipos no se usan para prescribir.
7. Integraciones (Wear OS, IA, Health Connect) no se declaran terminadas sin prueba real.

## 4. Historias de usuario (resumen)
| ID | Historia | Criterio de aceptación |
|---|---|---|
| U1 | Como persona nueva quiero empezar sin que la app suponga nada de mí | Primer arranque: bienvenida, 0 perfiles, 0 campos preseleccionados |
| U2 | Quiero crear varios perfiles aislados | Dos perfiles no comparten sesiones, planes, métricas ni racha |
| U3 | Quiero declarar mi material por entorno | Inventario independiente por entorno; alternar casa/gimnasio no pisa el plan base |
| U4 | Quiero un plan que respete mi material | Ningún ejercicio sin requisitos satisfechos; propuesta editable y aprobada antes de guardar |
| U5 | Quiero registrar una sesión con biseries | A1→A2→descanso→ronda; sin pérdida tras pausa, salto, cierre accidental |
| U6 | Quiero que fines de semana de descanso no rompan mi racha | L–V cumplidos + S/D descanso mantiene racha el lunes siguiente |
| U7 | Quiero ver anatomía 3D de ejercicios | Modelo glTF real, primarios/secundarios resaltados, alternativa textual |
| U8 | Quiero ver mi progreso | Métricas desde registros reales; estados vacíos explícitos |
| U9 | Quiero usar IA opcionalmente | Consentimiento explícito; validación local; vuelta al motor local sin cambio silencioso |
| U10 | Quiero controlar la sesión desde el reloj | Wear OS en vivo vía Data Layer; la app funciona entera sin reloj |
| U11 | Quiero exportar y borrar mis datos por perfil | JSON/CSV; eliminación por perfil verificable |

## 5. Alcance
**MVP (Fases 1–10):** onboarding de 8 etapas, perfiles, catálogo de equipamiento y ejercicios, motor local, generador IA/híbrido opt-in, sesión con biseries, descanso, biblioteca, anatomía 3D, progreso, calendario y rachas, exportación.
**Incremento separado:** app Wear OS + sincronización; Health Connect.
**Fuera de alcance:** cuentas, suscripciones, backend remoto propio salvo proxy IA opcional, iOS/Apple Watch, compatibilidad universal de relojes, fotos obligatorias, dietas.

## 6. Requisitos funcionales
RF1 Perfiles (crear/editar/seleccionar/archivar/exportar/eliminar). RF2 Onboarding progresivo de 8 etapas (perfil, objetivos, experiencia, disponibilidad, entornos, auditoría de equipo, preferencias/precauciones, revisión), omisible en lo opcional, pausable/reanudable. RF3 Catálogo de equipamiento con ID estable, alias ES/EN, atributos, variantes, estados disponible/no disponible/desconocido, búsqueda y filtros, importación/exportación JSON. RF4 Ejercicios como patrón motor + músculos + variantes + requisitos allOf/anyOf. RF5 Motores de plan local/IA/híbrido + validador determinista. RF6 Sesión activa y biseries. RF7 Calendario, reprogramación y rachas. RF8 Biblioteca y detalle. RF9 Anatomía 3D. RF10 Progreso y rendimiento. RF11 Reloj (incremento separado). RF12 Exportar/restaurar.

## 7. Requisitos no funcionales
Android (minSdk del SDK Expo vigente), offline completo salvo IA, contraste WCAG 2.2 AA, áreas táctiles ≥48 dp, escalado de texto, movimiento reducido, rendimiento estable en gama media, sin secretos en el repo/APK/logs.

## 8. Criterios de aceptación globales (V7)
Los 10 criterios V7 del prompt maestro aplican tal cual; su trazabilidad pantalla→referencia→componente→test está en `Implementation-Plan.md` §4.

## 9. Riesgos de producto
Activos 3D con licencia (bloqueante de Fase 8 si no existen); vídeos de demostración licenciados; cobertura del catálogo de ejercicios; calidad de plan sin revisión experta (mitigación: reglas conservadoras + aviso de consultar profesionales).
