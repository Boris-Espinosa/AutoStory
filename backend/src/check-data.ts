import 'reflect-metadata';
import { AppDataSource } from './db/data-source';
import {
  isValidLicensePlate,
  normalizeLicensePlate,
} from './vehicles/license-plate';
import { normalizeVin, validateVin } from './vehicles/vin';

interface VehicleRow {
  id: string;
  license_plate: string;
  vin: string | null;
}

/** Solo informa: no modifica ningún dato. */
async function checkData(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const rows: VehicleRow[] = await AppDataSource.query(
      'SELECT id, license_plate, vin FROM "vehicles" ORDER BY created_at',
    );

    let invalid = 0;

    for (const row of rows) {
      const reasons: string[] = [];

      if (!isValidLicensePlate(normalizeLicensePlate(row.license_plate))) {
        reasons.push('patente inválida');
      }

      if (row.vin) {
        const result = validateVin(normalizeVin(row.vin) ?? '');

        if (!result.ok) {
          reasons.push(`VIN inválido (${result.code})`);
        }
      }

      if (reasons.length > 0) {
        invalid += 1;
        console.log(
          [
            row.id,
            row.license_plate,
            row.vin ?? '(sin VIN)',
            reasons.join('; '),
          ].join('\t'),
        );
      }
    }

    console.log(
      invalid === 0
        ? 'Sin datos inválidos.'
        : `Vehículos con datos inválidos: ${invalid}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

checkData().catch((error) => {
  console.error('No se pudo revisar los datos.', error);
  process.exit(1);
});
