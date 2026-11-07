import { Repository } from 'typeorm';
import { Workshop } from '../entities/Workshop';
import { HttpError } from '../common/http-error';
import { CreateWorkshopInput } from './workshop.schema';

const DUPLICATE_NAME_MESSAGE = 'Ya tienes un taller con ese nombre';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'driverError' in error &&
    (error as { driverError?: { code?: string } }).driverError?.code === '23505'
  );
}

export class WorkshopService {
  constructor(private readonly workshops: Repository<Workshop>) {}

  listByUser(userId: string): Promise<Workshop[]> {
    return this.workshops.find({
      where: { createdByUserId: userId },
      order: { name: 'ASC' },
    });
  }

  async create(userId: string, input: CreateWorkshopInput): Promise<Workshop> {
    const existing = await this.workshops
      .createQueryBuilder('workshop')
      .where('workshop.created_by_user_id = :userId', { userId })
      .andWhere('lower(workshop.name) = lower(:name)', { name: input.name })
      .getOne();

    if (existing) {
      throw new HttpError(409, DUPLICATE_NAME_MESSAGE);
    }

    try {
      return await this.workshops.save(
        this.workshops.create({ ...input, createdByUserId: userId }),
      );
    } catch (error) {
      // Dos altas simultáneas pueden chocar en el índice único de la base.
      if (isUniqueViolation(error)) {
        throw new HttpError(409, DUPLICATE_NAME_MESSAGE);
      }

      throw error;
    }
  }
}
