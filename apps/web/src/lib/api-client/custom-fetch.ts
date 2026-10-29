export interface CustomFetchOptions extends RequestInit {
  params?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Prefixo da API em modo microfrontend
// O cliente gerado pelo Orval chama sempre /api/v1/... . Dentro do shell, as
// chamadas deste módulo precisam passar por /api/v1/records/... (o proxy do
// shell remove o "/records" e encaminha para o servidor deste MFE). Em modo
// standalone o prefixo fica vazio e nada muda.
// -----------------------------------------------------------------------------
const API_ROOT = '/api/v1';
let apiBasePath = API_ROOT;

/** Define a base das chamadas (ex.: '/api/v1/records' dentro do shell). */
export function setApiBasePath(basePath: string): void {
  apiBasePath = basePath.replace(/\/$/, '') || API_ROOT;
}

export function getApiBasePath(): string {
  return apiBasePath;
}

/** '/api/v1/form-templates' → '<base>/form-templates' */
export function resolveApiUrl(url: string): string {
  if (apiBasePath === API_ROOT) return url;
  if (url === API_ROOT || url.startsWith(`${API_ROOT}/`) || url.startsWith(`${API_ROOT}?`)) {
    return apiBasePath + url.slice(API_ROOT.length);
  }
  return url;
}

export const customFetch = async <T>(
  url: string,
  options: CustomFetchOptions = {},
): Promise<T> => {
  const { params, ...fetchOptions } = options;

  let requestUrl = resolveApiUrl(url);
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      requestUrl += (requestUrl.includes('?') ? '&' : '?') + queryString;
    }
  }

  const response = await fetch(requestUrl, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    let errorBody: unknown;
    const text = await response.text();
    try {
      errorBody = text ? JSON.parse(text) : undefined;
    } catch {
      errorBody = text;
    }
    throw errorBody;
  }

  let data: unknown = undefined;
  if (response.status !== 204) {
    const contentType = response.headers.get('content-type');
    const text = await response.text();
    if (contentType && contentType.includes('application/json')) {
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as unknown as T;
};
