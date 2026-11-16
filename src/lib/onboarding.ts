import { z } from 'zod';

type Option = { value: string | number; label: string };
export type Field = { key: string; label: string; multi?: boolean; optional?: boolean; options: Option[] };
export type Consent = { kind: string; version: number; label: string; hint: string };
export type StepDef = { title: string; intro: string; fields: Field[]; schema: z.ZodType; consent?: Consent };

const ids = (o: Option[]) => o.map((x) => x.value) as [string, ...string[]];

const goals: Option[] = [
  { value: 'strength', label: 'Ganar fuerza' },
  { value: 'muscle', label: 'Ganar músculo' },
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
const week = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const goalsSchema = z
  .object({ primaryGoal: z.enum(goalIds, 'Elige un objetivo principal'), secondaryGoals: z.array(z.enum(goalIds)).max(2, 'Máximo 2').optional() })
  .refine((d) => !d.secondaryGoals?.includes(d.primaryGoal), { path: ['secondaryGoals'], message: 'Ya es tu objetivo principal' });

const experienceSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'advanced'], 'Elige tu experiencia'),
  technique: z.enum(['low', 'medium', 'high']).optional(),
});

const availabilitySchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día').max(7),
  minutes: z.number().int().min(15, 'Mínimo 15 minutos').max(180, 'Máximo 180 minutos'),
});

// Etapas 2–7. La 1 (perfil) es su propia pantalla y la 8 (revisión) no tiene formulario.
export const STEPS: Record<number, StepDef> = {
  2: {
    title: 'Tus objetivos', intro: 'Elige uno principal. Los secundarios son opcionales.', schema: goalsSchema,
    fields: [
      { key: 'primaryGoal', label: 'Objetivo principal', options: goals },
      { key: 'secondaryGoals', label: 'Objetivos secundarios (hasta 2)', multi: true, optional: true, options: goals },
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
    ],
  },
  4: {
    title: 'Tu disponibilidad', intro: 'Días y tiempo reales; el plan se adapta a ellos.', schema: availabilitySchema,
    fields: [
      { key: 'days', label: 'Días en que puedes entrenar', multi: true, options: week.map((label, value) => ({ value, label })) },
      { key: 'minutes', label: 'Minutos por sesión', options: [30, 45, 60, 90].map((m) => ({ value: m, label: `${m} min` })) },
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
};

export const LAST_STEP = 8;

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
    const labels = picked.map((v) => f.options.find((o) => o.value === v)?.label).filter(Boolean);
    return labels.length ? [`${f.label.replace(/ \(.*\)$/, '')}: ${labels.join(', ')}`] : [];
  });
}

const FORM_STEPS = [2, 3, 4, 5, 6, 7];

/** Etapas guardadas (de 2 a 7) y la siguiente a completar; si no falta ninguna, la revisión (8). */
export function onboardingProgress(drafts: Record<number, unknown>) {
  const done = FORM_STEPS.filter((n) => drafts[n] !== undefined).length;
  return { done, total: FORM_STEPS.length, next: FORM_STEPS.find((n) => drafts[n] === undefined) ?? LAST_STEP };
}
