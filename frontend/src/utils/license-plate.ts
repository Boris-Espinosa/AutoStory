// El backend usa zod 3; el frontend zod 4 expone esa API en "zod/v3".
import { z } from 'zod/v3';

export const LICENSE_PLATE_MESSAGE =
  'La patente no tiene un formato válido. Ejemplos: BCDF12 (auto), ABC12 (moto), AB1234 (formato antiguo)';

// Fuente: Registro Civil. Actualizar si cambian los formatos anunciados.
export const LICENSE_PLATE_FORMATS = [
  // Autos nuevos (desde 2007): 4 consonantes y 2 dígitos; el primero no es 0.
  {
    name: 'AUTO_2007',
    regex: /^[BCDFGHJKLPRSTVWXYZ]{4}[1-9]\d$/,
  },
  // Autos antiguos: 2 letras y 4 dígitos; el primero no es 0.
  { name: 'AUTO_ANTIGUO', regex: /^[A-Z]{2}[1-9]\d{3}$/ },
  // Motos: 3 letras y 2 dígitos.
  { name: 'MOTO', regex: /^[A-Z]{3}\d{2}$/ },
  // Motos anunciadas (desde 2027): 4 letras y 1 dígito.
  { name: 'MOTO_NUEVA', regex: /^[A-Z]{4}\d$/ },
  // Autos anunciados (desde 2029): 5 letras y 1 dígito.
  { name: 'AUTO_NUEVA', regex: /^[A-Z]{5}\d$/ },
] as const;

/**
 * Quita solo espacios, puntos, guiones y punto medio. Cualquier otro carácter
 * se conserva para que la validación lo rechace.
 */
export function normalizeLicensePlate(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[ .\-·]/g, '');
}

export function isValidLicensePlate(value: string): boolean {
  return LICENSE_PLATE_FORMATS.some((format) => format.regex.test(value));
}

export const plateSchema = z
  .string({
    required_error: 'La patente es obligatoria.',
    invalid_type_error: 'La patente es obligatoria.',
  })
  .transform(normalizeLicensePlate)
  .refine(isValidLicensePlate, { message: LICENSE_PLATE_MESSAGE });
