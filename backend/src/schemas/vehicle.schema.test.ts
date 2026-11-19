import { createVehicleSchema } from './vehicle.schema';

const VIN = 'WVWZZZ6RZMY000001';
const CURRENT_YEAR = new Date().getFullYear();

function validInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
    licensePlate: 'BCDF12',
    currentMileage: 1000,
    ...overrides,
  };
}

function firstIssue(overrides: Record<string, unknown>): {
  field: string;
  message: string;
} {
  const result = createVehicleSchema.safeParse(validInput(overrides));

  if (result.success) {
    throw new Error('Se esperaba un error de validación.');
  }

  const [issue] = result.error.issues;

  return {
    field: issue.path.join('.'),
    message: issue.message,
  };
}

describe('createVehicleSchema', () => {
  it('normaliza la patente: mayúsculas, sin espacios, puntos ni guiones', () => {
    const result = createVehicleSchema.parse(
      validInput({ licensePlate: ' bc-df 12 ' }),
    );

    expect(result.licensePlate).toBe('BCDF12');
  });

  it('normaliza el VIN: mayúsculas y sin espacios', () => {
    const result = createVehicleSchema.parse(
      validInput({ vin: ' wvwzzz6rzmy000001 ' }),
    );

    expect(result.vin).toBe(VIN);
  });

  it('trata el VIN vacío como ausente', () => {
    const result = createVehicleSchema.parse(validInput({ vin: '' }));

    expect(result.vin).toBeNull();
  });

  it('acepta el VIN ausente o null', () => {
    expect(createVehicleSchema.parse(validInput()).vin).toBeNull();
    expect(createVehicleSchema.parse(validInput({ vin: null })).vin).toBeNull();
  });

  it('rechaza un VIN inválido', () => {
    expect(firstIssue({ vin: 'WVWZZZ6RZMY00000I' })).toEqual({
      field: 'vin',
      message:
        'El VIN debe tener 17 caracteres: letras y números, sin I, O ni Q',
    });
  });

  it('rechaza un VIN con dígito verificador incorrecto', () => {
    expect(firstIssue({ vin: '1HGCM82603A004352' })).toEqual({
      field: 'vin',
      message:
        'El VIN ingresado no es válido (el dígito verificador no coincide)',
    });
  });

  it('acepta los años límite 1950 y año actual + 1', () => {
    expect(createVehicleSchema.parse(validInput({ year: 1950 })).year).toBe(
      1950,
    );
    expect(
      createVehicleSchema.parse(validInput({ year: CURRENT_YEAR + 1 })).year,
    ).toBe(CURRENT_YEAR + 1);
  });

  it('rechaza un año fuera de rango', () => {
    const message = `El año debe estar entre 1950 y ${CURRENT_YEAR + 1}.`;

    expect(firstIssue({ year: 1949 })).toEqual({ field: 'year', message });
    expect(firstIssue({ year: CURRENT_YEAR + 2 })).toEqual({
      field: 'year',
      message,
    });
  });

  it('rechaza una marca fuera de la lista', () => {
    expect(firstIssue({ brand: 'Tesla' })).toEqual({
      field: 'brand',
      message: 'Selecciona una marca válida.',
    });
  });

  it('recorta los espacios del modelo y rechaza más de 60 caracteres', () => {
    expect(createVehicleSchema.parse(validInput({ model: '  Corolla  ' })).model).toBe(
      'Corolla',
    );
    expect(firstIssue({ model: 'x'.repeat(61) })).toEqual({
      field: 'model',
      message: 'El modelo no puede tener más de 60 caracteres.',
    });
  });

  it('rechaza una patente con formato inválido', () => {
    expect(firstIssue({ licensePlate: 'ABC' })).toEqual({
      field: 'licensePlate',
      message:
        'La patente no tiene un formato válido. Ejemplos: BCDF12 (auto), ABC12 (moto), AB1234 (formato antiguo)',
    });
    expect(firstIssue({ licensePlate: 'ABCD1234' })).toMatchObject({
      field: 'licensePlate',
    });
    expect(firstIssue({ licensePlate: 'BCD*12' })).toMatchObject({
      field: 'licensePlate',
    });
  });

  it('rechaza un kilometraje fuera de rango', () => {
    expect(firstIssue({ currentMileage: -1 })).toMatchObject({
      field: 'currentMileage',
    });
    expect(firstIssue({ currentMileage: 2_000_001 })).toMatchObject({
      field: 'currentMileage',
    });
  });
});
