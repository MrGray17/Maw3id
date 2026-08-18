import { AppError } from '../http/errors.js';

function validationError(fields) {
  return new AppError(422, 'validation_failed', 'Request validation failed.', { fields });
}

function optionalNumber(value, field, { min, max }) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value))) {
    throw validationError({ [field]: 'Must be a number.' });
  }
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw validationError({ [field]: `Must be between ${min} and ${max}.` });
  }
  return parsed;
}

function positiveInteger(value, field, fallback, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw validationError({ [field]: `Must be an integer between 1 and ${max}.` });
  }
  return parsed;
}

function casablancaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function parseDoctorSearchCriteria(query) {
  const specialty = typeof query.specialty === 'string' ? query.specialty.trim() : '';
  const city = typeof query.city === 'string' ? query.city.trim() : undefined;
  const latitude = optionalNumber(query.latitude, 'latitude', { min: -90, max: 90 });
  const longitude = optionalNumber(query.longitude, 'longitude', { min: -180, max: 180 });

  if (specialty.length < 2 || specialty.length > 120) {
    throw validationError({ specialty: 'Must contain between 2 and 120 characters.' });
  }
  if ((latitude === undefined) !== (longitude === undefined)) {
    throw validationError({ location: 'Latitude and longitude must be provided together.' });
  }
  if (latitude === undefined && (!city || city.length < 2 || city.length > 120)) {
    throw validationError({ city: 'Provide a city between 2 and 120 characters or coordinates.' });
  }
  if (query.acceptingOnly !== undefined && !['true', 'false'].includes(query.acceptingOnly)) {
    throw validationError({ acceptingOnly: 'Must be true or false.' });
  }

  return {
    specialty,
    city: latitude === undefined ? city : undefined,
    latitude,
    longitude,
    radiusMeters: optionalNumber(query.radiusMeters, 'radiusMeters', { min: 500, max: 100_000 }) ?? 25_000,
    acceptingOnly: query.acceptingOnly === 'true',
    limit: positiveInteger(query.limit, 'limit', 20, 50),
    offset: positiveInteger(query.page, 'page', 1, 10_000) - 1,
    serviceDate: casablancaDate(),
  };
}

export function createDoctorSearchController({ searchService }) {
  return {
    async nearby(req, res, next) {
      try {
        const criteria = parseDoctorSearchCriteria(req.query);
        criteria.offset *= criteria.limit;
        const doctors = await searchService({ criteria });
        res.status(200).json({
          data: doctors,
          meta: { generatedAt: new Date().toISOString(), requestId: req.id },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
