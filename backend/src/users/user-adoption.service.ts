import { DataSource, QueryRunner } from 'typeorm';
import { User } from '../entities/User';

export interface AdoptionResult {
  dryRun: boolean;
  counts: Record<string, number>;
  movedRows: number;
}

interface TableReferences {
  table: string;
  columns: string[];
}

interface PgConstraintError {
  code?: string;
  constraint?: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Descubre desde los metadatos de TypeORM toda columna que apunte a users. */
function findUserReferences(dataSource: DataSource): TableReferences[] {
  const usersTable = dataSource.getMetadata(User).tableName;
  const byTable = new Map<string, Set<string>>();

  for (const entity of dataSource.entityMetadatas) {
    for (const foreignKey of entity.foreignKeys) {
      if (foreignKey.referencedEntityMetadata.tableName !== usersTable) {
        continue;
      }

      const columns = byTable.get(entity.tableName) ?? new Set<string>();
      for (const column of foreignKey.columns) {
        columns.add(column.databaseName);
      }
      byTable.set(entity.tableName, columns);
    }
  }

  return [...byTable].map(([table, columns]) => ({
    table,
    columns: [...columns],
  }));
}

async function countReferences(
  runner: QueryRunner,
  reference: TableReferences,
  userId: string,
): Promise<number> {
  const condition = reference.columns
    .map((column) => `${quoteIdentifier(column)} = $1`)
    .join(' OR ');
  const rows: Array<{ count: number }> = await runner.query(
    `SELECT count(*)::int AS count FROM ${quoteIdentifier(reference.table)} WHERE ${condition}`,
    [userId],
  );

  return Number(rows[0]?.count ?? 0);
}

function explainError(error: unknown): Error {
  if (typeof error === 'object' && error !== null) {
    const { code, constraint } = error as PgConstraintError;

    if (code === '23505' || code === '23514') {
      const detail = constraint ? ` (${constraint})` : '';
      return new Error(
        `No se pudo adoptar el usuario: hay un conflicto de clave${detail}. No se cambió nada.`,
      );
    }
  }

  return error instanceof Error ? error : new Error('No se pudo adoptar el usuario.');
}

/**
 * Reasigna todo lo del usuario origen al usuario de Clerk destino y elimina el
 * origen. La transacción garantiza que un conflicto deje todo como estaba.
 */
export async function adoptUser(
  dataSource: DataSource,
  fromUserId: string,
  toClerkUserId: string,
  dryRun: boolean,
): Promise<AdoptionResult> {
  if (fromUserId === toClerkUserId) {
    throw new Error('El usuario origen y el destino deben ser distintos.');
  }

  const references = findUserReferences(dataSource);
  const runner = dataSource.createQueryRunner();
  await runner.connect();

  try {
    if (dryRun) {
      const counts: Record<string, number> = {};

      for (const reference of references) {
        const count = await countReferences(runner, reference, fromUserId);
        if (count > 0) {
          counts[reference.table] = count;
        }
      }

      return {
        dryRun: true,
        counts,
        movedRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
      };
    }

    await runner.startTransaction();

    try {
      const sourceRows: unknown[] = await runner.query(
        `SELECT 1 FROM "users" WHERE "id" = $1`,
        [fromUserId],
      );

      if (sourceRows.length === 0) {
        throw new Error(`El usuario origen "${fromUserId}" no existe.`);
      }

      await runner.query(
        `INSERT INTO "users" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`,
        [toClerkUserId],
      );

      const counts: Record<string, number> = {};

      for (const reference of references) {
        const count = await countReferences(runner, reference, fromUserId);

        if (count === 0) {
          continue;
        }

        counts[reference.table] = count;

        for (const column of reference.columns) {
          await runner.query(
            `UPDATE ${quoteIdentifier(reference.table)}
             SET ${quoteIdentifier(column)} = $1
             WHERE ${quoteIdentifier(column)} = $2`,
            [toClerkUserId, fromUserId],
          );
        }
      }

      await runner.query(`DELETE FROM "users" WHERE "id" = $1`, [fromUserId]);
      await runner.commitTransaction();

      return {
        dryRun: false,
        counts,
        movedRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
      };
    } catch (error) {
      await runner.rollbackTransaction();
      throw explainError(error);
    }
  } finally {
    await runner.release();
  }
}
