import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { asyncHandler } from '../common/async-handler';
import {
  ValidationError,
  formatIssues,
  validateBody,
} from '../common/validation-pipe';
import {
  UpdateAppointmentInput,
  listUserAppointmentsQuerySchema,
  updateAppointmentSchema,
} from './appointment.schema';
import { AppointmentService } from './appointments.service';

export function createAppointmentsRouter(
  service: AppointmentService,
  auth: RequestHandler,
  clock: Clock,
): Router {
  const router = Router();

  router.use(auth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const parsed = listUserAppointmentsQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new ValidationError(formatIssues(parsed.error));
      }

      res.json(await service.listForUser(req.auth.userId, parsed.data));
    }),
  );

  router.get(
    '/:appointmentId',
    asyncHandler(async (req, res) => {
      res.json(
        await service.getOne(req.auth.userId, req.params.appointmentId),
      );
    }),
  );

  router.patch(
    '/:appointmentId',
    validateBody(z.lazy(() => updateAppointmentSchema(clock.now()))),
    asyncHandler(async (req, res) => {
      res.json(
        await service.update(
          req.auth.userId,
          req.params.appointmentId,
          req.body as UpdateAppointmentInput,
        ),
      );
    }),
  );

  router.post(
    '/:appointmentId/cancel',
    asyncHandler(async (req, res) => {
      res.json(
        await service.cancel(req.auth.userId, req.params.appointmentId),
      );
    }),
  );

  router.post(
    '/:appointmentId/complete',
    asyncHandler(async (req, res) => {
      res.json(
        await service.complete(req.auth.userId, req.params.appointmentId),
      );
    }),
  );

  return router;
}
