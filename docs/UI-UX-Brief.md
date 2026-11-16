# ForgeFit — UI/UX Brief

Prioridad visual: V5 (`design/v5_aprobado/`) > V7 (`design/v7_nuevas_pantallas/`) > originales (`design/individual/`). Las capturas son referencias conceptuales; los datos que muestran NO son valores por defecto. Identidad: `brand/`.

## 1. Design tokens
| Token | Valor | Uso |
|---|---|---|
| `bg` | `#101318` | fondo |
| `surface` | `#222A33` | tarjetas |
| `surfaceAlt` | `#1A2027` | segundas superficies/inputs (derivado) |
| `accent` | `#B8F36B` | CTA, selección, progreso |
| `onAccent` | `#101318` | texto sobre acento (≈14:1) |
| `text` | `#E8EDF2` | primario |
| `textMuted` | `#98A3AE` | secundario (≥4.5:1 sobre `bg` y `surface`) |
| `border` | `#343D47` | contornos |
| `accentPressed` | `#9FD955` | pressed |
| `disabled` | `#3A434D` / texto `#6F7B87` | deshabilitado |
| `error` | `#FF8A80` | error (texto/borde, contraste verificado) |
| `success` | `#B8F36B` | check completado |
Los contrastes de los derivados se verifican con test (`__tests__/contrast.test.ts`, WCAG 2.2 AA: 4.5:1 texto, 3:1 no textual). Verde nunca como fondo de pantalla entera; 60/30/10 orientativo.
Espaciado 4/8/12/16/24/32. Radios: tarjeta 16, botón 14, chip 999. Sombras suaves; brillo verde solo contenido, no en capas adaptativas del icono.
Tipografía Inter (400/500/600/700), escalones: display 32, title 22, subtitle 17, body 15, caption 13; números tabulares (`fontVariant: ['tabular-nums']`). Escalado de texto del sistema respetado.
Movimiento 180–320 ms; respeta ajuste de reducir movimiento; nunca única señal de estado.
Accesibilidad: toque ≥48 dp, `accessibilityRole/Label/State` en controles, foco visible, safe areas Android.

## 2. Componentes base (Fase 1)
`Screen` (safe area, fondo), `Text` (variantes), `Button` (primary/secondary/ghost, estados), `Card`, `Chip/Segmented` (selección con acento + check), `Field` (input con etiqueta, error, hint), `StepHeader` (flecha atrás, título, barra «n de N»), `TabBar` inferior persistente (Inicio, Rutinas, Ejercicios, Progreso, Más; activo en acento), `EmptyState`.

## 3. Matriz de pantallas
| Pantalla | Referencia | Notas |
|---|---|---|
| Bienvenida | `v5_aprobado/pantallas_individuales/01_bienvenida.png` | marca + «Comenzar»; sin saludo personal |
| Crear perfil / modelo | `02_modelo_anatomico.png` | tarjetas masculino/femenino **sin selección inicial**; «omitir» permitido |
| Datos personales | `03_datos_personales.png` | edad/estatura opcionales y vacíos; peso no se pide |
| Objetivo | `04_objetivo.png` + V7 `02_objetivos_avanzados.png` | sin selección; sin textos de pérdida de grasa para menores |
| Días y descanso | `05_dias_y_descanso.png` | sin días marcados |
| Plan propuesto | `06_plan_propuesto.png` | solo tras onboarding y aprobación |
| Inicio sin plan | `07_inicio_sin_plan.png` | CTA «Configura tu plan»; sin métricas ficticias |
| Entrenamiento biserie | `08_entrenamiento_biserie.png` / `individual/03` | A1/A2 segmentado, peso/reps/RIR, «Completar serie» |
| Descanso | `individual/04_descanso.png` | cuenta atrás circular, ±30 s |
| Anatomía 3D | `09_anatomia_3d.png`, `individual/05`, `08` | GLB real; lista textual accesible |
| Rendimiento/Progreso | `10_analisis_rendimiento.png`, `individual/09`, `10` | solo datos reales o estado vacío |
| Reloj (móvil) | `11_sincronizacion_reloj.png`, `12_vistas_reloj_conjunto.png` | solo capacidades reales |
| Wear OS | `reloj_individual/01–03` | circular, un dato prioritario |
| Biblioteca / Detalle | `individual/06`, `07` | búsqueda, filtros, pestañas |
| V7 evaluación | `v7…/individuales/01_evaluacion_deportiva.png` | opcional |
| V7 entornos | `03_entornos_entrenamiento.png` | inventarios separados |
| V7 inventario pecho / piernas | `04…`, `05…` | granular; no marcado ≠ ausente |
| V7 generador | `06_generador_local_ia_hibrido.png` | consentimiento granular, sin modo preseleccionado |
Desviaciones respecto a las capturas se registran en `Implementation-Plan.md` §5.

## 4. Pantallas a añadir (no dibujadas)
Selector de perfiles, edición/gestión de perfil, edición de calendario/reprogramación, gestión de descansos, historial de sincronización: mismos tokens y patrones.

## 5. Estados vacíos
Calendario, estadísticas y racha antes de completar sesiones muestran `EmptyState` con explicación y CTA; nunca valores de muestra.

## 6. Lenguaje
Sin culpa ni presión; sin incentivar entrenar lesionado o en descanso; textos sobre dolor: consultar a un profesional. Español como idioma inicial.
