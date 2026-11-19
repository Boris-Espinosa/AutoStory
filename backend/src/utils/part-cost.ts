import { Repository } from 'typeorm';
import { Part } from '../entities/Part';

/**
 * Costo real de un repuesto. Hoy Part guarda `cost`; si más adelante el modelo
 * agrega `unitCost` y `quantity`, los agregados usan esa multiplicación.
 */
export function partCostSql(parts: Repository<Part>): string {
  const columns = new Map(
    parts.metadata.columns.map((column) => [
      column.propertyName,
      `"${column.databaseName}"`,
    ]),
  );

  const cost = columns.get('cost');
  const unitCost = columns.get('unitCost');
  const quantity = columns.get('quantity');

  if (!cost && unitCost && quantity) {
    return `${unitCost} * ${quantity}`;
  }

  return cost ?? '0';
}

export function partTotalCost(part: Part): number {
  const value = part as unknown as {
    cost?: number;
    unitCost?: number;
    quantity?: number;
  };

  if (value.cost !== undefined) {
    return value.cost;
  }

  return (value.unitCost ?? 0) * (value.quantity ?? 0);
}
