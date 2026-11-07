import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../app';
import { Maintenance } from '../entities/Maintenance';
import { Part } from '../entities/Part';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let maintenances: Repository<Maintenance>;
let parts: Repository<Part>;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  server = createServer(createApp(dataSource));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  maintenances = dataSource.getRepository(Maintenance);
  parts = dataSource.getRepository(Part);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "user_vehicles", "sharing_requests", "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
  await dataSource.getRepository(User).save([
    { id: 'user-1', name: 'Ana' },
    { id: 'user-2', name: 'Bruno' },
    { id: 'user-3', name: 'Carla' },
  ]);
});

interface ApiResponse {
  status: number;
  body: Record<string, any>;
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

const VEHICLE_PLATES = ['BCDF12', 'GHJK34', 'JKLP78'];

async function createVehicle(
  userId: string,
  index = 0,
): Promise<Record<string, any>> {
  const response = await api('POST', '/vehicles', {
    userId,
    body: {
      vin: null,
      licensePlate: VEHICLE_PLATES[index],
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
      currentMileage: 1000,
    },
  });

  expect(response.status).toBe(201);
  return response.body;
}

async function createPart(
  userId: string,
  vehicleId: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const response = await api('POST', '/parts', {
    userId,
    body: {
      vehicleId,
      name: 'Filtro de aceite',
      category: 'Filtros y lubricantes',
      cost: 10000,
      purchaseDate: '2026-01-05',
      ...overrides,
    },
  });

  expect(response.status).toBe(201);
  return response.body;
}

function maintenancePayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    serviceDate: '2026-01-10',
    serviceMileage: 1500,
    description: 'Cambio de aceite',
    laborCost: 20000,
    ...overrides,
  };
}

async function createMaintenance(
  userId: string,
  vehicleId: string,
  overrides: Record<string, unknown> = {},
): Promise<ApiResponse> {
  return api('POST', `/vehicles/${vehicleId}/maintenances`, {
    userId,
    body: maintenancePayload(overrides),
  });
}

async function vehicleMileage(vehicleId: string): Promise<number> {
  const rows: Array<{ current_mileage: number }> = await dataSource.query(
    'SELECT current_mileage FROM "vehicles" WHERE id = $1',
    [vehicleId],
  );

  return rows[0].current_mileage;
}

async function addGuest(userId: string, vehicleId: string): Promise<void> {
  await dataSource.getRepository(UserVehicle).save({
    userId,
    vehicleId,
    role: UserVehicleRole.GUEST,
  });
}

describe('POST /vehicles/:vehicleId/maintenances', () => {
  it('permite registrar al dueño y al invitado, con registeredBy', async () => {
    const vehicle = await createVehicle('user-1');
    await dataSource.getRepository(UserVehicle).save({
      userId: 'user-2',
      vehicleId: vehicle.id,
      role: UserVehicleRole.GUEST,
    });

    const asGuest = await createMaintenance('user-2', vehicle.id);
    const asOwner = await createMaintenance('user-1', vehicle.id);

    expect(asGuest.status).toBe(201);
    expect(asGuest.body.registeredBy).toEqual({ id: 'user-2', name: 'Bruno' });
    expect(asOwner.status).toBe(201);
    expect(asOwner.body.registeredBy).toEqual({ id: 'user-1', name: 'Ana' });
  });

  it('responde 404 a quien no es miembro', async () => {
    const vehicle = await createVehicle('user-1');

    const response = await createMaintenance('user-3', vehicle.id);

    expect(response.status).toBe(404);
    expect(await maintenances.count()).toBe(0);
  });

  it('rechaza fecha futura, fecha inexistente, descripción y kilometraje inválidos', async () => {
    const vehicle = await createVehicle('user-1');

    const future = await createMaintenance('user-1', vehicle.id, {
      serviceDate: '2999-01-01',
    });
    expect(future.status).toBe(400);
    expect(future.body.errors).toEqual(
      expect.arrayContaining([
        {
          field: 'serviceDate',
          message: 'La fecha no puede ser posterior a hoy',
        },
      ]),
    );

    const impossible = await createMaintenance('user-1', vehicle.id, {
      serviceDate: '2026-02-31',
    });
    expect(impossible.status).toBe(400);
    expect(impossible.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'serviceDate', message: 'La fecha no es válida.' },
      ]),
    );

    const missingDescription = await createMaintenance('user-1', vehicle.id, {
      description: '  ',
    });
    expect(missingDescription.status).toBe(400);
    expect(missingDescription.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'description' })]),
    );

    const shortDescription = await createMaintenance('user-1', vehicle.id, {
      description: 'Ab',
    });
    expect(shortDescription.status).toBe(400);
    expect(shortDescription.body.errors).toEqual(
      expect.arrayContaining([
        {
          field: 'description',
          message: 'La descripción debe tener al menos 3 caracteres.',
        },
      ]),
    );

    const negativeMileage = await createMaintenance('user-1', vehicle.id, {
      serviceMileage: -1,
    });
    expect(negativeMileage.status).toBe(400);
    expect(negativeMileage.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'serviceMileage' }),
      ]),
    );

    expect(await maintenances.count()).toBe(0);
  });
});

