import { EntityManager, In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { HttpError } from '../common/http-error';
import { Appointment, AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Maintenance } from '../entities/Maintenance';
import { NotificationType } from '../entities/Notification';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import {
  appointmentNotificationBody,
  appointmentNotificationTitle,
} from '../notifications/messages';
import { createNotifications, NotificationInput, recipientsFor } from '../notifications/notify';
import { VehicleAccessService } from '../vehicles/vehicle-access.service';
import {
  CreateAppointmentInput,
  DEFAULT_REMINDERS,
  ListAppointmentsQuery,
  ListUserAppointmentsQuery,
  UpdateAppointmentInput,
} from './appointment.schema';

export interface AppointmentRepositories {
  appointments: Repository<Appointment>;
  reminders: Repository<AppointmentReminder>;
  maintenances: Repository<Maintenance>;
  vehicles: Repository<Vehicle>;
  workshops: Repository<Workshop>;
  users: Repository<User>;
  userVehicles: Repository<UserVehicle>;
}

export interface AppointmentServiceDeps extends AppointmentRepositories {
  access: VehicleAccessService;
  clock: Clock;
}

export interface AppointmentReminderView {
  offsetMinutes: number;
  remindAt: string;
  processed: boolean;
}

export interface AppointmentView {
  id: string;
  vehicle: {
    id: string;
    licensePlate: string;
    brand: string;
    model: string;
    year: number;
  };
  workshop: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  createdBy: { id: string; name: string | null } | null;
  scheduledAt: string;
  timezone: string;
  reason: string;
  notes: string | null;
  status: AppointmentStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  maintenanceId: string | null;
  reminders: AppointmentReminderView[];
  canEdit: boolean;
}

export interface AppointmentWithSkipped extends AppointmentView {
  skippedReminders: number[];
}

export interface AppointmentList {
  items: AppointmentView[];
  total: number;
}

const uuidSchema = z.string().uuid();
const MINUTE_MS = 60_000;

export class AppointmentService {
  constructor(private readonly deps: AppointmentServiceDeps) {}

  async create(
    userId: string,
    vehicleId: string,
    input: CreateAppointmentInput,
  ): Promise<AppointmentWithSkipped> {
    await this.deps.access.assertMember(userId, vehicleId);

    const now = this.deps.clock.now();
    const offsets = input.reminders ?? DEFAULT_REMINDERS;
    const skipped = this.remindTimes(input.scheduledAt, offsets, now)
      .filter((reminder) => reminder.skipped)
      .map((reminder) => reminder.offsetMinutes);

    const appointmentId = await this.deps.appointments.manager.transaction(
      async (manager) => {
        if (input.workshopId) {
          const workshop = await manager.findOne(Workshop, {
            where: { id: input.workshopId, createdByUserId: userId },
          });

          if (!workshop) {
            throw new HttpError(404, 'Taller no encontrado');
          }
        }

        const vehicle = await manager.findOne(Vehicle, {
          where: { id: vehicleId },
        });

        if (!vehicle) {
          throw new HttpError(404, 'Vehículo no encontrado.');
        }

        const appointment = manager.create(Appointment, {
          vehicleId,
          workshopId: input.workshopId,
          createdByUserId: userId,
          scheduledAt: input.scheduledAt,
          timezone: input.timezone,
          reason: input.reason,
          notes: input.notes,
          status: AppointmentStatus.SCHEDULED,
        });
        await manager.save(appointment);

        await this.insertReminders(
          manager,
          appointment.id,
          input.scheduledAt,
          offsets,
          now,
        );

        const recipients = (
          await recipientsFor(manager, vehicleId, userId)
        ).filter((recipientId) => recipientId !== userId);

        await createNotifications(
          manager,
          recipients.map((recipientId) =>
            this.notification(
              recipientId,
              NotificationType.APPOINTMENT_CREATED,
              'created',
              {
                scheduledAt: input.scheduledAt,
                timezone: input.timezone,
                reason: input.reason,
                vehicle,
              },
              now,
              vehicleId,
              appointment.id,
            ),
          ),
        );

        return appointment.id;
      },
    );

    return {
      ...(await this.getOne(userId, appointmentId)),
      skippedReminders: skipped,
    };
  }

  async update(
    userId: string,
    appointmentId: string,
    input: UpdateAppointmentInput,
  ): Promise<AppointmentWithSkipped> {
    const current = await this.findAccessible(userId, appointmentId);
    const now = this.deps.clock.now();

    const skipped = await this.deps.appointments.manager.transaction(
      async (manager) => {
        const appointment = await manager.findOne(Appointment, {
          where: { id: appointmentId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!appointment) {
          throw new HttpError(404, 'Cita no encontrada.');
        }

        if (appointment.status !== AppointmentStatus.SCHEDULED) {
          throw new HttpError(409, 'La cita ya está cerrada');
        }

        const membership = await this.deps.access.assertMember(
          userId,
          appointment.vehicleId,
        );
        this.assertCanModify(appointment, userId, membership.role);

        if (
          input.workshopId &&
          input.workshopId !== appointment.workshopId
        ) {
          const workshop = await manager.findOne(Workshop, {
            where: { id: input.workshopId, createdByUserId: userId },
          });

          if (!workshop) {
            throw new HttpError(404, 'Taller no encontrado');
          }
        }

        const scheduledAt = input.scheduledAt ?? appointment.scheduledAt;
        const scheduledChanged =
          input.scheduledAt !== undefined &&
          input.scheduledAt.getTime() !== appointment.scheduledAt.getTime();

        let skippedReminders: number[] = [];

        if (scheduledChanged || input.reminders !== undefined) {
          const existing = await manager.find(AppointmentReminder, {
            where: { appointmentId },
          });
          const offsets =
            input.reminders ??
            existing.map((reminder) => reminder.offsetMinutes);

          skippedReminders = scheduledChanged
            ? await this.recalculateReminders(
                manager,
                appointmentId,
                scheduledAt,
                offsets,
                now,
              )
            : await this.replaceRemindersPreservingProcessed(
                manager,
                appointmentId,
                existing,
                offsets,
                scheduledAt,
                now,
              );
        }

        const patch: Partial<Appointment> = {};

        if (input.scheduledAt !== undefined) {
          patch.scheduledAt = input.scheduledAt;
        }
        if (input.timezone !== undefined) {
          patch.timezone = input.timezone;
        }
        if (input.workshopId !== undefined) {
          patch.workshopId = input.workshopId;
        }
        if (input.reason !== undefined) {
          patch.reason = input.reason;
        }
        if (input.notes !== undefined) {
          patch.notes = input.notes;
        }

        if (Object.keys(patch).length > 0) {
          await manager.update(Appointment, { id: appointmentId }, patch);
        }

        if (scheduledChanged) {
          const vehicle = await manager.findOne(Vehicle, {
            where: { id: appointment.vehicleId },
          });

          if (vehicle) {
            await this.notifyOthers(
              manager,
              appointment,
              userId,
              NotificationType.APPOINTMENT_RESCHEDULED,
              'rescheduled',
              {
                scheduledAt,
                timezone: input.timezone ?? appointment.timezone,
                reason: input.reason ?? appointment.reason,
                vehicle,
              },
              now,
            );
          }
        }

        return skippedReminders;
      },
    );

    return {
      ...(await this.getOne(userId, current.id)),
      skippedReminders: skipped,
    };
  }

  async cancel(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentView> {
    await this.close(userId, appointmentId, AppointmentStatus.CANCELLED);
    return this.getOne(userId, appointmentId);
  }

  async complete(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentView> {
    await this.close(userId, appointmentId, AppointmentStatus.COMPLETED);
    return this.getOne(userId, appointmentId);
  }

  async getOne(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentView> {
    const appointment = await this.findAccessible(userId, appointmentId);
    const [view] = await this.toViews([appointment], userId);
    return view;
  }

  async listForVehicle(
    userId: string,
    vehicleId: string,
    query: ListAppointmentsQuery,
  ): Promise<AppointmentList> {
    const builder = this.deps.appointments
      .createQueryBuilder('appointment')
      .where('appointment.vehicle_id = :vehicleId', { vehicleId });

    return this.list(builder, userId, query);
  }

  async listForUser(
    userId: string,
    query: ListUserAppointmentsQuery,
  ): Promise<AppointmentList> {
    const builder = this.deps.appointments
      .createQueryBuilder('appointment')
      .innerJoin(
        UserVehicle,
        'membership',
        'membership.vehicle_id = appointment.vehicle_id AND membership.user_id = :userId',
        { userId },
      );

    if (query.vehicleId) {
      builder.andWhere('appointment.vehicle_id = :vehicleId', {
        vehicleId: query.vehicleId,
      });
    }

    return this.list(builder, userId, query);
  }

  private async list(
    builder: SelectQueryBuilder<Appointment>,
    userId: string,
    query: ListAppointmentsQuery,
  ): Promise<AppointmentList> {
    const now = this.deps.clock.now();

    if (query.scope === 'history') {
      builder
        .andWhere('appointment.status IN (:...statuses)', {
          statuses: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
        })
        .orderBy('appointment.scheduled_at', 'DESC')
        .addOrderBy('appointment.created_at', 'DESC');
    } else {
      builder
        .andWhere('appointment.status = :status', {
          status: AppointmentStatus.SCHEDULED,
        })
        .andWhere(
          query.scope === 'upcoming'
            ? 'appointment.scheduled_at >= :now'
            : 'appointment.scheduled_at < :now',
          { now },
        )
        .orderBy('appointment.scheduled_at', 'ASC')
        .addOrderBy('appointment.created_at', 'ASC');
    }

    const [rows, total] = await builder
      .offset(query.offset)
      .limit(query.limit)
      .getManyAndCount();

    return { items: await this.toViews(rows, userId), total };
  }

  private async close(
    userId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<void> {
    await this.findAccessible(userId, appointmentId);
    const now = this.deps.clock.now();

    await this.deps.appointments.manager.transaction(async (manager) => {
      const appointment = await manager.findOne(Appointment, {
        where: { id: appointmentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!appointment) {
        throw new HttpError(404, 'Cita no encontrada.');
      }

      if (appointment.status !== AppointmentStatus.SCHEDULED) {
        throw new HttpError(409, 'La cita ya está cerrada');
      }

      const membership = await this.deps.access.assertMember(
        userId,
        appointment.vehicleId,
      );
      this.assertCanModify(appointment, userId, membership.role);

      await manager.update(
        Appointment,
        { id: appointmentId },
        status === AppointmentStatus.CANCELLED
          ? { status, cancelledAt: now }
          : { status, completedAt: now },
      );

      await manager.delete(AppointmentReminder, {
        appointmentId,
        processedAt: IsNull(),
      });

      if (status === AppointmentStatus.CANCELLED) {
        const vehicle = await manager.findOne(Vehicle, {
          where: { id: appointment.vehicleId },
        });

        if (vehicle) {
          await this.notifyOthers(
            manager,
            appointment,
            userId,
            NotificationType.APPOINTMENT_CANCELLED,
            'cancelled',
            {
              scheduledAt: appointment.scheduledAt,
              timezone: appointment.timezone,
              reason: appointment.reason,
              vehicle,
            },
            now,
          );
        }
      }
    });
  }

  private async findAccessible(
    userId: string,
    appointmentId: string,
  ): Promise<Appointment> {
    if (!uuidSchema.safeParse(appointmentId).success) {
      throw new HttpError(404, 'Cita no encontrada.');
    }

    const appointment = await this.deps.appointments.findOne({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new HttpError(404, 'Cita no encontrada.');
    }

    await this.deps.access.assertMember(userId, appointment.vehicleId);
    return appointment;
  }

  private assertCanModify(
    appointment: Appointment,
    userId: string,
    role: UserVehicleRole,
  ): void {
    if (role === UserVehicleRole.OWNER) {
      return;
    }

    if (appointment.createdByUserId === userId) {
      return;
    }

    throw new HttpError(403, 'No tienes permiso para esta acción');
  }

  private remindTimes(
    scheduledAt: Date,
    offsets: number[],
    now: Date,
  ): Array<{ offsetMinutes: number; remindAt: Date; skipped: boolean }> {
    return offsets.map((offsetMinutes) => {
      const remindAt = new Date(
        scheduledAt.getTime() - offsetMinutes * MINUTE_MS,
      );

      return {
        offsetMinutes,
        remindAt,
        skipped: remindAt.getTime() < now.getTime(),
      };
    });
  }

  private async insertReminders(
    manager: EntityManager,
    appointmentId: string,
    scheduledAt: Date,
    offsets: number[],
    now: Date,
  ): Promise<void> {
    const reminders = this.remindTimes(scheduledAt, offsets, now)
      .filter((reminder) => !reminder.skipped)
      .map((reminder) =>
        manager.create(AppointmentReminder, {
          appointmentId,
          offsetMinutes: reminder.offsetMinutes,
          remindAt: reminder.remindAt,
        }),
      );

    if (reminders.length > 0) {
      await manager.save(reminders);
    }
  }

  private async recalculateReminders(
    manager: EntityManager,
    appointmentId: string,
    scheduledAt: Date,
    offsets: number[],
    now: Date,
  ): Promise<number[]> {
    await manager.delete(AppointmentReminder, { appointmentId });
    await this.insertReminders(
      manager,
      appointmentId,
      scheduledAt,
      offsets,
      now,
    );

    return this.remindTimes(scheduledAt, offsets, now)
      .filter((reminder) => reminder.skipped)
      .map((reminder) => reminder.offsetMinutes);
  }

  private async replaceRemindersPreservingProcessed(
    manager: EntityManager,
    appointmentId: string,
    existing: AppointmentReminder[],
    offsets: number[],
    scheduledAt: Date,
    now: Date,
  ): Promise<number[]> {
    const keep = new Set(offsets);
    const remove = existing
      .filter((reminder) => !keep.has(reminder.offsetMinutes))
      .map((reminder) => reminder.id);

    if (remove.length > 0) {
      await manager.delete(AppointmentReminder, { id: In(remove) });
    }

    const existingOffsets = new Set(
      existing.map((reminder) => reminder.offsetMinutes),
    );
    const newOffsets = offsets.filter((offset) => !existingOffsets.has(offset));

    await this.insertReminders(
      manager,
      appointmentId,
      scheduledAt,
      newOffsets,
      now,
    );

    return this.remindTimes(scheduledAt, newOffsets, now)
      .filter((reminder) => reminder.skipped)
      .map((reminder) => reminder.offsetMinutes);
  }

  private async notifyOthers(
    manager: EntityManager,
    appointment: Appointment,
    actorId: string,
    type: NotificationType,
    kind: 'rescheduled' | 'cancelled',
    data: {
      scheduledAt: Date;
      timezone: string;
      reason: string;
      vehicle: Vehicle;
    },
    now: Date,
  ): Promise<void> {
    const recipients = (
      await recipientsFor(
        manager,
        appointment.vehicleId,
        appointment.createdByUserId,
      )
    ).filter((userId) => userId !== actorId);

    await createNotifications(
      manager,
      recipients.map((userId) =>
        this.notification(
          userId,
          type,
          kind,
          data,
          now,
          appointment.vehicleId,
          appointment.id,
        ),
      ),
    );
  }

  private notification(
    userId: string,
    type: NotificationType,
    kind: 'created' | 'rescheduled' | 'cancelled',
    data: {
      scheduledAt: Date;
      timezone: string;
      reason: string;
      vehicle: Vehicle;
    },
    now: Date,
    vehicleId: string,
    appointmentId: string,
  ): NotificationInput {
    return {
      userId,
      type,
      title: appointmentNotificationTitle(kind),
      body: appointmentNotificationBody(
        {
          scheduledAt: data.scheduledAt,
          timezone: data.timezone,
          reason: data.reason,
          vehicle: data.vehicle,
        },
        now,
      ),
      vehicleId,
      appointmentId,
    };
  }

  private async toViews(
    rows: Appointment[],
    userId: string,
  ): Promise<AppointmentView[]> {
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    const vehicleIds = [...new Set(rows.map((row) => row.vehicleId))];
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
          .map((row) => row.createdByUserId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [vehicles, workshops, users, reminders, maintenances, memberships] =
      await Promise.all([
        this.deps.vehicles.findBy({ id: In(vehicleIds) }),
        workshopIds.length > 0
          ? this.deps.workshops.findBy({ id: In(workshopIds) })
          : Promise.resolve([]),
        userIds.length > 0
          ? this.deps.users.findBy({ id: In(userIds) })
          : Promise.resolve([]),
        this.deps.reminders.find({
          where: { appointmentId: In(ids) },
          order: { offsetMinutes: 'DESC' },
        }),
        this.deps.maintenances.find({
          where: { appointmentId: In(ids) },
        }),
        this.deps.userVehicles.find({
          where: { userId, vehicleId: In(vehicleIds) },
        }),
      ]);

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const workshopById = new Map(
      workshops.map((workshop) => [workshop.id, workshop]),
    );
    const userById = new Map(users.map((user) => [user.id, user]));
    const roleByVehicle = new Map(
      memberships.map((membership) => [
        membership.vehicleId,
        membership.role,
      ]),
    );
    const remindersByAppointment = new Map<string, AppointmentReminder[]>();
    const maintenanceByAppointment = new Map<string, string>();

    for (const reminder of reminders) {
      const list = remindersByAppointment.get(reminder.appointmentId) ?? [];
      list.push(reminder);
      remindersByAppointment.set(reminder.appointmentId, list);
    }

    for (const maintenance of maintenances) {
      if (maintenance.appointmentId) {
        maintenanceByAppointment.set(maintenance.appointmentId, maintenance.id);
      }
    }

    return rows.map((row) => {
      const vehicle = vehicleById.get(row.vehicleId);
      const workshop = row.workshopId
        ? workshopById.get(row.workshopId)
        : undefined;
      const createdBy = row.createdByUserId
        ? userById.get(row.createdByUserId)
        : undefined;
      const editable =
        row.status === AppointmentStatus.SCHEDULED &&
        (roleByVehicle.get(row.vehicleId) === UserVehicleRole.OWNER ||
          row.createdByUserId === userId);

      return {
        id: row.id,
        vehicle: {
          id: row.vehicleId,
          licensePlate: vehicle?.licensePlate ?? '',
          brand: vehicle?.brand ?? '',
          model: vehicle?.model ?? '',
          year: vehicle?.year ?? 0,
        },
        workshop: workshop
          ? {
              id: workshop.id,
              name: workshop.name,
              address: workshop.address,
              phone: workshop.phone,
            }
          : null,
        createdBy: createdBy
          ? { id: createdBy.id, name: createdBy.name }
          : null,
        scheduledAt: row.scheduledAt.toISOString(),
        timezone: row.timezone,
        reason: row.reason,
        notes: row.notes,
        status: row.status,
        completedAt: row.completedAt?.toISOString() ?? null,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        maintenanceId: maintenanceByAppointment.get(row.id) ?? null,
        reminders: (remindersByAppointment.get(row.id) ?? []).map(
          (reminder) => ({
            offsetMinutes: reminder.offsetMinutes,
            remindAt: reminder.remindAt.toISOString(),
            processed: reminder.processedAt !== null,
          }),
        ),
        canEdit: editable,
      };
    });
  }
}
