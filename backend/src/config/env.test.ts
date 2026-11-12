// Sin esto, reimportar env.ts tras resetModules ejecuta dotenv/config otra
// vez y backend/.env real restaura las claves que este test borra.
jest.mock('dotenv/config', () => ({}));

type EnvModule = typeof import('./env');

function loadEnv(
  overrides: Record<string, string | undefined>,
): EnvModule {
  const previous = new Map(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  jest.resetModules();

  try {
    return require('./env') as EnvModule;
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('configuración de entorno', () => {
  it('exige las claves de Clerk en modo clerk', () => {
    let error: Error | undefined;

    try {
      loadEnv({
        NODE_ENV: 'test',
        AUTH_MODE: 'clerk',
        CLERK_PUBLISHABLE_KEY: undefined,
        CLERK_SECRET_KEY: undefined,
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toContain('CLERK_PUBLISHABLE_KEY');
    expect(error?.message).toContain('CLERK_SECRET_KEY');
  });

  it('no arranca con dev-header en producción', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', AUTH_MODE: 'dev-header' }),
    ).toThrow(/AUTH_MODE=dev-header/);
  });

  it('usa clerk por defecto y separa las partes autorizadas', () => {
    const { env } = loadEnv({
      AUTH_MODE: undefined,
      CLERK_PUBLISHABLE_KEY: 'pk_test_ejemplo',
      CLERK_SECRET_KEY: 'sk_test_ejemplo',
      CLERK_AUTHORIZED_PARTIES: ' http://a.test , , http://b.test ',
    });

    expect(env.auth.mode).toBe('clerk');
    expect(env.auth.authorizedParties).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });
});
