import { z } from 'zod';

const optionalText = (max: number, message: string) =>
  z
    .string({ invalid_type_error: message })
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const createWorkshopSchema = z
  .object({
    name: z
      .string({
        required_error: 'El nombre del taller es obligatorio.',
        invalid_type_error: 'El nombre del taller es obligatorio.',
      })
      .trim()
      .min(1, 'El nombre del taller es obligatorio.')
      .max(100, 'El nombre del taller no puede tener más de 100 caracteres.'),
    address: optionalText(
      200,
      'La dirección no puede tener más de 200 caracteres.',
    ),
    phone: optionalText(30, 'El teléfono no puede tener más de 30 caracteres.'),
    rating: z
      .number({ invalid_type_error: 'El rating debe ser un número entero.' })
      .int('El rating debe ser un número entero.')
      .min(1, 'El rating debe estar entre 1 y 5.')
      .max(5, 'El rating debe estar entre 1 y 5.')
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  })
  .strip();

export type CreateWorkshopInput = z.infer<typeof createWorkshopSchema>;