describe('PATCH /vehicles/:vehicleId/maintenances/:maintenanceId', () => {
  const path = (vehicleId: string, maintenanceId: string) =>
    `/vehicles/${vehicleId}/maintenances/${maintenanceId}`;

  it('permite al dueño editar cualquier mantención', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const created = await createMaintenance('user-2', vehicle.id);

    const response = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-1',
      body: {
        description: 'Editada por el dueño',
        registeredByUserId: 'user-3',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.description).toBe('Editada por el dueño');
    expect(response.body.registeredBy).toEqual({ id: 'user-2', name: 'Bruno' });
  });

  it('permite al invitado editar solo las suyas y responde 403 con las de otros', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const own = await createMaintenance('user-2', vehicle.id);
    const fromOwner = await createMaintenance('user-1', vehicle.id);

    const ownResponse = await api('PATCH', path(vehicle.id, own.body.id), {
      userId: 'user-2',
      body: { description: 'Cambio del invitado' },
    });
    const forbidden = await api(
      'PATCH',
      path(vehicle.id, fromOwner.body.id),
      { userId: 'user-2', body: { description: 'No permitido' } },
    );

    expect(ownResponse.status).toBe(200);
    expect(ownResponse.body.description).toBe('Cambio del invitado');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      message: 'No tienes permiso para esta acción.',
    });
  });

  it('permite al dueño conservar el taller que puso el invitado', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const workshop = await api('POST', '/workshops', {
      userId: 'user-2',
      body: { name: 'Taller del invitado' },
    });
    const created = await createMaintenance('user-2', vehicle.id, {
      workshopId: workshop.body.id,
    });

    const response = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-1',
      body: { workshopId: workshop.body.id, description: 'Editada por el dueño' },
    });

    expect(response.status).toBe(200);
    expect(response.body.workshop).toEqual({
      id: workshop.body.id,
      name: 'Taller del invitado',
    });
  });

  it('responde 404 a quien no es miembro y si la mantención no es del vehículo', async () => {
    const vehicle = await createVehicle('user-1');
    const otherVehicle = await createVehicle('user-1', 1);
    const created = await createMaintenance('user-1', vehicle.id);

    const notMember = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-3',
      body: { description: 'Intento ajeno' },
    });
    const otherRoute = await api(
      'PATCH',
      path(otherVehicle.id, created.body.id),
      { userId: 'user-1', body: { description: 'Otra ruta' } },
    );

    expect(notMember.status).toBe(404);
    expect(otherRoute.status).toBe(404);
  });

  it('reemplaza el conjunto de repuestos y deja los quitados sin asignar', async () => {
    const vehicle = await createVehicle('user-1');
    const first = await createPart('user-1', vehicle.id);
    const second = await createPart('user-1', vehicle.id, { name: 'Aceite' });
    const created = await createMaintenance('user-1', vehicle.id, {
      partIds: [first.id],
    });

    const response = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-1',
      body: { partIds: [second.id] },
    });

    expect(response.status).toBe(200);
    expect(response.body.parts).toEqual([
      expect.objectContaining({ id: second.id }),
    ]);
    expect((await parts.findOneByOrFail({ id: first.id })).maintenanceId).toBeNull();
    expect((await parts.findOneByOrFail({ id: second.id })).maintenanceId).toBe(
      created.body.id,
    );
  });

  it('responde 400 si un repuesto ya está asignado a otra mantención y no cambia nada', async () => {
    const vehicle = await createVehicle('user-1');
    const part = await createPart('user-1', vehicle.id);
    const first = await createMaintenance('user-1', vehicle.id, {
      partIds: [part.id],
    });
    const second = await createMaintenance('user-1', vehicle.id, {
      serviceDate: '2026-02-01',
      description: 'Otra mantención',
    });

    const response = await api('PATCH', path(vehicle.id, second.body.id), {
      userId: 'user-1',
      body: { description: 'No debe guardarse', partIds: [part.id] },
    });

    expect(response.status).toBe(400);
    const stored = await maintenances.findOneByOrFail({ id: second.body.id });
    expect(stored.description).toBe('Otra mantención');
    expect((await parts.findOneByOrFail({ id: part.id })).maintenanceId).toBe(
      first.body.id,
    );
  });

  it('nunca baja el kilometraje actual del vehículo al editar', async () => {
    const vehicle = await createVehicle('user-1');
    const created = await createMaintenance('user-1', vehicle.id, {
      serviceMileage: 5000,
    });
    expect(await vehicleMileage(vehicle.id)).toBe(5000);

    const lower = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-1',
      body: { serviceMileage: 2000 },
    });
    expect(lower.status).toBe(200);
    expect(lower.body.serviceMileage).toBe(2000);
    expect(await vehicleMileage(vehicle.id)).toBe(5000);

    const higher = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-1',
      body: { serviceMileage: 7000 },
    });
    expect(higher.status).toBe(200);
    expect(await vehicleMileage(vehicle.id)).toBe(7000);
  });

  it('valida los campos editables con las mismas reglas que al crear', async () => {
    const vehicle = await createVehicle('user-1');
    const created = await createMaintenance('user-1', vehicle.id);

    const response = await api('PATCH', path(vehicle.id, created.body.id), {
      userId: 'user-1',
      body: { serviceDate: '2999-01-01', description: 'Ab' },
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'serviceDate' }),
        expect.objectContaining({ field: 'description' }),
      ]),
    );
  });
});

