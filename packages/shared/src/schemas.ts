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

export const CdpWireMessageSchema = z.union([
  z.object({
    id: z.number().int(),
    method: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    id: z.number().int(),
    result: z.record(z.string(), z.unknown()).optional(),
    error: z.object({
      code: z.number().int(),
      message: z.string(),
      data: z.string().optional(),
    }).optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    method: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    sessionId: z.string().optional(),
  }),
]);

export const BridgeConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  token: z.string().min(32),
});

export const BridgeStatusSchema = z.object({
  type: z.literal('aether.status'),
  state: z.enum(['connected', 'disconnected', 'step']),
  label: z.string(),
  timestamp: z.number().int(),
});

export const BridgeMessageSchema = z.union([CdpWireMessageSchema, BridgeStatusSchema]);

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;
export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;
