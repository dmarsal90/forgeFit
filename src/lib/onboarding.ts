import { z } from 'zod';
import { EXERCISES } from '../data/exercises';

type Option = { value: string | number; label: string };
export type Field = { key: string; label: string; multi?: boolean; optional?: boolean; picker?: boolean; options: Option[] };
export type Consent = { kind: string; version: number; label: string; hint: string };
export type StepDef = { title: string; intro: string; fields: Field[]; schema: z.ZodType; consent?: Consent };

const ids = (o: Option[]) => o.map((x) => x.value) as [string, ...string[]];

const goals: Option[] = [
  { value: 'strength', label: 'Ganar fuerza' },
  { value: 'muscle', label: 'Ganar músculo' },
  { value: 'strength_muscle', label: 'Fuerza e hipertrofia' },
  { value: 'power', label: 'Potencia (explosividad)' },
  { value: 'endurance', label: 'Resistencia muscular' },
  { value: 'general', label: 'Estar en forma' },
  { value: 'mobility', label: 'Movilidad y salud articular' },
];
const goalIds = ids(goals);
const environments: Option[] = [
  { value: 'home', label: 'Casa' }, { value: 'gym', label: 'Gimnasio' }, { value: 'outdoor', label: 'Aire libre' }, { value: 'travel', label: 'Viajes' },
];
const jointLimitations: Option[] = [
  { value: 'shoulder', label: 'Hombro' }, { value: 'elbow', label: 'Codo' }, { value: 'wrist', label: 'Muñeca' },
  { value: 'hip', label: 'Cadera' }, { value: 'knee', label: 'Rodilla' }, { value: 'ankle', label: 'Tobillo' },
  { value: 'neck', label: 'Cuello' }, { value: 'lumbar_spine', label: 'Columna lumbar' }, { value: 'thoracic_spine', label: 'Columna dorsal' },
];
const muscleLimitations: Option[] = [
  { value: 'pectoral', label: 'Pectoral' }, { value: 'lats_upper_back', label: 'Dorsal y espalda alta' }, { value: 'trapezius', label: 'Trapecio' },
  { value: 'deltoid', label: 'Deltoides' }, { value: 'biceps', label: 'Bíceps' }, { value: 'triceps', label: 'Tríceps' },
  { value: 'forearm', label: 'Antebrazo' }, { value: 'core', label: 'Abdomen y core' }, { value: 'lumbar_muscles', label: 'Musculatura lumbar' },
  { value: 'glutes', label: 'Glúteos' }, { value: 'adductors', label: 'Aductores' }, { value: 'hamstrings', label: 'Isquiotibiales' },
  { value: 'quadriceps', label: 'Cuádriceps' }, { value: 'calves', label: 'Gemelos y sóleo' }, { value: 'hip_flexors', label: 'Flexores de cadera' },
];
export const JOINT_IDS = ids(jointLimitations);
export const MUSCLE_IDS = ids(muscleLimitations);
export const LIMITATION_LABEL: Record<string, string> = Object.fromEntries([...jointLimitations, ...muscleLimitations].map((x) => [x.value, x.label.toLowerCase()]));
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const disciplines: Option[] = [
  { value: 'powerlifting', label: 'Powerlifting' }, { value: 'bodybuilding', label: 'Culturismo' }, { value: 'crossfit', label: 'CrossFit' },
  { value: 'calisthenics', label: 'Calistenia' }, { value: 'running', label: 'Carrera' }, { value: 'team_sports', label: 'Deportes de equipo' }, { value: 'yoga', label: 'Yoga o pilates' },
];

const goalsSchema = z
  .object({
    primaryGoal: z.enum(goalIds, 'Elige un objetivo principal'),
    secondaryGoals: z.array(z.enum(goalIds)).max(2, 'Máximo 2').optional(),
    priorityMuscles: z.array(z.enum(ids(muscleLimitations))).max(6, 'Máximo 6').optional(),
  })
  .refine((d) => !d.secondaryGoals?.includes(d.primaryGoal), { path: ['secondaryGoals'], message: 'Ya es tu objetivo principal' });

const experienceSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'advanced'], 'Elige tu experiencia'),
  technique: z.enum(['low', 'medium', 'high']).optional(),
  years: z.enum(['lt1', '1to3', '3to5', '5plus']).optional(),
  rirFamiliarity: z.enum(['none', 'some', 'good']).optional(),
  disciplines: z.array(z.enum(ids(disciplines))).max(7).optional(),
});

const availabilitySchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día').max(7),
  minutes: z.number().int().min(15, 'Mínimo 15 minutos').max(180, 'Máximo 180 minutos'),
  split: z.enum(['auto', 'full', 'upper_lower', 'ppl']).optional(),
  sleep: z.enum(['lt6', '6to7', '7plus']).optional(),
  pauses: z.enum(['short', 'normal', 'long']).optional(),
});

const exerciseIds = ids(EXERCISES.map((e) => ({ value: e.id, label: e.es })));
export const EXERCISE_NAME: Record<string, string> = Object.fromEntries(EXERCISES.map((e) => [e.id, e.es]));
const preferencesSchema = z.object({
  modality: z.enum(['mixed', 'free', 'machines', 'calisthenics']).optional(),
  tempo: z.enum(['normal', 'controlled', 'explosive']).optional(),
  supersets: z.enum(['yes', 'no']).optional(),
  excluded: z.array(z.enum(exerciseIds)).max(40, 'Máximo 40').optional(),
  preferred: z.array(z.enum(exerciseIds)).max(40, 'Máximo 40').optional(),
}).refine((d) => !d.excluded?.some((x) => d.preferred?.includes(x)), { path: ['preferred'], message: 'Un ejercicio no puede ser preferido y excluido a la vez' });

// Etapas 2–8. La 1 (perfil) es su propia pantalla y la 8 (revisión) no tiene formulario.
export const STEPS: Record<number, StepDef> = {
  2: {
    title: 'Tus objetivos', intro: 'Elige uno principal. Los secundarios son opcionales.', schema: goalsSchema,
    fields: [
      { key: 'primaryGoal', label: 'Objetivo principal', options: goals },
      { key: 'secondaryGoals', label: 'Objetivos secundarios (hasta 2)', multi: true, optional: true, options: goals },
      { key: 'priorityMuscles', label: 'Músculos prioritarios (hasta 6, opcional)', multi: true, optional: true, options: muscleLimitations },
    ],
  },
  3: {
    title: 'Tu experiencia', intro: 'Sirve para ajustar la progresión. No hace falta ser preciso.', schema: experienceSchema,
    fields: [
      { key: 'level', label: 'Experiencia entrenando con pesas', options: [
        { value: 'beginner', label: 'Principiante' }, { value: 'intermediate', label: 'Intermedio' }, { value: 'advanced', label: 'Avanzado' },
      ] },
      { key: 'technique', label: 'Familiaridad con la técnica (opcional)', optional: true, options: [
        { value: 'low', label: 'Poca' }, { value: 'medium', label: 'Media' }, { value: 'high', label: 'Mucha' },
      ] },
      { key: 'years', label: 'Años entrenando con constancia (opcional)', optional: true, options: [
        { value: 'lt1', label: 'Menos de 1' }, { value: '1to3', label: '1 a 3' }, { value: '3to5', label: '3 a 5' }, { value: '5plus', label: 'Más de 5' },
      ] },
      { key: 'rirFamiliarity', label: 'Sabes medir el esfuerzo con RIR o RPE (opcional)', optional: true, options: [
        { value: 'none', label: 'No sé qué es' }, { value: 'some', label: 'Lo conozco un poco' }, { value: 'good', label: 'Lo uso con soltura' },
      ] },
      { key: 'disciplines', label: 'Disciplinas que practicas o has practicado (opcional)', multi: true, optional: true, options: disciplines },
    ],
  },
  4: {
    title: 'Tu disponibilidad', intro: 'Días y tiempo reales; el plan se adapta a ellos.', schema: availabilitySchema,
    fields: [
      { key: 'days', label: 'Días en que puedes entrenar', multi: true, options: WEEKDAYS.map((label, value) => ({ value, label })) },
      { key: 'minutes', label: 'Minutos por sesión', options: [30, 45, 60, 90].map((m) => ({ value: m, label: `${m} min` })) },
      { key: 'split', label: 'División de la semana (opcional)', optional: true, options: [
        { value: 'auto', label: 'Que decida la app' }, { value: 'full', label: 'Cuerpo completo' },
        { value: 'upper_lower', label: 'Torso / pierna' }, { value: 'ppl', label: 'Empuje / tirón / pierna' },
      ] },
      { key: 'sleep', label: 'Horas de sueño habituales (opcional)', optional: true, options: [
        { value: 'lt6', label: 'Menos de 6 h' }, { value: '6to7', label: '6 a 7 h' }, { value: '7plus', label: '7 h o más' },
      ] },
      { key: 'pauses', label: 'Pausas entre series (opcional)', optional: true, options: [
        { value: 'short', label: 'Cortas' }, { value: 'normal', label: 'Normales' }, { value: 'long', label: 'Largas' },
      ] },
    ],
  },
  5: {
    title: 'Tus entornos', intro: 'Dónde entrenas. Puedes elegir varios.',
    schema: z.object({ environments: z.array(z.enum(ids(environments))).min(1, 'Elige al menos un entorno') }),
    fields: [{ key: 'environments', label: 'Entornos de entrenamiento', multi: true, options: environments }],
  },
  6: {
    // Pantalla propia (auditoría de inventario por entorno); aquí solo el título y el esquema vacío.
    title: 'Tu equipamiento', intro: 'Marca qué tienes y qué no en cada entorno. Lo que no indiques queda «sin indicar».',
    schema: z.object({}), fields: [],
  },
  7: {
    title: 'Precauciones', intro: 'Indica zonas con molestias para que el plan las tenga en cuenta. No sustituye el consejo médico.',
    schema: z.object({
      jointLimitations: z.array(z.enum(ids(jointLimitations))).optional(),
      muscleLimitations: z.array(z.enum(ids(muscleLimitations))).optional(),
    }),
    fields: [
      { key: 'jointLimitations', label: 'Articulaciones con molestias o lesión (opcional)', multi: true, optional: true, options: jointLimitations },
      { key: 'muscleLimitations', label: 'Músculos con molestias o lesión (opcional)', multi: true, optional: true, options: muscleLimitations },
    ],
    consent: {
      kind: 'ai_plan', version: 1, label: 'Permitir proponer mi plan con IA',
      hint: 'Opcional y desactivado por defecto. Aún no se envía nada; antes de usarlo te volveremos a avisar. Puedes revocarlo cuando quieras.',
    },
  },
  8: {
    title: 'Tus preferencias', intro: 'Cómo te gusta entrenar. Todo es opcional y el plan lo usa para elegir y ordenar ejercicios.', schema: preferencesSchema,
    fields: [
      { key: 'modality', label: 'Modalidad', optional: true, options: [
        { value: 'mixed', label: 'Mixta' }, { value: 'free', label: 'Pesos libres' },
        { value: 'machines', label: 'Máquinas y poleas' }, { value: 'calisthenics', label: 'Calistenia' },
      ] },
      { key: 'tempo', label: 'Tempo de las repeticiones', optional: true, options: [
        { value: 'normal', label: 'Normal' }, { value: 'controlled', label: 'Controlado (bajada de 3 s)' }, { value: 'explosive', label: 'Explosivo al subir' },
      ] },
      { key: 'supersets', label: 'Biseries (dos ejercicios seguidos, ahorran tiempo)', optional: true, options: [
        { value: 'yes', label: 'Sí, me gustan' }, { value: 'no', label: 'Prefiero series normales' },
      ] },
      { key: 'excluded', label: 'Ejercicios que no quieres hacer', multi: true, optional: true, picker: true, options: [] },
      { key: 'preferred', label: 'Ejercicios que prefieres', multi: true, optional: true, picker: true, options: [] },
    ],
  },
};

