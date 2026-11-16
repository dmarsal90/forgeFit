# DIRECTIVA V7 — PRIORIDAD ABSOLUTA (LEER PRIMERO)

**Entrega v7:** el paquete incorpora todas las referencias previas V5/V6 y SEIS NUEVAS VISTAS de evaluación, objetivos, entornos, inventario de pecho, inventario de piernas y generador local/IA/híbrido. Abrir `docs/V7_VISUAL_REFERENCE.md`, `visual/v7_nuevas_pantallas/ForgeFit_V7_formularios_completo.png` y cada PNG de `visual/v7_nuevas_pantallas/individuales/`. Mantener el diseño visual V5 aprobado; V7 añade pantallas, NO sustituye las existentes.

**Sin datos precargados:** aunque los bocetos exhiban selecciones para demostrar el estado visual, en producción no seleccionar experiencia, sexo/modelo, edad, estatura, objetivos, entornos, máquinas, días, modo de generación, proveedor de IA, consentimiento ni rutinas. Las opciones del boceto son solo ejemplos visuales.

**Antes de modificar código:** auditar el repo y crear/completar los seis documentos `docs/PRD.md`, `docs/TRD.md`, `docs/AppFlow.md`, `docs/UI-UX-Brief.md`, `docs/Backend-Schema.md`, `docs/Implementation-Plan.md`; incluir V7, arquitectura del catálogo, generación local/IA/híbrida, privacidad, sincronización Wear OS, 3D y pruebas. Revisar coherencia de los seis documentos y arquitectura ANTES de implementar.

**Seguridad y calidad de planes:** usar una biblioteca estructurada de ejercicios y equipos, validador determinista de compatibilidad y limitaciones, propuesta editable y confirmación humana. No generar cargas máximas ni recomendaciones que ignoren dolor o recuperación. Para menores, no prescribir pérdida de grasa o ideales corporales. Somatotipos NO determinan entrenamiento.

**IA externa:** integración opcional con proveedor configurable; las credenciales no deben quedar embebidas en APK ni exponerse en logs. El prompt se compone en tiempo de ejecución desde `docs/AI_PLAN_PROMPT_TEMPLATE.md` y el perfil autorizado, con identificadores válidos de ejercicios, inventario y restricciones. El modelo no puede autorizar ejercicios fuera del inventario: toda respuesta se valida con JSON Schema/Zod, reglas locales y revisión por el usuario. Si no hay conectividad o consentimiento, conservar motor local.

---

# FORGEFIT — PROMPT MAESTRO V7 PARA CODEX

## REFERENCIAS APROBADAS V5 Y NUEVAS V7
Este paquete incluye el NUEVO boceto visual aprobado: `visual/v5_aprobado/ForgeFit_V5_boceto_completo.png`, sus **12 vistas individuales** en `visual/v5_aprobado/pantallas_individuales/` y **3 vistas individuales Wear OS** en `visual/v5_aprobado/reloj_individual/`. Estas referencias V5 tienen **prioridad sobre cualquier referencia anterior** en materia de apariencia y composición. Las 10 vistas originales en `visual/individual/` siguen como referencias complementarias para funciones no representadas en V5. Lee `docs/V5_VISUAL_REFERENCE.md` antes de diseñar o programar. Mantén el lenguaje Dark Performance (carbón, verde Volt, cards premium, visualización anatómica 3D y estadísticas consistentes) con máxima fidelidad; no generes una interfaz alternativa.

### CERO DATOS PRESELECCIONADOS
En el primer arranque NO existe perfil, modelo anatómico, edad, estatura, objetivo, días, descansos, plan, datos de entrenamiento ni métricas. Aunque las imágenes muestren elecciones masculinas, fuerza, 5 días, descansos o estadísticas, son **ejemplos de la maqueta, no valores por defecto**. Todos los campos comienzan vacíos; seleccionar o completar solo tras acción expresa del usuario. Datos no esenciales son opcionales. La selección del modelo visual no define capacidades ni prescribe rutinas.

### RELOJES Y SINCRONIZACIÓN
Diseñar la experiencia de reloj de las 3 capturas y crear app complementaria Wear OS para dispositivos compatibles (incluidos Galaxy Watch Wear OS), con rutina del día, ejercicio/biserie, series, cronómetro sincronizado, descanso, controles y recuperación offline. Implementar con API Data Layer y estado de sesión canónico; Health Services para sensores compatibles con permiso y Health Connect para registros, no para control en vivo. Otros fabricantes: arquitectura de adaptadores y detección de capacidades; NO garantizar compatibilidad universal. El reloj no es obligatorio para usar la app.

