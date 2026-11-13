// Falla el build antes de exportar si la configuración pública está incompleta.
// Nunca imprime valores: solo nombres de variables.

const REQUIRED = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'];

const errors = [];

for (const name of REQUIRED) {
  if (!process.env[name]?.trim()) {
    errors.push(`Falta la variable ${name}.`);
  }
}

for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('EXPO_PUBLIC_') && value?.trim().startsWith('sk_')) {
    errors.push(`${name} parece una clave secreta; solo se permite la clave pública.`);
  }
}

// En Vercel la URL pública no puede apuntar a localhost.
if (
  process.env.VERCEL !== undefined &&
  /localhost/i.test(process.env.EXPO_PUBLIC_API_URL ?? '')
) {
  errors.push('EXPO_PUBLIC_API_URL apunta a localhost en Vercel.');
}

if (errors.length > 0) {
  console.error('Configuración inválida para el build web:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
