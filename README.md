# AutoStory

Aplicación móvil y web para registrar vehículos y su información de mantención: patente y VIN, mantenciones, repuestos, citas, talleres y notificaciones (`frontend/app.json:3-4`, `backend/package.json:8`, `backend/src/entities/Vehicle.ts:21-57`, `backend/src/routes/vehicles.routes.ts:84-182`). El backend es una API Express/TypeScript con PostgreSQL y el frontend usa Expo (React Native + web) con autenticación de Clerk (`backend/package.json:8,27-37`, `frontend/package.json:4,6,11,31`).

Demo del frontend: https://autostory-frontend.vercel.app

## Origen del proyecto

El proyecto comenzó como un trabajo de la Universidad del Bío-Bío, Concepción, para la asignatura Modelamiento de Procesos e Información. Fue creado por Boris Espinosa.

## Demo y capturas

Demo web: https://autostory-frontend.vercel.app

Las capturas están en `frontend/public/capturas/` (los nombres de archivo indican la pantalla mostrada):

<img src="frontend/public/capturas/autostory-sign-in.png" alt="Inicio de sesión" width="600">

<img src="frontend/public/capturas/autostory-vehiculos.png" alt="Listado de vehículos" width="600">

<img src="frontend/public/capturas/autostory-_vehicles_new.png" alt="Formulario de nuevo vehículo" width="600">

<img src="frontend/public/capturas/autostory-vehiculo-resumen.png" alt="Resumen del vehículo" width="600">

<img src="frontend/public/capturas/autostory-appointments.png" alt="Citas" width="600">

<img src="frontend/public/capturas/autostory-notifications.png" alt="Notificaciones" width="600">

## Funcionalidades

- Registro, edición y eliminación de vehículos, con patente, VIN, marca, modelo, año y kilometraje (`backend/src/routes/vehicles.routes.ts:84-90,155-166`, `backend/src/entities/Vehicle.ts:26-57`).
- Decodificación de VIN mediante la API externa de NHTSA, con caché en memoria y límite de 20 consultas por minuto y usuario (`backend/src/services/vin-decoder.service.ts:4-8,61-86`, `backend/src/routes/vehicles.routes.ts:68-96`).
- Subida y borrado de la foto del vehículo; solo el dueño puede hacerlo (`backend/src/routes/vehicles.routes.ts:170-182`, `backend/src/services/vehicle-access.service.ts:32-40`). La foto se valida por su firma real y admite JPG, PNG y WEBP, con límite de 8 MB (`backend/src/middlewares/photo-upload.ts:13,32,92-132`).
- Registro de mantenciones y repuestos, y resumen de gastos por vehículo (`backend/src/routes/vehicles.routes.ts:104-140`, `backend/src/routes/parts.routes.ts:18-22`).
- Citas: crear desde la ficha del vehículo, listar, editar, cancelar y completar (`backend/src/routes/vehicles.routes.ts:142-153`, `backend/src/routes/appointments.routes.ts:25-43`, `backend/src/entities/Appointment.ts:15-19`).
- Talleres: listar y crear (`backend/src/routes/workshops.routes.ts:19-25`).
- Notificaciones: listar, consultar cantidad de no leídas y marcar como leídas (`backend/src/routes/notifications.routes.ts:19-25`).
- Recordatorios de citas: el backend procesa los vencimientos en un trabajador que se inicia con la API y aplica una limpieza periódica (`backend/src/jobs/reminder-worker.ts:24-30,157-230,263-305`, `backend/src/server.ts:17`); los recordatorios pendientes se exponen en `/me/reminders` (`backend/src/routes/me.routes.ts:35`) y la app móvil puede programar avisos locales con ellos (`frontend/src/notifications/local.ts:64-111`, `frontend/src/notifications/setup.ts:14-15`).
- Eliminación de cuenta, con vista previa de lo que se borrará y confirmación explícita (`backend/src/routes/me.routes.ts:27-33`, `backend/src/services/account-deletion.service.ts:21-32`, `frontend/src/features/account/api/me.ts:41-45`).
- Acceso a vehículos por membresía: roles `OWNER` y `GUEST`, con guardias que comprueban la pertenencia o la propiedad antes de permitir la acción (`backend/src/entities/UserVehicle.ts:13-22`, `backend/src/services/vehicle-access.service.ts:22-40`, `backend/src/middlewares/vehicle-access.middleware.ts:5-20`).
- Inicio de sesión con Google o Apple a través de Clerk (`frontend/src/features/auth/screens/SignInScreen.tsx:52,209-224`, `frontend/app.json:34-39`). En Expo Go, Apple no está disponible (`frontend/src/features/auth/screens/SignInScreen.tsx:119-120`).

