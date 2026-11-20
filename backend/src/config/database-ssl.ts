import { warn } from '../common/logger';

export interface DatabaseSslInput {
  url: string | undefined;
  ssl: boolean;
  insecure: boolean;
  nodeEnv: 'development' | 'test' | 'production';
}

export interface DatabaseSslOptions {
  url: string | undefined;
  ssl: false | { rejectUnauthorized: boolean };
}

/** En pg el sslmode de la URL gana sobre la opción ssl del código, así que hay que fijar ambos. */
export function buildDatabaseSslOptions(input: DatabaseSslInput): DatabaseSslOptions {
  if (input.insecure && input.nodeEnv === 'production') {
    warn(
      'DATABASE_SSL_INSECURE se ignora: NODE_ENV=production verifica siempre el certificado.',
    );
  }

  if (!input.ssl && input.nodeEnv === 'production') {
    warn('DATABASE_SSL no está activo en producción; Neon exige TLS.');
  }

  const insecure =
    input.ssl && input.insecure && input.nodeEnv !== 'production';
  const ssl: DatabaseSslOptions['ssl'] = input.ssl
    ? { rejectUnauthorized: !insecure }
    : false;

  if (!input.url) {
    return { url: input.url, ssl };
  }

  const url = new URL(input.url);
  if (!input.ssl) {
    url.searchParams.set('sslmode', 'disable');
  } else if (insecure) {
    // Sin sslmode, pg respeta la opción ssl del código; no-verify falla con uselibpqcompat.
    url.searchParams.delete('sslmode');
  } else {
    url.searchParams.set('sslmode', 'verify-full');
  }

  return { url: url.toString(), ssl };
}