describe('DELETE /vehicles/:vehicleId/maintenances/:maintenanceId', () => {
  const path = (vehicleId: string, maintenanceId: string) =>
    `/vehicles/${vehicleId}/maintenances/${maintenanceId}`;

  it('permite al dueño eliminar cualquier mantención', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const created = await createMaintenance('user-2', vehicle.id);

    const response = await api('DELETE', path(vehicle.id, created.body.id), {
      userId: 'user-1',
    });

    expect(response.status).toBe(204);
    expect(await maintenances.count()).toBe(0);
  });

  it('permite al invitado eliminar solo las suyas y responde 403 con las de otros', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const own = await createMaintenance('user-2', vehicle.id);
    const fromOwner = await createMaintenance('user-1', vehicle.id);

    const ownResponse = await api('DELETE', path(vehicle.id, own.body.id), {
      userId: 'user-2',
    });
    const forbidden = await api(
      'DELETE',
      path(vehicle.id, fromOwner.body.id),
      { userId: 'user-2' },
    );

    expect(ownResponse.status).toBe(204);
    expect(forbidden.status).toBe(403);
    expect(await maintenances.count()).toBe(1);
  });

  it('responde 404 a quien no es miembro', async () => {
    const vehicle = await createVehicle('user-1');
    const created = await createMaintenance('user-1', vehicle.id);

    const response = await api('DELETE', path(vehicle.id, created.body.id), {
      userId: 'user-3',
    });

    expect(response.status).toBe(404);
    expect(await maintenances.count()).toBe(1);
  });

  it('deja los repuestos intactos y sin asignar al eliminar', async () => {
    const vehicle = await createVehicle('user-1');
    const part = await createPart('user-1', vehicle.id);
    const created = await createMaintenance('user-1', vehicle.id, {
      partIds: [part.id],
    });

    const response = await api('DELETE', path(vehicle.id, created.body.id), {
      userId: 'user-1',
    });

    expect(response.status).toBe(204);
    const stored = await parts.findOneByOrFail({ id: part.id });
    expect(stored.maintenanceId).toBeNull();
    expect(stored.name).toBe('Filtro de aceite');
  });
});

