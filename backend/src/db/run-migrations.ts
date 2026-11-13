import 'reflect-metadata';
import { error as logError, info } from '../common/logger';
import { AppDataSource } from './data-source';

async function runMigrations(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const applied = await AppDataSource.runMigrations();

    for (const migration of applied) {
      info(migration.name);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

runMigrations().catch((error) => {
  logError(
    'No se pudieron aplicar las migraciones.',
    error instanceof Error ? error.name : 'Error',
  );
  process.exit(1);
});