### RACHAS
Los descansos programados son neutros y nunca rompen rachas. La constancia se evalúa contra sesiones programadas, con reprogramaciones y cambios de calendario auditables. No penalizar sábados o domingos cuando estén marcados como descanso.

### DOCUMENTACIÓN ANTES DE CÓDIGO
Inspecciona repo y crea/completa primero, con coherencia y criterios verificables, `docs/PRD.md`, `docs/TRD.md`, `docs/AppFlow.md`, `docs/UI-UX-Brief.md`, `docs/Backend-Schema.md`, `docs/Implementation-Plan.md`. Deben citar las imágenes V5, contemplar multi-perfil, onboarding vacío, Wear OS, compatibilidad realista, modelo 3D y rachas. **No tocar código hasta finalizar los seis documentos y revisar la arquitectura.** Después implementar solo el alcance autorizado; no fingir integraciones terminadas.

---

# FORGEFIT — PROMPT MAESTRO PARA CODEX
## Android · Implementación guiada por diseño aprobado

Actúa como arquitecto senior React Native/Expo, diseñador de producto mobile premium, ingeniero de gráficos 3D, especialista en sistemas de entrenamiento, QA y seguridad. Trabaja sobre el repositorio existente, sin reemplazarlo por un proyecto nuevo salvo justificación y autorización explícita.

## FUENTES DE VERDAD Y PRIORIDAD
1. La composición V5 `visual/v5_aprobado/ForgeFit_V5_boceto_completo.png` y sus vistas separadas son la referencia visual **principal aprobada**; el boceto anterior y las 10 pantallas de `visual/individual/` son referencias complementarias. NO rediseñes libremente, NO cambies la paleta ni la estética.
2. `docs/DESIGN_SYSTEM.md`, `docs/SCREEN_SPECS.md`, `docs/3D_AND_MOTION.md`, `docs/EXERCISE_AND_DATA.md` son las especificaciones complementarias. Las imágenes son referencias conceptuales, no componentes listos ni recursos con licencia de producción. Reproduce la estructura y la apariencia con componentes nativos, adaptando de manera responsable detalles de legibilidad y accesibilidad.
3. Respeta el código y datos existentes. No afirmes que una función funciona sin probarla.

## PUERTA OBLIGATORIA DE DOCUMENTACIÓN — ANTES DE EDITAR CÓDIGO
Inspecciona el repositorio y CREA/COMPLETA estos seis documentos en `docs/`:
- `PRD.md`: visión, público, casos de uso, historias, MVP, requisitos y criterios de aceptación.
- `TRD.md`: arquitectura, versiones verificadas, dependencias, decisiones y alternativas, offline, Android, pruebas y seguridad.
- `AppFlow.md`: rutas y estados, flujos de entrenamiento, biseries, descanso, recuperación de sesión, diagramas Mermaid.
- `UI-UX-Brief.md`: especificación exacta de las pantallas V5 y de las diez originales complementarias, design tokens, layouts, tipografía, componentes, movimiento, accesibilidad, y referencias a imágenes del paquete.
- `Backend-Schema.md`: esquema SQLite real, relaciones, migraciones, exportación, futuro backend opcional; no montar servidor innecesario.
- `Implementation-Plan.md`: fases, tareas, dependencias, pruebas, criterios de terminado y matriz de riesgos.

Los seis documentos deben ser coherentes y suficientemente completos para implementar sin inventar decisiones. Verifica que todos existen, que enlazan a los recursos de diseño y que el plan concuerda con la arquitectura. **No modifiques código de la app antes de completar esta etapa.** Después revisa la arquitectura y ejecuta únicamente el alcance autorizado; si la ejecución es autónoma, limita el primer incremento a design system, navegación y una pantalla funcional, dejando el resto planificado. No declares entregado un módulo incompleto.

