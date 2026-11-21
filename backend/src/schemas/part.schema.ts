import { z } from 'zod';
import { ISO_DATE_REGEX, isValidIsoDate } from '../utils/iso-date';
import { PART_CATEGORIES } from '../entities/Part';

export const createPartSchema = z
  .object({
    vehicleId: z
      .string({
        required_error: 'Debe seleccionar un vehículo.',
        invalid_type_error: 'El vehículo seleccionado no es válido.',
      })
      .uuid('El vehículo seleccionado no es válido.'),
    maintenanceId: z
      .string({ invalid_type_error: 'La mantención seleccionada no es válida.' })
      .uuid('La mantención seleccionada no es válida.')
      .nullable()
      .optional(),
    name: z
      .string({
        required_error: 'El nombre del repuesto es obligatorio.',
        invalid_type_error: 'El nombre del repuesto es obligatorio.',
      })
      .trim()
      .min(1, 'El nombre del repuesto es obligatorio.')
      .max(120, 'El nombre del repuesto no puede tener más de 120 caracteres.'),
    category: z.enum(PART_CATEGORIES, {
      errorMap: () => ({ message: 'La categoría seleccionada no es válida.' }),
    }),
    cost: z
      .number({
        required_error: 'El costo es obligatorio.',
        invalid_type_error: 'El costo debe ser un número entero.',
      })
      .int('El costo debe ser un número entero.')
      .min(0, 'El costo no puede ser negativo.')
      .max(2_147_483_647, 'El costo no puede superar 2.147.483.647.'),
    purchaseDate: z
      .string({
        required_error: 'La fecha de compra es obligatoria.',
        invalid_type_error: 'La fecha de compra es obligatoria.',
      })
      .regex(ISO_DATE_REGEX, 'La fecha de compra debe tener el formato YYYY-MM-DD.')
      .refine(isValidIsoDate, 'La fecha de compra no es válida.'),
  })
  .strip();

export type CreatePartInput = z.infer<typeof createPartSchema>;

export const listPartsQuerySchema = z
  .object({
    unassigned: z
      .enum(['true', 'false'], {
        errorMap: () => ({ message: 'El filtro no es válido.' }),
      })
      .optional()
      .transform((value) => value === 'true'),
    limit: z.coerce
      .number({ invalid_type_error: 'El límite debe ser un número entero.' })
      .int('El límite debe ser un número entero.')
      .min(1, 'El límite debe ser al menos 1.')
      .max(100, 'El límite no puede ser mayor que 100.')
      .default(100),
    offset: z.coerce
      .number({ invalid_type_error: 'El desplazamiento debe ser un número entero.' })
      .int('El desplazamiento debe ser un número entero.')
      .min(0, 'El desplazamiento no puede ser negativo.')
      .default(0),
  })
  .strip();

export type ListPartsQuery = z.infer<typeof listPartsQuerySchema>;
