import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from './runtimeConfig';

describe('parseRuntimeConfig', () => {
  it('uses the local API default outside production', () => {
    expect(parseRuntimeConfig({}, false)).toEqual({
      apiBaseUrl: 'http://127.0.0.1:3000/api/v1',
      mapStyleUrl: null,
    });
  });

  it('normalizes trailing slashes', () => {
    expect(parseRuntimeConfig({
      VITE_API_BASE_URL: 'https://api.maw3id.ma/api/v1///',
      VITE_MAP_STYLE_URL: 'https://maps.maw3id.ma/style.json/',
    }, true)).toEqual({
      apiBaseUrl: 'https://api.maw3id.ma/api/v1',
      mapStyleUrl: 'https://maps.maw3id.ma/style.json',
    });
  });

  it('rejects insecure production endpoints', () => {
    expect(() => parseRuntimeConfig({ VITE_API_BASE_URL: 'http://api.maw3id.ma' }, true))
      .toThrow('VITE_API_BASE_URL must use HTTPS in production.');
  });

  it('rejects non-http protocols', () => {
    expect(() => parseRuntimeConfig({ VITE_API_BASE_URL: 'javascript:alert(1)' }, false))
      .toThrow('VITE_API_BASE_URL must use HTTP or HTTPS.');
  });
});
