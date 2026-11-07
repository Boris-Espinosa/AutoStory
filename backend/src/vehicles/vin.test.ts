import {
  normalizeVin,
  validateVin,
  vinSchema,
} from './vin';
import { makeVin } from '../testing/vin';

const VALID_VIN = '1HGCM82633A004352';
const EUROPEAN_VIN = 'WVWZZZ6RZMY000001';

describe('normalizeVin', () => {
  it('recorta, pasa a mayúsculas y quita solo espacios', () => {
    expect(normalizeVin(' 1hgcm82633a004352 ')).toBe(VALID_VIN);
    expect(normalizeVin('1HG CM82 633A 004352')).toBe(VALID_VIN);
  });

  it('trata vacío y null como ausencia', () => {
    expect(normalizeVin('')).toBeNull();
    expect(normalizeVin('   ')).toBeNull();
    expect(normalizeVin(null)).toBeNull();
    expect(normalizeVin(undefined)).toBeNull();
  });

  it('no borra símbolos: los deja para que la validación los rechace', () => {
    expect(normalizeVin('1HGCM826*3A004352')).toBe('1HGCM826*3A004352');
  });
});

describe('validateVin', () => {
  it('acepta el VIN norteamericano válido conocido', () => {
    expect(validateVin(VALID_VIN)).toEqual({ ok: true });
  });

  it('acepta un VIN calculado con makeVin', () => {
    expect(validateVin(makeVin('1HGCM826'))).toEqual({ ok: true });
  });

  it('rechaza un VIN norteamericano con dígito verificador incorrecto', () => {
    expect(validateVin('1HGCM82603A004352')).toEqual({
      ok: false,
      code: 'VIN_CHECK_DIGIT',
      message:
        'El VIN ingresado no es válido (el dígito verificador no coincide)',
    });
  });

  it.each([
    ['16 caracteres', VALID_VIN.slice(0, 16)],
    ['18 caracteres', `${VALID_VIN}0`],
    ['letra O', '1HGCM82633A00435O'],
    ['letra Q', '1HGCM82633A00435Q'],
    ['letra I', '1HGCM82633A00435I'],
    ['símbolos', '1HGCM826*3A00435*'],
  ])('rechaza el formato con %s', (_case, vin) => {
    expect(validateVin(vin)).toEqual({
      ok: false,
      code: 'VIN_FORMAT',
      message:
        'El VIN debe tener 17 caracteres: letras y números, sin I, O ni Q',
    });
  });

  it('no exige dígito verificador a un VIN no norteamericano', () => {
    expect(validateVin(EUROPEAN_VIN)).toEqual({ ok: true });
  });

  it('valida el VIN ya normalizado en minúsculas y con espacios', () => {
    expect(validateVin(normalizeVin(' 1hgcm82633a004352 ') ?? '')).toEqual({
      ok: true,
    });
  });
});

describe('vinSchema', () => {
  it('es opcional y la cadena vacía equivale a ausente', () => {
    expect(vinSchema.parse(undefined)).toBeNull();
    expect(vinSchema.parse(null)).toBeNull();
    expect(vinSchema.parse('')).toBeNull();
  });

  it('propaga el mensaje del dígito verificador', () => {
    const result = vinSchema.safeParse('1HGCM82603A004352');

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'El VIN ingresado no es válido (el dígito verificador no coincide)',
      );
    }
  });
});
