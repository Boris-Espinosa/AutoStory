# AutoStory

AutoStory es una aplicación móvil y web para registrar vehículos y su información de mantención: patente y VIN, mantenciones, repuestos, citas, talleres y notificaciones. El backend es una API Express/TypeScript con PostgreSQL y el frontend usa Expo (React Native + web) con autenticación de Clerk.

## Demo

Demo web: https://autostory-frontend.vercel.app

El inicio de sesión se hace con Google o Apple mediante Clerk.

## Funcionalidades

- Registro, edición y eliminación de vehículos, con patente, VIN, marca, modelo, año y kilometraje.
- Decodificación de VIN mediante la API externa de NHTSA, con cache en memoria y límite de 20 consultas por minuto y usuario.
- Subida y borrado de la foto del vehículo; solo el dueño puede hacerlo. La foto se valida por su firma real y admite JPG, PNG y WEBP, con límite de 8 MB.
- Registro de mantenciones y repuestos, y resumen de gastos por vehículo.
- Citas: crear desde la ficha del vehículo, listar, editar, cancelar y completar.
- Talleres: listar y crear.
- Notificaciones: listar, consultar cantidad de no leídas y marcar como leídas.
- Recordatorios de citas: el backend procesa los vencimientos en un worker que se inicia con la API y aplica un cleanup periódico; los recordatorios pendientes se exponen en `/me/reminders` y la app móvil puede programar avisos locales con ellos.
- Eliminación de cuenta, con preview de lo que se borrará y confirmación explícita.
- Acceso a vehículos por membresía: roles `OWNER` y `GUEST`, con guards que comprueban la pertenencia o la propiedad antes de permitir la acción. El DUEÑO puede enviar y cancelar solicitudes de compartir y revocar invitados desde el modal «Compartir vehículo»; el receptor acepta o rechaza desde su notificación, y el INVITADO puede abandonar el vehículo. El DUEÑO no puede salir ni ser revocado.
- Inicio de sesión con Google o Apple a través de Clerk. En Expo Go, Apple no está disponible.

## Stack tecnológico

| Capa             | Tecnología                                                                   | Uso                                           |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| Backend          | Node.js `>=22`                                                               | Entorno de ejecución de la API                |
| Backend          | Express `^4.21.2`                                                            | Servidor HTTP y rutas                         |
| Backend          | TypeScript `^5.7.3`                                                          | Lenguaje del backend                          |
| Backend          | PostgreSQL (driver `pg` `^8.13.1`)                                           | Base de datos                                 |
| Backend          | TypeORM `^0.3.20`                                                            | Entidades, repositorios y migraciones         |
| Backend          | zod `^4.6.7`                                                                 | Validación de entrada y configuración         |
| Backend          | `@clerk/express` `^2.1.88`, `@clerk/backend` `^3.27.0`                       | Autenticación y cuenta de Clerk               |
| Backend          | `@aws-sdk/client-s3` `^3.1168.0`, `@aws-sdk/s3-request-presigner` `3.1168.0` | Almacenamiento y firma de URLs de fotos       |
| Backend          | `multer` `^2.5.0`, `express-rate-limit` `^8.7.3`                             | Subida de fotos, límites de VIN y solicitudes |
| Backend          | Jest `^29.7.0`                                                               | Pruebas unitarias y de integración            |
| Frontend         | Expo `~58.0.25`, expo-router `~58.0.31`                                      | App móvil y web, rutas                        |
| Frontend         | React `19.3.0`, React Native `0.88.1`, react-native-web `^0.21.4`            | Interfaz móvil y web                          |
| Frontend         | `@clerk/expo` `^4.15.1`                                                      | Inicio de sesión y token de sesión            |
| Frontend         | `@tanstack/react-query` `^5.105.3`                                           | Consultas a la API                            |
| Frontend         | `expo-notifications` `~58.1.9`                                               | Recordatorios locales en móvil                |
| Frontend         | zod `^4.6.7`                                                                 | Validación de formularios                     |
| Frontend         | TypeScript `~6.0.3`, ESLint `^9.0.0`                                         | Tipos y lint                                  |
| Servicio externo | API de decodificación VIN de NHTSA                                           | Datos de marca, modelo y año desde el VIN     |

La versión de Node proviene del campo `engines` del backend. El proyecto no fija una versión del servidor de PostgreSQL.

## Arquitectura

```mermaid
flowchart LR
    A[Frontend Expo: móvil y web] -->|HTTP /vehicles, /sharing-requests, /parts, /workshops, /appointments, /notifications, /me| B[API Express + TypeScript]
    B --> C[(PostgreSQL)]
    B --> D[Clerk]
    B --> E[Almacenamiento S3 / R2]
    B --> F[API de decodificación VIN de NHTSA]
    B --> G[Reminder worker]
    G --> C
```

