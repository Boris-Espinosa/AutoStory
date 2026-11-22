// Sin esto, reimportar env.ts tras resetModules ejecuta dotenv/config otra
// vez y backend/.env real restaura las claves que este test borra.
jest.mock('dotenv/config', () => ({}));

type EnvModule = typeof import('../../config/env');

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
    return require('../../config/env') as EnvModule;
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

  it('separa CORS_ORIGIN y quita la barra final', () => {
    const { env } = loadEnv({
      NODE_ENV: 'test',
      AUTH_MODE: 'clerk',
      CLERK_PUBLISHABLE_KEY: 'pk_test_ejemplo',
      CLERK_SECRET_KEY: 'sk_test_ejemplo',
      CORS_ORIGIN: 'http://a.test/ , http://b.test/',
    });

    expect(env.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('en producción exige CORS_ORIGIN y DATABASE_URL', () => {
    const base = {
      NODE_ENV: 'production',
      AUTH_MODE: 'clerk',
      CLERK_PUBLISHABLE_KEY: 'pk_test_ejemplo',
      CLERK_SECRET_KEY: 'sk_test_ejemplo',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/autostory',
      CORS_ORIGIN: 'https://app.test',
    };

    expect(() => loadEnv({ ...base, CORS_ORIGIN: undefined })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
    expect(() =>
      loadEnv({ ...base, CORS_ORIGIN: 'https://*.app.test' }),
    ).toThrow(/comodines/);
  });

  it('en producción exige STORAGE_DRIVER=s3', () => {
    const base = {
      NODE_ENV: 'production',
      AUTH_MODE: 'clerk',
      CLERK_PUBLISHABLE_KEY: 'pk_test_ejemplo',
      CLERK_SECRET_KEY: 'sk_test_ejemplo',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/autostory',
      CORS_ORIGIN: 'https://app.test',
    };
    const message =
      /STORAGE_DRIVER=s3 es obligatorio cuando NODE_ENV=production/;

    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'disk' })).toThrow(
      message,
    );
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: undefined })).toThrow(
      message,
    );
  });

  it('permite disk fuera de producción', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'development',
        AUTH_MODE: 'dev-header',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/autostory',
        STORAGE_DRIVER: 'disk',
      }),
    ).not.toThrow();
    expect(() =>
      loadEnv({
        NODE_ENV: 'test',
        AUTH_MODE: 'dev-header',
        STORAGE_DRIVER: 'disk',
      }),
    ).not.toThrow();
  });

  it('en producción con s3 arranca y tolera S3_PUBLIC_BASE_URL sobrante', () => {
    const { env } = loadEnv({
      NODE_ENV: 'production',
      AUTH_MODE: 'clerk',
      CLERK_PUBLISHABLE_KEY: 'pk_test_ejemplo',
      CLERK_SECRET_KEY: 'sk_test_ejemplo',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/autostory',
      CORS_ORIGIN: 'https://app.test',
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://s3.test',
      S3_REGION: 'auto',
      S3_BUCKET: 'autostory-fotos',
      S3_ACCESS_KEY_ID: 'access',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_PUBLIC_BASE_URL: 'https://fotos.test',
    });

    expect(env.storage.s3).not.toHaveProperty('publicBaseUrl');
  });

  it('en producción con STORAGE_DRIVER=s3 exige toda la configuración S3', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'clerk',
        CLERK_PUBLISHABLE_KEY: 'pk_test_ejemplo',
        CLERK_SECRET_KEY: 'sk_test_ejemplo',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/autostory',
        CORS_ORIGIN: 'https://app.test',
        STORAGE_DRIVER: 's3',
        S3_ENDPOINT: undefined,
        S3_REGION: undefined,
        S3_BUCKET: undefined,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
      }),
    ).toThrow(/S3_BUCKET/);
  });
});
