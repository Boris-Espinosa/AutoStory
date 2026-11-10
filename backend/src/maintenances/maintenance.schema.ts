import { z } from 'zod';
import { isValidIsoDate, todayInSantiago } from '../common/iso-date';

export const createMaintenanceSchema = z
  .object({
    serviceDate: z
      .string({
        required_error: 'La fecha es obligatoria.',
        invalid_type_error: 'La fecha es obligatoria.',
      })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD.')
      .refine(isValidIsoDate, 'La fecha no es válida.')
      .refine(
        (value) => value <= todayInSantiago(),
        'La fecha no puede ser posterior a hoy',
      ),
    serviceMileage: z
      .number({
        required_error: 'El kilometraje del servicio es obligatorio.',
        invalid_type_error: 'El kilometraje del servicio debe ser un número entero.',
      })
      .int('El kilometraje del servicio debe ser un número entero.')
      .min(0, 'El kilometraje del servicio no puede ser negativo.')
      .max(
        2000000,
        'El kilometraje del servicio no puede superar 2.000.000.',
      ),
    description: z
      .string({
        required_error: 'La descripción es obligatoria.',
        invalid_type_error: 'La descripción es obligatoria.',
      })
      .trim()
      .min(3, 'La descripción debe tener al menos 3 caracteres.')
      .max(500, 'La descripción no puede tener más de 500 caracteres.'),
    diagnosis: z
      .string({ invalid_type_error: 'El diagnóstico debe ser texto.' })
      .trim()
      .max(1000, 'El diagnóstico no puede tener más de 1000 caracteres.')
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
    laborCost: z
      .number({ invalid_type_error: 'El costo de mano de obra debe ser un número entero.' })
      .int('El costo de mano de obra debe ser un número entero.')
      .min(0, 'El costo de mano de obra no puede ser negativo.')
      .max(
        100000000,
        'El costo de mano de obra no puede superar 100.000.000.',
      )
      .default(0),
    workshopId: z
      .string({ invalid_type_error: 'El taller seleccionado no es válido.' })
      .uuid('El taller seleccionado no es válido.')
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    appointmentId: z
      .string({ invalid_type_error: 'La cita seleccionada no es válida.' })
      .uuid('La cita seleccionada no es válida.')
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    partIds: z
      .array(
        z
          .string({ invalid_type_error: 'El repuesto seleccionado no es válido.' })
          .uuid('El repuesto seleccionado no es válido.'),
        { invalid_type_error: 'Los repuestos deben venir en una lista.' },
      )
      .max(50, 'No se pueden asignar más de 50 repuestos.')
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'No se puede repetir un repuesto.',
      )
      .optional()
      .transform((value) => value ?? []),
  })
  .strip();

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;

/** Mismas validaciones que al crear; cada campo es opcional. */
export const updateMaintenanceSchema = createMaintenanceSchema
  .partial()
  .omit({ appointmentId: true });

export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;

export const listMaintenancesQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: 'El límite debe ser un número entero.' })
      .int('El límite debe ser un número entero.')
      .min(1, 'El límite debe ser al menos 1.')
      .max(100, 'El límite no puede ser mayor que 100.')
      .default(50),
    offset: z.coerce
      .number({ invalid_type_error: 'El desplazamiento debe ser un número entero.' })
      .int('El desplazamiento debe ser un número entero.')
      .min(0, 'El desplazamiento no puede ser negativo.')
      .default(0),
  })
  .strip();

export type ListMaintenancesQuery = z.infer<typeof listMaintenancesQuerySchema>;
