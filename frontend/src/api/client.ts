/** Sin barra final. En producción la URL es obligatoria: no hay valor por defecto. */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? 'http://localhost:3000' : '')
).replace(/\/+$/, '');

export const API_URL_CONFIGURED = API_BASE_URL.length > 0;

const REQUEST_TIMEOUT_MS = 30_000;

/** Esperas entre reintentos cuando el servidor dormido no responde. */
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

export const SERVER_WAKING_MESSAGE =
  'El servidor está iniciando, puede tardar hasta un minuto';

type ServerWakingListener = (waking: boolean) => void;

const serverWakingListeners = new Set<ServerWakingListener>();

export function subscribeServerWaking(listener: ServerWakingListener): () => void {
  serverWakingListeners.add(listener);

  return () => {
    serverWakingListeners.delete(listener);
  };
}

function notifyServerWaking(waking: boolean): void {
  serverWakingListeners.forEach((listener) => listener(waking));
}

/** Despierta el backend sin bloquear la interfaz. */
export function checkServerHealth(): void {
  void fetchApi('/health', { method: 'GET' }, {}).catch(() => undefined);
}

/** Si photoUrl ya es absoluta se usa tal cual; si no, es relativa al API. */
export function resolvePhotoUrl(photoUrl: string): string {
  return photoUrl.startsWith('http') ? photoUrl : `${API_BASE_URL}${photoUrl}`;
}

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

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchApi(
  path: string,
  init: RequestInit,
  headers: Record<string, string>,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    if (attempt > 0) {
      // Plan gratuito de Render: el servidor dormido tarda en despertar.
      notifyServerWaking(true);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
      });

      notifyServerWaking(false);
      return response;
    } catch {
      if (attempt >= RETRY_DELAYS_MS.length) {
        break;
      }
    }
  }

  notifyServerWaking(false);

  if (__DEV__) {
    console.warn('[auth] api', (init.method ?? 'GET').toUpperCase(), path, 'sin conexión');
  }

  throw new ApiError(
    'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
    0,
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
