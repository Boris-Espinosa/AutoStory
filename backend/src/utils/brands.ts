/** Marcas admitidas al registrar un vehículo. "Otra" cubre el resto. */
export const BRANDS = [
  'Toyota',
  'Chevrolet',
  'Hyundai',
  'Kia',
  'Nissan',
  'Suzuki',
  'Volkswagen',
  'Mazda',
  'Ford',
  'Peugeot',
  'Honda',
  'Mitsubishi',
  'Renault',
  'Subaru',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Citroën',
  'Fiat',
  'Jeep',
  'MG',
  'Chery',
  'Great Wall',
  'Volvo',
  'Otra',
] as const;

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

const BRANDS_BY_KEY = new Map(
  BRANDS.map((brand) => [normalizeForComparison(brand), brand]),
);

/** Devuelve la marca canónica o "Otra" si el VIN trae una desconocida. */
export function matchBrand(make: string): string {
  return BRANDS_BY_KEY.get(normalizeForComparison(make)) ?? 'Otra';
}
