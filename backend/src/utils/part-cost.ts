import { Repository } from 'typeorm';
import { Part } from '../entities/Part';

/** Costo real de un repuesto: Part guarda `cost`. */
export function partCostSql(parts: Repository<Part>): string {
  const columns = new Map(
    parts.metadata.columns.map((column) => [
      column.propertyName,
      `"${column.databaseName}"`,
    ]),
  );

  return columns.get('cost') ?? '0';
}

export function partTotalCost(part: Part): number {
  return part.cost;
}
