import 'dotenv/config';
import path from 'path';
import { z } from 'zod';

const DEFAULT_CORS_ORIGIN = 'http://localhost:8081';

/** Separa por comas y quita la barra final de cada origen. */
function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

function isValidOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().optional(),
    DATABASE_URL: z
      .string()
      .url('DATABASE_URL debe ser una URL válida.')
      .optional(),
    DATABASE_SSL: z.enum(['true', 'false']).default('false'),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    TEST_DATABASE_URL: z
      .string()
      .url('TEST_DATABASE_URL debe ser una URL válida.')
      .optional(),
    AUTH_MODE: z.enum(['clerk', 'dev-header']).default('clerk'),
    CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    CLERK_AUTHORIZED_PARTIES: z.string().optional(),
    REMINDER_WORKER_ENABLED: z.enum(['true', 'false']).default('true'),
    REMINDER_WORKER_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    UPLOADS_DIR: z.string().min(1).optional(),
    STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
    S3_ENDPOINT: z.string().url('S3_ENDPOINT debe ser una URL válida.').optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_PUBLIC_BASE_URL: z
      .string()
      .url('S3_PUBLIC_BASE_URL debe ser una URL válida.')
      .optional(),
  })
  .superRefine((value, context) => {
    const corsOrigins = splitOrigins(value.CORS_ORIGIN);
    const authorizedParties = splitOrigins(value.CLERK_AUTHORIZED_PARTIES);

    if (value.NODE_ENV === 'production' && corsOrigins.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message: 'Falta CORS_ORIGIN (uno o varios orígenes separados por comas).',
      });
    }

    for (const origin of [...corsOrigins, ...authorizedParties]) {
      if (value.NODE_ENV === 'production' && origin.includes('*')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [
            corsOrigins.includes(origin)
              ? 'CORS_ORIGIN'
              : 'CLERK_AUTHORIZED_PARTIES',
          ],
          message: `No se permiten comodines en producción: ${origin}`,
        });
        continue;
      }

      if (!isValidOrigin(origin)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [
            corsOrigins.includes(origin)
              ? 'CORS_ORIGIN'
              : 'CLERK_AUTHORIZED_PARTIES',
          ],
          message: `Origen inválido: ${origin}`,
        });
      }
    }

    if (value.AUTH_MODE === 'dev-header' && value.NODE_ENV === 'production') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_MODE'],
        message:
          'AUTH_MODE=dev-header no está permitido cuando NODE_ENV=production.',
      });
    }

    if (value.AUTH_MODE === 'clerk') {
      const required = [
        'CLERK_PUBLISHABLE_KEY',
        'CLERK_SECRET_KEY',
      ] as const;

      for (const variable of required) {
        if (value[variable] === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [variable],
            message: `AUTH_MODE=clerk requiere ${variable}.`,
          });
        }
      }
    }

    if (value.STORAGE_DRIVER === 's3' && value.NODE_ENV === 'production') {
      const required = [
        'S3_ENDPOINT',
        'S3_REGION',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'S3_PUBLIC_BASE_URL',
      ] as const;

      for (const variable of required) {
        if (value[variable] === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [variable],
            message: `STORAGE_DRIVER=s3 requiere ${variable}.`,
          });
        }
      }
    }

    // En tests la conexión de desarrollo no se usa: los tests de integración
    // arman su propio DataSource con TEST_DATABASE_URL.
    if (value.DATABASE_URL || value.NODE_ENV === 'test') {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'Falta DATABASE_URL.',
    });
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `- ${issue.path.join('.') || 'entorno'}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Configuración de entorno inválida:\n${details}\nRevisa .env.example.`,
  );
}

const corsOrigins = splitOrigins(parsed.data.CORS_ORIGIN);
const allowedOrigins =
  corsOrigins.length > 0 ? corsOrigins : [DEFAULT_CORS_ORIGIN];
const authorizedParties = splitOrigins(parsed.data.CLERK_AUTHORIZED_PARTIES);

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigin: allowedOrigins[0],
  corsOrigins: allowedOrigins,
  databaseUrl: parsed.data.DATABASE_URL,
  testDatabaseUrl: parsed.data.TEST_DATABASE_URL,
  auth: {
    mode: parsed.data.AUTH_MODE,
    publishableKey: parsed.data.CLERK_PUBLISHABLE_KEY,
    secretKey: parsed.data.CLERK_SECRET_KEY,
    authorizedParties:
      authorizedParties.length > 0 ? authorizedParties : undefined,
  },
  reminderWorker: {
    enabled: parsed.data.REMINDER_WORKER_ENABLED === 'true',
    intervalSeconds: parsed.data.REMINDER_WORKER_INTERVAL_SECONDS,
  },
  database: {
    ssl: parsed.data.DATABASE_SSL === 'true',
    poolMax: parsed.data.DATABASE_POOL_MAX,
  },
  uploadsDir: path.resolve(
    parsed.data.UPLOADS_DIR ?? path.resolve(__dirname, '../../uploads'),
  ),
  storage: {
    driver: parsed.data.STORAGE_DRIVER,
    s3: {
      endpoint: parsed.data.S3_ENDPOINT,
      region: parsed.data.S3_REGION,
      bucket: parsed.data.S3_BUCKET,
      accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: parsed.data.S3_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
    },
  },
};
