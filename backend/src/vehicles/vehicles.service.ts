import { Repository } from 'typeorm';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { HttpError } from '../common/http-error';
import { CreateVehicleInput } from './vehicle.schema';

export interface VehiclesRepositories {
  userVehicles: Repository<UserVehicle>;
  vehicles: Repository<Vehicle>;
}

export type VehicleWithRole = Vehicle & { role: UserVehicleRole };

export class VehiclesService {
  constructor(private readonly repositories: VehiclesRepositories) {}

  async listByUser(userId: string): Promise<VehicleWithRole[]> {
    const memberships = await this.repositories.userVehicles
      .createQueryBuilder('membership')
      .innerJoinAndSelect('membership.vehicle', 'vehicle')
      .where('membership.userId = :userId', { userId })
      .orderBy('membership.assignedAt', 'DESC')
      .getMany();

    return memberships.map(({ vehicle, role }) => ({ ...vehicle, role }));
  }

  async create(
    userId: string,
    input: CreateVehicleInput,
  ): Promise<VehicleWithRole> {
    return this.repositories.userVehicles.manager.transaction(
      async (manager) => {
        // Serializa las altas del mismo usuario para que dos solicitudes
        // simultáneas no pasen ambas la comprobación de duplicado.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [userId],
        );

        // Solo los vehículos propios: el de otro usuario no se detecta.
        const duplicates: unknown[] = await manager.query(
          `SELECT 1
             FROM "user_vehicles" membership
             JOIN "vehicles" vehicle ON vehicle.id = membership.vehicle_id
            WHERE membership.user_id = $1
              AND membership.role = 'OWNER'
              AND (
                vehicle.license_plate = $2
                OR ($3::text IS NOT NULL AND vehicle.vin = $3)
              )
            LIMIT 1`,
          [userId, input.licensePlate, input.vin],
        );

        if (duplicates.length > 0) {
          throw new HttpError(409, 'Ya tienes este vehículo registrado');
        }

        const vehicle = manager.create(Vehicle, {
          vin: input.vin,
          licensePlate: input.licensePlate,
          brand: input.brand,
          model: input.model,
          year: input.year,
          currentMileage: input.currentMileage,
          photoUrl: input.photoUrl ?? null,
        });
        await manager.save(vehicle);

        await manager.save(
          manager.create(UserVehicle, {
            userId,
            vehicleId: vehicle.id,
            role: UserVehicleRole.OWNER,
          }),
        );

        return { ...vehicle, role: UserVehicleRole.OWNER };
      },
    );
  }

  /**
   * Actualiza los datos editables. El kilometraje solo puede subir y los
   * duplicados se buscan solo entre los vehículos propios del usuario.
   */
  async update(
    userId: string,
    vehicleId: string,
    input: CreateVehicleInput,
  ): Promise<Vehicle> {
    return this.repositories.vehicles.manager.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [userId],
      );

      const vehicle = await manager.findOneBy(Vehicle, { id: vehicleId });

      if (!vehicle) {
        throw new HttpError(404, 'Vehículo no encontrado.');
      }

      if (input.currentMileage < vehicle.currentMileage) {
        throw new HttpError(
          400,
          'El kilometraje no puede ser menor al actual.',
        );
      }

      const duplicates: unknown[] = await manager.query(
        `SELECT 1
           FROM "user_vehicles" membership
           JOIN "vehicles" vehicle ON vehicle.id = membership.vehicle_id
          WHERE membership.user_id = $1
            AND membership.role = 'OWNER'
            AND vehicle.id <> $2
            AND (
              vehicle.license_plate = $3
              OR ($4::text IS NOT NULL AND vehicle.vin = $4)
            )
          LIMIT 1`,
        [userId, vehicleId, input.licensePlate, input.vin],
      );

      if (duplicates.length > 0) {
        throw new HttpError(409, 'Ya tienes este vehículo registrado');
      }

      vehicle.vin = input.vin;
      vehicle.licensePlate = input.licensePlate;
      vehicle.brand = input.brand;
      vehicle.model = input.model;
      vehicle.year = input.year;
      vehicle.currentMileage = input.currentMileage;

      await manager.save(vehicle);

      return vehicle;
    });
  }

  /**
   * Borra el vehículo y devuelve su foto para eliminarla después del commit.
   * La base borra en cascada membresías, repuestos, mantenciones y solicitudes.
   */
  async remove(vehicleId: string): Promise<string | null> {
    return this.repositories.vehicles.manager.transaction(async (manager) => {
      const vehicle = await manager.findOneBy(Vehicle, { id: vehicleId });

      if (!vehicle) {
        throw new HttpError(404, 'Vehículo no encontrado.');
      }

      await manager.delete(Vehicle, { id: vehicleId });

      return vehicle.photoUrl;
    });
  }

  /** Guarda la nueva foto y devuelve la ruta anterior, si existía. */
  async setPhoto(
    vehicleId: string,
    photoUrl: string | null,
  ): Promise<string | null> {
    const vehicle = await this.repositories.vehicles.findOneBy({
      id: vehicleId,
    });

    if (!vehicle) {
      throw new HttpError(404, 'Vehículo no encontrado.');
    }

    const previous = vehicle.photoUrl;
    vehicle.photoUrl = photoUrl;
    await this.repositories.vehicles.save(vehicle);

    return previous;
  }
}
