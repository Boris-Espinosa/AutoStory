import { promises as fs } from 'fs';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import path from 'path';
import { DataSource } from 'typeorm';
import { createApp } from '../app';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { createStorageService } from '../storage/storage.service';
import { VEHICLE_UPLOADS_DIR } from '../vehicles/photo-upload';
import { createTestDataSource } from './test-data-source';

const VIN = 'WVWZZZ6RZMY000001';
const LICENSE_PLATE = 'BBJJ12';

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
const storage = createStorageService();

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  server = createServer(
    createApp(dataSource, undefined, undefined, undefined, storage),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "user_vehicles", "sharing_requests", "parts", "maintenances", "vehicles", "users" CASCADE`,
  );
  await dataSource.getRepository(User).save([
    { id: 'user-1', name: 'Ana' },
    { id: 'user-2', name: 'Bruno' },
  ]);
});

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

async function api(
  method: string,
  path: string,
  options: { userId?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};

  if (options.userId) {
    headers['x-user-id'] = options.userId;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function vehiclePayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    vin: VIN,
    licensePlate: LICENSE_PLATE,
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 1000,
    ...overrides,
  };
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const TXT_BYTES = Buffer.from('no soy una imagen');

const createdPhotos: string[] = [];

afterAll(async () => {
  for (const photoUrl of createdPhotos) {
    await fs.rm(path.join(VEHICLE_UPLOADS_DIR, path.basename(photoUrl)), {
      force: true,
    });
  }
});

async function countUploadedFiles(): Promise<number> {
  return (await fs.readdir(VEHICLE_UPLOADS_DIR)).length;
}

async function uploadPhoto(
  userId: string,
  vehicleId: string,
  fileName: string,
  bytes: Buffer,
): Promise<ApiResponse> {
  const form = new FormData();
  form.append('photo', new Blob([bytes]), fileName);

  const response = await fetch(`${baseUrl}/vehicles/${vehicleId}/photo`, {
    method: 'POST',
    headers: { 'x-user-id': userId },
    body: form,
  });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function createVehicleAs(
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const response = await api('POST', '/vehicles', {
    userId,
    body: vehiclePayload(overrides),
  });

  expect(response.status).toBe(201);
  return response.body;
}

describe('POST /vehicles', () => {
  it('permite que dos usuarios registren la misma patente y el mismo VIN', async () => {
    const first = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload(),
    });
    const second = await api('POST', '/vehicles', {
      userId: 'user-2',
      body: vehiclePayload(),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.role).toBe('OWNER');
    expect(second.body.role).toBe('OWNER');

    const {
      id: _firstId,
      createdAt: _firstCreatedAt,
      ...firstRest
    } = first.body;
    const {
      id: _secondId,
      createdAt: _secondCreatedAt,
      ...secondRest
    } = second.body;

    expect(firstRest).toEqual(secondRest);
    expect(firstRest).toMatchObject({ vin: VIN, licensePlate: LICENSE_PLATE });
  });

  it('responde 409 cuando el mismo usuario repite la patente', async () => {
    await api('POST', '/vehicles', { userId: 'user-1', body: vehiclePayload() });

    const repeated = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ vin: null, licensePlate: 'bb-jj 12' }),
    });

    expect(repeated.status).toBe(409);
    expect(repeated.body).toEqual({
      message: 'Ya tienes este vehículo registrado',
    });
  });

  it('responde 409 cuando el mismo usuario repite el VIN con otra patente', async () => {
    await api('POST', '/vehicles', { userId: 'user-1', body: vehiclePayload() });

    const repeated = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ licensePlate: 'ZZZZ99' }),
    });

    expect(repeated.status).toBe(409);
    expect(repeated.body).toEqual({
      message: 'Ya tienes este vehículo registrado',
    });
  });

  it('resuelve dos solicitudes simultáneas con un 201 y un 409', async () => {
    const responses = await Promise.all([
      api('POST', '/vehicles', { userId: 'user-1', body: vehiclePayload() }),
      api('POST', '/vehicles', { userId: 'user-1', body: vehiclePayload() }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  it('acepta un vehículo sin VIN', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ vin: null }),
    });

    expect(response.status).toBe(201);
    expect(response.body.vin).toBeNull();
  });

  it('trata el VIN vacío como ausente', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ vin: '' }),
    });

    expect(response.status).toBe(201);
    expect(response.body.vin).toBeNull();
  });

  it('normaliza la patente y el VIN', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({
        vin: ' wvwzzz6rzmy000001 ',
        licensePlate: 'bb-jj 12',
      }),
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ vin: VIN, licensePlate: LICENSE_PLATE });
  });

  it('rechaza con 400 un VIN inválido', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ vin: 'WVWZZZ6RZMY00000I' }),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.');
  });

  it('rechaza con 400 cuando falta la patente', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ licensePlate: '  ' }),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Datos inválidos.');
  });

  it('rechaza con 400 una patente con símbolos y no la guarda limpia', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ vin: null, licensePlate: 'BC*DF#12' }),
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ field: 'licensePlate' }),
    ]);
    expect(await dataSource.getRepository(Vehicle).count()).toBe(0);
  });

  it('rechaza con 400 un VIN con dígito verificador incorrecto', async () => {
    const response = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload({ vin: '1HGCM82603A004352' }),
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      {
        field: 'vin',
        message:
          'El VIN ingresado no es válido (el dígito verificador no coincide)',
      },
    ]);
    expect(await dataSource.getRepository(Vehicle).count()).toBe(0);
  });
});

describe('acceso limitado al usuario', () => {
  it('no permite acceder al vehículo de otro usuario aunque comparta patente y VIN', async () => {
    const own = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload(),
    });
    await api('POST', '/vehicles', { userId: 'user-2', body: vehiclePayload() });

    const response = await api('GET', `/vehicles/${own.body.id}/maintenances`, {
      userId: 'user-2',
    });

    expect(response.status).toBe(404);
  });

  it('lista solo los vehículos del usuario autenticado', async () => {
    await api('POST', '/vehicles', { userId: 'user-1', body: vehiclePayload() });
    await api('POST', '/vehicles', { userId: 'user-2', body: vehiclePayload() });

    const response = await api('GET', '/vehicles', { userId: 'user-2' });
    const vehicles = response.body as unknown as Array<{
      licensePlate: string;
      role: string;
    }>;

    expect(response.status).toBe(200);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      licensePlate: LICENSE_PLATE,
      role: 'OWNER',
    });
  });
});

describe('rutas de verificación eliminadas', () => {
  it('responde 404 en /admin/* y /vehicles/:id/verification', async () => {
    const vehicle = await api('POST', '/vehicles', {
      userId: 'user-1',
      body: vehiclePayload(),
    });

    const admin = await api('GET', '/admin/vehicles', { userId: 'user-1' });
    const verification = await api(
      'GET',
      `/vehicles/${vehicle.body.id}/verification`,
      { userId: 'user-1' },
    );

    expect(admin.status).toBe(404);
    expect(verification.status).toBe(404);
  });
});

describe('persistencia y listado', () => {
  it('crea el Vehicle y su fila OWNER juntos', async () => {
    const vehicle = await createVehicleAs('user-1');

    const rows: Array<{ id: string; role: string }> = await dataSource.query(
      `SELECT vehicle.id, membership.role
         FROM "vehicles" vehicle
         JOIN "user_vehicles" membership ON membership.vehicle_id = vehicle.id
        WHERE vehicle.id = $1`,
      [vehicle.id],
    );

    expect(rows).toEqual([{ id: vehicle.id, role: 'OWNER' }]);
    expect(vehicle.role).toBe('OWNER');
  });

  it('lista solo los vehículos del usuario, con su role y por assignedAt descendente', async () => {
    const older = await createVehicleAs('user-1', {
      vin: null,
      licensePlate: 'BCDF12',
    });
    const newer = await createVehicleAs('user-1', {
      vin: null,
      licensePlate: 'GHJK34',
    });
    await createVehicleAs('user-2', { vin: null, licensePlate: 'CCCC33' });

    await dataSource.query(
      `UPDATE "user_vehicles" SET assigned_at = '2026-01-01' WHERE vehicle_id = $1`,
      [older.id],
    );
    await dataSource.query(
      `UPDATE "user_vehicles" SET assigned_at = '2026-02-01' WHERE vehicle_id = $1`,
      [newer.id],
    );

    const response = await api('GET', '/vehicles', { userId: 'user-1' });
    const vehicles = response.body as unknown as Array<Record<string, any>>;

    expect(response.status).toBe(200);
    expect(vehicles.map((vehicle) => vehicle.licensePlate)).toEqual([
      'GHJK34',
      'BCDF12',
    ]);
    expect(vehicles.every((vehicle) => vehicle.role === 'OWNER')).toBe(true);
    expect(vehicles[0]).toMatchObject({
      id: newer.id,
      vin: null,
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
      currentMileage: 1000,
      photoUrl: null,
    });
  });
});

describe('GET /vehicles/brands', () => {
  it('devuelve las marcas admitidas y exige autenticación', async () => {
    const response = await api('GET', '/vehicles/brands', { userId: 'user-1' });
    const brands = response.body as unknown as string[];

    expect(response.status).toBe(200);
    expect(brands).toEqual(
      expect.arrayContaining([
        'Toyota',
        'Chevrolet',
        'Mercedes-Benz',
        'Citroën',
        'Otra',
      ]),
    );

    expect((await api('GET', '/vehicles/brands')).status).toBe(401);
  });
});

describe('POST /vehicles/:vehicleId/photo', () => {
  it('responde 403 a un invitado y no escribe archivos', async () => {
    const vehicle = await createVehicleAs('user-1');
    await dataSource.getRepository(UserVehicle).save({
      userId: 'user-2',
      vehicleId: vehicle.id,
      role: UserVehicleRole.GUEST,
    });
    const before = await countUploadedFiles();

    const response = await uploadPhoto(
      'user-2',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'No tienes permiso para esta acción.',
    });
    expect(await countUploadedFiles()).toBe(before);
  });

  it('responde 404 a quien no es miembro', async () => {
    const vehicle = await createVehicleAs('user-1');

    const response = await uploadPhoto(
      'user-2',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Vehículo no encontrado.' });
  });

  it('rechaza un .txt con 400', async () => {
    const vehicle = await createVehicleAs('user-1');

    const response = await uploadPhoto(
      'user-1',
      vehicle.id,
      'nota.txt',
      TXT_BYTES,
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'El archivo no es una imagen válida (solo JPG, PNG o WEBP).',
    });
  });

  it('rechaza un .txt renombrado a .png con 400', async () => {
    const vehicle = await createVehicleAs('user-1');

    const response = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      TXT_BYTES,
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'El archivo no es una imagen válida (solo JPG, PNG o WEBP).',
    });
  });

  it('traduce el límite de tamaño de Multer a 400', async () => {
    const vehicle = await createVehicleAs('user-1');
    const before = await countUploadedFiles();
    const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1);

    const response = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      tooLarge,
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'La foto no puede superar los 5 MB.',
    });
    expect(await countUploadedFiles()).toBe(before);
  });

  it('guarda la foto, actualiza photoUrl y borra la anterior', async () => {
    const vehicle = await createVehicleAs('user-1');

    const first = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );
    expect(first.status).toBe(200);

    const firstUrl = first.body.photoUrl as string;
    createdPhotos.push(firstUrl);
    expect(firstUrl).toMatch(/^\/uploads\/vehicles\/[0-9a-f-]{36}\.png$/);
    await expect(
      fs.access(path.join(VEHICLE_UPLOADS_DIR, path.basename(firstUrl))),
    ).resolves.toBeUndefined();

    const second = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );
    expect(second.status).toBe(200);

    const secondUrl = second.body.photoUrl as string;
    createdPhotos.push(secondUrl);
    expect(secondUrl).not.toBe(firstUrl);
    await expect(
      fs.access(path.join(VEHICLE_UPLOADS_DIR, path.basename(firstUrl))),
    ).rejects.toThrow();

    const list = await api('GET', '/vehicles', { userId: 'user-1' });
    const [listed] = list.body as unknown as Array<{ photoUrl: string }>;
    expect(listed.photoUrl).toBe(secondUrl);
  });

  it('un fallo al borrar la foto anterior no rompe el reemplazo', async () => {
    const vehicle = await createVehicleAs('user-1');

    const first = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );
    createdPhotos.push(first.body.photoUrl as string);

    jest
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(new Error('fallo simulado'));

    const second = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );
    createdPhotos.push(second.body.photoUrl as string);

    expect(second.status).toBe(200);

    const list = await api('GET', '/vehicles', { userId: 'user-1' });
    const [listed] = list.body as unknown as Array<{ photoUrl: string }>;
    expect(listed.photoUrl).toBe(second.body.photoUrl);
  });

  it('un fallo al borrar la foto no impide eliminar el vehículo', async () => {
    const vehicle = await createVehicleAs('user-1');
    const photo = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );
    createdPhotos.push(photo.body.photoUrl as string);

    jest
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(new Error('fallo simulado'));

    const response = await api('DELETE', `/vehicles/${vehicle.id}`, {
      userId: 'user-1',
    });

    expect(response.status).toBe(204);
  });
});

describe('DELETE /vehicles/:vehicleId', () => {
  it('elimina el vehículo y sus membresías para el dueño', async () => {
    const vehicle = await createVehicleAs('user-1');
    await dataSource.getRepository(UserVehicle).save({
      userId: 'user-2',
      vehicleId: vehicle.id,
      role: UserVehicleRole.GUEST,
    });

    const response = await api('DELETE', `/vehicles/${vehicle.id}`, {
      userId: 'user-1',
    });

    expect(response.status).toBe(204);
    expect(
      await dataSource.getRepository(Vehicle).findOneBy({ id: vehicle.id }),
    ).toBeNull();
    expect(
      await dataSource
        .getRepository(UserVehicle)
        .find({ where: { vehicleId: vehicle.id } }),
    ).toEqual([]);
    expect((await api('GET', '/vehicles', { userId: 'user-1' })).body).toEqual(
      [],
    );
  });

  it('responde 403 a un invitado y conserva el vehículo', async () => {
    const vehicle = await createVehicleAs('user-1');
    await dataSource.getRepository(UserVehicle).save({
      userId: 'user-2',
      vehicleId: vehicle.id,
      role: UserVehicleRole.GUEST,
    });

    const response = await api('DELETE', `/vehicles/${vehicle.id}`, {
      userId: 'user-2',
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'No tienes permiso para esta acción.',
    });
    expect(
      await dataSource.getRepository(Vehicle).findOneBy({ id: vehicle.id }),
    ).not.toBeNull();
  });

  it('responde 404 a quien no es miembro', async () => {
    const vehicle = await createVehicleAs('user-1');

    const response = await api('DELETE', `/vehicles/${vehicle.id}`, {
      userId: 'user-2',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Vehículo no encontrado.' });
    expect(
      await dataSource.getRepository(Vehicle).findOneBy({ id: vehicle.id }),
    ).not.toBeNull();
  });

  it('borra la foto del disco', async () => {
    const vehicle = await createVehicleAs('user-1');
    const uploaded = await uploadPhoto(
      'user-1',
      vehicle.id,
      'foto.png',
      PNG_BYTES,
    );
    const photoUrl = uploaded.body.photoUrl as string;
    createdPhotos.push(photoUrl);
    const photoPath = path.join(VEHICLE_UPLOADS_DIR, path.basename(photoUrl));

    await expect(fs.access(photoPath)).resolves.toBeUndefined();

    const response = await api('DELETE', `/vehicles/${vehicle.id}`, {
      userId: 'user-1',
    });

    expect(response.status).toBe(204);
    await expect(fs.access(photoPath)).rejects.toThrow();
  });

  it('no afecta el vehículo de otro usuario con la misma patente y VIN', async () => {
    const first = await createVehicleAs('user-1');
    const second = await createVehicleAs('user-2');

    const response = await api('DELETE', `/vehicles/${first.id}`, {
      userId: 'user-1',
    });

    expect(response.status).toBe(204);

    const list = await api('GET', '/vehicles', { userId: 'user-2' });
    expect(list.body).toEqual([
      expect.objectContaining({
        id: second.id,
        licensePlate: LICENSE_PLATE,
        vin: VIN,
      }),
    ]);
  });
});
