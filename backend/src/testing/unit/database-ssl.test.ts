import { buildDatabaseSslOptions } from '../../config/database-ssl';

const url = 'postgres://user:pass@localhost:5432/autostory?sslmode=require';

function parsedUrl(resultUrl: string | undefined): URL {
  return new URL(resultUrl!);
}

describe('opciones SSL de la base', () => {
  it('verifica el certificado con DATABASE_SSL=true en producción', () => {
    const result = buildDatabaseSslOptions({
      url,
      ssl: true,
      insecure: false,
      nodeEnv: 'production',
    });

    expect(result.ssl).toEqual({ rejectUnauthorized: true });
    expect(parsedUrl(result.url).searchParams.get('sslmode')).toBe(
      'verify-full',
    );
  });

  it('ignora DATABASE_SSL_INSECURE en producción y lo advierte', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = buildDatabaseSslOptions({
        url,
        ssl: true,
        insecure: true,
        nodeEnv: 'production',
      });

      expect(result.ssl).toEqual({ rejectUnauthorized: true });
      expect(parsedUrl(result.url).searchParams.get('sslmode')).toBe(
        'verify-full',
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_SSL_INSECURE'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('no activa SSL si DATABASE_SSL está ausente', () => {
    const result = buildDatabaseSslOptions({
      url,
      ssl: false,
      insecure: false,
      nodeEnv: 'development',
    });

    expect(result.ssl).toBe(false);
    expect(parsedUrl(result.url).searchParams.get('sslmode')).toBe('disable');
  });

  it('advierte en producción si DATABASE_SSL está ausente', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      buildDatabaseSslOptions({
        url,
        ssl: false,
        insecure: false,
        nodeEnv: 'production',
      });

      expect(warn).toHaveBeenCalledWith(
        'DATABASE_SSL no está activo en producción; Neon exige TLS.',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('en desarrollo con el flag quita sslmode y no verifica', () => {
    const result = buildDatabaseSslOptions({
      url,
      ssl: true,
      insecure: true,
      nodeEnv: 'development',
    });

    expect(result.ssl).toEqual({ rejectUnauthorized: false });
    expect(parsedUrl(result.url).searchParams.has('sslmode')).toBe(false);
  });

  it('con uselibpqcompat=true y sslmode=no-verify el flag sigue sin verificar', () => {
    const urlConAliasInseguro =
      'postgres://user:pass@localhost:5432/autostory?sslmode=no-verify&uselibpqcompat=true';

    const result = buildDatabaseSslOptions({
      url: urlConAliasInseguro,
      ssl: true,
      insecure: true,
      nodeEnv: 'development',
    });

    expect(result.ssl).toEqual({ rejectUnauthorized: false });
    expect(parsedUrl(result.url).searchParams.has('sslmode')).toBe(false);
    expect(parsedUrl(result.url).searchParams.get('uselibpqcompat')).toBe(
      'true',
    );
  });

  it('conserva usuario, contraseña, host, base y parámetros distintos de sslmode', () => {
    const urlNeon =
      'postgres://us%40er:p%3Ass@ep-test.neon.tech:5432/autostory?sslmode=require&channel_binding=require&application_name=auto%20story';

    const result = buildDatabaseSslOptions({
      url: urlNeon,
      ssl: true,
      insecure: false,
      nodeEnv: 'production',
    });
    const parsed = parsedUrl(result.url);

    expect(decodeURIComponent(parsed.username)).toBe('us@er');
    expect(decodeURIComponent(parsed.password)).toBe('p:ss');
    expect(parsed.hostname).toBe('ep-test.neon.tech');
    expect(parsed.port).toBe('5432');
    expect(parsed.pathname).toBe('/autostory');
    expect(parsed.searchParams.get('channel_binding')).toBe('require');
    expect(parsed.searchParams.get('application_name')).toBe('auto story');
    expect(parsed.searchParams.get('sslmode')).toBe('verify-full');
  });
});
