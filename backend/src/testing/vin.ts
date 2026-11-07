import { calculateVinCheckDigit } from '../vehicles/vin';

/**
 * Completa un VIN norteamericano. El prefijo aporta los caracteres y el dígito
 * verificador de la posición 9 se calcula con ISO 3779.
 */
export function makeVin(prefix: string): string {
  const base = prefix.padEnd(17, '0').slice(0, 17);
  const placeholder = `${base.slice(0, 8)}0${base.slice(9)}`;
  const digit = calculateVinCheckDigit(placeholder);

  if (digit === null) {
    throw new Error(`No se pudo calcular el dígito verificador de ${prefix}`);
  }

  return `${base.slice(0, 8)}${digit}${base.slice(9)}`;
}
