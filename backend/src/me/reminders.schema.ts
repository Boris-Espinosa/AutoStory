import { z } from 'zod';

export const listRemindersQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: 'El límite debe ser un número entero.' })
      .int('El límite debe ser un número entero.')
      .min(1, 'El límite debe ser al menos 1.')
      .max(50, 'El límite no puede ser mayor que 50.')
      .default(50),
  })
  .strip();

export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
