import { AsyncRouteHandler } from '../common/async-handler';
import { ValidationError, formatIssues } from '../common/validation-pipe';
import {
  UpdateAppointmentInput,
  listUserAppointmentsQuerySchema,
} from '../schemas/appointment.schema';
import { AppointmentService } from '../services/appointments.service';

export function listUserAppointments(
  service: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
    const parsed = listUserAppointmentsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    res.json(await service.listForUser(req.auth.userId, parsed.data));
  };
}

export function getAppointment(
  service: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(
      await service.getOne(req.auth.userId, req.params.appointmentId),
    );
  };
}

export function updateAppointment(
  service: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(
      await service.update(
        req.auth.userId,
        req.params.appointmentId,
        req.body as UpdateAppointmentInput,
      ),
    );
  };
}

export function cancelAppointment(
  service: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(
      await service.cancel(req.auth.userId, req.params.appointmentId),
    );
  };
}

export function completeAppointment(
  service: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(
      await service.complete(req.auth.userId, req.params.appointmentId),
    );
  };
}