La entidad y la tabla de solicitudes de compartir vehículo existen (`backend/src/entities/SharingRequest.ts:19-49`, `backend/src/migrations/1767225600000-InitialSchema.ts:79-106`), pero no hay rutas en el backend ni pantallas en el frontend para crear o responder esas solicitudes. Por el momento se documenta solo como modelo de datos.

## Stack tecnológico

| Capa | Tecnología | Uso | Fuente de la versión |
|---|---|---|---|
| Backend | Node.js `>=22` | Entorno de ejecución de la API | `backend/package.json:5-7` (`engines`) |
| Backend | Express `^4.21.2` | Servidor HTTP y rutas | `backend/package.json:31` |
| Backend | TypeScript `^5.7.3` | Lenguaje del backend | `backend/package.json:48` |
| Backend | PostgreSQL (driver `pg` `^8.13.1`) | Base de datos | `backend/package.json:34`, `backend/src/db/data-source.ts:53` |
| Backend | TypeORM `^0.3.20` | Entidades, repositorios y migraciones | `backend/package.json:36`, `backend/src/db/data-source.ts:35-42` |
| Backend | zod `^4.6.7` | Validación de entrada y configuración | `backend/package.json:37`, `backend/src/config/env.ts:3,24-59` |
| Backend | `@clerk/express` `^2.1.88`, `@clerk/backend` `^3.27.0` | Autenticación y cuenta de Clerk | `backend/package.json:27-28` |
| Backend | `@aws-sdk/client-s3` `^3.1168.0`, `@aws-sdk/s3-request-presigner` `3.1168.0` | Almacenamiento y firma de URLs de fotos | `backend/package.json:25-26`, `backend/src/storage/storage.service.ts:4-10` |
| Backend | `multer` `^2.5.0`, `express-rate-limit` `^8.7.3` | Subida de fotos y límite de consultas VIN | `backend/package.json:32-33` |
| Backend | Jest `^29.7.0` | Pruebas unitarias y de integración | `backend/package.json:45`, `backend/jest.config.js:1-10` |
| Frontend | Expo `~58.0.25`, expo-router `~58.0.31` | App móvil y web, rutas | `frontend/package.json:11,21`, `frontend/app/_layout.tsx:1` |
| Frontend | React `19.3.0`, React Native `0.88.1`, react-native-web `^0.21.4` | Interfaz móvil y web | `frontend/package.json:25,28,31` |
| Frontend | `@clerk/expo` `^4.15.1` | Inicio de sesión y token de sesión | `frontend/package.json:6`, `frontend/app/_layout.tsx:1` |
| Frontend | `@tanstack/react-query` `^5.105.3` | Consultas a la API | `frontend/package.json:10`, `frontend/app/_layout.tsx:3` |
| Frontend | `expo-notifications` `~58.1.9` | Recordatorios locales en móvil | `frontend/package.json:20`, `frontend/src/notifications/local.ts:3` |
| Frontend | zod `^4.6.7` | Validación de formularios | `frontend/package.json:32` |
| Frontend | TypeScript `~6.0.3`, ESLint `^9.0.0` | Tipos y lint | `frontend/package.json:36,38` |
| Servicio externo | API de decodificación VIN de NHTSA | Datos de marca, modelo y año desde el VIN | `backend/src/services/vin-decoder.service.ts:4-5` |

No se declara una versión del servidor de PostgreSQL en el repositorio. La versión de Node proviene del campo `engines` del backend; no hay `.nvmrc`.

