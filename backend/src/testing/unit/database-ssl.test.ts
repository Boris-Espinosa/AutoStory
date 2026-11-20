import { buildDatabaseSslOptions } from '../../config/database-ssl';

const url = 'postgres://user:pass@localhost:5432/autostory?sslmode=require';

function sslModeOf(resultUrl: string | undefined): string | null {
  return new URL(resultUrl!).searchParams.get('sslmode');
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
    expect(sslModeOf(result.url)).toBe('verify-full');
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
      expect(sslModeOf(result.url)).toBe('verify-full');
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
    expect(sslModeOf(result.url)).toBe('disable');
  });

  it('desactiva la verificación solo fuera de producción con el flag explícito', () => {
    const result = buildDatabaseSslOptions({
      url,
      ssl: true,
      insecure: true,
      nodeEnv: 'development',
    });

    expect(result.ssl).toEqual({ rejectUnauthorized: false });
    expect(sslModeOf(result.url)).toBe('no-verify');
  });
});
