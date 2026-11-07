import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ENTITIES, MIGRATIONS } from '../db/data-source';

export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL no está definida. Los tests de integración usan una base aparte.',
    );
  }

  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL no puede ser igual a DATABASE_URL.');
  }

  const databaseName = decodeURIComponent(
    new URL(url).pathname.replace(/^\//, ''),
  );

  if (!/test/i.test(databaseName)) {
    throw new Error(
      'La base de TEST_DATABASE_URL debe tener "test" en el nombre.',
    );
  }

  return url;
}

export function createTestDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    url: requireTestDatabaseUrl(),
    entities: ENTITIES,
    migrations: MIGRATIONS,
    dropSchema: true,
    migrationsRun: true,
    synchronize: false,
    logging: false,
  });
}