## Arquitectura

```mermaid
flowchart LR
    A[Frontend Expo: móvil y web] -->|HTTP /vehicles, /parts, /workshops, /appointments, /notifications, /me| B[API Express + TypeScript]
    B --> C[(PostgreSQL)]
    B --> D[Clerk]
    B --> E[Almacenamiento S3 / R2]
    B --> F[API de decodificación VIN de NHTSA]
    B --> G[Trabajador de recordatorios]
    G --> C
```

Fuentes del diagrama: `frontend/src/api/client.ts:2-4`, `backend/src/app.ts:129-177,207-234`, `backend/src/db/data-source.ts:52-63`, `backend/src/storage/storage.service.ts:74-110`, `backend/src/services/vin-decoder.service.ts:4-5`, `backend/src/jobs/reminder-worker.ts:263-305`.

Estructura de carpetas:

```text
backend/
├── src/                  # app.ts, server.ts y código por capas
│   ├── routes/           # definición de endpoints
│   ├── controllers/      # handlers HTTP
│   ├── services/         # lógica de negocio
│   ├── middlewares/      # autenticación, acceso a vehículos y fotos
│   ├── schemas/          # esquemas zod
│   ├── entities/         # entidades de TypeORM
│   ├── migrations/       # migraciones de esquema
│   ├── db/               # DataSource y ejecución de migraciones
│   ├── jobs/             # trabajador de recordatorios
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
└── (package.json, app.json, vercel.json, eas.json, .env.example, LICENSE)
```

Fuente de la estructura: `git ls-files`. `frontend/docs/` y `backend/docs/` no están versionados.

## Requisitos previos

- Node.js `>=22` (`backend/package.json:5-7`).
- PostgreSQL y una base de datos para la API (`backend/.env.example:7-8`, `backend/src/db/data-source.ts:53`).
- Una instancia de Clerk para el modo de autenticación `clerk` (`backend/.env.example:26-34`).
- Para fotos en producción, un bucket compatible con S3; el repositorio documenta Cloudflare R2 (`docs/despliegue.md:1-13`).
- Para la app móvil, Expo; el proyecto define un perfil de build de desarrollo en EAS (`frontend/eas.json:5-13`). Los scripts `npm run android` y `npm run ios` se ejecutan con el entorno de Expo ya instalado (`frontend/package.json:42-43`). El repositorio no fija una versión mínima de npm ni instrucciones de Android Studio o Xcode, así que no se especifican aquí.

## Ejecución local

Los comandos se ejecutan desde PowerShell, en la carpeta correspondiente.

