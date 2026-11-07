import 'reflect-metadata';
import { createApp } from './app';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();

  const app = createApp(AppDataSource);

  app.listen(env.port, () => {
    console.log(`AutoStory API escuchando en http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar la API.', error);
  process.exit(1);
});
