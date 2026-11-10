import 'reflect-metadata';
import { createApp } from './app';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { startReminderWorker } from './notifications/reminder-worker';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();

  const app = createApp(AppDataSource);
  const stopReminderWorker = startReminderWorker(AppDataSource);

  const server = app.listen(env.port, () => {
    console.log(`AutoStory API escuchando en http://localhost:${env.port}`);
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
  console.error('No se pudo iniciar la API.', error);
  process.exit(1);
});
