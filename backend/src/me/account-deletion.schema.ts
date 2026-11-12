import { z } from 'zod';

export const deleteAccountSchema = z
  .object({
    confirm: z.literal('ELIMINAR', {
      errorMap: () => ({ message: 'Escribe ELIMINAR para confirmar.' }),
    }),
  })
  .strip();

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
