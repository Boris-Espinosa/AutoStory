export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Usuario temporal mientras no existe autenticación real. */
export const CURRENT_USER_ID = 'user-1';

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorBody {
  message?: unknown;
  errors?: unknown;
}

function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isApiErrorDetail(value: unknown): value is ApiErrorDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorDetail).field === 'string' &&
    typeof (value as ApiErrorDetail).message === 'string'
  );
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  // FormData define su propio Content-Type con el boundary.
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Solo en desarrollo: usuario temporal mientras no existe autenticación real.
  if (process.env.NODE_ENV !== 'production') {
    headers['x-user-id'] = CURRENT_USER_ID;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      0,
    );
  }

  const body = parseJson(await response.text());

  if (!response.ok) {
    const errorBody = (body ?? {}) as ApiErrorBody;
    const message =
      typeof errorBody.message === 'string'
        ? errorBody.message
        : 'Ocurrió un error inesperado. Intenta nuevamente.';
    const details = Array.isArray(errorBody.errors)
      ? errorBody.errors.filter(isApiErrorDetail)
      : [];

    throw new ApiError(message, response.status, details);
  }

  return body as T;
}
