import { NextFunction, Request, RequestHandler, Response } from 'express';
import { DataSource } from 'typeorm';
import { createAuthMiddleware } from '../auth/auth.middleware';
import { env } from '../config/env';
import { User } from '../entities/User';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let auth: RequestHandler;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  auth = createAuthMiddleware(dataSource.getRepository(User));
});

afterAll(async () => {
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(`TRUNCATE TABLE "users" CASCADE`);
  await dataSource.getRepository(User).save({ id: 'user-1', name: 'Ana Pérez' });
});

interface AuthResult {
  status: number;
  body?: unknown;
  nextCalled: boolean;
  userId?: string;
}

/** Ejecuta el middleware sin red: resuelve cuando responde o llama a next. */
function callAuth(headerValue?: string): Promise<AuthResult> {
  const req = {
    header: (name: string) =>
      name.toLowerCase() === 'x-user-id' ? headerValue : undefined,
  } as unknown as Request;

  return new Promise((resolve) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(body: unknown) {
        resolve({ status, body, nextCalled: false });
        return res;
      },
    } as unknown as Response;

    const next: NextFunction = () => {
      resolve({ status: 200, nextCalled: true, userId: req.auth?.userId });
    };

    auth(req, res, next);
  });
}

describe('middleware de autenticación', () => {
  it('responde 401 sin la cabecera x-user-id', async () => {
    const result = await callAuth();

    expect(result).toEqual({
      status: 401,
      body: { message: 'No autenticado' },
      nextCalled: false,
    });
  });

  it('responde 401 cuando el usuario no existe', async () => {
    const result = await callAuth('user-inexistente');

    expect(result.status).toBe(401);
    expect(result.nextCalled).toBe(false);
  });

  it('deja pasar y expone req.auth.userId con un usuario válido', async () => {
    const result = await callAuth('user-1');

    expect(result).toEqual({
      status: 200,
      nextCalled: true,
      userId: 'user-1',
    });
  });

  it('responde 401 en producción aunque la cabecera sea válida', async () => {
    const previous = env.nodeEnv;
    env.nodeEnv = 'production';

    try {
      const result = await callAuth('user-1');

      expect(result.status).toBe(401);
      expect(result.nextCalled).toBe(false);
    } finally {
      env.nodeEnv = previous;
    }
  });
});
