import { apiRequest } from '../../api/httpClient';
import { doctorSearchResponseSchema } from './doctorSchemas';

export interface DoctorSearchCriteria {
  specialty: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  acceptingOnly: boolean;
}

export function searchDoctors(criteria: DoctorSearchCriteria, signal: AbortSignal) {
  const query = new URLSearchParams({
    specialty: criteria.specialty,
    acceptingOnly: String(criteria.acceptingOnly),
  });
  if (criteria.city) query.set('city', criteria.city);
  if (criteria.latitude !== undefined) query.set('latitude', String(criteria.latitude));
  if (criteria.longitude !== undefined) query.set('longitude', String(criteria.longitude));
  return apiRequest(`/doctors/nearby?${query.toString()}`, doctorSearchResponseSchema, { signal });
}