1. Instalar dependencias en `backend/` y en `frontend/` (`backend/package-lock.json`, `frontend/package-lock.json`).

   ```powershell
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

2. Copiar los archivos de ejemplo a `.env` y completarlos con valores propios; no se incluyen valores reales en este README (`backend/.env.example:1-52`, `frontend/.env.example:1-5`).

   ```powershell
   cd ../backend
   Copy-Item .env.example .env
   cd ../frontend
   Copy-Item .env.example .env
   ```

3. Crear el esquema de la base de datos. El proyecto **no usa** `synchronize`: está en `false` (`backend/src/db/data-source.ts:58-59`) y hay seis migraciones registradas (`:35-42`). Se pueden aplicar de forma explícita:

   ```powershell
   cd backend
   npm run migration:run
   ```

   El script `start:prod` también ejecuta las migraciones compiladas antes de arrancar la API (`backend/package.json:14`, `backend/src/db/run-migrations.ts:5-17`).

4. Arrancar la API:

   ```powershell
   cd backend
   npm run dev
   ```

5. Arrancar el frontend en web (o en móvil con `npm run android` / `npm run ios`):

   ```powershell
   cd frontend
   npm run web
   ```

   La URL de la API del frontend se toma de `EXPO_PUBLIC_API_URL` (`frontend/src/api/client.ts:2-4`).

Si se usa Clerk en local, hacen falta `AUTH_MODE=clerk` con `CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` en el backend, y `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` en el frontend (`backend/.env.example:26-34`, `frontend/.env.example:4-5`). La configuración de los orígenes y las URLs de redirección para el inicio de sesión se describe en `docs/clerk-expo-go.md`. Como alternativa fuera de producción, el backend admite `AUTH_MODE=dev-header` con la cabecera `x-user-id` (`backend/src/config/env.ts:99-106`, `backend/src/middlewares/auth.middleware.ts:28-50`).

## Variables de entorno

Los ejemplos son ficticios. Nunca pongas secretos en `EXPO_PUBLIC_*` ni en el repositorio (`frontend/.env.example:4`, `backend/.env.example:29-34`).

### Backend (`backend/.env.example`)

| Variable | Dónde se usa | Descripción | Obligatoria | Fuente |
|---|---|---|---|---|
| `NODE_ENV` | Configuración de entorno | `development`, `test` o `production` | No (default `development`) | `backend/.env.example:1-2`, `backend/src/config/env.ts:26-28` |
| `PORT` | Arranque del servidor | Puerto HTTP | No (default `3000`) | `backend/.env.example:4-5`, `backend/src/config/env.ts:29` |
| `DATABASE_URL` | DataSource de TypeORM | URL de PostgreSQL; se exige salvo en `NODE_ENV=test` | Sí, salvo en tests | `backend/.env.example:7-8`, `backend/src/config/env.ts:31-34,156-164` |
| `DATABASE_SSL` | Opciones SSL de la BD | `"true"` o `"false"` | No (default `false`) | `backend/.env.example:10-11`, `backend/src/config/env.ts:35` |
| `DATABASE_SSL_INSECURE` | Opciones SSL de la BD | Desactiva la verificación del certificado; el ejemplo indica no usarla en producción | No (default `false`) | `backend/.env.example:13-15`, `backend/src/config/env.ts:36` |
| `DATABASE_POOL_MAX` | Pool de conexiones | Máximo de conexiones | No (default `10`) | `backend/.env.example:17-18`, `backend/src/config/env.ts:37` |
| `TEST_DATABASE_URL` | DataSource de tests | BD separada para integración; no puede igualar `DATABASE_URL` y su nombre debe contener `test` | Sí, para tests de integración | `backend/.env.example:20-21`, `backend/src/testing/test-data-source.ts:7-30` |
| `CORS_ORIGIN` | Middleware CORS | Orígenes permitidos, separados por comas | Sí en producción; si no, default `http://localhost:8081` | `backend/.env.example:23-24`, `backend/src/config/env.ts:64-70,179-181` |
| `AUTH_MODE` | Middleware de autenticación | `clerk` o `dev-header` (este último, solo fuera de producción) | No (default `clerk`) | `backend/.env.example:26-27`, `backend/src/config/env.ts:42,99-106` |
| `CLERK_PUBLISHABLE_KEY` | Middleware de Clerk | Clave pública de Clerk | Sí si `AUTH_MODE=clerk` | `backend/.env.example:29-31`, `backend/src/config/env.ts:43,108-123` |
| `CLERK_SECRET_KEY` | Middleware de Clerk y borrado de cuenta | Clave secreta de Clerk | Sí si `AUTH_MODE=clerk` | `backend/.env.example:29-31`, `backend/src/config/env.ts:44,108-123`, `backend/src/services/account-deletion.service.ts:26-31` |
| `CLERK_AUTHORIZED_PARTIES` | Middleware de Clerk | Orígenes autorizados, separados por comas | No | `backend/.env.example:33-34`, `backend/src/config/env.ts:45,182` |
| `REMINDER_WORKER_ENABLED` | Trabajador de recordatorios | Activa o desactiva el bucle (`true`/`false`) | No (default `true`) | `backend/.env.example:36-38`, `backend/src/config/env.ts:46,198-201` |
| `REMINDER_WORKER_INTERVAL_SECONDS` | Trabajador de recordatorios | Intervalo del bucle en segundos | No (default `60`) | `backend/.env.example:36-38`, `backend/src/config/env.ts:47-51` |
| `UPLOADS_DIR` | Servicio de almacenamiento | Carpeta local de fotos en desarrollo/tests | No (default `backend/uploads`) | `backend/.env.example:40-42`, `backend/src/config/env.ts:52,207-209` |
| `STORAGE_DRIVER` | Servicio de almacenamiento | `disk` o `s3`; `s3` es obligatorio en producción | No (default `disk`) | `backend/.env.example:44-46`, `backend/src/config/env.ts:53,125-132` |
| `S3_ENDPOINT` | Cliente S3 | Endpoint del bucket | Sí con `STORAGE_DRIVER=s3` en producción | `backend/.env.example:47-49`, `backend/src/config/env.ts:54,134-152` |
| `S3_REGION` | Cliente S3 | Región del bucket (`auto` en R2) | Sí con `STORAGE_DRIVER=s3` en producción | `backend/.env.example:47-50`, `backend/src/config/env.ts:55,134-152` |
| `S3_BUCKET` | Cliente S3 | Nombre del bucket | Sí con `STORAGE_DRIVER=s3` en producción | `backend/.env.example:47-50`, `backend/src/config/env.ts:56,134-152` |
| `S3_ACCESS_KEY_ID` | Cliente S3 | Credencial de acceso | Sí con `STORAGE_DRIVER=s3` en producción | `backend/.env.example:47-52`, `backend/src/config/env.ts:57,134-152` |
| `S3_SECRET_ACCESS_KEY` | Cliente S3 | Credencial secreta | Sí con `STORAGE_DRIVER=s3` en producción | `backend/.env.example:47-52`, `backend/src/config/env.ts:58,134-152` |

