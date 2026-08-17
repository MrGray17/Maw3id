import { AppError } from './errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireUuid(value, fieldName) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(422, 'validation_failed', 'Request validation failed.', {
      fields: {
        [fieldName]: 'Must be a valid UUID.',
      },
    });
  }

  return value;
}

export function rejectUnexpectedFields(value, allowedFields = []) {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const unexpectedFields = Object.keys(body).filter((field) => !allowedFields.includes(field));

  if (unexpectedFields.length > 0) {
    throw new AppError(422, 'validation_failed', 'Request validation failed.', {
      fields: Object.fromEntries(unexpectedFields.map((field) => [field, 'Field is not allowed.'])),
    });
  }

  return body;
}
