import { z } from 'zod';
import { apiRequest } from '../../api/httpClient';
import { runtimeConfig } from '../../config/runtimeConfig';

const meta = z.object({ requestId: z.string().optional() });
const user = z.object({ id: z.string().uuid(), role: z.enum(['patient', 'doctor', 'secretary', 'admin']), fullName: z.string().optional() });
const challenge = z.object({ data: z.object({ challengeId: z.string().uuid(), expiresAt: z.string(), resendAvailableAt: z.string(), developmentCode: z.string().regex(/^\d{6}$/).optional() }), meta });
const session = z.object({ data: z.object({ user, csrfToken: z.string().min(40) }), meta });

export const requestPhoneCode = (phoneNumber: string) => apiRequest('/auth/phone/request', challenge, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phoneNumber }),
});
export const verifyPhoneCode = (challengeId: string, phoneNumber: string, code: string) => apiRequest('/auth/phone/verify', session, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId, phoneNumber, code }),
});
export const getSession = () => apiRequest('/auth/session', session);
export async function logout(csrfToken: string) {
  const response = await fetch(`${runtimeConfig.apiBaseUrl}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': csrfToken } });
  if (!response.ok) throw new Error('Logout failed');
}