export const LAST_STEP = 9;

export type StepValues = Record<string, string | number | (string | number)[] | undefined>;

/** Devuelve datos validados o errores por campo. */
export function validateStep(step: number, values: StepValues) {
  const r = STEPS[step].schema.safeParse(values);
  if (r.success) return { data: r.data as StepValues, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { data: null, errors };
}

/** Líneas «Campo: valores» de una etapa, para la revisión. */
export function summarize(step: number, values: StepValues): string[] {
  return STEPS[step].fields.flatMap((f) => {
    const raw = values[f.key];
    const picked = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]);
    const labels = picked.map((v) => (f.picker ? EXERCISE_NAME[v as string] : f.options.find((o) => o.value === v)?.label)).filter(Boolean);
    return labels.length ? [`${f.label.replace(/ \(.*\)$/, '')}: ${labels.join(', ')}`] : [];
  });
}

const FORM_STEPS = [2, 3, 4, 5, 6, 7]; // obligatorias; la 8 (preferencias) es opcional y no bloquea el plan

/** Etapas guardadas (de 2 a 7) y la siguiente a completar; si no falta ninguna, la revisión (8). */
export function onboardingProgress(drafts: Record<number, unknown>) {
  const done = FORM_STEPS.filter((n) => drafts[n] !== undefined).length;
  return { done, total: FORM_STEPS.length, next: FORM_STEPS.find((n) => drafts[n] === undefined) ?? LAST_STEP };
}
