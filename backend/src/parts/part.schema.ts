import { z } from 'zod';
import { ISO_DATE_REGEX, isValidIsoDate } from '../common/iso-date';
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
      .min(0, 'El costo no puede ser negativo.'),
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