## DISEÑO VISUAL OBLIGATORIO
- Nombre visual: ForgeFit. Estilo Dark Performance / interfaz de rendimiento futurista, carbón y grafito, verde lima Volt como acento.
- Tokens: fondo `#101318`, superficie `#222A33`, acción `#B8F36B`, texto `#E8EDF2`, secundario `#98A3AE`, borde `#343D47`. Deriva tokens adicionales con contrastes WCAG; no usar un degradado de neón en todo.
- Jerarquía visual, bordes, sombras suaves, tarjetas oscuras, chips, botones verdes, indicadores circulares y bottom navigation deben seguir las referencias.
- Tipografía Inter o equivalente con licencia válida, números tabulares para datos.
- Safe areas Android, escalado de texto, 48dp mínimos de toque, contrastes, estados de error, skeletons, dark mode y `prefers-reduced-motion`/ajuste equivalente en Android.
- Animaciones sutiles de transición, tarjetas, completado, temporizador y gráficos; rendimiento estable en Android de gama media, sin animación ornamental que dificulte registrar una serie.

## DIEZ PANTALLAS — CORRESPONDENCIA EXACTA
01 Inicio: si no hay perfil, comenzar onboarding; si hay perfil, saludo, calendario semanal, tarjeta del día y progreso; no mostrar métricas ficticias.
02 Rutina: días configurados por el perfil, músculos, estado, navegación al entrenamiento; si no hay plan, mostrar estado vacío y crear plan.
03 Entrenamiento activo: biserie A1/A2, ejercicio, demo, músculos, series, peso, reps, RIR, botón completar.
04 Descanso: temporizador circular, controles, siguiente ejercicio.
05 Anatomía del ejercicio: modelo humano 3D real, músculos primarios/secundarios, giro, zoom, selección.
06 Biblioteca: búsqueda, filtros por grupo, tarjetas con ejercicios y equipamiento.
07 Detalle: demo, instrucciones, errores, cadencia, pestañas músculos/variantes.
08 Músculos: modelo anatómico 3D anterior/posterior interactivo y filtros.
09 Progreso: volumen, series, fuerza, gráfico histórico y reparto muscular.
10 Rendimiento: métricas, consistencia y mapa muscular semanal sobre modelos 3D.

## 3D REAL — NO SUSTITUIR POR IMAGEN 2D
La anatomía debe ser un modelo glTF/GLB real, renderizado e interactivo, con mesh/materiales segmentados por músculos o grupos, cámara orbitable y zoom acotado, vista anterior/posterior, resaltado de músculos principales y secundarios, y modo accesible con listado textual. Verifica compatibilidad Expo/React Native antes de elegir librería (expo-gl/three/R3F u otra). Adquiere o crea assets originales/licenciados, conserva atribución cuando corresponda, y registra licencias. Implementa LOD/compresión, carga diferida, fallback técnico explícito si WebGL falla; el fallback NO sustituye el requisito final de 3D. Nunca uses la imagen de referencia como si fuese el modelo 3D.

## ENTRENAMIENTO Y BISERIES
- Plantilla opcional de cinco días, NO seleccionada por defecto: lunes pecho/hombros/tríceps; martes espalda/bíceps/abdomen; miércoles piernas; jueves pecho/espalda/hombros; viernes piernas/brazos/abdomen.
- Rango principal configurable 6–10 reps, accesorios con rangos específicos; carga, reps, RIR, notas, descanso, cadencia, historial, estado de sesión.
- Biseries mismo músculo: press banca barra + aperturas mancuernas; jalón al pecho + remo unilateral (serrucho). Antagonistas: curl bíceps + extensión tríceps; extensión cuádriceps + curl femoral. Permitir editar combinaciones.
- Motor de estados explícito: A1 → A2 → descanso → ronda siguiente; tolerar pausa, salto, corrección y cierre accidental sin pérdida.
- Excéntrica orientativa 2–3 s cuando proceda, sin prometer beneficios garantizados por tempos lentos.
- Doble progresión explicable, recomendaciones prudentes y editables, sin aumentos automáticos de carga ni tests máximos obligatorios.
- Biblioteca de demostraciones en vídeo corto con permisos claros; reproductor, loop, pausa, descripción y alternativa offline cuando exista licencia.

## MODELO DE DATOS Y ANÁLISIS
Especifica e implementa con migraciones SQLite entidades: exercises, muscles, exercise_muscles(role primary/secondary), media_assets, programs, workout_days, exercise_blocks, superset_members, planned_sets, workout_sessions, performed_sets, rest_events, recommendations, settings. Relaciones consistentes y transacciones. Historial, tendencias, volumen estimado y adherencia; etiquetas claras sobre qué miden las métricas. Exportación JSON/CSV, privacidad local, backup/restauración. No subir fotos, historial o datos sensibles sin consentimiento.

