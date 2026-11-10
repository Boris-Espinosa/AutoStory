import { EntityManager } from 'typeorm';
import { Notification, NotificationType } from '../entities/Notification';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  vehicleId?: string | null;
  appointmentId?: string | null;
  reminderId?: string | null;
}

export interface CreateNotificationsOptions {
  /** El trabajador de recordatorios ignora los duplicados de (usuario, recordatorio). */
  ignoreConflicts?: boolean;
}

/** Inserta las notificaciones dentro de la transacción que las origina. */
export async function createNotifications(
  manager: EntityManager,
  notifications: NotificationInput[],
  options: CreateNotificationsOptions = {},
): Promise<void> {
  if (notifications.length === 0) {
    return;
  }

  const insert = manager
    .createQueryBuilder()
    .insert()
    .into(Notification)
    .values(notifications);

  if (options.ignoreConflicts) {
    await insert.orIgnore().execute();
    return;
  }

  await insert.execute();
}

/**
 * Destinatarios de los avisos de una cita: el dueño actual del vehículo y
 * quien la programó si sigue siendo miembro, sin duplicados.
 */
export async function recipientsFor(
  manager: EntityManager,
  vehicleId: string,
  createdByUserId: string | null,
): Promise<string[]> {
  const members = await manager.find(UserVehicle, { where: { vehicleId } });
  const recipients = new Set<string>();
  const owner = members.find(
    (member) => member.role === UserVehicleRole.OWNER,
  );

  if (owner) {
    recipients.add(owner.userId);
  }

  if (
    createdByUserId &&
    members.some((member) => member.userId === createdByUserId)
  ) {
    recipients.add(createdByUserId);
  }

  return [...recipients];
}
