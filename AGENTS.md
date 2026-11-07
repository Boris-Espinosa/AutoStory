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
- Autenticación: un middleware (`src/auth`) deja el id del usuario en `req.auth.userId`. Hoy lee la cabecera `x-user-id` solo en desarrollo; más adelante se reemplaza por Clerk. Ningún otro archivo lee la cabecera ni sabe cómo se autentica.
- Configuración por variables de entorno (`DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `CORS_ORIGIN`). Nunca escribas credenciales en el código y mantén un `.env.example` sin secretos.
- Las fotos se guardan en `backend/uploads/` (carpeta en `.gitignore`).
- Toda FK que apunte a Vehicle usa `ON DELETE CASCADE`, incluidas las de módulos futuros (Cita, Mantención).
- Los talleres son personales: nunca devuelvas talleres de otros usuarios.
- Las listas de mantenciones y repuestos se cargan sin consultas N+1.
- La fecha de una mantención no puede ser futura (zona America/Santiago).
- Ids de usuario del seed: `"user-1"` y `"user-2"`.

## Reglas de trabajo

- No instales dependencias que no sean necesarias y no modifiques archivos fuera del alcance de cada tarea.
- Los tests no hacen llamadas de red reales.
- Al terminar cada tarea ejecuta build y tests y reporta el resultado.
- El diseño de la interfaz sigue docs/ui-design.md.
- Usa los tokens de src/theme.ts; no escribas colores ni tamaños sueltos en las pantallas.
- Los rediseños cambian presentación y rutas, no la lógica ni la API.
