import {
  LICENSE_PLATE_MESSAGE,
  isValidLicensePlate,
  normalizeLicensePlate,
  plateSchema,
} from './license-plate';

describe('normalizeLicensePlate', () => {
  it('pasa a mayúsculas y quita solo espacios, puntos, guiones y punto medio', () => {
    expect(normalizeLicensePlate(' bc-df 12 ')).toBe('BCDF12');
    expect(normalizeLicensePlate('bc.df.12')).toBe('BCDF12');
    expect(normalizeLicensePlate('BC·DF·12')).toBe('BCDF12');
  });

  it('conserva los caracteres inválidos para que la validación los rechace', () => {
    expect(normalizeLicensePlate('BCD*12')).toBe('BCD*12');
    expect(normalizeLicensePlate('BC#DF12')).toBe('BC#DF12');
  });
});

describe('isValidLicensePlate', () => {
  it.each(['BCDF12', 'AB1234', 'ABC12', 'ABCD1', 'ABCDE1'])(
    'acepta %s',
    (plate) => {
      expect(isValidLicensePlate(normalizeLicensePlate(plate))).toBe(true);
    },
  );

  it.each([
    ['vocales', 'AEIO12'],
    ['letra M', 'BCDM12'],
    ['primer dígito 0', 'BCDF02'],
    ['símbolo *', 'BCD*12'],
    ['símbolo #', 'BC#DF12'],
    ['digitos extra', 'BCDF123'],
    ['solo letras', 'ABCDEFG'],
    ['vacía', ''],
  ])('rechaza la patente con %s', (_case, plate) => {
    expect(isValidLicensePlate(normalizeLicensePlate(plate))).toBe(false);
  });
});

describe('plateSchema', () => {
  it.each(['BCDF12', 'bc-df 12', 'BC·DF·12', 'AB1234', 'ABC12', 'ABCD1', 'ABCDE1'])(
    'acepta y normaliza %s',
    (plate) => {
      expect(plateSchema.parse(plate)).toMatch(/^[A-Z0-9]+$/);
    },
  );

  it.each(['AEIO12', 'BCDM12', 'BCDF02', 'BCD*12', 'BC#DF12', 'BCDF123', 'ABCDEFG', ''])(
    'rechaza %s con el mensaje en español',
    (plate) => {
      const result = plateSchema.safeParse(plate);

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toBe(LICENSE_PLATE_MESSAGE);
      }
    },
  );
});
