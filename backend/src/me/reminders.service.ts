import { In, Repository } from 'typeorm';
import { Clock } from '../common/clock';
import { AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import {
  appointmentNotificationBody,
  appointmentNotificationTitle,
} from '../notifications/messages';

export interface PendingReminderView {
  reminderId: string;
  appointmentId: string;
  remindAt: string;
  title: string;
  body: string;
}

export interface RemindersServiceDeps {
  reminders: Repository<AppointmentReminder>;
  vehicles: Repository<Vehicle>;
  workshops: Repository<Workshop>;
  clock: Clock;
}

/**
 * Recordatorios pendientes para los avisos locales del teléfono: mismos
 * destinatarios (recipientsFor) y mismos textos que las notificaciones del
 * servidor.
 */
export class RemindersService {
  constructor(private readonly deps: RemindersServiceDeps) {}

  async listPending(
    userId: string,
    limit: number,
  ): Promise<PendingReminderView[]> {
    const now = this.deps.clock.now();

    const rows = await this.deps.reminders
      .createQueryBuilder('reminder')
      .innerJoinAndSelect('reminder.appointment', 'appointment')
      .where('reminder.processed_at IS NULL')
      .andWhere('reminder.remind_at > :now', { now })
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.SCHEDULED,
      })
      // Los paréntesis externos son obligatorios: TypeORM no agrupa cada
      // condición al unirlas con AND y el OR rompería la precedencia.
      .andWhere(
        `(EXISTS (
            SELECT 1 FROM user_vehicles recipient_owner
            WHERE recipient_owner.vehicle_id = appointment.vehicle_id
              AND recipient_owner.user_id = :userId
              AND recipient_owner.role = 'OWNER'
          )
          OR (
            appointment.created_by_user_id = :userId
            AND EXISTS (
              SELECT 1 FROM user_vehicles recipient_member
              WHERE recipient_member.vehicle_id = appointment.vehicle_id
                AND recipient_member.user_id = :userId
            )
          ))`,
        { userId },
      )
      .orderBy('reminder.remind_at', 'ASC')
      .addOrderBy('reminder.id', 'ASC')
      // many-to-one sin duplicar filas: limit directo en vez de take.
      .limit(limit)
      .getMany();

    if (rows.length === 0) {
      return [];
    }

    const vehicleIds = [...new Set(rows.map((row) => row.appointment.vehicleId))];
    const workshopIds = [
      ...new Set(
        rows
          .map((row) => row.appointment.workshopId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [vehicles, workshops] = await Promise.all([
      this.deps.vehicles.findBy({ id: In(vehicleIds) }),
      workshopIds.length > 0
        ? this.deps.workshops.findBy({ id: In(workshopIds) })
        : Promise.resolve([]),
    ]);

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const workshopById = new Map(
      workshops.map((workshop) => [workshop.id, workshop]),
    );

    return rows.map((row) => {
      const appointment = row.appointment;
      const vehicle = vehicleById.get(appointment.vehicleId);
      const workshop = appointment.workshopId
        ? workshopById.get(appointment.workshopId)
        : undefined;

      return {
        reminderId: row.id,
        appointmentId: row.appointmentId,
        remindAt: row.remindAt.toISOString(),
        title: appointmentNotificationTitle('reminder'),
        body: appointmentNotificationBody(
          {
            scheduledAt: appointment.scheduledAt,
            timezone: appointment.timezone,
            reason: appointment.reason,
            vehicle: {
              brand: vehicle?.brand ?? '',
              model: vehicle?.model ?? '',
              licensePlate: vehicle?.licensePlate ?? '',
            },
            workshop: workshop?.name ?? null,
          },
          now,
        ),
      };
    });
  }
}
