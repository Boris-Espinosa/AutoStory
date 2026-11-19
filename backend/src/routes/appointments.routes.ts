import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { asyncHandler } from '../common/async-handler';
import { validateBody } from '../common/validation-pipe';
import {
  cancelAppointment,
  completeAppointment,
  getAppointment,
  listUserAppointments,
  updateAppointment,
} from '../controllers/appointments.controller';
import { updateAppointmentSchema } from '../schemas/appointment.schema';
import { AppointmentService } from '../services/appointments.service';

export function createAppointmentsRouter(
  service: AppointmentService,
  auth: RequestHandler,
  clock: Clock,
): Router {
  const router = Router();

  router.use(auth);

  router.get('/', asyncHandler(listUserAppointments(service)));

  router.get('/:appointmentId', asyncHandler(getAppointment(service)));

  router.patch(
    '/:appointmentId',
    validateBody(z.lazy(() => updateAppointmentSchema(clock.now()))),
    asyncHandler(updateAppointment(service)),
  );

  router.post(
    '/:appointmentId/cancel',
    asyncHandler(cancelAppointment(service)),
  );

  router.post(
    '/:appointmentId/complete',
    asyncHandler(completeAppointment(service)),
  );

  return router;
}
