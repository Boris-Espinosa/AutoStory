import { EntityManager, In, Repository } from 'typeorm';
import { z } from 'zod';
import { HttpError } from '../common/http-error';
import { Maintenance } from '../entities/Maintenance';
import { Part } from '../entities/Part';
import { User } from '../entities/User';
import { UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import { partCostSql, partTotalCost } from '../parts/part-cost';
import {
  CreateMaintenanceInput,
  ListMaintenancesQuery,
  UpdateMaintenanceInput,
} from './maintenance.schema';

export interface MaintenanceRepositories {
  maintenances: Repository<Maintenance>;
  parts: Repository<Part>;
  workshops: Repository<Workshop>;
  users: Repository<User>;
}

export interface MaintenancePartView {
  id: string;
  name: string;
  category: string;
  cost: number;
  purchaseDate: string;
  totalCost: number;
}

export interface MaintenanceView {
  id: string;
  vehicleId: string;
  serviceDate: string;
  serviceMileage: number;
  description: string;
  diagnosis: string | null;
  laborCost: number;
  workshop: { id: string; name: string } | null;
  registeredBy: { id: string; name: string | null } | null;
  parts: MaintenancePartView[];
  partsTotal: number;
  totalCost: number;
  createdAt: Date;
}

export interface MaintenanceList {
  items: MaintenanceView[];
  total: number;
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
}

const uuidSchema = z.string().uuid();

export class MaintenanceService {
  constructor(private readonly repositories: MaintenanceRepositories) {}

  async create(
    userId: string,
    vehicleId: string,
    input: CreateMaintenanceInput,
  ): Promise<MaintenanceView> {
    const maintenanceId = await this.repositories.maintenances.manager.transaction(
      async (manager) => {
        if (input.workshopId) {
          const workshop = await manager.findOne(Workshop, {
            where: { id: input.workshopId, createdByUserId: userId },
          });

          // No se revela si el taller existe para otro usuario.
          if (!workshop) {
            throw new HttpError(404, 'Taller no encontrado');
          }
        }

        const maintenance = manager.create(Maintenance, {
          vehicleId,
          serviceDate: input.serviceDate,
          serviceMileage: input.serviceMileage,
          description: input.description,
          diagnosis: input.diagnosis,
          laborCost: input.laborCost,
          workshopId: input.workshopId,
          registeredByUserId: userId,
        });
        await manager.save(maintenance);

        if (input.partIds.length > 0) {
          // El UPDATE condicionado hace que dos solicitudes simultáneas no
          // asignen el mismo repuesto: la segunda afecta menos filas.
          const result = await manager
            .createQueryBuilder()
            .update(Part)
            .set({ maintenanceId: maintenance.id })
            .where('id IN (:...partIds)', { partIds: input.partIds })
            .andWhere('vehicle_id = :vehicleId', { vehicleId })
            .andWhere('maintenance_id IS NULL')
            .execute();

          if ((result.affected ?? 0) !== input.partIds.length) {
            throw new HttpError(
              400,
              'Alguno de los repuestos no existe, no pertenece a este vehículo o ya está asignado a otra mantención',
            );
          }
        }

        await manager
          .createQueryBuilder()
          .update(Vehicle)
          .set({
            currentMileage: () => 'GREATEST("current_mileage", :serviceMileage)',
          })
          .where('id = :vehicleId', { vehicleId })
          .setParameter('serviceMileage', input.serviceMileage)
          .execute();

        return maintenance.id;
      },
    );

    return this.getOne(vehicleId, maintenanceId);
  }

  async update(
    userId: string,
    role: UserVehicleRole,
    vehicleId: string,
    maintenanceId: string,
    input: UpdateMaintenanceInput,
  ): Promise<MaintenanceView> {
    await this.repositories.maintenances.manager.transaction(async (manager) => {
      const maintenance = await this.findForWrite(
        manager,
        vehicleId,
        maintenanceId,
      );
      this.assertCanModify(maintenance, userId, role);

      if (input.workshopId && input.workshopId !== maintenance.workshopId) {
        const workshop = await manager.findOne(Workshop, {
          where: { id: input.workshopId, createdByUserId: userId },
        });

        if (!workshop) {
          throw new HttpError(404, 'Taller no encontrado');
        }
      }

      const patch: Partial<Maintenance> = {};

      if (input.serviceDate !== undefined) patch.serviceDate = input.serviceDate;
      if (input.serviceMileage !== undefined) {
        patch.serviceMileage = input.serviceMileage;
      }
      if (input.description !== undefined) patch.description = input.description;
      if (input.diagnosis !== undefined) patch.diagnosis = input.diagnosis;
      if (input.laborCost !== undefined) patch.laborCost = input.laborCost;
      if (input.workshopId !== undefined) patch.workshopId = input.workshopId;

      if (Object.keys(patch).length > 0) {
        await manager.update(
          Maintenance,
          { id: maintenanceId, vehicleId },
          patch,
        );
      }

      if (input.partIds !== undefined) {
        // El conjunto se reemplaza: lo quitado vuelve a quedar sin asignar.
        await manager.update(
          Part,
          { maintenanceId },
          { maintenanceId: null },
        );

        if (input.partIds.length > 0) {
          const result = await manager
            .createQueryBuilder()
            .update(Part)
            .set({ maintenanceId })
            .where('id IN (:...partIds)', { partIds: input.partIds })
            .andWhere('vehicle_id = :vehicleId', { vehicleId })
            .andWhere('maintenance_id IS NULL')
            .execute();

          if ((result.affected ?? 0) !== input.partIds.length) {
            throw new HttpError(
              400,
              'Alguno de los repuestos no existe, no pertenece a este vehículo o ya está asignado a otra mantención',
            );
          }
        }
      }

      if (input.serviceMileage !== undefined) {
        await manager
          .createQueryBuilder()
          .update(Vehicle)
          .set({
            currentMileage: () => 'GREATEST("current_mileage", :serviceMileage)',
          })
          .where('id = :vehicleId', { vehicleId })
          .setParameter('serviceMileage', input.serviceMileage)
          .execute();
      }
    });

    return this.getOne(vehicleId, maintenanceId);
  }

  async remove(
    userId: string,
    role: UserVehicleRole,
    vehicleId: string,
    maintenanceId: string,
  ): Promise<void> {
    await this.repositories.maintenances.manager.transaction(async (manager) => {
      const maintenance = await this.findForWrite(
        manager,
        vehicleId,
        maintenanceId,
      );
      this.assertCanModify(maintenance, userId, role);

      // La FK de repuestos usa ON DELETE SET NULL: quedan sin asignar.
      await manager.delete(Maintenance, { id: maintenanceId, vehicleId });
    });
  }

  private async findForWrite(
    manager: EntityManager,
    vehicleId: string,
    maintenanceId: string,
  ): Promise<Maintenance> {
    if (!uuidSchema.safeParse(maintenanceId).success) {
      throw new HttpError(404, 'Mantención no encontrada.');
    }

    const maintenance = await manager.findOne(Maintenance, {
      where: { id: maintenanceId, vehicleId },
    });

    if (!maintenance) {
      throw new HttpError(404, 'Mantención no encontrada.');
    }

    return maintenance;
  }

  private assertCanModify(
    maintenance: Maintenance,
    userId: string,
    role: UserVehicleRole,
  ): void {
    if (role === UserVehicleRole.OWNER) {
      return;
    }

    if (maintenance.registeredByUserId === userId) {
      return;
    }

    throw new HttpError(403, 'No tienes permiso para esta acción.');
  }

  async list(
    vehicleId: string,
    query: ListMaintenancesQuery,
  ): Promise<MaintenanceList> {
    const [rows, total] = await this.repositories.maintenances.findAndCount({
      where: { vehicleId },
      order: { serviceDate: 'DESC', createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    const [items, totals] = await Promise.all([
      this.toViews(rows),
      this.getTotals(vehicleId),
    ]);

    return { items, total, ...totals };
  }

  async getOne(
    vehicleId: string,
    maintenanceId: string,
  ): Promise<MaintenanceView> {
    if (!uuidSchema.safeParse(maintenanceId).success) {
      throw new HttpError(404, 'Mantención no encontrada.');
    }

    const maintenance = await this.repositories.maintenances.findOne({
      where: { id: maintenanceId, vehicleId },
    });

    if (!maintenance) {
      throw new HttpError(404, 'Mantención no encontrada.');
    }

    const [view] = await this.toViews([maintenance]);
    return view;
  }

  /** Mano de obra y repuestos de todo el vehículo, no solo de la página. */
  private async getTotals(
    vehicleId: string,
  ): Promise<{ laborTotal: number; partsTotal: number; grandTotal: number }> {
    const [laborRow, partsRow] = await Promise.all([
      this.repositories.maintenances
        .createQueryBuilder('maintenance')
        .select('COALESCE(SUM(maintenance.labor_cost), 0)', 'laborTotal')
        .where('maintenance.vehicle_id = :vehicleId', { vehicleId })
        .getRawOne<{ laborTotal: string }>(),
      this.repositories.parts
        .createQueryBuilder('part')
        .select(`COALESCE(SUM(${partCostSql(this.repositories.parts)}), 0)`, 'partsTotal')
        .where('part.vehicle_id = :vehicleId', { vehicleId })
        .getRawOne<{ partsTotal: string }>(),
    ]);

    const laborTotal = Number(laborRow?.laborTotal ?? 0);
    const partsTotal = Number(partsRow?.partsTotal ?? 0);

    return { laborTotal, partsTotal, grandTotal: laborTotal + partsTotal };
  }

  /** Carga repuestos, talleres y usuarios de toda la página en 3 consultas. */
  private async toViews(rows: Maintenance[]): Promise<MaintenanceView[]> {
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    const workshopIds = [
      ...new Set(
        rows
          .map((row) => row.workshopId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const userIds = [
      ...new Set(
        rows
          .map((row) => row.registeredByUserId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [parts, workshops, users] = await Promise.all([
      this.repositories.parts.find({
        where: { maintenanceId: In(ids) },
        order: { createdAt: 'ASC' },
      }),
      workshopIds.length > 0
        ? this.repositories.workshops.findBy({ id: In(workshopIds) })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.repositories.users.findBy({ id: In(userIds) })
        : Promise.resolve([]),
    ]);

    const partsByMaintenance = new Map<string, Part[]>();
    for (const part of parts) {
      if (part.maintenanceId) {
        const list = partsByMaintenance.get(part.maintenanceId) ?? [];
        list.push(part);
        partsByMaintenance.set(part.maintenanceId, list);
      }
    }

    const workshopById = new Map(workshops.map((workshop) => [workshop.id, workshop]));
    const userById = new Map(users.map((user) => [user.id, user]));

    return rows.map((row) => {
      const maintenanceParts = (partsByMaintenance.get(row.id) ?? []).map(
        (part) => ({
          id: part.id,
          name: part.name,
          category: part.category,
          cost: part.cost,
          purchaseDate: part.purchaseDate,
          totalCost: partTotalCost(part),
        }),
      );
      const partsTotal = maintenanceParts.reduce(
        (total, part) => total + part.totalCost,
        0,
      );
      const workshop = row.workshopId
        ? workshopById.get(row.workshopId)
        : undefined;
      const registeredBy = row.registeredByUserId
        ? userById.get(row.registeredByUserId)
        : undefined;

      return {
        id: row.id,
        vehicleId: row.vehicleId,
        serviceDate: row.serviceDate,
        serviceMileage: row.serviceMileage,
        description: row.description,
        diagnosis: row.diagnosis,
        laborCost: row.laborCost,
        workshop: workshop ? { id: workshop.id, name: workshop.name } : null,
        registeredBy: registeredBy
          ? { id: registeredBy.id, name: registeredBy.name }
          : null,
        parts: maintenanceParts,
        partsTotal,
        totalCost: row.laborCost + partsTotal,
        createdAt: row.createdAt,
      };
    });
  }
}
