interface RuntimeEnvironment {
  VITE_API_BASE_URL?: string;
  VITE_MAP_STYLE_URL?: string;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  mapStyleUrl: string | null;
}

function validatedUrl(value: string, name: string, production: boolean) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL.`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use HTTP or HTTPS.`);
  if (production && url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production.`);
  return value.replace(/\/+$/, '');
}

export function parseRuntimeConfig(environment: RuntimeEnvironment, production: boolean): RuntimeConfig {
  const apiBaseUrl = validatedUrl(
    environment.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1',
    'VITE_API_BASE_URL',
    production,
  );
  const mapStyleUrl = environment.VITE_MAP_STYLE_URL
    ? validatedUrl(environment.VITE_MAP_STYLE_URL, 'VITE_MAP_STYLE_URL', production)
    : null;
  return { apiBaseUrl, mapStyleUrl };
}

export const runtimeConfig = parseRuntimeConfig({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_MAP_STYLE_URL: import.meta.env.VITE_MAP_STYLE_URL,
}, import.meta.env.PROD);
