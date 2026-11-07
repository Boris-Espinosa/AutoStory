import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource } from 'typeorm';
import { createApp } from '../app';
import { User } from '../entities/User';
import { createTestDataSource } from './test-data-source';

const VIN = 'WVWZZZ6RZMY000001';

const realFetch = global.fetch;

let dataSource: DataSource;
let server: Server;
let baseUrl: string;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  // La API de NHTSA se simula; las llamadas al servidor de prueba se dejan
  // pasar al fetch real.
  jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url.startsWith('https://vpic.nhtsa.dot.gov/')) {
      return Promise.resolve(
        jsonResponse({
          Results: [
            {
              Make: 'VOLKSWAGEN',
              Model: 'Polo',
              ModelYear: '2021',
              ErrorCode: '0',
            },
          ],
        }),
      );
    }

    return realFetch(input, init);
  });

  server = createServer(createApp(dataSource));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  jest.restoreAllMocks();
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "user_vehicles", "sharing_requests", "parts", "maintenances", "vehicles", "users" CASCADE`,
  );
  await dataSource.getRepository(User).save([
    { id: 'user-1', name: 'Ana' },
    { id: 'user-2', name: 'Bruno' },
    { id: 'user-3', name: 'Carla' },
  ]);
});

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

async function api(
  path: string,
  userId?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};

  if (userId) {
    headers['x-user-id'] = userId;
  }

  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

describe('GET /vehicles/vin/:vin/decode', () => {
  it('devuelve marca, modelo, año y estado completo', async () => {
    const response = await api(`/vehicles/vin/${VIN}/decode`, 'user-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
      status: 'full',
    });
  });

  it('normaliza el VIN de la ruta', async () => {
    const response = await api(
      `/vehicles/vin/${VIN.toLowerCase()}/decode`,
      'user-1',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ brand: 'Volkswagen', status: 'full' });
  });

  it('responde 400 en español cuando el VIN es inválido', async () => {
    const response = await api('/vehicles/vin/NO-ES-UN-VIN/decode', 'user-1');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Datos inválidos.',
      errors: [
        {
          field: 'vin',
          message:
            'El VIN debe tener 17 caracteres: letras y números, sin I, O ni Q',
        },
      ],
    });
  });

  it('responde 400 sin llamar a la red cuando el dígito verificador no coincide', async () => {
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;

    const response = await api('/vehicles/vin/1HGCM82603A004352/decode', 'user-1');

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      {
        field: 'vin',
        message:
          'El VIN ingresado no es válido (el dígito verificador no coincide)',
      },
    ]);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore + 1);
  });

  it('requiere autenticación', async () => {
    const response = await api(`/vehicles/vin/${VIN}/decode`);

    expect(response.status).toBe(401);
  });

  it('responde 429 en la consulta 21 del mismo usuario en un minuto', async () => {
    const responses: ApiResponse[] = [];

    for (let index = 0; index < 21; index += 1) {
      responses.push(await api(`/vehicles/vin/${VIN}/decode`, 'user-3'));
    }

    expect(responses.slice(0, 20).map((response) => response.status)).toEqual(
      Array(20).fill(200),
    );
    expect(responses[20].status).toBe(429);
    expect(responses[20].body.message).toBe(
      'Demasiadas consultas de VIN. Intenta de nuevo en un minuto.',
    );
  });
});
