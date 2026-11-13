import 'reflect-metadata';
import { mkdir } from 'fs/promises';
import { createApp } from './app';
import { error as logError, info } from './common/logger';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { startReminderWorker } from './notifications/reminder-worker';
import { UPLOADS_DIR } from './vehicles/photo-upload';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await AppDataSource.initialize();

  const app = createApp(AppDataSource);
  const stopReminderWorker = startReminderWorker(AppDataSource);

  const server = app.listen(env.port, () => {
    info(`AutoStory API escuchando en http://localhost:${env.port}`);
  });

  let shuttingDown = false;
  let closingDatabase = false;

  const closeDatabase = async (code: number): Promise<void> => {
    if (closingDatabase) {
      return;
    }

    closingDatabase = true;

    try {
      await AppDataSource.destroy();
    } finally {
      process.exit(code);
    }
  };

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    info(`Recibido ${signal}: cerrando la API.`);

    stopReminderWorker();

    const timeout = setTimeout(() => {
      logError('Cierre forzado: se agotó el tiempo de espera.');
      server.closeAllConnections();
      void closeDatabase(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    server.close((error) => {
      clearTimeout(timeout);
      void closeDatabase(error ? 1 : 0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logError(
    'No se pudo iniciar la API.',
    error instanceof Error ? error.name : undefined,
  );
  process.exit(1);
});
