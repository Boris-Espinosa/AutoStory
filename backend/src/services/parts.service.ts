import { IsNull, Repository } from 'typeorm';
import { Maintenance } from '../entities/Maintenance';
import { Part } from '../entities/Part';
import { HttpError } from '../common/http-error';
import { partCostSql } from '../utils/part-cost';
import { CreatePartInput } from '../schemas/part.schema';

export interface PartsRepositories {
  maintenances: Repository<Maintenance>;
  parts: Repository<Part>;
}

export interface PartsList {
  items: Part[];
  totalCost: number;
  total: number;
}

export interface ListPartsOptions {
  unassigned?: boolean;
  limit: number;
  offset: number;
}

export interface PartsExpensesSummary {
  partsTotal: number;
  partsCount: number;
  laborTotal: number;
  maintenanceCount: number;
  grandTotal: number;
}

export class PartsService {
  constructor(private readonly repositories: PartsRepositories) {}

  async create(input: CreatePartInput): Promise<Part> {
    if (input.maintenanceId) {
      const maintenance = await this.repositories.maintenances.findOne({
        where: { id: input.maintenanceId },
      });

      if (!maintenance || maintenance.vehicleId !== input.vehicleId) {
        throw new HttpError(400, 'La mantención seleccionada no pertenece al vehículo.');
      }
    }

    const part = this.repositories.parts.create({
      vehicleId: input.vehicleId,
      maintenanceId: input.maintenanceId ?? null,
      name: input.name,
      category: input.category,
      cost: input.cost,
      purchaseDate: input.purchaseDate,
    });

    return this.repositories.parts.save(part);
  }

  async listByVehicle(
    vehicleId: string,
    options: ListPartsOptions,
  ): Promise<PartsList> {
    const totalCostQuery = this.repositories.parts
      .createQueryBuilder('part')
      .select(
        `COALESCE(SUM(${partCostSql(this.repositories.parts)}), 0)`,
        'totalCost',
      )
      .where('part.vehicle_id = :vehicleId', { vehicleId });

    if (options.unassigned) {
      totalCostQuery.andWhere('part.maintenance_id IS NULL');
    }

    const [[items, total], totalCostRow] = await Promise.all([
      this.repositories.parts.findAndCount({
        where: options.unassigned
          ? { vehicleId, maintenanceId: IsNull() }
          : { vehicleId },
        order: { purchaseDate: 'DESC', createdAt: 'DESC', id: 'ASC' },
        take: options.limit,
        skip: options.offset,
      }),
      totalCostQuery.getRawOne<{ totalCost: string }>(),
    ]);

    return { items, totalCost: Number(totalCostRow?.totalCost ?? 0), total };
  }

  async getExpensesSummary(vehicleId: string): Promise<PartsExpensesSummary> {
    const [partsRow, maintenanceRow] = await Promise.all([
      this.repositories.parts
        .createQueryBuilder('part')
        .select(`COALESCE(SUM(${partCostSql(this.repositories.parts)}), 0)`, 'partsTotal')
        .addSelect('COUNT(*)', 'partsCount')
        .where('part.vehicle_id = :vehicleId', { vehicleId })
        .getRawOne<{ partsTotal: string; partsCount: string }>(),
      this.repositories.maintenances
        .createQueryBuilder('maintenance')
        .select('COALESCE(SUM(maintenance.labor_cost), 0)', 'laborTotal')
        .addSelect('COUNT(*)', 'maintenanceCount')
        .where('maintenance.vehicle_id = :vehicleId', { vehicleId })
        .getRawOne<{ laborTotal: string; maintenanceCount: string }>(),
    ]);

    const partsTotal = Number(partsRow?.partsTotal ?? 0);
    const laborTotal = Number(maintenanceRow?.laborTotal ?? 0);

    return {
      partsTotal,
      partsCount: Number(partsRow?.partsCount ?? 0),
      laborTotal,
      maintenanceCount: Number(maintenanceRow?.maintenanceCount ?? 0),
      grandTotal: partsTotal + laborTotal,
    };
  }
}
