# AutoStory-app

AutoStory se encarga de guardar y manejar el historial de los vehículos de los usuarios.

## Entorno

- Windows 11 con PowerShell. No uses sintaxis de bash (`export`, `rm -rf`, `$(...)`); usa comandos compatibles con PowerShell.
- Monorepo: `backend/` (API) y `frontend/` (app). Cada carpeta tiene su propio AGENTS.md.

## Forma de trabajar

- Cambios pequeños: un objetivo por tarea y pocos archivos tocados. Si la tarea es más grande, propón un plan por pasos y espera mi confirmación.
- Antes de escribir código, dime en 2-3 líneas qué vas a hacer y por qué.
- Después de cada cambio, explica brevemente las decisiones técnicas (soy estudiante retomando la programación).
- No agregues dependencias sin preguntarme. Si propones una, di para qué sirve y verifica que existe en npm.
- No inventes APIs, flags ni versiones: si no estás seguro, léelo en `node_modules` o en la documentación, o dímelo.
- Nunca leas ni modifiques archivos `.env`. Nada de secretos en el código.
- No toques migraciones ni el esquema de la base de datos sin avisarme antes.

## Verificación (cómo saber que terminaste)

- Backend (en `backend/`): tipos `npm run typecheck`. No hay script `lint` configurado.
- Frontend (en `frontend/`): linter `npm run lint` y tipos `npx tsc --noEmit`.
- Corre los comandos aplicables antes de decir que está listo y muéstrame el resultado.

## Git

- Commits pequeños en formato Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`).
- No hagas commit ni push: yo lo hago después de revisar el diff.