Estructura de carpetas:

```text
backend/
├── src/                  # app.ts, server.ts y código por capas
│   ├── routes/           # definición de endpoints
│   ├── controllers/      # handlers HTTP
│   ├── services/         # lógica de negocio
│   ├── middlewares/      # autenticación, acceso a vehículos y fotos
│   ├── schemas/          # schemas zod
│   ├── entities/         # entidades de TypeORM
│   ├── migrations/       # schema migrations
│   ├── db/               # DataSource y ejecución de migraciones
│   ├── jobs/             # reminder worker
│   ├── storage/          # driver disk / s3
│   ├── config/           # configuración de entorno
│   ├── common/           # manejo de errores y utilidades HTTP
│   ├── utils/            # utilidades puras
│   ├── testing/          # pruebas unitarias y de integración
│   ├── scripts/          # seed y adopción de usuarios
│   └── types/            # tipados de Express
└── (jest.config.js, jest.integration.config.js, package.json, tsconfig*.json, .env.example)

frontend/
├── app/                  # rutas de Expo Router
│   ├── (auth)/           # sign-in y sso-callback
│   ├── (tabs)/           # inicio, cuenta, citas y notificaciones
│   ├── account/          # eliminación de cuenta
│   ├── appointments/     # detalle, edición y creación de citas
│   └── vehicles/         # detalle, mantenciones, repuestos y fotos
├── src/                  # código compartido
│   ├── api/              # cliente HTTP y llamadas a la API
│   ├── components/       # componentes de interfaz
│   ├── features/         # pantallas y lógica por funcionalidad
│   ├── hooks/            # hooks compartidos
│   ├── notifications/    # recordatorios locales
│   ├── utils/            # utilidades puras
│   └── theme.ts          # tema de interfaz
├── assets/brand/         # iconos y logo
└── (package.json, app.json, vercel.json, eas.json, .env.example)
```

## Requisitos previos

- Node.js `>=22`.
- PostgreSQL y una base de datos para la API.
- Una instancia de Clerk para el modo de autenticación `clerk`.
- Para fotos en producción, un bucket compatible con S3; en el proyecto se usa Cloudflare R2.
- Para la app móvil se usa Expo y el proyecto define un perfil de build de desarrollo en EAS. Los scripts `npm run android` y `npm run ios` requieren tener configurado el entorno de Expo y un emulador o dispositivo (no cubierto en este README).

## Ejecución local

Los ejemplos están en PowerShell. Todos los comandos parten de la raíz del repositorio.

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Boris-Espinosa/AutoStory.git
   cd AutoStory
   ```

2. Instalar dependencias en `backend/` y en `frontend/`.

   ```powershell
   cd backend
   npm install
   cd ../frontend
   npm install
   cd ..
   ```

3. Copiar los archivos de ejemplo a `.env` y completarlos con valores propios.

   ```powershell
   cd backend
   Copy-Item .env.example .env
   cd ../frontend
   Copy-Item .env.example .env
   cd ..
   ```

   En macOS/Linux/Git Bash, usa `cp .env.example .env` en cada carpeta.

4. Crear una base de datos PostgreSQL vacía y poner su URL en `DATABASE_URL` dentro de `backend/.env`. El proyecto **no usa** `synchronize`: está en `false` y el schema se crea con las migraciones del proyecto. Se pueden aplicar de forma explícita:

   ```powershell
   cd backend
   npm run migration:run
   cd ..
   ```

   El script `start:prod` también ejecuta las migraciones compiladas antes de arrancar la API.

5. Arrancar la API:

   ```powershell
   cd backend
   npm run dev
   ```

   El proceso queda ocupando esa terminal.

6. En otra terminal, desde la raíz del repositorio: arrancar el frontend en web (o en móvil con `npm run android` / `npm run ios`).

   ```powershell
   cd frontend
   npm run web
   ```

   La URL de la API del frontend se toma de `EXPO_PUBLIC_API_URL`.

Con Clerk, hacen falta `AUTH_MODE=clerk` con `CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` en el backend, y `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` en el frontend. Para probar solo la API fuera de producción, el backend admite `AUTH_MODE=dev-header` con la cabecera `x-user-id` (por ejemplo, con curl o Postman). El frontend siempre requiere `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, así que `dev-header` no permite usar la app sin Clerk.

## Variables de entorno

Los ejemplos son ficticios. Nunca pongas secretos en `EXPO_PUBLIC_*` ni en el repositorio.

### Backend (`backend/.env.example`)

