import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z
      .string()
      .url('CORS_ORIGIN debe ser una URL válida.')
      .default('http://localhost:8081'),
    DATABASE_URL: z
      .string()
      .url('DATABASE_URL debe ser una URL válida.')
      .optional(),
    TEST_DATABASE_URL: z
      .string()
      .url('TEST_DATABASE_URL debe ser una URL válida.')
      .optional(),
    PGHOST: z.string().min(1).optional(),
    PGPORT: z.coerce.number().int().positive().optional(),
    PGUSER: z.string().min(1).optional(),
    PGPASSWORD: z.string().min(1).optional(),
    PGDATABASE: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    // En tests la conexión de desarrollo no se usa: los tests de integración
    // arman su propio DataSource con TEST_DATABASE_URL.
    if (value.DATABASE_URL || value.NODE_ENV === 'test') {
      return;
    }

    const required = [
      'PGHOST',
      'PGPORT',
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
    ] as const;

    for (const variable of required) {
      if (value[variable] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [variable],
          message: `Falta ${variable} o DATABASE_URL.`,
        });
      }
    }
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

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigin: parsed.data.CORS_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  testDatabaseUrl: parsed.data.TEST_DATABASE_URL,
  database: {
    host: parsed.data.PGHOST,
    port: parsed.data.PGPORT,
    username: parsed.data.PGUSER,
    password: parsed.data.PGPASSWORD,
    name: parsed.data.PGDATABASE,
  },
};
