import { z } from 'zod';
import { BRANDS } from '../utils/brands';
import { plateSchema } from '../utils/license-plate';
import { vinSchema } from '../utils/vin';

const MIN_YEAR = 1950;
const MAX_MILEAGE = 2_000_000;
const maxYear = () => new Date().getFullYear() + 1;

export const createVehicleSchema = z
  .object({
    vin: vinSchema,
    licensePlate: plateSchema,
    brand: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? 'La marca es obligatoria.'
            : 'La marca es obligatoria.',
      })
      .trim()
      .pipe(
        z.enum(BRANDS, {
          error: 'Selecciona una marca válida.',
        }),
      ),
    model: z
      .string({
        error: 'El modelo es obligatorio.',
      })
      .trim()
      .min(1, 'El modelo es obligatorio.')
      .max(60, 'El modelo no puede tener más de 60 caracteres.'),
    year: z
      .number({
        error: (issue) =>
          issue.input === undefined
            ? 'El año es obligatorio.'
            : 'El año debe ser un número entero.',
      })
      .int('El año debe ser un número entero.')
      .refine(
        (year) => year >= MIN_YEAR && year <= maxYear(),
        { error: () => `El año debe estar entre ${MIN_YEAR} y ${maxYear()}.` },
      ),
    currentMileage: z
      .number({
        error: (issue) =>
          issue.input === undefined
            ? 'El kilometraje es obligatorio.'
            : 'El kilometraje debe ser un número entero.',
      })
      .int('El kilometraje debe ser un número entero.')
      .min(0, 'El kilometraje no puede ser negativo.')
      .max(MAX_MILEAGE, `El kilometraje no puede superar ${MAX_MILEAGE}.`),
  })
  .strip();

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema;

export type UpdateVehicleInput = CreateVehicleInput;