## SEGURIDAD, CALIDAD Y ENTREGA
Validación Zod, consultas parametrizadas, permisos mínimos, no secretos en app, manejo de errores, test unitarios del motor A1/A2 y progresión, integración de persistencia, navegación y recuperación, pruebas en dispositivo Android. Verifica `typecheck`, lint, tests y build; documenta resultados reales. No añadas planes comerciales, suscripciones, cuentas ni backend remoto en MVP.

## ORDEN DE EJECUCIÓN
0 Auditoría del repo → 1 Seis documentos completos → 2 Revisión de diseño/arquitectura y plan → 3 Design system → 4 Navegación y layouts → 5 Sesión y biseries → 6 SQLite → 7 Biblioteca y vídeos → 8 Anatomía 3D real → 9 Analítica con misma apariencia → 10 QA y build Android.

**ENTREGABLES:** seis documentos, componentes implementados de la fase autorizada, pruebas, lista de archivos cambiados, diferencias frente al diseño aprobado y próximos pasos. Si falta un recurso 3D licenciado, reporta bloqueo y no simules que está resuelto.

# AMPLIACIÓN OBLIGATORIA — PERFILES, PERSONALIZACIÓN Y RACHAS

Esta sección prevalece ante cualquier requisito previo que suponga un único usuario, un único modelo masculino o una racha basada en días naturales consecutivos.

## Perfiles independientes
- Permitir crear, editar, seleccionar y archivar varios perfiles locales en un mismo dispositivo, sin mezclar sesiones, rutinas, métricas, objetivos, preferencias ni recomendaciones.
- Campos: nombre/apodo, modelo anatómico 3D preferido (masculino/femenino; opción de cambiarlo en cualquier momento), edad o fecha de nacimiento opcional, estatura opcional, objetivos, experiencia, días de disponibilidad, duración por sesión, equipos disponibles, preferencias y limitaciones declaradas.
- El modelo visual es una preferencia de representación, NO un indicador de sexo biológico, fuerza, habilidad ni un factor que determine automáticamente la rutina. No inferir capacidades por sexo, género o aspecto.
- No exigir datos corporales para empezar. Tratar edad/estatura y cualquier dato personal como información privada; facilitar edición, exportación y eliminación por perfil.
- Añadir selector de perfiles y onboarding en el mismo lenguaje visual Dark Performance del diseño aprobado. Mantener las diez referencias existentes y diseñar nuevas pantallas coherentes para selección de perfil, onboarding, propuesta de plan, edición de calendario y gestión de descansos.

## Generador de planes explicable
- Generar una propuesta editable según objetivo, experiencia, días disponibles, duración, material y limitaciones; ofrecer una explicación breve de las decisiones y pedir confirmación antes de guardar.
- No generar cargas máximas ni prescribir dietas restrictivas. Dar prioridad a la técnica, progresión gradual, distribución razonable de grupos musculares y recuperación.
- Para usuarios menores de edad, adaptar las recomendaciones con cautela y no ofrecer objetivos de pérdida de grasa o apariencia física como metas prescriptivas.
- Mantener el programa de cinco días ya definido como plantilla seleccionable, no como obligación para todos.
- El modelo anatómico 3D debe poder cambiarse sin perder datos y resaltar músculos primarios/secundarios del ejercicio.

## Calendario y rachas por cumplimiento del plan
- La racha mide cumplimiento de sesiones PROGRAMADAS, no días naturales seguidos.
- Un descanso programado es neutro: NO suma una sesión y NO rompe la racha. Ejemplo: entrenar lunes a viernes y descansar sábado y domingo conserva la racha hasta la siguiente sesión programada.
- Distinguir: sesión programada, completada, pendiente, omitida, reprogramada, descanso planificado y descanso extraordinario. Registrar historial de cambios para evitar inconsistencias.
- Definir una regla de cumplimiento configurable (p. ej. completar sesión o marcarla como realizada); no imponer completar todas las series como única opción.
- Si una sesión se reprograma antes de su vencimiento, evaluar el cumplimiento contra el calendario vigente; evitar penalizar dos veces. Permitir corregir errores de registro con trazabilidad.
- Las semanas con todos sus entrenamientos programados cumplidos incrementan la racha semanal; los días de descanso no la alteran. En semanas sin entrenamientos programados, pausar la racha en lugar de incrementarla artificialmente.
- Visualizar claramente sesiones completadas (check verde), descansos (luna gris), sesiones próximas y sesiones omitidas, con explicaciones accesibles.
- Evitar mensajes de culpa, presión o incentivos para entrenar lesionado o durante descansos.