Ejemplo ficticio de backend (valores inventados, no usar en producción):

```dotenv
DATABASE_URL=postgres://usuario_ficticio:clave_ficticia@localhost:5432/autostory
TEST_DATABASE_URL=postgres://usuario_ficticio:clave_ficticia@localhost:5432/autostory_test
AUTH_MODE=clerk
CLERK_PUBLISHABLE_KEY=pk_test_ejemplo
CLERK_SECRET_KEY=sk_test_ejemplo
STORAGE_DRIVER=disk
```

### Frontend (`frontend/.env.example`)

| Variable | Dónde se usa | Descripción | Obligatoria | Fuente |
|---|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Cliente HTTP y verificación del build | URL base de la API; por defecto `http://localhost:3000` en desarrollo | Sí en producción | `frontend/.env.example:1-2`, `frontend/src/api/client.ts:2-6`, `frontend/scripts/check-env.mjs:4,22-25` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Provider de Clerk en el layout raíz | Clave pública de Clerk del frontend | Sí | `frontend/.env.example:4-5`, `frontend/app/_layout.tsx:51`, `frontend/scripts/check-env.mjs:4` |
| `VERCEL` | Verificación del build | Se usa para detectar el build de Vercel y rechazar una API en `localhost` | No (la define el entorno de Vercel) | `frontend/scripts/check-env.mjs:22-25` |

