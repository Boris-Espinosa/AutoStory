# Backend

## Stack
- Node.js (>=22) + Express + TypeScript estricto. Base de datos: PostgreSQL con TypeORM. Validación: zod.
- Auth: Clerk (`@clerk/express`/`@clerk/backend`); modo `dev-header` solo fuera de producción.

## Comandos
- Desarrollo: `npm run dev` · Build: `npm run build` · Tipos: `npm run typecheck`
- Tests: `npm test` · Integración: `npm run test:integration`
- Lint: no hay script `lint` configurado en `package.json`.

## Convenciones
- Estructura por capas en la raíz de `src/`: `routes/*.routes.ts` registra los endpoints y se monta en `src/app.ts`; `controllers/*.controller.ts` contiene solo handlers; la lógica va en `services/*.service.ts`.
- Dependencias en un solo sentido: `routes → controllers → services → utils/common/entities`; los middlewares pueden importar services. Un service nunca importa `routes`, `controllers` ni `middlewares`.
- Valida toda entrada externa (body, params, query) con zod (`src/common/validation-pipe.ts`, esquemas en `src/schemas/*.schema.ts`) antes de usarla.
- Errores: usa el manejador central (`src/common/error-handler.ts`, `src/common/http-error.ts`); códigos HTTP correctos (400 validación, 401/403 auth, 404, 409 conflicto).
- Consultas: usa TypeORM/repositorios y SQL crudo con parámetros (`$1`, etc.) para valores. Identificadores dinámicos solo desde metadatos internos con `quoteIdentifier`/nombres de columna (`src/services/user-adoption.service.ts`, `src/utils/part-cost.ts`), nunca desde entrada de usuario.
- Helpers puros (normalización, formato de texto, fecha) van en `src/utils/`; integraciones con I/O externo (por ejemplo `vin-decoder.service.ts`) van en `src/services/`. El storage se queda en `src/storage/`.
- Tests unitarios: `src/testing/unit/*.test.ts`. Tests de integración: `src/testing/integration/*.integration.test.ts`. Los helpers compartidos (`setup-env.ts`, `test-data-source.ts`, `vin.ts`) siguen en `src/testing/`.
- Variables de entorno: léelas solo desde `src/config/env.ts` y documenta las nuevas en `.env.example`.

## Cuidado
- Antes de cambiar una entidad o tabla, explícame el impacto sobre los datos existentes.

## Estructura objetivo
Árbol final de `src/` según `docs/refactor-plan.md`.

```
backend/src/
├── app.ts  server.ts  app.test.ts
├── routes/        vehicles, parts, appointments, notifications, me, workshops (.routes.ts)
├── controllers/   vehicles, parts, appointments, notifications, me, workshops (.controller.ts) → solo handlers
├── services/      vehicle-access, vehicles, vin-decoder (+test), appointments, maintenance,
│                  parts (+test), notifications, reminders, account-deletion,
│                  user-sync, user-adoption, workshop
├── middlewares/   auth.middleware.ts, vehicle-access.middleware.ts, photo-upload.ts
├── schemas/       vehicle (+test), part, maintenance, appointment, notification,
│                  account-deletion, reminders, workshop
├── utils/         vin (+test), license-plate (+test), brands, part-cost, iso-date,
│                  messages (+test)
├── jobs/          reminder-worker.ts, notify.ts
├── scripts/       seed.ts, adopt-user.ts
├── common/        async-handler, clock, error-handler, http-error, logger, validation-pipe
├── config/        env.ts, env.test.ts
├── db/            data-source.ts, run-migrations.ts
├── entities/      10 entidades (sin cambios de contenido)
├── migrations/    6 migraciones (sin cambios)
├── storage/       storage.service.ts (+test)
├── testing/       unit/ (9 *.test.ts), integration/ (12 *.integration.test.ts), setup-env.ts, test-data-source.ts, vin.ts
└── types/         express.d.ts
```

`backend/docs/` es la carpeta del plan de refactor; no forma parte de `src/`.