## Modelo de datos y pruebas
- Introducir entidades `profiles`, `profile_preferences`, `training_goals`, `training_plans`, `plan_days`, `scheduled_sessions`, `session_reschedules`, `workout_sessions`, `exercise_sets`, `rest_days`, `streak_snapshots` (opcional/cache). Todas las entidades de actividad deben relacionarse con `profile_id`.
- Definir reglas puras y pruebas unitarias para: fin de semana de descanso, descanso entre sesiones, reprogramación, sesión omitida, cambio de plan, zona horaria, días sin entrenamiento y cambio de perfil.
- Revisar y actualizar obligatoriamente PRD, TRD, AppFlow, UI/UX Brief, Backend Schema e Implementation Plan ANTES de modificar código; añadir criterios de aceptación de estos requisitos y validar consistencia.
- Prohibido cambiar las referencias visuales aprobadas de las diez pantallas salvo adaptación justificada a múltiples perfiles; nuevas vistas deben seguir exactamente los tokens y patrones existentes.



# AMPLIACIÓN V4 — ONBOARDING VACÍO Y RELOJES INTELIGENTES

**Esta sección prevalece sobre cualquier ejemplo, fixture, perfil predeterminado o selección automática anterior.**

## Primera ejecución SIN DATOS
- La app arranca sin perfiles, sin rutinas, sin objetivo, sin edad, sin estatura, sin sexo, sin modelo anatómico elegido y sin historial. Ningún campo personal debe tener valor precargado; tampoco seleccionar silenciosamente una opción del selector.
- La primera pantalla es bienvenida / crear perfil. Solicitar nombre o alias, modelo anatómico 3D preferido (masculino/femenino y opción de omitir hasta elegir), edad opcional, estatura opcional, objetivo, experiencia, días y horarios, duración por sesión, equipamiento, preferencias y limitaciones declaradas. No inferir sexo ni capacidad a partir del modelo 3D.
- Proporcionar validaciones claras, opciones de omitir datos no esenciales y explicaciones de privacidad. No generar un plan hasta que el usuario elija objetivo y disponibilidad suficientes; permitir elegir entre generar plan y crear manualmente.
- El programa avanzado de 5 días existe SOLO como plantilla explícitamente seleccionable, jamás como plan inicial. No crear registros de entrenamiento ficticios, rachas o estadísticas precargadas.
- Los fixtures para tests deben estar aislados del build de producción y no poblar la base de datos real.
- Los perfiles son independientes: datos, reloj vinculado, sesiones, calendario, rachas y preferencias por `profile_id`. Cambiar de perfil no debe mezclar información de un reloj asociado a otro usuario.

## Integración de relojes: alcance verificado y limitaciones
- **Wear OS / Galaxy Watch compatible**: desarrollar una aplicación complementaria nativa Wear OS (Kotlin + Jetpack Compose for Wear OS, o alternativa documentada y validada), junto a la aplicación React Native Android. No asumir que Expo Go puede ejecutar integración nativa Wear OS; preparar módulos nativos, development build y pipeline Gradle.
- Para sincronización bidireccional de rutina y sesión en tiempo casi real, usar **Wear OS Data Layer API** (MessageClient/DataClient) con app instalada y firmada coherentemente en móvil y reloj. Diseñar eventos idempotentes, secuencias/versiones y confirmaciones; almacenar localmente y reconciliar al reconectar. No asumir latencia cero ni conexión permanente.
- Compartir: perfil activo autorizado, ID de sesión, ejercicio actual, A1/A2, ronda, series previstas/completadas, peso/reps/RIR registrados, inicio y pausas, tiempo transcurrido, temporizador de descanso, siguiente ejercicio, y comandos iniciar/pausar/reanudar/completar serie. El reloj debe mostrar información legible y permitir interacción sencilla sin depender de tener el móvil en la mano.
- Un solo estado canónico por sesión; tiempo calculado a partir de marcas temporales e intervalos de pausa, no de sumar contadores independientes. Resolver duplicados, mensajes fuera de orden, conflictos y desconexiones; nunca perder registros.
- **Health Services (Wear OS)** para métricas compatibles como frecuencia cardíaca, solo con consentimiento explícito, permisos mínimos y capacidades verificadas del dispositivo. No inferir automáticamente repeticiones ni calidad técnica a partir del pulso.
- **Health Connect en el móvil** para importar/exportar tipos compatibles (p. ej. ExerciseSessionRecord y frecuencia cardíaca cuando esté disponible). Es intercambio de datos de salud, NO sustituto de la sincronización en vivo de ejercicios y series. Samsung Health puede tardar en transferir datos; no prometer sincronización inmediata.
- **Otros relojes**: definir arquitectura `WearableProvider` con capacidades detectables (`liveSession`, `remoteControls`, `healthMetrics`, `completedWorkoutSync`). Compatibilidad universal NO garantizada: dispositivos Wear OS con app complementaria pueden tener control de sesión; Garmin/Fitbit/Amazfit y otros dependen de APIs, permisos y soporte de fabricante y pueden limitarse a importar resúmenes. Apple Watch no tiene integración directa equivalente con esta app solo Android. Mostrar capacidades reales por dispositivo, no botones que aparenten funcionar.
- No iniciar un entrenamiento duplicado en Samsung Health y ForgeFit sin estrategia explícita de deduplicación; identificadores de origen y sincronización.

