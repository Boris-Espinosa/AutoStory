# AutoStory - Backend

API REST de AutoStory construida con ExpressJS + TypeScript + PostgreSQL + TypeORM, con validación mediante zod.

## Requisitos

- Node.js 18 o superior.
- PostgreSQL disponible.

## Configuración

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` a `.env` y ajustar las credenciales de PostgreSQL.

3. Crear la base de datos indicada en `PGDATABASE` (por ejemplo `autostory`) y aplicar las migraciones:

   ```bash
   npm run migration:run
   ```

   El esquema no se sincroniza automáticamente (`synchronize: false`): cualquier cambio de tablas, columnas o índices requiere una migración nueva.

4. Ejecutar el seed:

   ```bash
   npm run seed
   ```

   El seed es idempotente y crea los usuarios `user-1` y `user-2` con cinco vehículos: hay registros independientes del mismo auto (misma patente y VIN) con dueños distintos, un vehículo sin VIN y un vehículo compartido como invitado. También crea mantenciones y repuestos de ejemplo.

5. Levantar la API:

   ```bash
   npm run dev
   ```

   La API queda disponible en `http://localhost:3000`.

## Scripts

| Script            | Descripción                              |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Inicia la API en modo desarrollo.        |
| `npm run build`   | Compila TypeScript a `dist/`.            |
| `npm start`       | Ejecuta la compilación de `dist/`.       |
| `npm run seed`    | Carga los datos de prueba.               |
| `npm run dev:adopt -- <origen> <clerkId> [--dry-run]` | Reasigna los datos de un usuario local a un id de Clerk (solo desarrollo). |
| `npm test`        | Ejecuta los tests unitarios con Jest.    |
| `npm run test:integration` | Tests de integración contra `TEST_DATABASE_URL`. |
| `npm run migration:run` | Aplica las migraciones pendientes. |
| `npm run typecheck` | Verifica tipos sin emitir archivos.    |

## Autenticación

Por defecto (`AUTH_MODE=clerk`) todas las rutas protegidas exigen un token de Clerk en `Authorization: Bearer <token>`. Si falta o no es válido, la API responde `401`. El middleware está en `src/auth/auth.middleware.ts` y es el único lugar que sabe cómo se autentica.

Fuera de producción, `AUTH_MODE=dev-header` permite autenticar con la cabecera `x-user-id` (solo para desarrollo y tests). Con `NODE_ENV=production` el servidor se niega a arrancar en ese modo.

Ejemplo:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/vehicles
```

## Endpoints

`GET /health` y `/uploads/*` son públicas. El resto de las rutas requiere autenticación.

| Método | Ruta                                   | Descripción                                                  |
| ------ | -------------------------------------- | ------------------------------------------------------------ |
| GET    | `/health`                              | Estado de la API (`{ "status": "ok" }`).                     |
| GET    | `/me`                                  | Perfil del usuario autenticado (`{ id, name, email, imageUrl }`). |
| POST   | `/parts`                               | Crea un repuesto. Responde `201` con el repuesto creado.     |
| POST   | `/vehicles`                            | Registra un vehículo. Responde `201` con el vehículo creado. |
| GET    | `/vehicles`                            | Lista los vehículos del usuario.                             |
| GET    | `/vehicles/vin/:vin/decode`            | Decodifica un VIN para autocompletar marca, modelo y año.    |
| GET    | `/vehicles/:vehicleId/parts`           | Lista los repuestos (`{ items, totalCost }`).                |
| GET    | `/vehicles/:vehicleId/expenses/summary`| Resumen de gastos en repuestos (`{ partsTotal, partsCount }`).|
| GET    | `/vehicles/:vehicleId/maintenances`    | Lista las mantenciones del vehículo.                         |

### Registrar un vehículo

```bash
curl -X POST http://localhost:3000/vehicles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "vin": "WVWZZZ6RZMY000001",
    "licensePlate": "BBJJ12",
    "brand": "Volkswagen",
    "model": "Polo",
    "year": 2021,
    "currentMileage": 32500
  }'
```

Reglas de negocio:

- La patente es obligatoria y se normaliza (mayúsculas, sin espacios, puntos ni guiones). No es única.
- El VIN es opcional. Si viene, se normaliza y debe tener 17 caracteres sin I, O ni Q; una cadena vacía se trata como ausencia. No es único y, una vez fijado, no cambia.
- El duplicado se evalúa solo entre los vehículos donde el usuario es `OWNER`: misma patente, o mismo VIN cuando viene. Si existe, responde `409` con `{ "message": "Ya tienes este vehículo registrado" }`.
- El vehículo de otro usuario no se detecta: dos usuarios pueden registrar la misma patente y VIN y ambos reciben `201` con ids distintos.

### Decodificar un VIN

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/vehicles/vin/WVWZZZ6RZMY000001/decode
```

```json
{
  "brand": "Volkswagen",
  "model": "Polo",
  "year": 2021,
  "status": "full"
}
```

- Consulta la API pública de NHTSA vPIC con un tiempo límite de 5 segundos y caché en memoria de 24 horas.
- `status` es `full` (marca, modelo y año), `partial` (solo algunos datos) o `none` (VIN no reconocido o servicio no disponible).
- La marca se normaliza contra `src/vehicles/brands.ts`; si no coincide, se devuelve `"Otra"`.
- No consulta ni informa si el VIN ya está registrado: solo autocompleta el formulario. Registrar un vehículo nunca depende de este endpoint.
- Límite: 20 consultas por minuto por usuario; al superarlo responde `429`.

### Crear un repuesto

```bash
curl -X POST http://localhost:3000/parts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "vehicleId": "11111111-1111-4111-8111-111111111111",
    "maintenanceId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "name": "Pastillas de freno",
    "category": "Frenos",
    "cost": 45990,
    "purchaseDate": "2026-10-15"
  }'
```

Reglas de negocio:

- El vehículo debe pertenecer al usuario autenticado; si no, responde `404`.
- Si se envía `maintenanceId`, la mantención debe pertenecer al mismo vehículo; si no, responde `400`.
- `cost` es un entero en pesos chilenos (CLP), sin decimales.
- `purchaseDate` debe tener formato ISO `YYYY-MM-DD`.

### Validación

Los esquemas zod se aplican con `validateBody` (`src/common/validation-pipe.ts`), que descarta las propiedades desconocidas (whitelist) y entrega mensajes de error en español. Los errores se normalizan de forma global en `src/common/error-handler.ts` con el formato:

```json
{
  "message": "Datos inválidos.",
  "errors": [{ "field": "cost", "message": "El costo es obligatorio." }]
}
```

## Estructura

```
src/
├── app.ts                 # createApp(): construye Express sin arrancarlo
├── server.ts              # Arranque del servidor
├── db/
│   └── data-source.ts     # DataSource de TypeORM y migraciones
├── seed.ts                # Datos de prueba
├── auth/                  # Autenticación con Clerk (o dev-header en tests)
├── common/                # HttpError, manejo de errores y validación
├── config/                # Variables de entorno validadas con zod
├── entities/              # Vehicle, Maintenance, Part
├── parts/                 # Módulo de repuestos
└── vehicles/              # Módulo de vehículos y mantenciones
```
