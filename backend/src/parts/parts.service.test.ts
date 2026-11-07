import { Repository } from 'typeorm';
import { Maintenance } from '../entities/Maintenance';
import { Part } from '../entities/Part';
import { CreatePartInput } from './part.schema';
import { PartsService } from './parts.service';

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const MAINTENANCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function buildInput(overrides: Partial<CreatePartInput> = {}): CreatePartInput {
  return {
    vehicleId: VEHICLE_ID,
    maintenanceId: MAINTENANCE_ID,
    name: 'Pastillas de freno',
    category: 'Frenos',
    cost: 45990,
    purchaseDate: '2026-10-15',
    ...overrides,
  };
}

function buildService() {
  const maintenances = { findOne: jest.fn() };
  const parts = { create: jest.fn(), save: jest.fn(), find: jest.fn() };

  const service = new PartsService({
    maintenances: maintenances as unknown as Repository<Maintenance>,
    parts: parts as unknown as Repository<Part>,
  });

  return { service, maintenances, parts };
}

describe('PartsService', () => {
  it('crea un repuesto cuando la mantención pertenece al vehículo', async () => {
    const { service, maintenances, parts } = buildService();

    maintenances.findOne.mockResolvedValue({
      id: MAINTENANCE_ID,
      vehicleId: VEHICLE_ID,
    });
    parts.create.mockImplementation((data: Partial<Part>) => data);
    parts.save.mockImplementation(async (data: Partial<Part>) => ({
      ...data,
      id: 'part-1',
      createdAt: new Date('2026-10-15T12:00:00.000Z'),
    }));

    const created = await service.create(buildInput());

    expect(created).toMatchObject({
      id: 'part-1',
      vehicleId: VEHICLE_ID,
      maintenanceId: MAINTENANCE_ID,
      name: 'Pastillas de freno',
      category: 'Frenos',
      cost: 45990,
      purchaseDate: '2026-10-15',
    });
    expect(parts.create).toHaveBeenCalledWith({
      vehicleId: VEHICLE_ID,
      maintenanceId: MAINTENANCE_ID,
      name: 'Pastillas de freno',
      category: 'Frenos',
      cost: 45990,
      purchaseDate: '2026-10-15',
    });
    expect(parts.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza con 400 cuando la mantención pertenece a otro vehículo', async () => {
    const { service, maintenances, parts } = buildService();

    maintenances.findOne.mockResolvedValue({
      id: MAINTENANCE_ID,
      vehicleId: OTHER_VEHICLE_ID,
    });

    await expect(service.create(buildInput())).rejects.toMatchObject({
      statusCode: 400,
      message: 'La mantención seleccionada no pertenece al vehículo.',
    });
    expect(parts.save).not.toHaveBeenCalled();
  });

  it('rechaza con 400 cuando la mantención no existe', async () => {
    const { service, maintenances, parts } = buildService();

    maintenances.findOne.mockResolvedValue(null);

    await expect(service.create(buildInput())).rejects.toMatchObject({
      statusCode: 400,
      message: 'La mantención seleccionada no pertenece al vehículo.',
    });
    expect(parts.save).not.toHaveBeenCalled();
  });

  it('lista los repuestos del vehículo y suma el costo total', async () => {
    const { service, parts } = buildService();
    const items = [{ cost: 10000 }, { cost: 2500 }];
    parts.find.mockResolvedValue(items);

    const result = await service.listByVehicle(VEHICLE_ID);

    expect(result).toEqual({ items, totalCost: 12500 });
    expect(parts.find).toHaveBeenCalledWith({
      where: { vehicleId: VEHICLE_ID },
      order: { purchaseDate: 'DESC', createdAt: 'DESC' },
    });
  });
});
