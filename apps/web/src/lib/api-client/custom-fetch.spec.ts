import { afterEach, describe, expect, it } from 'vitest';
import { resolveApiUrl, setApiBasePath } from './custom-fetch';

describe('resolveApiUrl (modo microfrontend)', () => {
  afterEach(() => setApiBasePath('/api/v1'));

  it('keeps URLs untouched in standalone mode', () => {
    expect(resolveApiUrl('/api/v1/form-templates')).toBe('/api/v1/form-templates');
  });

  it('routes API calls through the shell proxy prefix', () => {
    setApiBasePath('/api/v1/records/');
    expect(resolveApiUrl('/api/v1/form-templates?page=1')).toBe('/api/v1/records/form-templates?page=1');
    expect(resolveApiUrl('/api/v1/auth/me')).toBe('/api/v1/records/auth/me');
    expect(resolveApiUrl('/health')).toBe('/health');
  });
});
