import { z } from 'zod';
import { Repository } from 'typeorm';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { HttpError } from '../common/http-error';

const vehicleIdSchema = z.string().uuid();

export class VehicleAccessService {
  constructor(private readonly userVehicles: Repository<UserVehicle>) {}

  async getMembership(
    userId: string,
    vehicleId: string,
  ): Promise<UserVehicle | null> {
    if (!vehicleIdSchema.safeParse(vehicleId).success) {
      throw new HttpError(404, 'Vehículo no encontrado.');
    }

    return this.userVehicles.findOne({ where: { userId, vehicleId } });
  }

  async assertMember(userId: string, vehicleId: string): Promise<UserVehicle> {
    const membership = await this.getMembership(userId, vehicleId);

    if (!membership) {
      throw new HttpError(404, 'Vehículo no encontrado.');
    }

    return membership;
  }

  async assertOwner(userId: string, vehicleId: string): Promise<UserVehicle> {
    const membership = await this.assertMember(userId, vehicleId);

    if (membership.role !== UserVehicleRole.OWNER) {
      throw new HttpError(403, 'No tienes permiso para esta acción.');
    }

    return membership;
  }
}