## Nuevas pantallas y estados
1. Bienvenida y perfil vacío.
2. Onboarding paso a paso sin valores precargados.
3. Objetivo, equipamiento y calendario.
4. Previsualización editable de plan propuesto.
5. Conectar reloj: detectado/no compatible/pendiente/permisos/desconectado/sincronizando.
6. Pantalla Wear OS de entrenamiento activo: ejercicio, A1/A2, series, cronómetro, descanso y completar serie.
7. Historial de sincronización, errores recuperables y permisos.
8. Estado vacío para calendario, estadísticas y racha antes de completar sesiones.

Mantener en todas las pantallas el estilo Dark Performance aprobado: `#101318`, `#222A33`, `#B8F36B`, `#E8EDF2`; diseño del reloj adaptado a pantalla circular, legibilidad, batería y accesibilidad. Anatomía 3D real en móvil; en reloj usar indicadores ligeros, no cargar modelos 3D pesados innecesarios.

## Datos y seguridad
Extender Backend-Schema con `wearable_devices`, `profile_device_links`, `sync_events`, `sync_cursors`, `device_capabilities`, `health_permissions`, `external_health_records` y campos `source`, `external_id`, `revision`, `updated_at`, `deleted_at` donde corresponda. Definir consentimiento, revocación, desvinculación y eliminación. No exponer datos de un perfil en el reloj vinculado a otro.

## Criterios de aceptación obligatorios
- Instalación limpia: cero perfiles, cero planes, cero entrenamientos, cero rachas; onboarding sin edad/estatura/modelo/objetivo precargados.
- Crear perfil y plan manual o generado; cambiar de perfil sin contaminación de datos.
- Cinco sesiones programadas completadas lunes-viernes + descanso sábado-domingo: la racha se mantiene el lunes siguiente.
- Galaxy Watch Wear OS compatible: abrir sesión en móvil y visualizarla en reloj; completar serie desde cualquiera y observarla en el otro tras sincronizar.
- Cronómetro y pausas coherentes tras bloquear pantalla, desconectar y reconectar; no duplicar series.
- Sin reloj conectado: la app móvil funciona íntegramente.
- Reloj sin integración en vivo: comunicar límites claramente y ofrecer Health Connect solo cuando corresponda.
- Revocar permisos de salud: la app continúa funcionando sin métricas del reloj.
- Pruebas unitarias del motor de sincronización, pruebas en emulador Wear OS y, cuando esté disponible, prueba real con Galaxy Watch. No declarar compatible un fabricante sin verificarlo.

## Documentación primero
Actualizar los seis documentos PRD, TRD, AppFlow, UI-UX Brief, Backend-Schema e Implementation-Plan ANTES de modificar código. Incluir arquitectura de dos aplicaciones (Android y Wear OS), matriz de compatibilidad, estrategia offline, estados de permisos, estimación de complejidad y fases. Implementar primero el onboarding vacío y persistencia; después sincronización Wear OS en un incremento separado y verificable. No afirmar que la integración ya está funcionando por haberla documentado.


# AMPLIACIÓN V6 OBLIGATORIA — EVALUACIÓN DEPORTIVA, EQUIPAMIENTO EXACTO E IA

