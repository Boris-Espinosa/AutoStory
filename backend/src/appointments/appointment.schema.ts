import { z } from 'zod';

const MAX_DAYS_AHEAD = 730;
const ALLOWED_REMINDERS = [10080, 1440, 120, 30] as const;
export const DEFAULT_REMINDERS = [1440, 120];

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFC').trim();
}

function scheduledAtSchema(now: Date) {
  const maxInstant = now.getTime() + MAX_DAYS_AHEAD * 86_400_000;

  return z
    .string({
      required_error: 'La fecha y hora son obligatorias.',
      invalid_type_error: 'La fecha y hora no son válidas.',
    })
    .datetime({
      offset: true,
      message: 'La fecha y hora no son válidas.',
    })
    .transform((value) => new Date(value))
    .refine(
      (value) => value.getTime() > now.getTime(),
      'La cita debe ser en una fecha y hora futuras',
    )
    .refine(
      (value) => value.getTime() <= maxInstant,
      'La cita no puede ser posterior a 730 días.',
    );
}

const timezoneSchema = z
  .string({ invalid_type_error: 'La zona horaria no es válida.' })
  .default('America/Santiago')
  .refine(isValidTimezone, 'La zona horaria no es válida.');

const reasonSchema = z
  .string({
    required_error: 'El motivo es obligatorio.',
    invalid_type_error: 'El motivo es obligatorio.',
  })
  .transform(normalizeText)
  .refine(
    (value) => value.length >= 3,
    'El motivo debe tener al menos 3 caracteres.',
  )
  .refine(
    (value) => value.length <= 200,
    'El motivo no puede tener más de 200 caracteres.',
  );

const notesSchema = z
  .string({ invalid_type_error: 'Las observaciones deben ser texto.' })
  .transform(normalizeText)
  .refine(
    (value) => value.length <= 1000,
    'Las observaciones no pueden tener más de 1000 caracteres.',
  )
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const workshopIdSchema = z
  .string({ invalid_type_error: 'El taller seleccionado no es válido.' })
  .uuid('El taller seleccionado no es válido.')
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const remindersSchema = z
  .array(
    z
      .number({ invalid_type_error: 'El recordatorio no es válido.' })
      .int('El recordatorio no es válido.'),
    { invalid_type_error: 'Los recordatorios deben venir en una lista.' },
  )
  .refine(
    (values) =>
      values.every((value) =>
        (ALLOWED_REMINDERS as readonly number[]).includes(value),
      ),
    'El recordatorio no es válido.',
  )
  .refine(
    (values) => new Set(values).size === values.length,
    'No se puede repetir un recordatorio.',
  )
  .optional();

export function createAppointmentSchema(now: Date) {
  return z
    .object({
      scheduledAt: scheduledAtSchema(now),
      timezone: timezoneSchema,
      reason: reasonSchema,
      notes: notesSchema,
      workshopId: workshopIdSchema,
      reminders: remindersSchema,
    })
    .strip();
}

export type CreateAppointmentInput = z.infer<
  ReturnType<typeof createAppointmentSchema>
>;

export function updateAppointmentSchema(now: Date) {
  return createAppointmentSchema(now).partial();
}

export type UpdateAppointmentInput = z.infer<
  ReturnType<typeof updateAppointmentSchema>
>;

const scopeSchema = z.enum(['upcoming', 'overdue', 'history'], {
  errorMap: () => ({ message: 'El alcance no es válido.' }),
});

const paginationShape = {
  scope: scopeSchema.default('upcoming'),
  limit: z.coerce
    .number({ invalid_type_error: 'El límite debe ser un número entero.' })
    .int('El límite debe ser un número entero.')
    .min(1, 'El límite debe ser al menos 1.')
    .max(100, 'El límite no puede ser mayor que 100.')
    .default(30),
  offset: z.coerce
    .number({ invalid_type_error: 'El desplazamiento debe ser un número entero.' })
    .int('El desplazamiento debe ser un número entero.')
    .min(0, 'El desplazamiento no puede ser negativo.')
    .default(0),
};

export const listAppointmentsQuerySchema = z
  .object(paginationShape)
  .strip();

export type ListAppointmentsQuery = z.infer<
  typeof listAppointmentsQuerySchema
>;

export const listUserAppointmentsQuerySchema = z
  .object({
    ...paginationShape,
    vehicleId: z
      .string({ invalid_type_error: 'El vehículo no es válido.' })
      .uuid('El vehículo no es válido.')
      .optional(),
  })
  .strip();

export type ListUserAppointmentsQuery = z.infer<
  typeof listUserAppointmentsQuerySchema
>;
