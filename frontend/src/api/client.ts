export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const SESSION_REJECTED_MESSAGE =
  'El servidor no aceptó tu sesión. Inténtalo de nuevo más tarde.';

/** Opciones del proveedor de token de sesión. */
export interface TokenRequestOptions {
  skipCache?: boolean;
}

/**
 * Devuelve el token de sesión de Clerk, o null si no hay sesión activa.
 * Lo registra un componente raíz con `useAuth().getToken`.
 */
export type TokenProvider = (options?: TokenRequestOptions) => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

/** Avisa que el servidor rechazó incluso un token recién emitido. */
type SessionRejectedHandler = () => void;

let sessionRejectedHandler: SessionRejectedHandler | null = null;

export function setSessionRejectedHandler(handler: SessionRejectedHandler): void {
  sessionRejectedHandler = handler;
}

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

async function requestToken(options: TokenRequestOptions = {}): Promise<string | null> {
  return tokenProvider ? tokenProvider(options) : null;
}

async function fetchApi(
  path: string,
  init: RequestInit,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    if (__DEV__) {
      console.warn('[auth] api', (init.method ?? 'GET').toUpperCase(), path, 'sin conexión');
    }

    throw new ApiError(
      'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      0,
    );
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  // FormData define su propio Content-Type con el boundary.
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // El token de sesión dura poco: se pide uno nuevo en cada petición.
  const token = await requestToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetchApi(path, init, headers);

  // Token vencido: se pide otro saltando la caché y se reintenta una sola vez.
  if (response.status === 401 && token) {
    const freshToken = await requestToken({ skipCache: true });

    if (freshToken) {
      headers.Authorization = `Bearer ${freshToken}`;
      response = await fetchApi(path, init, headers);
    }

    if (response.status === 401) {
      // Un token recién emitido también fue rechazado: no se cierra la sesión
      // (eso provocaba un bucle de inicio de sesión), solo se avisa una vez.
      sessionRejectedHandler?.();
      throw new ApiError(SESSION_REJECTED_MESSAGE, 401);
    }
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
