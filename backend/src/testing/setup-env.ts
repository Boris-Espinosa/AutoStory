// Los tests existentes autentican con x-user-id. El modo clerk se prueba
// aparte mutando env.auth.mode después de cargar la configuración.
process.env.AUTH_MODE = 'dev-header';
