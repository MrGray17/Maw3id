import { z } from 'zod';

export const queueStatusSchema = z.enum([
  'available', 'moderate', 'busy', 'full', 'paused', 'closed', 'unknown',
]);
export type QueueStatus = z.infer<typeof queueStatusSchema>;

const doctorSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(2).max(160),
  specialty: z.string().min(2).max(120),
  cabinet: z.object({
    id: z.string().uuid(),
    name: z.string().min(2).max(160),
    address: z.string().min(2),
    city: z.string().min(2),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  queueStatus: queueStatusSchema,
  estimatedWaitMinutes: z.object({
    min: z.number().int().nonnegative(), max: z.number().int().nonnegative(),
  }).refine((range) => range.min <= range.max).nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  acceptingTickets: z.boolean(),
  lastUpdatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
}).strict();

export const doctorSearchResponseSchema = z.object({
  data: z.array(doctorSchema),
  meta: z.object({
    generatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    requestId: z.string().min(1).optional(),
  }),
}).strict();

export type DoctorSearchResult = z.infer<typeof doctorSchema>;
