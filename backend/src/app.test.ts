import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource } from 'typeorm';
import { createApp } from './app';

type UserLookup = () => Promise<unknown>;

function fakeDataSource(
  userLookup: UserLookup = async () => ({ id: 'user-1' }),
): DataSource {
  const repository = {
    findOne: userLookup,
    createQueryBuilder: () => {
      throw new Error('consulta inesperada');
    },
  };

  return {
    getRepository: () => repository,
  } as unknown as DataSource;
}

async function withServer(
  dataSource: DataSource,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(createApp(dataSource));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

interface ApiResponse {
  status: number;
  body: Record<string, any>;
}

async function request(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

describe('GET /health', () => {
  it('responde 200 con el estado de la API', async () => {
    await withServer(fakeDataSource(), async (baseUrl) => {
      const response = await request(baseUrl, '/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});

describe('formato de errores', () => {
  it('traduce un error de zod a 400 con { errors: [{ field, message }] }', async () => {
    await withServer(fakeDataSource(), async (baseUrl) => {
      const response = await request(baseUrl, '/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user-1',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      expect(Array.isArray(response.body.errors)).toBe(true);
      expect(response.body.errors.length).toBeGreaterThan(0);

      for (const issue of response.body.errors) {
        expect(typeof issue.field).toBe('string');
        expect(typeof issue.message).toBe('string');
      }
    });
  });

  it('responde 400 cuando el cuerpo no es JSON válido', async () => {
    await withServer(fakeDataSource(), async (baseUrl) => {
      const response = await request(baseUrl, '/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user-1',
        },
        body: '{"vin":',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Datos inválidos.' });
    });
  });

  it('responde 404 en una ruta inexistente', async () => {
    await withServer(fakeDataSource(), async (baseUrl) => {
      const response = await request(baseUrl, '/no-existe');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Recurso no encontrado.' });
    });
  });

  it('responde 500 genérico sin filtrar el detalle interno', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const dataSource = fakeDataSource(async () => {
      throw new Error('detalle interno que no debe salir');
    });

    try {
      await withServer(dataSource, async (baseUrl) => {
        const response = await request(baseUrl, '/vehicles', {
          headers: { 'x-user-id': 'user-1' },
        });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          message: 'Ocurrió un error inesperado en el servidor.',
        });
        expect(JSON.stringify(response.body)).not.toContain('detalle interno');
        expect(consoleError).toHaveBeenCalled();
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