| Variable                           | Dónde se usa                            | Descripción                                                                                    | Obligatoria                                              |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `NODE_ENV`                         | Configuración de entorno                | `development`, `test` o `production`                                                           | No (default `development`)                               |
| `PORT`                             | Arranque del servidor                   | Puerto HTTP                                                                                    | No (default `3000`)                                      |
| `DATABASE_URL`                     | DataSource de TypeORM                   | URL de PostgreSQL; se exige salvo en `NODE_ENV=test`                                           | Sí, salvo en tests                                       |
| `DATABASE_SSL`                     | Opciones SSL de la BD                   | `"true"` o `"false"`                                                                           | No (default `false`)                                     |
| `DATABASE_SSL_INSECURE`            | Opciones SSL de la BD                   | Desactiva la verificación del certificado; el ejemplo indica no usarla en producción           | No (default `false`)                                     |
| `DATABASE_POOL_MAX`                | Pool de conexiones                      | Máximo de conexiones                                                                           | No (default `10`)                                        |
| `TEST_DATABASE_URL`                | DataSource de tests                     | BD separada para integración; no puede igualar `DATABASE_URL` y su nombre debe contener `test` | Sí, para tests de integración                            |
| `CORS_ORIGIN`                      | Middleware CORS                         | Orígenes permitidos, separados por comas                                                       | Sí en producción; si no, default `http://localhost:8081` |
| `AUTH_MODE`                        | Middleware de autenticación             | `clerk` o `dev-header` (este último, solo fuera de producción)                                 | No (default `clerk`)                                     |
| `CLERK_PUBLISHABLE_KEY`            | Middleware de Clerk                     | Clave pública de Clerk                                                                         | Sí si `AUTH_MODE=clerk`                                  |
| `CLERK_SECRET_KEY`                 | Middleware de Clerk y borrado de cuenta | Clave secreta de Clerk                                                                         | Sí si `AUTH_MODE=clerk`                                  |
| `CLERK_AUTHORIZED_PARTIES`         | Middleware de Clerk                     | Orígenes autorizados, separados por comas                                                      | No                                                       |
| `REMINDER_WORKER_ENABLED`          | Reminder worker                         | Activa o desactiva el loop (`true`/`false`)                                                    | No (default `true`)                                      |
| `REMINDER_WORKER_INTERVAL_SECONDS` | Reminder worker                         | Intervalo del loop en segundos                                                                 | No (default `60`)                                        |
| `UPLOADS_DIR`                      | Servicio de almacenamiento              | Carpeta local de fotos en desarrollo/tests                                                     | No (default `backend/uploads`)                           |
| `STORAGE_DRIVER`                   | Servicio de almacenamiento              | `disk` o `s3`; `s3` es obligatorio en producción                                               | No (default `disk`)                                      |
| `S3_ENDPOINT`                      | Cliente S3                              | Endpoint del bucket                                                                            | Sí con `STORAGE_DRIVER=s3` en producción                 |
| `S3_REGION`                        | Cliente S3                              | Región del bucket (`auto` en R2)                                                               | Sí con `STORAGE_DRIVER=s3` en producción                 |
| `S3_BUCKET`                        | Cliente S3                              | Nombre del bucket                                                                              | Sí con `STORAGE_DRIVER=s3` en producción                 |
| `S3_ACCESS_KEY_ID`                 | Cliente S3                              | Credencial de acceso                                                                           | Sí con `STORAGE_DRIVER=s3` en producción                 |
| `S3_SECRET_ACCESS_KEY`             | Cliente S3                              | Credencial secreta                                                                             | Sí con `STORAGE_DRIVER=s3` en producción                 |

Ejemplo de configuración del backend (valores de prueba):

```dotenv
DATABASE_URL=postgres://usuario_ficticio:clave_ficticia@localhost:5432/autostory
TEST_DATABASE_URL=postgres://usuario_ficticio:clave_ficticia@localhost:5432/autostory_test
AUTH_MODE=clerk
CLERK_PUBLISHABLE_KEY=pk_test_ejemplo
CLERK_SECRET_KEY=sk_test_ejemplo
STORAGE_DRIVER=disk
```

### Frontend (`frontend/.env.example`)

| Variable                            | Dónde se usa                          | Descripción                                                               | Obligatoria                         |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| `EXPO_PUBLIC_API_URL`               | Cliente HTTP y verificación del build | URL base de la API; por defecto `http://localhost:3000` en desarrollo     | Sí en producción                    |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Provider de Clerk en el layout raíz   | Clave pública de Clerk del frontend                                       | Sí                                  |
| `VERCEL`                            | Verificación del build                | Se usa para detectar el build de Vercel y rechazar una API en `localhost` | No (la define el entorno de Vercel) |

