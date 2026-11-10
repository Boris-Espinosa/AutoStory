import { z } from 'zod';

export const listNotificationsQuerySchema = z
  .object({
    unread: z
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
      .default(30),
    offset: z.coerce
      .number({
        invalid_type_error: 'El desplazamiento debe ser un número entero.',
      })
      .int('El desplazamiento debe ser un número entero.')
      .min(0, 'El desplazamiento no puede ser negativo.')
      .default(0),
  })
  .strip();

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
