import { z } from 'zod';

// Estructura del plan (docs/PLAN_GENERATION.md). El mismo esquema valida lo que genere el motor local
// y, más adelante, lo que devuelva una IA: nada entra sin pasar por aquí.
const item = z.object({
  exerciseVariantId: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  repRange: z.tuple([z.number().int().min(1).max(100), z.number().int().min(1).max(100)]).refine(([a, b]) => a <= b, 'repRange: mínimo mayor que máximo'),
  restSeconds: z.number().int().min(0).max(600),
  effortGuidance: z.string().max(200).optional(),
});
const block = z.object({ type: z.enum(['single', 'superset']), items: z.array(item).min(1).max(2) })
  .refine((b) => (b.type === 'single') === (b.items.length === 1), 'una biserie tiene 2 ejercicios y un bloque simple 1');
const session = z.object({ day: z.number().int().min(0).max(6), name: z.string().min(1).max(60), blocks: z.array(block).min(1).max(12) });

export const planSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['local', 'ai', 'hybrid']),
  summary: z.string().max(500).optional(),
  rationale: z.string().max(1000).optional(),
  warnings: z.array(z.string().max(300)).max(20).optional(),
  sessions: z.array(session).min(1).max(7),
});

export type PlanItem = z.infer<typeof item>;
export type PlanBlock = z.infer<typeof block>;
export type PlanSession = z.infer<typeof session>;
export type Plan = z.infer<typeof planSchema>;
