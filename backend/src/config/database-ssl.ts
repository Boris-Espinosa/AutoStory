export interface DatabaseSslInput {
  url: string | undefined;
  ssl: boolean;
}

export interface DatabaseSslOptions {
  url: string | undefined;
  ssl: false | { rejectUnauthorized: boolean };
}

/** En pg el sslmode de la URL gana sobre la opción ssl del código, así que hay que fijar ambos. */
export function buildDatabaseSslOptions(input: DatabaseSslInput): DatabaseSslOptions {
  const ssl: DatabaseSslOptions['ssl'] = input.ssl
    ? { rejectUnauthorized: true }
    : false;

  if (!input.url) {
    return { url: input.url, ssl };
  }

  const url = new URL(input.url);
  url.searchParams.set('sslmode', input.ssl ? 'verify-full' : 'disable');

  return { url: url.toString(), ssl };
}
