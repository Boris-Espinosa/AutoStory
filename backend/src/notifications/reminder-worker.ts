import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Not,
} from 'typeorm';
import { Clock, systemClock } from '../common/clock';
import { env } from '../config/env';
import { Appointment, AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Notification, NotificationType } from '../entities/Notification';
import { Vehicle } from '../entities/Vehicle';
import {
  appointmentNotificationBody,
  appointmentNotificationTitle,
} from './messages';
import { createNotifications, recipientsFor } from './notify';

const BATCH_SIZE = 100;
const MAX_CONSECUTIVE_FAILURES = 5;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 90 * 86_400_000;
const PROCESSED_REMINDER_RETENTION_MS = 30 * 86_400_000;

/** Fallos seguidos por recordatorio; solo vive en esta instancia. */
const consecutiveFailures = new Map<string, number>();

export interface ReminderWorkerHooks {
  /** Solo para tests: permite simular un fallo al procesar un recordatorio. */
  beforeProcess?(reminderId: string): void;
}

async function processReminder(
  manager: EntityManager,
  reminder: AppointmentReminder,
  now: Date,
): Promise<void> {
  const appointment = await manager.findOne(Appointment, {
    where: { id: reminder.appointmentId },
    relations: { vehicle: true, workshop: true },
  });
  const vehicle: Vehicle | null = appointment?.vehicle ?? null;

  if (
    appointment === null ||
    vehicle === null ||
    appointment.status !== AppointmentStatus.SCHEDULED ||
    appointment.scheduledAt.getTime() <= now.getTime()
  ) {
    // La cita ya no existe, se cerró o ya comenzó: no se notifica.
    await manager.update(
      AppointmentReminder,
      { id: reminder.id },
      { processedAt: now },
    );
    return;
  }

  const recipients = await recipientsFor(
    manager,
    appointment.vehicleId,
    appointment.createdByUserId,
  );

  await createNotifications(
    manager,
    recipients.map((userId) => ({
      userId,
      type: NotificationType.APPOINTMENT_REMINDER,
      title: appointmentNotificationTitle('reminder'),
      body: appointmentNotificationBody(
        {
          scheduledAt: appointment.scheduledAt,
          timezone: appointment.timezone,
          reason: appointment.reason,
          vehicle,
          workshop: appointment.workshop?.name ?? null,        },
        now,
      ),
      vehicleId: appointment.vehicleId,
      appointmentId: appointment.id,
      reminderId: reminder.id,
    })),
    { ignoreConflicts: true },
  );

  await manager.update(
    AppointmentReminder,
    { id: reminder.id },
    { processedAt: now },
  );
}

async function registerFailure(
  manager: EntityManager,
  reminderId: string,
  now: Date,
  error: unknown,
): Promise<void> {
  const attempt = (consecutiveFailures.get(reminderId) ?? 0) + 1;

  // Solo el id y el intento: sin usuario, vehículo ni datos de la cita.
  console.error('Fallo al procesar un recordatorio.', {
    reminderId,
    attempt,
    error: error instanceof Error ? error.name : 'Error',
  });

  if (attempt < MAX_CONSECUTIVE_FAILURES) {
    consecutiveFailures.set(reminderId, attempt);
    return;
  }

  consecutiveFailures.delete(reminderId);

  try {
    await manager.update(
      AppointmentReminder,
      { id: reminderId },
      { processedAt: now },
    );
    console.warn('El recordatorio se descartó tras 5 fallos seguidos.', {
      reminderId,
    });
  } catch {
    // Si tampoco se puede marcar, se reintenta en el siguiente ciclo.
  }
}

/**
 * Procesa los recordatorios vencidos por lotes hasta agotarlos. Cada lote se
 * toma con FOR UPDATE SKIP LOCKED para que varias instancias no se pisen.
 */
export async function processDueReminders(
  dataSource: DataSource,
  clock: Clock = systemClock,
  now: Date = clock.now(),
  hooks: ReminderWorkerHooks = {},
): Promise<number> {
  const failedThisRun = new Set<string>();
  let processed = 0;

  for (;;) {
    const batchSize = await dataSource.transaction(async (manager) => {
      const where: FindOptionsWhere<AppointmentReminder> = {
        processedAt: IsNull(),
        remindAt: LessThanOrEqual(now),
      };

      if (failedThisRun.size > 0) {
        where.id = Not(In([...failedThisRun]));
      }

      const due = await manager.find(AppointmentReminder, {
        where,
        order: { remindAt: 'ASC' },
        take: BATCH_SIZE,
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });

      for (const reminder of due) {
        try {
          hooks.beforeProcess?.(reminder.id);
          // Un savepoint por recordatorio: un fallo no arrastra a los demás.
          await manager.transaction((inner) =>
            processReminder(inner, reminder, now),
          );
          consecutiveFailures.delete(reminder.id);
          processed += 1;
        } catch (error) {
          failedThisRun.add(reminder.id);
          await registerFailure(manager, reminder.id, now, error);
        }
      }

      return due.length;
    });

    if (batchSize < BATCH_SIZE) {
      break;
    }
  }

  return processed;
}

export interface CleanupResult {
  notifications: number;
  reminders: number;
}

/** Borra notificaciones de más de 90 días y recordatorios procesados de más de 30. */
export async function cleanupExpiredData(
  dataSource: DataSource,
  now: Date,
): Promise<CleanupResult> {
  const notifications = await dataSource.getRepository(Notification).delete({
    createdAt: LessThan(new Date(now.getTime() - NOTIFICATION_RETENTION_MS)),
  });
  const reminders = await dataSource
    .getRepository(AppointmentReminder)
    .delete({
      processedAt: LessThan(
        new Date(now.getTime() - PROCESSED_REMINDER_RETENTION_MS),
      ),
    });

  return {
    notifications: notifications.affected ?? 0,
    reminders: reminders.affected ?? 0,
  };
}

/**
 * Bucle del trabajador con setTimeout encadenado para que los ciclos no se
 * solapen. Devuelve la función que lo detiene.
 */
export function startReminderWorker(
  dataSource: DataSource,
  clock: Clock = systemClock,
): () => void {
  if (!env.reminderWorker.enabled) {
    return () => {};
  }

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let lastCleanupAt: number | null = null;

  const scheduleNext = (): void => {
    if (stopped) {
      return;
    }

    timer = setTimeout(runCycle, env.reminderWorker.intervalSeconds * 1000);
  };

  const runCycle = async (): Promise<void> => {
    try {
      const now = clock.now();
      await processDueReminders(dataSource, clock, now);

      if (
        lastCleanupAt === null ||
        now.getTime() - lastCleanupAt >= CLEANUP_INTERVAL_MS
      ) {
        await cleanupExpiredData(dataSource, now);
        lastCleanupAt = now.getTime();
      }
    } catch (error) {
      console.error(
        'El trabajador de recordatorios falló en este ciclo.',
        error instanceof Error ? error.name : 'Error',
      );
    } finally {
      scheduleNext();
    }
  };

  void runCycle();

  return () => {
    stopped = true;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