Ejemplo de configuración del frontend:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ejemplo_publica
```

## Scripts útiles

Backend (ejecutar dentro de `backend/`):

| Comando                      | Qué hace                                               |
| ---------------------------- | ------------------------------------------------------ |
| `npm run dev`                | Arranca la API con `ts-node`                           |
| `npm run build`              | Compila con `tsc -p tsconfig.build.json`               |
| `npm run start`              | Ejecuta `dist/server.js`                               |
| `npm run start:prod`         | Ejecuta las migraciones compiladas y luego el servidor |
| `npm run migration:run`      | Aplica migraciones pendientes                          |
| `npm run migration:revert`   | Revierte la última migración                           |
| `npm run migration:generate` | Genera una migración a partir de cambios de entidades  |
| `npm run seed`               | Carga datos de ejemplo                                 |
| `npm run dev:adopt`          | Ejecuta el script de adopción de usuarios              |
| `npm run typecheck`          | Comprueba tipos sin emitir archivos                    |
| `npm test`                   | Pruebas unitarias                                      |
| `npm run test:integration`   | Pruebas de integración                                 |

Frontend (ejecutar dentro de `frontend/`):

| Comando           | Qué hace                     |
| ----------------- | ---------------------------- |
| `npm run start`   | Inicia Expo                  |
| `npm run web`     | Inicia Expo en web           |
| `npm run android` | Inicia Expo en Android       |
| `npm run ios`     | Inicia Expo en iOS           |
| `npm run lint`    | Ejecuta ESLint mediante Expo |

## Pruebas

Backend:

- `npm test` ejecuta los archivos `*.test.ts`, excluyendo los de integración. El entorno de pruebas fija `AUTH_MODE=dev-header` y `STORAGE_DRIVER=disk`. Hoy son 16 suites y 182 tests, todos en verde.
- `npm run test:integration` ejecuta los archivos `*.integration.test.ts` y, por tanto, necesita PostgreSQL: exige `TEST_DATABASE_URL`, distinta de `DATABASE_URL` y con `test` en el nombre de la base. El DataSource de tests usa `dropSchema: true` y `migrationsRun: true`, así que recrea el schema desde las migraciones. Hay 13 suites y 203 tests.

Frontend:

- `npm run lint`.
- Comprobación de tipos con `npx tsc --noEmit`. No es un script de `package.json`.
- El build de Vercel ejecuta `node scripts/check-env.mjs && npx expo export -p web`.

## Despliegue

- Frontend web: la configuración de Vercel define `buildCommand: node scripts/check-env.mjs && npx expo export -p web`, `outputDirectory: dist` y reenvía todas las rutas a `/`. La demo está en la sección Demo.
- Móvil: el perfil de build `development` define `developmentClient`, distribución `internal` y APK de Android. El scheme de la app es `autostory`.
- Backend (Render):
  - Build: `npm run build`.
  - Arranque: `npm run start:prod`, que ejecuta las migraciones compiladas antes de iniciar la API.
  - Variables mínimas: las de la tabla de variables de entorno, en particular `NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGIN`, `CLERK_*`, `STORAGE_DRIVER=s3` y las `S3_*`.
  - Fotos: bucket privado compatible con S3 (Cloudflare R2).
  - API desplegada: https://autostory-ym5q.onrender.com

## Seguridad y decisiones técnicas

- El modo `clerk` obtiene la identidad del token verificado y crea/actualiza el usuario local; el modo `dev-header` usa la cabecera `x-user-id` y está prohibido en producción.
- El cliente solicita un token nuevo en cada petición, envía `Authorization: Bearer <token>` y, ante un 401, pide uno fresco saltando el cache y reintenta una sola vez. Los reintentos por fallo de red se limitan a GET y HEAD.
- La autorización por vehículo comprueba la membresía (`OWNER`/`GUEST`) y exige propiedad para editar o borrar el vehículo y su foto. La subida de la foto va después del owner guard, para que un usuario sin permiso no escriba archivos.
- Las entradas externas se validan con schemas zod antes de usarse.
- Con el driver `s3`, las fotos se guardan en un bucket privado y se entregan mediante signed URLs de lectura. No hay URL pública del bucket.
- El schema de la base de datos se gestiona solo con migraciones (`synchronize: false`).
- Las claves S3 y `CLERK_SECRET_KEY` se mantienen en el backend; `EXPO_PUBLIC_*` solo contiene valores públicos.

## Origen del proyecto

Comencé este proyecto como un trabajo de la Universidad del Bío-Bío, Concepción, para la asignatura Modelamiento de Procesos e Información.

## Autor y licencia

Autor: Boris Espinosa.

Licencia: ISC. El texto completo está en [LICENSE](./LICENSE).
