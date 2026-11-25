import { z } from 'zod';

export const sendSharingRequestSchema = z
  .object({
    email: z
      .string({ error: 'El correo electrónico es obligatorio.' })
      .trim()
      .min(1, 'El correo electrónico es obligatorio.')
      .max(254, 'El correo no puede tener más de 254 caracteres.')
      .pipe(z.email({ error: 'Escribe un correo electrónico válido.' })),
  })
  .strip();

export type SendSharingRequestInput = z.infer<typeof sendSharingRequestSchema>;

export const uuidParamSchema = z
  .string()
  .uuid('El ID de la solicitud no es válido.');

export const userIdParamSchema = z
  .string()
  .min(1, 'El ID del usuario no es válido.')
  .max(64, 'El ID del usuario no es válido.');