## Regla de precedencia
Esta ampliación V6 prevalece sobre cualquier lista genérica de «banco», «polea» o «gimnasio completo» y sobre cualquier generación de rutinas que ignore el inventario. Mantener intacto el estilo Dark Performance V5 y sus capturas aprobadas; las pantallas nuevas deben adoptar ese diseño. No establecer datos preseleccionados. Antes de editar código, completar los seis documentos exigidos incorporando todos estos requisitos y revisar el plan.

## Onboarding progresivo de ocho etapas
1. Perfil: alias, edad opcional, estatura opcional, modelo 3D visual independiente de la prescripción, unidades, consentimiento y privacidad.
2. Objetivos: fuerza, hipertrofia, fuerza+hipertrofia, resistencia, condición general, movilidad, potencia y objetivos combinados; prioridades musculares y objetivos secundarios. «Definición/recomposición» puede figurar como preferencia general sin sugerir restricciones alimentarias, metas de grasa ni ideales corporales; especialmente evitar prescripciones de pérdida de peso para menores.
3. Experiencia: años, familiaridad con movimientos, nivel autodeclarado, cargas conocidas opcionales, RPE/RIR, historial y disciplinas; no asumir capacidad por edad o anatomía.
4. Disponibilidad: días específicos, duración, pausas, preferencias de división, sesiones por semana, recuperación y sueño opcionales; días de descanso neutros para rachas.
5. Entornos: casa, gimnasio, exterior, viajes; varios inventarios reutilizables y conmutables.
6. Auditoría de equipamiento: catálogo exhaustivo por categoría, variantes individuales, atributos, fotos identificativas licenciadas, buscador, filtros, selección múltiple, favoritos, «no tengo equipamiento», importación/exportación JSON; nunca asumir que un gimnasio posee un elemento.
7. Preferencias y precauciones: pesos libres/máquinas/mixto/calisthenics, biseries, superseries, series tradicionales, tempo, grupos prioritarios, ejercicios preferidos/excluidos, movilidad, dolor o limitaciones declaradas opcionales, tiempo disponible; no diagnosticar ni recomendar superar dolor.
8. Revisión y propuesta: resumen editable, modos motor local / IA / híbrido, razones, estimación temporal, compatibilidad del material, advertencias y aprobación explícita antes de guardar.
Permitir omitir información opcional, pausar/reanudar onboarding, editar después, mantener perfiles independientes.

## Catálogo exhaustivo, normalizado y extensible
Consultar `docs/EQUIPMENT_TAXONOMY.md` y `docs/PLAN_GENERATION.md`. Inventariar por separado: estación/máquina física, variantes, accesorios, capacidad y configuración (por ejemplo banco plano vs inclinable, Smith vertical vs inclinada, polea simple fija vs doble regulable, agarres disponibles, pesos/rangos). Incluir pecho, espalda, hombros, piernas/glúteos, brazos, abdomen, pesos libres, calistenia, cardio y movilidad. Cada elemento debe tener ID estable, aliases ES/EN, categoría, características, rango de resistencia opcional, ubicación, disponibilidad y fuente. Distinguir «no seleccionado» de «confirmado ausente»; no asumir equipamiento disponible por defecto.
Modelar cada ejercicio como patrón motor + músculos primarios/secundarios + variantes + dificultad + precauciones + opciones de configuración alternativas. Requisitos con lógica ALL/ANY: press banca barra necesita barra+discos+banco+soporte seguro; cruce bilateral necesita dos poleas compatibles; pec deck y pec deck inverso no son el mismo ejercicio; fondos lastrados requieren paralelas y medio de lastre. Validación determinista estricta de cada ejercicio antes de mostrar/guardar una propuesta.

## Tres motores de planificación
A) Local, sin conexión, determinista, explicable y verificable. B) IA externa opt-in, configurable por proveedor y modelo con credenciales seguras gestionadas por backend/proxy; no incrustar API keys en la app. C) Híbrido: motor local construye conjunto de ejercicios elegibles, estructura y límites; IA propone orden, variantes y razonamiento dentro de restricciones; validador local rechaza o repara propuestas inválidas con trazabilidad. Si falla IA o red, permitir regresar al motor local, sin cambiar silenciosamente el modo.
Generar el prompt dinámico en tiempo de ejecución a partir de `docs/AI_PLAN_PROMPT_TEMPLATE.md`, enviando únicamente campos consentidos y datos mínimos; nunca interpolar texto del usuario como instrucciones del sistema. Proteger contra prompt injection en notas libres y respuestas de proveedores. Usar JSON estructurado con schema versionado y validación Zod/JSON Schema, whitelist de exercise IDs, límites de volumen/tiempo, descanso, equipamiento, incompatibilidades, restricciones y reglas de seguridad. Mostrar motivo y procedencia de cada recomendación; guardar versión del prompt, modelo, consentimientos y decisiones sin almacenar innecesariamente datos sensibles.