describe('talleres', () => {
  it('lista solo los talleres del usuario y permite el mismo nombre en otro usuario', async () => {
    const first = await api('POST', '/workshops', {
      userId: 'user-1',
      body: { name: 'Taller Central' },
    });
    const second = await api('POST', '/workshops', {
      userId: 'user-2',
      body: { name: 'Taller Central' },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const listUser1 = await api('GET', '/workshops', { userId: 'user-1' });
    const listUser2 = await api('GET', '/workshops', { userId: 'user-2' });

    expect(listUser1.body).toEqual([
      expect.objectContaining({ id: first.body.id, name: 'Taller Central' }),
    ]);
    expect(listUser2.body).toEqual([
      expect.objectContaining({ id: second.body.id, name: 'Taller Central' }),
    ]);
  });

  it('responde 409 con nombre duplicado sin distinguir mayúsculas', async () => {
    await api('POST', '/workshops', {
      userId: 'user-1',
      body: { name: 'Taller Central' },
    });

    const duplicated = await api('POST', '/workshops', {
      userId: 'user-1',
      body: { name: 'taller central' },
    });

    expect(duplicated.status).toBe(409);
    expect(duplicated.body).toEqual({
      message: 'Ya tienes un taller con ese nombre',
    });
  });

  it('responde 404 con un taller de otro usuario y no crea la mantención', async () => {
    const vehicle = await createVehicle('user-1');
    const otherWorkshop = await api('POST', '/workshops', {
      userId: 'user-2',
      body: { name: 'Taller Ajeno' },
    });

    const response = await createMaintenance('user-1', vehicle.id, {
      workshopId: otherWorkshop.body.id,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Taller no encontrado' });
    expect(await maintenances.count()).toBe(0);
  });

  it('guarda el taller propio en la mantención', async () => {
    const vehicle = await createVehicle('user-1');
    const workshop = await api('POST', '/workshops', {
      userId: 'user-1',
      body: { name: 'Taller Central', rating: 5 },
    });

    const response = await createMaintenance('user-1', vehicle.id, {
      workshopId: workshop.body.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.workshop).toEqual({
      id: workshop.body.id,
      name: 'Taller Central',
    });
  });
});

describe('repuestos de la mantención', () => {
  it('responde 400 y no deja nada creado con repuestos inválidos', async () => {
    const vehicle = await createVehicle('user-1');
    const otherVehicle = await createVehicle('user-1', 1);
    const otherPart = await createPart('user-1', otherVehicle.id);

    const fromOtherVehicle = await createMaintenance('user-1', vehicle.id, {
      serviceMileage: 9000,
      partIds: [otherPart.id],
    });
    expect(fromOtherVehicle.status).toBe(400);
    expect(fromOtherVehicle.body.message).toBe(
      'Alguno de los repuestos no existe, no pertenece a este vehículo o ya está asignado a otra mantención',
    );

    const missing = await createMaintenance('user-1', vehicle.id, {
      serviceMileage: 9000,
      partIds: ['99999999-9999-4999-8999-999999999999'],
    });
    expect(missing.status).toBe(400);

    const vehiclePart = await createPart('user-1', vehicle.id);
    const first = await createMaintenance('user-1', vehicle.id, {
      partIds: [vehiclePart.id],
    });
    expect(first.status).toBe(201);

    const alreadyAssigned = await createMaintenance('user-1', vehicle.id, {
      serviceMileage: 9000,
      partIds: [vehiclePart.id],
    });
    expect(alreadyAssigned.status).toBe(400);

    expect(await maintenances.count()).toBe(1);
    expect(await vehicleMileage(vehicle.id)).toBe(1500);
  });

  it('asigna los repuestos del mismo vehículo', async () => {
    const vehicle = await createVehicle('user-1');
    const first = await createPart('user-1', vehicle.id, { cost: 10000 });
    const second = await createPart('user-1', vehicle.id, {
      name: 'Aceite',
      cost: 5000,
    });

    const response = await createMaintenance('user-1', vehicle.id, {
      partIds: [first.id, second.id],
    });

    expect(response.status).toBe(201);
    expect(response.body.parts).toHaveLength(2);
    expect(response.body.partsTotal).toBe(15000);
    expect(response.body.totalCost).toBe(35000);
  });

  it('resuelve dos solicitudes simultáneas: una gana y la otra recibe 400', async () => {
    const vehicle = await createVehicle('user-1');
    const part = await createPart('user-1', vehicle.id);

    const responses = await Promise.all([
      createMaintenance('user-1', vehicle.id, { partIds: [part.id] }),
      createMaintenance('user-1', vehicle.id, { partIds: [part.id] }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(await maintenances.count()).toBe(1);

    const stored = await parts.findOneByOrFail({ id: part.id });
    expect(stored.maintenanceId).not.toBeNull();
  });
});

describe('kilometraje del vehículo', () => {
  it('sube solo si el del servicio es mayor y nunca baja', async () => {
    const vehicle = await createVehicle('user-1');

    await createMaintenance('user-1', vehicle.id, { serviceMileage: 2000 });
    expect(await vehicleMileage(vehicle.id)).toBe(2000);

    await createMaintenance('user-1', vehicle.id, { serviceMileage: 1500 });
    expect(await vehicleMileage(vehicle.id)).toBe(2000);

    await createMaintenance('user-1', vehicle.id, { serviceMileage: 5000 });
    expect(await vehicleMileage(vehicle.id)).toBe(5000);
  });
});

describe('GET /vehicles/:vehicleId/maintenances', () => {
  it('devuelve totales del vehículo que coinciden con el detalle y el resumen', async () => {
    const vehicle = await createVehicle('user-1');
    const first = await createPart('user-1', vehicle.id, { cost: 10000 });
    const second = await createPart('user-1', vehicle.id, {
      name: 'Aceite',
      cost: 5000,
    });
    const created = await createMaintenance('user-1', vehicle.id, {
      laborCost: 20000,
      partIds: [first.id, second.id],
    });

    const list = await api('GET', `/vehicles/${vehicle.id}/maintenances`, {
      userId: 'user-1',
    });
    const detail = await api(
      'GET',
      `/vehicles/${vehicle.id}/maintenances/${created.body.id}`,
      { userId: 'user-1' },
    );
    const summary = await api(
      'GET',
      `/vehicles/${vehicle.id}/expenses/summary`,
      { userId: 'user-1' },
    );

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      total: 1,
      laborTotal: 20000,
      partsTotal: 15000,
      grandTotal: 35000,
    });
    expect(detail.body).toMatchObject({
      id: created.body.id,
      partsTotal: 15000,
      totalCost: 35000,
    });
    expect(summary.body).toEqual({
      partsTotal: 15000,
      partsCount: 2,
      laborTotal: 20000,
      maintenanceCount: 1,
      grandTotal: 35000,
    });
  });

  it('pagina respetando limit y offset sin cambiar los totales', async () => {
    const vehicle = await createVehicle('user-1');

    for (const serviceDate of ['2026-01-01', '2026-02-01', '2026-03-01']) {
      await createMaintenance('user-1', vehicle.id, {
        serviceDate,
        laborCost: 1000,
      });
    }

    const full = await api('GET', `/vehicles/${vehicle.id}/maintenances`, {
      userId: 'user-1',
    });
    const page = await api(
      'GET',
      `/vehicles/${vehicle.id}/maintenances?limit=1&offset=1`,
      { userId: 'user-1' },
    );

    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].serviceDate).toBe('2026-02-01');
    expect(page.body.total).toBe(3);
    expect(page.body).toMatchObject({
      laborTotal: full.body.laborTotal,
      partsTotal: full.body.partsTotal,
      grandTotal: full.body.grandTotal,
    });
  });

  it('valida la paginación y la membresía', async () => {
    const vehicle = await createVehicle('user-1');

    const tooLarge = await api(
      'GET',
      `/vehicles/${vehicle.id}/maintenances?limit=101`,
      { userId: 'user-1' },
    );
    const notMember = await api(
      'GET',
      `/vehicles/${vehicle.id}/maintenances`,
      { userId: 'user-2' },
    );

    expect(tooLarge.status).toBe(400);
    expect(notMember.status).toBe(404);
  });

  it('responde 404 si la mantención es de otro vehículo o el id no es uuid', async () => {
    const vehicle = await createVehicle('user-1');
    const otherVehicle = await createVehicle('user-1', 1);
    const created = await createMaintenance('user-1', vehicle.id);

    const otherRoute = await api(
      'GET',
      `/vehicles/${otherVehicle.id}/maintenances/${created.body.id}`,
      { userId: 'user-1' },
    );
    const notUuid = await api(
      'GET',
      `/vehicles/${vehicle.id}/maintenances/no-es-uuid`,
      { userId: 'user-1' },
    );

    expect(otherRoute.status).toBe(404);
    expect(notUuid.status).toBe(404);
  });
});

describe('GET /vehicles/:vehicleId/parts?unassigned=true', () => {
  it('devuelve solo los repuestos sin mantención', async () => {
    const vehicle = await createVehicle('user-1');
    const assigned = await createPart('user-1', vehicle.id);
    const free = await createPart('user-1', vehicle.id, {
      name: 'Pastillas de freno',
    });
    await createMaintenance('user-1', vehicle.id, {
      partIds: [assigned.id],
    });

    const all = await api('GET', `/vehicles/${vehicle.id}/parts`, {
      userId: 'user-1',
    });
    const unassigned = await api(
      'GET',
      `/vehicles/${vehicle.id}/parts?unassigned=true`,
      { userId: 'user-1' },
    );

    expect(all.body.items).toHaveLength(2);
    expect(unassigned.body.items).toEqual([
      expect.objectContaining({ id: free.id }),
    ]);
  });
});
