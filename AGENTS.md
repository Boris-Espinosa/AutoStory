# AGENTS.md

Reglas del proyecto AutoStory-app.

## Idioma y moneda

- Idioma de la interfaz y de los mensajes de error: español.
- Código y nombres de variables: inglés.
- Moneda: pesos chilenos (CLP), enteros sin decimales.

## Stack y reglas técnicas

- Backend: Node.js + Express + TypeScript + TypeORM + PostgreSQL. Validación de entrada con zod. No usamos NestJS ni class-validator ni SQLite.
- Frontend: Expo + TypeScript + Expo Router, debe funcionar en móvil y web.
- `docs/modelo-er.md` es la fuente de verdad del modelo de datos; no renombres ni elimines campos sin avisar.
- Roles en el código: `OWNER` y `GUEST` (interfaz: "Dueño" e "Invitado").
- Patentes: obligatorias, normalizadas (mayúsculas, sin espacios, puntos ni guiones) y no únicas.
- VIN: opcional, normalizado si existe, no único; 17 caracteres sin I, O, Q cuando existe.
- Las reglas de VIN y patente viven en `backend/src/vehicles/vin.ts` y `license-plate.ts`, y se copian idénticas a `frontend/src/utils/`; manténlas sincronizadas.
- Normalizar nunca debe borrar caracteres inválidos en silencio: se rechazan.
- Los campos de formulario filtran lo que se escribe y además validan.
- Nunca reveles si una patente o un VIN existe en el sistema a quien no sea miembro del vehículo.
- Los servicios externos (decodificador de VIN) siempre con tiempo límite, caché y fallback, y nunca bloquean un registro.
- Autenticación: Clerk. Un middleware (`src/auth`) verifica el token y deja el id del usuario en `req.auth.userId`; ningún otro archivo sabe cómo se autentica. El modo "dev-header" (cabecera `x-user-id`) solo existe fuera de producción y en los tests.
- Ninguna ruta del API es pública salvo GET /health y /uploads.
- La Secret key de Clerk solo vive en `backend/.env`; en el frontend solo `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- La identidad sale solo de `req.auth.userId` (token verificado).
- No uses `requireAuth()` de Clerk en rutas de API (redirige): usa `getAuth` y responde 401.
- El paquete de Clerk para Expo es `@clerk/expo` (no `@clerk/clerk-expo`) y el hook de inicio de sesión es `useSSO` (`useOAuth` está obsoleto).
- Las redirecciones tras iniciar sesión solo aceptan rutas internas.
- En Expo Go solo se prueba Google; Apple requiere un development build.
- El inicio de sesión se prueba con el development build, no con Expo Go.
- La URL de redirección de Clerk debe estar en la lista permitida del panel.
- Nunca imprimas claves ni tokens en los registros.
- Configuración por variables de entorno (`DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `CORS_ORIGIN`). Nunca escribas credenciales en el código y mantén un `.env.example` sin secretos.
- Las fotos se guardan en `backend/uploads/` (carpeta en `.gitignore`).
- Toda FK que apunte a Vehicle usa `ON DELETE CASCADE`, incluidas las de módulos futuros (Cita, Mantención).
- Los talleres son personales: nunca devuelvas talleres de otros usuarios.
- Las listas de mantenciones y repuestos se cargan sin consultas N+1.
- La fecha de una mantención no puede ser futura (zona America/Santiago).
- Ids de usuario del seed: `"user-1"` y `"user-2"`.
- Las fechas viajan como instantes ISO en UTC; la zona IANA se guarda aparte y solo se usa para mostrar.
- El reloj del backend se obtiene de `src/common/clock.ts`, nunca con `new Date()` directo en la lógica de citas.
- Los trabajos periódicos son idempotentes y seguros con varias instancias (`FOR UPDATE SKIP LOCKED` y restricciones únicas).
- Las notificaciones nunca incluyen datos de otros usuarios.

## Reglas de trabajo

- No instales dependencias que no sean necesarias y no modifiques archivos fuera del alcance de cada tarea.
- Los tests no usan temporizadores reales ni red real.
- Al terminar cada tarea ejecuta build y tests y reporta el resultado.
- El diseño de la interfaz sigue docs/ui-design.md.
- Usa los tokens de src/theme.ts; no escribas colores ni tamaños sueltos en las pantallas.
- Los rediseños cambian presentación y rutas, no la lógica ni la API.

## Reglas de exploración (ahorro de tokens)

- Lee solo los archivos que la tarea nombra o que importas directamente. Máximo 8 lecturas antes de empezar a escribir código.
- Nunca abras archivos minificados, bundles, .map, lockfiles ni carpetas completas de node_modules. De una librería, solo archivos .d.ts concretos, y solo si el prompt no trae un ejemplo.
- Limita toda salida de comandos (Select-Object -First 20, -TotalCount 60). No uses Get-Content -Raw ni Substring sobre archivos grandes.
- Máximo 2 búsquedas o descargas de documentación por tarea, y nunca referencias de API completas.
- Si no resuelves algo en 3 intentos, detente y pregúntame con el error exacto, en vez de seguir investigando.
- Si el prompt trae código de referencia, úsalo como base y no lo reverifiques.
