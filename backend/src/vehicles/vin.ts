import { z } from 'zod';

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export const VIN_FORMAT_MESSAGE =
  'El VIN debe tener 17 caracteres: letras y números, sin I, O ni Q';
export const VIN_CHECK_DIGIT_MESSAGE =
  'El VIN ingresado no es válido (el dígito verificador no coincide)';

const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

const CHECK_DIGIT_WEIGHTS = [
  8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2,
];

export type VinValidation =
  | { ok: true }
  | {
      ok: false;
      code: 'VIN_FORMAT' | 'VIN_CHECK_DIGIT';
      message: string;
    };

/** Quita espacios y normaliza a mayúsculas. El resto se valida, no se borra. */
export function normalizeVin(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/ /g, '');

  return normalized.length > 0 ? normalized : null;
}

/** Dígito verificador ISO 3779 de la posición 9, o null si el VIN no es de 17. */
export function calculateVinCheckDigit(vin: string): string | null {
  if (vin.length !== 17) {
    return null;
  }

  let sum = 0;

  for (let index = 0; index < vin.length; index += 1) {
    const character = vin[index];
    const value = /[0-9]/.test(character)
      ? Number(character)
      : TRANSLITERATION[character];

    if (value === undefined) {
      return null;
    }

    sum += value * CHECK_DIGIT_WEIGHTS[index];
  }

  const remainder = sum % 11;

  return remainder === 10 ? 'X' : String(remainder);
}

export function validateVin(vin: string): VinValidation {
  if (!VIN_REGEX.test(vin)) {
    return { ok: false, code: 'VIN_FORMAT', message: VIN_FORMAT_MESSAGE };
  }

  // Solo los VIN norteamericanos (primer carácter 1 a 5) exigen dígito verificador.
  if (/^[1-5]/.test(vin) && calculateVinCheckDigit(vin) !== vin[8]) {
    return {
      ok: false,
      code: 'VIN_CHECK_DIGIT',
      message: VIN_CHECK_DIGIT_MESSAGE,
    };
  }

  return { ok: true };
}

function addValidationIssue(
  value: string | null,
  context: z.RefinementCtx,
): void {
  if (value === null) {
    return;
  }

  const result = validateVin(value);

  if (!result.ok) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
  }
}

/** VIN de un formulario: opcional y una cadena vacía equivale a ausente. */
export const vinSchema = z
  .union([z.string(), z.null()], {
    invalid_type_error: 'El VIN no es válido.',
  })
  .optional()
  .transform((value) => normalizeVin(value ?? null))
  .superRefine(addValidationIssue);

/** VIN de una ruta: obligatorio. */
export const vinParamSchema = z
  .string({
    required_error: VIN_FORMAT_MESSAGE,
    invalid_type_error: VIN_FORMAT_MESSAGE,
  })
  .transform((value) => normalizeVin(value) ?? '')
  .superRefine((value, context) => {
    const result = validateVin(value);

    if (!result.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message,
        path: ['vin'],
      });
    }
  });
