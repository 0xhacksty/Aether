import { z } from 'zod';

export const ActionOpSchema = z.enum([
  'click',
  'type',
  'key',
  'select',
  'scroll',
  'hover',
]);

export const ActionRiskSchema = z.enum([
  'read',
  'reversible',
  'irreversible',
]);

export const ActionItemSchema = z.object({
  ref: z.string().regex(/^e\d+$/, 'Ref must be formatted as e1, e2, ...'),
  op: ActionOpSchema,
  value: z.string().optional(),
});

export const ActParamsSchema = z.object({
  actions: z.array(ActionItemSchema).min(1).max(5),
  risk: ActionRiskSchema,
  why: z.string().min(1),
});

export const NavigateParamsSchema = z.object({
  url: z.string().url(),
});

export const FindParamsSchema = z.object({
  query: z.string().min(1),
});

export const ReadParamsSchema = z.object({
  ref: z.string().regex(/^e\d+$/),
});

export const ScreenshotParamsSchema = z.object({
  ref: z.string().regex(/^e\d+$/).optional(),
});

export const AskParamsSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).min(2).max(4).optional(),
});

export const DoneParamsSchema = z.object({
  result: z.string(),
  evidence: z.string(),
});
