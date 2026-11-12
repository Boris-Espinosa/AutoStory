import 'reflect-metadata';
import { error as logError, info } from './common/logger';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { adoptUser } from './users/user-adoption.service';

const USAGE =
  'Uso: npm run dev:adopt -- <fromUserId> <toClerkUserId> [--dry-run]';

function readArgs(): { fromUserId: string; toClerkUserId: string; dryRun: boolean } | null {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const unknownFlags = args.filter(
    (arg) => arg.startsWith('--') && arg !== '--dry-run',
  );

  if (positional.length !== 2 || unknownFlags.length > 0) {
    return null;
  }

  return {
    fromUserId: positional[0],
    toClerkUserId: positional[1],
    dryRun,
  };
}

async function main(): Promise<void> {
  if (env.nodeEnv === 'production') {
    logError('dev:adopt no se ejecuta en producción.');
    process.exitCode = 1;
    return;
  }

  const args = readArgs();

  if (!args) {
    logError(USAGE);
    process.exitCode = 1;
    return;
  }

  await AppDataSource.initialize();

  try {
    const result = await adoptUser(
      AppDataSource,
      args.fromUserId,
      args.toClerkUserId,
      args.dryRun,
    );

    if (result.dryRun) {
      info(
        `Simulación: ${args.fromUserId} -> ${args.toClerkUserId} (sin cambios).`,
      );
    } else {
      info(
        `Usuario ${args.fromUserId} adoptado como ${args.toClerkUserId}.`,
      );
    }

    for (const [table, count] of Object.entries(result.counts)) {
      info(`  ${table}: ${count}`);
    }
    info(`Total de filas: ${result.movedRows}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  logError(
    error instanceof Error ? error.message : 'No se pudo adoptar el usuario.',
  );
  process.exitCode = 1;
});
