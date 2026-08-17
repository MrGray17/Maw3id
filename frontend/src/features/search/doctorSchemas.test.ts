import { describe, expect, it } from 'vitest';
import { doctorSearchResponseSchema } from './doctorSchemas';

const validResponse = {
  data: [{
    id: '4f62cb52-d28c-481a-a19b-cbc431549037',
    displayName: 'Dr Amine Idrissi',
    specialty: 'Cardiologie',
    cabinet: {
      id: '7709730d-6d7a-4757-a001-b65b7eb63424',
      name: 'Cabinet Al Amal',
      address: '12 avenue Mohammed V',
      city: 'Rabat',
      latitude: 34.0209,
      longitude: -6.8416,
    },
    queueStatus: 'available',
    estimatedWaitMinutes: { min: 5, max: 15 },
    distanceMeters: 850,
    acceptingTickets: true,
    lastUpdatedAt: '2026-08-17T10:00:00.000Z',
  }],
  meta: { generatedAt: '2026-08-17T10:00:01.000Z', requestId: 'req-123' },
};

describe('doctorSearchResponseSchema', () => {
  it('accepts the documented public doctor projection', () => {
    expect(doctorSearchResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('rejects private or undocumented doctor fields', () => {
    const unsafe = structuredClone(validResponse);
    Object.assign(unsafe.data[0]!, { privatePhone: '+212600000000' });
    expect(doctorSearchResponseSchema.safeParse(unsafe).success).toBe(false);
  });

  it('rejects inverted wait ranges', () => {
    const invalid = structuredClone(validResponse);
    invalid.data[0]!.estimatedWaitMinutes = { min: 30, max: 10 };
    expect(doctorSearchResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