## Composición corporal y somatotipos
Permitir registrar opcionalmente medidas autodeclaradas o medidas obtenidas de dispositivos compatibles, con fecha, método, unidades, procedencia, incertidumbre y opción de no compartirlas con IA. No exigir fotos, porcentaje graso, peso ni clasificación corporal. Los somatotipos «ectomorfo, mesomorfo, endomorfo» no constituyen una base científica suficiente para prescribir entrenamientos; si se recoge esta etiqueta tradicional por preferencia del usuario, etiquetarla como descriptiva/no diagnóstica y NO usarla como regla de prescripción ni inferir resultados. Evitar objetivos de aspecto corporal prescriptivos o comparaciones. Priorizar historial, preferencias, tolerancia, técnica, recuperación, progresión y disponibilidad.

## Seguridad y pruebas obligatorias
Sin recomendaciones de cargas máximas obligatorias, dolor ignorado, ejercicio peligroso, sobreentrenamiento o dieta restrictiva. Incluir calentamiento apropiado, progresión gradual, técnica, descansos, alternativas y consejo de consultar profesionales ante dolor/lesión. Para adolescentes, no ofrecer prescripciones de pérdida de grasa ni ideales físicos. Tests: gimnasio sin máquinas; polea simple no habilita crossover; banco sin rack no habilita press pesado con barra; pec deck inverso separado; casa sin equipo; dos entornos; selección de ejercicios y sus accesorios; IA devuelve ID inventado; IA ignora restricciones; respuesta JSON malformada; fallo de red; prompt injection en notas; cambio de modo; perfiles aislados; descansos sin romper racha. Las propuestas siempre son revisables y editables.

## Implementación y entrega
Actualizar `docs/PRD.md`, `TRD.md`, `AppFlow.md`, `UI-UX-Brief.md`, `Backend-Schema.md`, `Implementation-Plan.md` ANTES de código con entidades equipment_catalog, equipment_variants, equipment_attributes, training_environments, environment_inventory, exercise_requirements, exercise_variants, plan_generation_requests, plan_generation_results, ai_provider_configs, user_consents y auditoría de cambios. Añadir pantallas V5-style de objetivos detallados, catálogo con búsqueda, ficha de máquina, entorno, datos opcionales, selección de modo IA y revisión del plan. Mantener wearable y anatomía 3D de V5. Documentar limitaciones y no fingir que un proveedor de IA está integrado hasta probarlo realmente.


# CRITERIOS DE ACEPTACIÓN ESPECÍFICOS V7

1. El primer arranque muestra onboarding vacío, sin opciones elegidas ni perfil ficticio.
2. Existen vistas funcionales correspondientes a los seis PNG de `visual/v7_nuevas_pantallas/individuales/`, con tokens de diseño V5.
3. El catálogo permite buscar y seleccionar por separado press horizontal, inclinado, declinado, pec deck, pec deck inverso, cruces en polea, paralelas, Smith, hack squat, prensa 45°, curl femoral sentado/tumbado, etc., y añadir accesorios, cargas y variantes.
4. Cada entorno tiene inventario independiente, y la misma persona puede alternar entre casa/gimnasio sin sobrescribir el plan base.
5. Un ejercicio se acepta solo si existe una configuración de ejecución válida con todos sus requisitos obligatorios, restricciones y accesorios. El algoritmo no infiere que todo gimnasio tiene todo el equipo.
6. El modo local funciona offline; IA e híbrido requieren consentimiento explícito y disponibilidad del proveedor. Ninguna selección predefinida en el onboarding.
7. La IA solo recibe datos autorizados, produce salida estructurada versionada y nunca modifica un plan sin revisión y aceptación del usuario.
8. Pruebas de regresión: ausencia de equipo, accesorios faltantes, variantes de polea, respuestas inválidas de IA, cambio de perfil, descanso programado y sincronización del reloj.
9. Las pantallas y textos de las maquetas son referencias conceptuales, no datos precargados ni activos finales con licencia garantizada.
10. Entregar matriz de correspondencia pantalla→archivo de referencia→componente→test, y señalar claramente lo implementado vs. pendiente.
