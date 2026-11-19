import 'dotenv/config';

// Los tests existentes autentican con x-user-id. El modo clerk se prueba
// aparte mutando env.auth.mode después de cargar la configuración.
process.env.AUTH_MODE = 'dev-header';

// Los tests asumen almacenamiento local aunque el .env local configure R2.
process.env.STORAGE_DRIVER = 'disk';
