import { z } from 'zod';
import { BRANDS } from './brands';
import { plateSchema } from './license-plate';
import { vinSchema } from './vin';

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear() + 1;
const MAX_MILEAGE = 2_000_000;

export const createVehicleSchema = z
  .object({
    vin: vinSchema,
    licensePlate: plateSchema,
    brand: z
      .string({
        required_error: 'La marca es obligatoria.',
        invalid_type_error: 'La marca es obligatoria.',
      })
      .trim()
      .pipe(
        z.enum(BRANDS, {
          errorMap: () => ({ message: 'Selecciona una marca válida.' }),
        }),
      ),
    model: z
      .string({
        required_error: 'El modelo es obligatorio.',
        invalid_type_error: 'El modelo es obligatorio.',
      })
      .trim()
      .min(1, 'El modelo es obligatorio.')
      .max(60, 'El modelo no puede tener más de 60 caracteres.'),
    year: z
      .number({
        required_error: 'El año es obligatorio.',
        invalid_type_error: 'El año debe ser un número entero.',
      })
      .int('El año debe ser un número entero.')
      .min(MIN_YEAR, `El año debe estar entre ${MIN_YEAR} y ${MAX_YEAR}.`)
      .max(MAX_YEAR, `El año debe estar entre ${MIN_YEAR} y ${MAX_YEAR}.`),
    currentMileage: z
      .number({
        required_error: 'El kilometraje es obligatorio.',
        invalid_type_error: 'El kilometraje debe ser un número entero.',
      })
      .int('El kilometraje debe ser un número entero.')
      .min(0, 'El kilometraje no puede ser negativo.')
      .max(MAX_MILEAGE, `El kilometraje no puede superar ${MAX_MILEAGE}.`),
    photoUrl: z
      .string({ invalid_type_error: 'La foto no es válida.' })
      .max(512, 'La ruta de la foto no puede tener más de 512 caracteres.')
      .nullable()
      .optional(),
  })
  .strip();

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
