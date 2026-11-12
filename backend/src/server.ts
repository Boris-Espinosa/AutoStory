import 'reflect-metadata';
import { createApp } from './app';
import { error as logError, info } from './common/logger';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { startReminderWorker } from './notifications/reminder-worker';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();

  const app = createApp(AppDataSource);
  const stopReminderWorker = startReminderWorker(AppDataSource);

  const server = app.listen(env.port, () => {
    info(`AutoStory API escuchando en http://localhost:${env.port}`);
  });

  const shutdown = (): void => {
    stopReminderWorker();
    server.close(() => {
      void AppDataSource.destroy().finally(() => process.exit(0));
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

bootstrap().catch((error) => {
  logError(
    'No se pudo iniciar la API.',
    error instanceof Error ? error.name : undefined,
  );
  process.exit(1);
});