Ejemplo ficticio de frontend:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ejemplo_publica
```

## Scripts útiles

Backend (ejecutar dentro de `backend/`; `backend/package.json:10-23`):

| Comando | Qué hace | Fuente |
|---|---|---|
| `npm run dev` | Arranca la API con `ts-node` | `backend/package.json:11` |
| `npm run build` | Compila con `tsc -p tsconfig.build.json` | `backend/package.json:12` |
| `npm run start` | Ejecuta `dist/server.js` | `backend/package.json:13` |
| `npm run start:prod` | Ejecuta las migraciones compiladas y luego el servidor | `backend/package.json:14` |
| `npm run migration:run` | Aplica migraciones pendientes | `backend/package.json:17` |
| `npm run migration:revert` | Revierte la última migración | `backend/package.json:18` |
| `npm run migration:generate` | Genera una migración a partir de cambios de entidades | `backend/package.json:19` |
| `npm run seed` | Carga datos de ejemplo | `backend/package.json:15`, `backend/src/scripts/seed.ts` |
| `npm run dev:adopt` | Ejecuta el script de adopción de usuarios | `backend/package.json:16`, `backend/src/scripts/adopt-user.ts` |
| `npm run typecheck` | Comprueba tipos sin emitir archivos | `backend/package.json:22` |
| `npm test` | Pruebas unitarias | `backend/package.json:20`, `backend/jest.config.js:7-8` |
| `npm run test:integration` | Pruebas de integración | `backend/package.json:21`, `backend/jest.integration.config.js:7-9` |

Frontend (ejecutar dentro de `frontend/`; `frontend/package.json:40-46`):

| Comando | Qué hace | Fuente |
|---|---|---|
| `npm run start` | Inicia Expo | `frontend/package.json:41` |
| `npm run web` | Inicia Expo en web | `frontend/package.json:44` |
| `npm run android` | Inicia Expo en Android | `frontend/package.json:42` |
| `npm run ios` | Inicia Expo en iOS | `frontend/package.json:43` |
| `npm run lint` | Ejecuta ESLint mediante Expo | `frontend/package.json:45` |

No hay scripts en la raíz del repositorio: no existe un `package.json` en ella.

## Pruebas

Backend:

- `npm test` ejecuta los archivos `*.test.ts`, excluyendo los de integración (`backend/jest.config.js:7-8`). El entorno de pruebas fija `AUTH_MODE=dev-header` y `STORAGE_DRIVER=disk` (`backend/src/testing/setup-env.ts:3-8`).
- `npm run test:integration` ejecuta los archivos `*.integration.test.ts` (`backend/jest.integration.config.js:7-9`) y, por tanto, necesita PostgreSQL: exige `TEST_DATABASE_URL`, distinta de `DATABASE_URL` y con `test` en el nombre de la base (`backend/src/testing/test-data-source.ts:7-30`). El DataSource de tests usa `dropSchema: true` y `migrationsRun: true`, así que recrea el esquema desde las migraciones (`:41-51`). **No apuntes esta variable a una base de datos con datos reales.**

Frontend:

- `npm run lint` (`frontend/package.json:45`).
- Comprobación de tipos con `npx tsc --noEmit` (`frontend/tsconfig.json:1-7`). No es un script de `package.json`.
- El build de Vercel ejecuta `node scripts/check-env.mjs && npx expo export -p web` (`frontend/vercel.json:2`).

## Despliegue

- Frontend web: la configuración de Vercel define `buildCommand: node scripts/check-env.mjs && npx expo export -p web`, `outputDirectory: dist` y reenvía todas las rutas a `/` (`frontend/vercel.json:2-7`). La demo es: https://autostory-frontend.vercel.app
- Móvil: `frontend/eas.json:5-13` define un perfil de build `development` con `developmentClient`, distribución `internal` y APK de Android. El esquema de la app es `autostory` (`frontend/app.json:8`).
- Backend y fotos: la guía versionada `docs/despliegue.md` describe el bucket privado compatible con R2, las variables S3 y la comprobación de las URLs firmadas; también menciona Render como entorno donde configurar las variables de producción (`docs/despliegue.md:58-125`).

API desplegada: https://autostory-ym5q.onrender.com

## Seguridad y decisiones técnicas

- El modo `clerk` obtiene la identidad del token verificado y crea/actualiza el usuario local; el modo `dev-header` usa la cabecera `x-user-id` y está prohibido en producción (`backend/src/middlewares/auth.middleware.ts:19-70`, `backend/src/config/env.ts:99-106`).
- El cliente solicita un token nuevo en cada petición, envía `Authorization: Bearer <token>` y, ante un 401, pide uno fresco saltando la caché y reintenta una sola vez (`frontend/src/api/client.ts:206-237`). Los reintentos por fallo de red se limitan a GET y HEAD (`frontend/src/api/client.ts:149-159`).
- La autorización por vehículo comprueba la membresía (`OWNER`/`GUEST`) y exige propiedad para editar o borrar el vehículo y su foto (`backend/src/services/vehicle-access.service.ts:22-40`, `backend/src/routes/vehicles.routes.ts:155-182`). La subida de la foto va después de la guardia de dueño, para que un usuario sin permiso no escriba archivos (`backend/src/routes/vehicles.routes.ts:168-175`).
- Las entradas externas se validan con esquemas zod antes de usarse (`backend/src/common/validation-pipe.ts`, `backend/src/schemas/*.schema.ts`, `backend/src/config/env.ts:24-59`).
- Con el driver `s3`, las fotos se guardan en un bucket privado y se entregan mediante URLs de lectura firmadas: la firma se calcula en ventanas de 1800 segundos y `expiresIn` es de 5400 segundos (`backend/src/storage/storage.service.ts:19-22,166-188`, `docs/despliegue.md:47-56`). No hay URL pública del bucket (`docs/despliegue.md:50-52,71-72`).
- El esquema de la base de datos se gestiona solo con migraciones (`synchronize: false`) (`backend/src/db/data-source.ts:58-59`).
- Las claves S3 y `CLERK_SECRET_KEY` se mantienen en el backend; `EXPO_PUBLIC_*` solo contiene valores públicos (`backend/.env.example:29-31,47-52`, `frontend/.env.example:4`).

## Limitaciones conocidas

- No se encontraron rutas ni pantallas para crear o responder solicitudes de compartir vehículo, aunque la entidad y la tabla existen (`backend/src/entities/SharingRequest.ts:19-49`, `backend/src/migrations/1767225600000-InitialSchema.ts:79-106`).
- Apple no está disponible en Expo Go; requiere un development build y configuración de Apple en Clerk (`frontend/src/features/auth/screens/SignInScreen.tsx:119-120`, `docs/clerk-expo-go.md:119-122`).
- En web y en Expo Go no se usan los avisos locales; los recordatorios dependen del trabajador del backend y de las notificaciones de la app (`frontend/src/notifications/setup.ts:14-15`, `backend/src/jobs/reminder-worker.ts:263-305`).
- Con `NODE_ENV=production`, `STORAGE_DRIVER` debe ser `s3` y las fotos relativas antiguas (`/uploads/...`) ya no se sirven (`backend/src/config/env.ts:125-132`, `docs/despliegue.md:121-123`).
- `docs/despliegue.md:127-165` describe tres puntos a revisar antes de usar más de una instancia de la API: migraciones en el arranque, limitador de VIN en memoria y contador de fallos del trabajador en memoria.

<!-- TODO: añadir aquí otras limitaciones que conozcas y no estén en el código o en docs versionados -->

## Documentación adicional

- [Modelo entidad-relación](docs/modelo-er.md)
- [Despliegue de fotos en Cloudflare R2](docs/despliegue.md)
- [Inicio de sesión con Clerk en un development build](docs/clerk-expo-go.md)
- [Diseño de interfaz](docs/ui-design.md)
- [Auditoría de interfaz](docs/ui-audit.md)
- [Auditoría de refactor: vehículo multi-usuario](docs/refactor-audit.md)
- Casos de uso: [registrar vehículo](docs/caso-de-uso-registrar-vehiculo.md), [asignar mantención](docs/caso-de-uso-asignar-mantencion.md), [añadir repuestos](docs/caso-de-uso-anadir-repuestos.md), [programar citas](docs/caso-de-uso-programar-citas.md), [autenticación con Clerk](docs/caso-de-uso-autenticacion-clerk.md)

## Autor y licencia

Clonado del repositorio:

```powershell
git clone https://github.com/Boris-Espinosa/AutoStory.git
```

Fuente del comando: `git remote -v`.

Autor: Boris Espinosa (creador del proyecto).

Licencia: ISC, según lo declarado por el autor. El repositorio todavía no incluye un archivo `LICENSE` del proyecto; el único archivo versionado es `frontend/LICENSE:1-3`, que contiene la licencia MIT con copyright de "650 Industries, Inc. (aka Expo)" y corresponde a la plantilla de Expo.

<!-- TODO: crear el archivo LICENSE del proyecto con licencia ISC y elegir el titular del copyright -->
