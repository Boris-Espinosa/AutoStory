# Compartir vehículo — plan de implementación (8 pasos)

Plan autosuficiente: se ejecuta un paso por commit, en orden, sin consultar otras conversaciones. Estado real al redactarlo: **ningún paso ejecutado**; la rama `feat/compartir-vehiculo` solo contiene el commit de casos de uso y MER (`af5e179 docs: casos de uso y reglas de compartir vehículo`). Este documento se commité aparte con `docs: plan de implementación de compartir vehículo`, que no cuenta como paso.

Fuentes de verdad usadas: `docs/caso-de-uso-compartir-vehiculo.md`, `docs/caso-de-uso-responder-solicitud-compartir.md`, `docs/caso-de-uso-abandonar-vehiculo.md`, `docs/modelo-er.md` (R33–R39) y `backend/docs/refactor-plan.md` (formato de las 9 secciones).

## 1. Objetivo, restricciones y estructura objetivo

**Objetivo:** permitir que el DUEÑO envíe, liste y cancele solicitudes de compartir, revoque INVITADOS; que el receptor vea una solicitud limitada desde su notificación y la acepte o rechace; y que el INVITADO pueda abandonar el vehículo. Todo sin exponer patente, VIN, foto ni historial antes de aceptar (R35).

**Restricciones**

- Un objetivo por commit; mensajes `feat(paso N): <descripción corta>` salvo el paso 8, que es `docs(paso 8): ...`. El agente NO commitea ni hace push; el usuario revisa el diff y commitea. El plan solo propone mensajes.
- Sin dependencias nuevas, sin cambiar versiones, sin tocar `.env` ni `.env.example` (no hay variables nuevas).
- Sin ejecutar migraciones contra Neon. El usuario aplica las migraciones cuando decida; este plan solo las escribe.
- `npm run test:integration` solo contra `TEST_DATABASE_URL` (distinta de `DATABASE_URL`, con "test" en el nombre). Nunca contra la BD de Neon.
- Respetar R14: sin membresía → 404; con membresía sin el rol → 403; solicitud ajena → 404 aunque haya membresía.
- Respetar R2/R38: el DUEÑO nunca sale ni puede ser revocado (409 si se intenta por API).
- La identidad del usuario siempre sale de `req.auth.userId` (R28); nunca del body, query ni cabeceras del cliente.
- Sin rutas nuevas en `frontend/app/`: los modales viven en `src/features/` y se abren desde pantallas existentes.

**Alcance funcional (R33–R39)**

| Regla | Implementación |
| --- | --- |
| R33 | Búsqueda por email exacto sin distinguir mayúsculas ni espacios de borde; si no existe o no tiene email, no se crea nada y se devuelve el mismo mensaje neutral. |
| R34 | No enviar a uno mismo ni a miembro; máximo una PENDING por (vehículo, receptor) con índice único parcial; tope 10 PENDING por vehículo y 10 envíos/minuto por usuario. |
| R35 | Detalle limitado a marca, modelo, año y nombre del emisor; ajena → 404. |
| R36 | Aceptar en la misma transacción cambia el estado y crea el INVITADO; rechazar solo cambia el estado; responder algo que no es PENDING → 409; sin expiración automática. |
| R37 | El DUEÑO cancela una PENDING, que pasa a CANCELLED y permite reenviar. |
| R38 | El DUEÑO revoca y el INVITADO abandona; se conservan mantenciones, repuestos y citas. |
| R39 | Tres tipos de notificación, solo al centro de notificaciones (sin push); la notificación es el único punto de entrada del receptor. |

**Contrato API propuesto (9 endpoints nuevos + 1 modificado)**

| # | Método y ruta | Guard | Entrada | Respuesta | Errores |
| --- | --- | --- | --- | --- | --- |
| 1 | `POST /vehicles/:vehicleId/sharing-requests` | `auth` + `owner` | body `{ email }` (zod: string, trim, formato email, máx. 254) | `202 { message: "Si la persona tiene cuenta en AutoStory, recibirá la solicitud." }`, creada o no | 400 email inválido; 403/404 permisos; 409 uno mismo / ya miembro / PENDING previa / tope de 10; 429 tope de envíos |
| 2 | `GET /vehicles/:vehicleId/sharing-requests` | `auth` + `owner` | solo `:vehicleId` | `200 { items: [{ id, receiverEmail, sentAt, status: "PENDING" }] }` | 403/404 permisos |
| 3 | `PATCH /vehicles/:vehicleId/sharing-requests/:requestId/cancel` | `auth` + `owner` | `:requestId` UUID | `200 { id, status: "CANCELLED", respondedAt }` | 404 solicitud ajena al vehículo; 409 ya respondida/cancelada; 403/404 permisos |
| 4 | `GET /vehicles/:vehicleId/members` | `auth` + `owner` | solo `:vehicleId` | `200 { items: [{ userId, email, role: "GUEST", assignedAt }] }` (solo INVITADOS) | 403/404 permisos |
| 5 | `DELETE /vehicles/:vehicleId/members/:userId` | `auth` + `owner` | `:userId` | `204` | 409 si es el DUEÑO; 404 miembro inexistente; 403/404 permisos |
| 6 | `DELETE /vehicles/:vehicleId/members/me` | `auth` + `member` | solo `:vehicleId` | `204` | 409 si es el DUEÑO; 404 sin membresía |
| 7 | `GET /sharing-requests/:requestId` | `auth` + pertenencia al receptor | `:requestId` UUID | `200 { id, vehicle: { brand, model, year }, senderName, status, sentAt }` | 404 ajena; 409 si no está PENDING; 400 UUID inválido |
| 8 | `POST /sharing-requests/:requestId/accept` | `auth` + pertenencia al receptor | `:requestId` UUID | `200 { id, status: "ACCEPTED" }` | 404 ajena; 409 ya respondida/cancelada; 400 UUID inválido |
| 9 | `POST /sharing-requests/:requestId/reject` | `auth` + pertenencia al receptor | `:requestId` UUID | `200 { id, status: "REJECTED" }` | 404 ajena; 409 ya respondida/cancelada; 400 UUID inválido |
| M | `GET /notifications` (existente) | sin cambios | sin cambios | mismo cuerpo **más** `sharingRequestId: string \| null` en cada item | sin cambios |

Notas del contrato:

- El mensaje de la fila 1 es idéntico para correo inexistente, sin email y envío exitoso. Los errores 409/429 sí son explícitos porque no revelan si un correo está registrado (R33).
- `senderName` es `sender.name` o `"Un usuario de AutoStory"` si es nulo/vacío (R35). Nunca se serializan `licensePlate`, `vin`, `photoUrl`, mantenciones, repuestos ni citas en el detalle.
- Las filas 1–6 se registran en `src/routes/vehicles.routes.ts` (el router ya está montado en `/vehicles`); las filas 7–9 en un router nuevo montado en `/sharing-requests`.
- **Declarar `DELETE /:vehicleId/members/me` antes que `DELETE /:vehicleId/members/:userId`**: si no, Express interpreta `me` como `userId` y el DUEÑO recibiría 409 en vez de poder salir.
- El cambio M rompe la respuesta existente de forma compatible (campo nuevo nullable); es necesario porque hoy `NotificationView` no expone el id de la solicitud y el frontend no puede abrir el modal (R39).

**Estructura objetivo**

```
backend/
├── src/entities/
│   ├── SharingRequest.ts        + CANCELLED, + índice único parcial
│   └── Notification.ts          + 3 tipos, + columna sharing_request_id y FK
├── src/migrations/
│   ├── 1767225606000-SharingEnums.ts       (transaction = false, solo ALTER TYPE)
│   └── 1767225607000-SharingSupport.ts     (columna, FK, índice)
├── src/db/data-source.ts                    + 2 migraciones, + migrationsTransactionMode: 'each'
├── src/testing/test-data-source.ts          + migrationsTransactionMode: 'each'
├── src/schemas/sharing-request.schema.ts    (nuevo)
├── src/services/sharing-requests.service.ts (nuevo, todos los casos de compartir y membresía)
├── src/controllers/sharing-requests.controller.ts (nuevo, solo handlers)
├── src/routes/vehicles.routes.ts             + 6 rutas de solicitudes/miembros del dueño
├── src/routes/sharing-requests.routes.ts     (nuevo, 3 rutas del receptor)
├── src/app.ts                                + app.use('/sharing-requests', ...)
├── src/services/notifications.service.ts    + sharingRequestId en NotificationView y toView
├── src/jobs/notify.ts                        + sharingRequestId en NotificationInput
├── src/utils/messages.ts                     + textos de compartir (título ≤120, cuerpo ≤300)
├── src/testing/unit/sharing-requests.service.test.ts (nuevo)
└── src/testing/integration/sharing.integration.test.ts (nuevo)

frontend/
├── src/api/sharing.ts                        (nuevo: tipos, query keys, hooks, mutaciones)
├── src/api/notifications.ts                  + 3 tipos, + sharingRequestId
├── src/features/notifications/screens/NotificationsScreen.tsx
│                                             + TYPE_ICONS, abre modal de compartir
├── src/features/notifications/components/SharingRequestModal.tsx (nuevo)
├── src/components/ShareVehicleModal.tsx     (nuevo, modal del DUEÑO)
├── src/features/vehicles/screens/VehicleDetailScreen.tsx
│                                             + opciones del menú ⋮ para OWNER y GUEST
└── README.md                                 líneas 22 y 297
```

## 2. Decisiones tomadas

| Decisión | Justificación (una línea) |
| --- | --- |
| `SharingRequestStatus.CANCELLED` se añade al enum existente | R37 lo exige; la tabla `sharing_requests` ya existe, no hace falta crearla. |
| `ALTER TYPE ... ADD VALUE` en migración propia con `transaction = false` | PG 11 prohíbe ejecutarlo dentro de una transacción; PG 12+ lo permite pero el valor nuevo no es usable hasta el commit. Separarlo funciona en ambos. |
| `migrationsTransactionMode: 'each'` en ambos data sources | Con el modo `all` por defecto, TypeORM 0.3.31 lanza `ForbiddenTransactionModeOverrideError` al declarar `transaction = false` en una migración. |
| Columna, FK e índice en una segunda migración transaccional | Solo el `ALTER TYPE` necesita comportamiento especial; el resto se beneficia de rollback atómico. |
| Enviar búsqueda con `LOWER(TRIM(email)) = LOWER(TRIM($1))` y `email IS NOT NULL` | R33 exige ignorar mayúsculas y espacios de borde sin crear usuario ni normalizar correos existentes. |
| No tocar `normalizeEmail` de `user-sync.service.ts` | Hoy solo hace `trim`; cambiarlo reescribiría emails existentes y está fuera del alcance. |
| 0 o >1 coincidencias de email → respuesta 202 neutral | No se crea nada y no se revela qué correos están registrados (R33). |
| Duplicado PENDING → índice parcial y `23505` mapeado a 409 | La restricción la garantiza la BD aunque haya dos peticiones concurrentes. |
| Tope de 10 PENDING por vehículo con `pg_advisory_xact_lock(hashtext($1))` y `$1 = 'sharing:' + vehicleId` | Mismo patrón ya usado en `vehicles.service.ts`; el prefijo evita colisiones con otros locks del proceso y evita que dos envíos concurrentes rebasen el límite. |
| Rate limit de 10 envíos/minuto por usuario en memoria | `express-rate-limit` 8.7.3 ya está instalado; usar `limit` (no `max`) y `keyGenerator: (req) => req.auth.userId`, igual que el limiter de VIN. |
| Aceptar con `UPDATE ... WHERE id=$1 AND receiver_user_id=$2 AND status='PENDING'` y comprobar `affected === 1` | Es atómico y evita el viaje extra y el bloqueo de `SELECT ... FOR UPDATE`; la propia fila queda bloqueada hasta el commit. |
| `INSERT ... ON CONFLICT (user_id, vehicle_id) DO NOTHING` para la membresía | La aceptación es idempotente ante reintentos y no falla si ya existe la fila. |
| Notificaciones creadas con `createNotifications(manager, …)` dentro de la misma transacción | R39 y R36: si falla el cambio de estado, no queda un aviso huérfano. |
| Destinatarios explícitos, no `recipientsFor` | Esa helper es específica de citas (R22) y notificaría al dueño en vez del receptor/emisor correctos. |
| Sin push, solo centro de notificaciones | R39. |
| Permisos: 404 sin membresía, 403 con rol incorrecto, 404 para solicitud ajena | R14 y su excepción explícita. |
| Un solo `SharingRequestsService` para solicitudes y membresías | Revocar y abandonar son parte del mismo flujo; un tercer service añadiría archivos sin lógica nueva. |
| Un solo modal de notificación local, sin ruta en `app/` | La notificación es el único punto de entrada (R39) y `frontend/AGENTS.md` prohíbe crear helpers o carpetas nuevas en `app/`. |
| Invalidar `vehiclesQueryKey`, `notificationsQueryKey` y las query keys locales de compartir tras aceptar, rechazar, abandonar y revocar | El cambio de membresía altera la lista de vehículos, el centro de notificaciones y los modales abiertos. |
| Iconos: `person-add-outline`, `checkmark-circle-outline` y `close-circle-outline` | Verificados en `frontend/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json` (confirmado). |

**Hallazgos que el plan reporta y corrige explícitamente**

1. `GET /notifications` no devuelve `sharingRequestId`; se añade en el paso 2 (cambio M), junto con la primera notificación de compartir.
2. `backend/AGENTS.md` dice "10 entidades" pero hay 11 (`SharingRequest` ya existe); se corrige en el paso 8. También pasa de 6 a 7 migraciones tras el paso 1.
3. `README.md` líneas 22 y 297 dicen que compartir "aún no está implementado"; se actualizan en el paso 8.
4. No hay contradicción entre casos de uso y MER: ambos coinciden en estados, índice parcial, permisos y notificaciones.

**Dudas marcadas**

- **No verificado:** versión exacta de PostgreSQL en Neon y en la BD de tests. No se leyó `.env` ni se conectó a BD. El usuario debe ejecutar `SELECT version();` en ambas antes del paso 1. El plan no depende del resultado gracias al enfoque de dos migraciones.
- **Confirmado:** los iconos de los tres tipos nuevos existen en el glyph map indicado.
- **Confirmado:** `migrationsTransactionMode?: "all" | "none" | "each"` existe en `typeorm@0.3.31` (`node_modules/typeorm/data-source/BaseDataSourceOptions.d.ts`) y `ForbiddenTransactionModeOverrideError` existe en `node_modules/typeorm/error/`.
- **Confirmado:** la documentación oficial de PostgreSQL indica que PG 11 rechaza `ALTER TYPE ... ADD VALUE` dentro de transacción y que PG 12+ no permite usar el valor nuevo hasta el commit.
- **Confirmado:** `recipientsFor` es de citas; `createNotifications` inserta en la transacción recibida; `cleanupExpiredData` borra notificaciones con más de 90 días.

## 3. Estado base y comando de verificación V

**Estado base medido al redactar este plan**

| Comando | Resultado |
| --- | --- |
| Backend `npm run typecheck` | OK, sin salida |
| Backend `npm test` | 15 suites, 154 tests, todos pasan |
| Backend `npx jest --listTests` | 15 suites unitarias en `src/testing/unit/` |
| Backend `npm run test:integration` | **No ejecutado**: requiere `TEST_DATABASE_URL` aparte. No hay número base verificado en esta sesión; no ejecutar contra Neon. |
| Backend linter | N/A: no hay script `lint` en `backend/package.json` |
| Frontend `npx tsc --noEmit` | OK, sin salida |
| Frontend `npm run lint` | 5 errores y 8 warnings preexistentes, exit code 1. Comparar por total y regla, nunca por ruta ni línea. |
| Frontend `npx expo export --platform web` | No ejecutado al redactar; forma parte de V en los pasos 5–8. |

**V = verificación estándar al final de cada paso.**

Backend (pasos 1–4):

```
Set-Location 'C:\Users\Boris Espinosa\AutoStory-app\backend'
npm run typecheck
npm test
```

Frontend (pasos 5–8), además de V backend cuando el paso toque ambos:

```
Set-Location 'C:\Users\Boris Espinosa\AutoStory-app\frontend'
npx tsc --noEmit
npm run lint
$out = Join-Path $env:TEMP 'autostory-web-export'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
npx expo export --platform web --output-dir $out
Remove-Item -Recurse -Force $out
```

Criterio de aceptación del lint: seguir en **5 errores y 8 warnings**, sin reglas nuevas. El exit code 1 es la línea base, no un fallo del paso.

**PRERREQUISITO (sin commit), antes del paso 1:** el usuario confirma la versión de PostgreSQL con `SELECT version();` en Neon y en la BD de tests, y ejecuta la integración solo contra la BD de tests:

```
Set-Location 'C:\Users\Boris Espinosa\AutoStory-app\backend'
npx jest --config jest.integration.config.js --listTests
npm run test:integration
```

Debe dar 12 suites. Si `TEST_DATABASE_URL` no está definida, es igual a `DATABASE_URL` o su nombre no contiene "test", `createTestDataSource()` falla por diseño: no cambiar esa validación.

**Regla de migración (paso 1):** no ejecutar `npm run migration:*` contra Neon. `1767225606000-SharingEnums.ts` declara `transaction = false` y contiene **solo** los `ALTER TYPE`; `1767225607000-SharingSupport.ts` es transaccional y contiene columna, FK e índice. El orden de registro en `MIGRATIONS` es enums → soporte; el `down` se ejecuta en orden inverso (primero soporte, luego enums).

**Alternativa documentada, no aplicar sin decidir:** si PostgreSQL es 12 o superior en Neon y en la BD de tests, evaluar una sola migración transaccional y NO cambiar `migrationsTransactionMode`; decidir tras el `SELECT version()`. El diseño de dos migraciones descrito arriba se mantiene por defecto porque funciona en cualquier versión.

## 4. Tabla de cambios por archivo

| Archivo | Paso | Cambio concreto |
| --- | --- | --- |
| `backend/src/entities/SharingRequest.ts` | 1 | `CANCELLED` en `SharingRequestStatus` e `@Index('UQ_sharing_requests_pending', ['vehicleId','receiverUserId'], { unique: true, where: '"status" = \'PENDING\'' })` |
| `backend/src/entities/Notification.ts` | 1 | 3 valores en `NotificationType`; columna `sharingRequestId` (`sharing_request_id`, uuid, nullable) con `@ManyToOne(() => SharingRequest, { onDelete: 'CASCADE' })` |
| `backend/src/migrations/1767225606000-SharingEnums.ts` | 1 | Nuevo; `transaction = false`; `ALTER TYPE "sharing_request_status" ADD VALUE 'CANCELLED'` y 3 `ALTER TYPE "notification_type" ADD VALUE ...`. `down` reconstruye ambos tipos con `USING` y mapa explícito; pérdida semántica documentada en el archivo |
| `backend/src/migrations/1767225607000-SharingSupport.ts` | 1 | Nuevo; `ALTER TABLE "notifications" ADD COLUMN "sharing_request_id" uuid NULL`, FK `ON DELETE CASCADE`, `CREATE UNIQUE INDEX "UQ_sharing_requests_pending" ... WHERE "status" = 'PENDING'`. `down` revierte en orden inverso |
| `backend/src/db/data-source.ts` | 1 | Añadir las 2 migraciones a `MIGRATIONS` y `migrationsTransactionMode: 'each'` |
| `backend/src/testing/test-data-source.ts` | 1 | `migrationsTransactionMode: 'each'` |
| `backend/src/testing/integration/sharing.integration.test.ts` | 1–4 | Nuevo; verifica enum, índice parcial, FK, estados, permisos y flujo completo desde el paso 2 en adelante |
| `backend/src/schemas/sharing-request.schema.ts` | 2 | Nuevo: `sendSharingRequestSchema` (email), `uuidParamSchema` y esquemas de respuesta si hacen falta |
| `backend/src/services/sharing-requests.service.ts` | 2–4 | Nuevo: `send`, `listPending`, `cancel`, `getForReceiver`, `accept`, `reject`, `listMembers`, `revoke`, `leave` |
| `backend/src/controllers/sharing-requests.controller.ts` | 2–4 | Nuevo; solo handlers con `asyncHandler` vía el router |
| `backend/src/routes/vehicles.routes.ts` | 2 y 4 | 6 rutas con `owner`/`member`; `me` antes que `:userId`; limiter de 10/min junto al de VIN |
| `backend/src/routes/sharing-requests.routes.ts` | 3 | Nuevo; `router.use(auth)` → GET `/:requestId` → POST `/:requestId/accept` → POST `/:requestId/reject` |
| `backend/src/app.ts` | 3 | Crear el service y `app.use('/sharing-requests', createSharingRequestsRouter(...))` antes de `notFoundHandler`, sin reordenar los `app.use` existentes |
| `backend/src/services/notifications.service.ts` | 2 | `sharingRequestId` en `NotificationView` y en `toView` (cambio M) |
| `backend/src/jobs/notify.ts` | 2 | `sharingRequestId?: string \| null` en `NotificationInput` (no tocar `recipientsFor`) |
| `backend/src/utils/messages.ts` | 2 y 3 | Paso 2: textos de `SHARING_REQUEST_RECEIVED`; paso 3: textos de `ACCEPTED`/`REJECTED`. Cuerpo con `Array.from(...).slice(0, 300)` como el existente |
| `backend/src/testing/unit/sharing-requests.service.test.ts` | 2–4 | Nuevo; casos de normalización de email, `affected !== 1` → 409 y textos con límites |
| `frontend/src/api/notifications.ts` | 5 | 3 valores en `NotificationType`, `sharingRequestId` en `Notification` |
| `frontend/src/api/sharing.ts` | 5 | Nuevo: tipos, `sharingQueryKeys`, hooks de solicitudes/miembros y mutaciones con invalidación |
| `frontend/src/features/notifications/screens/NotificationsScreen.tsx` | 5 y 7 | Paso 5: 3 entradas en `TYPE_ICONS` y respaldo `notifications-outline` para tipos desconocidos; paso 7: abrir el modal solo si el tipo es `SHARING_REQUEST_RECEIVED` (y hay `sharingRequestId`); `ACCEPTED`/`REJECTED` solo se marcan leídas |
| `frontend/src/components/ShareVehicleModal.tsx` | 6 | Nuevo; campo email, pendientes e invitados, confirmación de revocar con `ConfirmModal` |
| `frontend/src/features/vehicles/screens/VehicleDetailScreen.tsx` | 6 | Opción "Compartir vehículo" en el ⋮ de OWNER y "Abandonar vehículo" en el de GUEST, con `ConfirmModal` |
| `frontend/src/features/notifications/components/SharingRequestModal.tsx` | 7 | Nuevo; detalle limitado, botones Aceptar/Rechazar; si la solicitud ya no está PENDING, muestra "Ya respondiste esta solicitud" |
| `README.md` | 8 | Línea 22: GUEST ya asignable desde la app; línea 297: funcionalidad implementada |

Sin cambios: `normalizeEmail`, `app.ts` salvo el nuevo `app.use`, migraciones existentes, esquema de otras tablas, dependencias y `frontend/app/**`.

## 5. Pasos

Convención: todo paso termina con **V** (sección 3). El SHA de cada paso se anota en la sección 8 al empezar el siguiente. No adelantar pasos.

### Paso 1 — base de datos y migraciones

- Archivos: `entities/SharingRequest.ts`, `entities/Notification.ts`, las 2 migraciones nuevas, `db/data-source.ts`, `testing/test-data-source.ts` y `testing/integration/sharing.integration.test.ts`.
- Cambios: las dos migraciones descritas en la sección 3; `MIGRATIONS` y `migrationsTransactionMode: 'each'` en ambos data sources.
- Nota: si PostgreSQL es 12 o superior en Neon y en la BD de tests, evaluar una sola migración transaccional y NO cambiar `migrationsTransactionMode`; decidir tras el `SELECT version()`. El diseño de dos migraciones sigue siendo la alternativa documentada por defecto.
- Impacto en datos existentes (pedido por `backend/AGENTS.md`): ninguna fila se borra ni se reescribe. Se añaden valores de enum, una columna nullable, una FK y un índice único parcial. Las solicitudes PENDING actuales (si las hay) pasan a estar protegidas por el índice; no se crean notificaciones nuevas. El `down` reconvierte `CANCELLED → REJECTED` y los 3 tipos nuevos a valores antiguos: **pérdida semántica irreversible**, documentada en la migración.
- `down` de enums: renombrar el tipo, crear el tipo antiguo, `ALTER COLUMN ... USING CASE ... END::<tipo>`, ajustar default y borrar el tipo viejo. PostgreSQL no tiene `ALTER TYPE ... REMOVE VALUE`.
- Verificación: V backend + `npx jest --config jest.integration.config.js --listTests` (12 suites) + `npm run test:integration` solo contra la BD de tests (lo ejecuta el usuario). Comprobar que la migración de enums se aplica fuera de transacción y que la de soporte se registra después. **No ejecutar migraciones en Neon.**
- Commit: `feat(paso 1): preparar base de datos para compartir vehículo`

### Paso 2 — DUEÑO: enviar, listar y cancelar

- Archivos: `schemas/sharing-request.schema.ts`, `services/sharing-requests.service.ts`, `controllers/sharing-requests.controller.ts`, `routes/vehicles.routes.ts`, `services/notifications.service.ts`, `jobs/notify.ts`, `utils/messages.ts`, tests unitario e integración.
- Lógica: búsqueda `LOWER(TRIM(email))` con `email IS NOT NULL`; 0 o >1 → 202 sin insertar. Uno mismo, ya miembro, PENDING previa (`23505`) y tope de 10 → 409; 10 envíos/minuto → 429. `pg_advisory_xact_lock(hashtext($1))` con `$1 = 'sharing:' + vehicleId` alrededor del conteo de pendientes e inserción. Notificación `SHARING_REQUEST_RECEIVED` al receptor en la misma transacción, con `sharingRequestId` apuntando a la solicitud: es su único punto de entrada (R39), así que el cambio M va en este paso. Listar devuelve el email actual del receptor vía join, nunca datos de vehículo. Cancelar con `UPDATE ... WHERE status='PENDING'` y `affected === 1`; 409 si no.
- Seguridad: nadie puede enviar por otro usuario; el dueño se resuelve desde `req.auth.userId`.
- Verificación: V backend + tests nuevos (202 neutral para correo inexistente, 409 en duplicado, 429 en el undécimo envío (usuario exclusivo para ese test), 404 en solicitud de otro vehículo, y que `GET /notifications` devuelve `sharingRequestId` distinto de null en la notificación creada). Integración la ejecuta el usuario contra la BD de tests.
- Commit: `feat(paso 2): enviar, listar y cancelar solicitudes de compartir`

### Paso 3 — receptor: detalle, aceptar y rechazar

- Archivos: `routes/sharing-requests.routes.ts`, `app.ts`, `services/sharing-requests.service.ts`, `controllers/sharing-requests.controller.ts`, `utils/messages.ts`, tests.
- Lógica: `getForReceiver` devuelve solo marca, modelo, año, `senderName` y `sentAt`; 404 si el receptor no es `req.auth.userId`. `accept`: `UPDATE "sharing_requests" SET status='ACCEPTED', responded_at=now() WHERE id=$1 AND receiver_user_id=$2 AND status='PENDING'`; si `affected !== 1` → 409; dentro de la misma transacción, `INSERT ... ON CONFLICT DO NOTHING` en `user_vehicles` con rol GUEST y la notificación `SHARING_REQUEST_ACCEPTED` al emisor. `reject` es igual sin el INSERT y con `SHARING_REQUEST_REJECTED`.
- Notificaciones: reutilizar `NotificationInput.sharingRequestId` (ya expuesto por `toView` desde el paso 2) para `ACCEPTED` y `REJECTED`. Textos con título ≤120 y cuerpo ≤300. No usar `recipientsFor`.
- Permisos: solicitud ajena → 404 aunque el usuario sea miembro del vehículo (R14).
- Verificación: V backend + test de que aceptar crea la membresía y la notificación en una sola transacción (simular fallo del INSERT y comprobar que el estado sigue PENDING), 409 al responder dos veces, 404 en solicitud ajena y que el detalle no contiene `licensePlate`, `vin`, `photoUrl` ni historial.
- Commit: `feat(paso 3): responder solicitudes de compartir desde la notificación`

### Paso 4 — miembros: listar, revocar y abandonar

- Archivos: `routes/vehicles.routes.ts`, `services/sharing-requests.service.ts`, `controllers/sharing-requests.controller.ts`, `schemas/sharing-request.schema.ts`, `sharing.integration.test.ts`.
- Lógica: `listMembers` devuelve solo GUEST con email y `assignedAt`. `revoke` borra la fila GUEST; si el `userId` resulta ser OWNER → 409; inexistente → 404. `leave` borra la fila del propio usuario; OWNER → 409. No borrar mantenciones, repuestos ni citas: sus FKs al vehículo permanecen.
- Orden de rutas: `DELETE /:vehicleId/members/me` antes que `DELETE /:vehicleId/members/:userId`.
- Verificación: V backend + test de que el ex invitado ya no ve el vehículo en `GET /vehicles` pero su mantención sigue en el historial; test de que el DUEÑO no puede abandonar ni ser revocado (409); 403 para GUEST que intente revocar.
- Commit: `feat(paso 4): revocar invitados y abandonar vehículo`

### Paso 5 — frontend: datos y tipos

- Archivos: `frontend/src/api/notifications.ts`, `frontend/src/api/sharing.ts`, `frontend/src/features/notifications/screens/NotificationsScreen.tsx`.
- Cambios: 3 tipos nuevos en `NotificationType`, `sharingRequestId: string | null`, tipos de solicitud/miembro, query keys propias y hooks de lista/mutaciones. En `NotificationsScreen.tsx`, ampliar `TYPE_ICONS` con las 3 entradas nuevas y usar respaldo `notifications-outline` para tipos desconocidos de builds móviles antiguos (`TYPE_ICONS[notification.type] ?? 'notifications-outline'`), para que `tsc` pase sin dejar iconos vacíos. Tras aceptar, rechazar, abandonar y revocar: invalidar `vehiclesQueryKey`, `notificationsQueryKey` y las query keys locales de compartir. Sin lógica de modales en pantallas todavía.
- Verificación: V frontend (tsc, lint con 5 errores/8 warnings, `expo export`).
- Commit: `feat(paso 5): tipos y hooks de compartir en el frontend`

### Paso 6 — modales del DUEÑO y del INVITADO

- Archivos: `frontend/src/components/ShareVehicleModal.tsx`, `frontend/src/features/vehicles/screens/VehicleDetailScreen.tsx`.
- Cambios: el ⋮ de OWNER gana "Compartir vehículo"; el de GUEST gana "Abandonar vehículo" con `ConfirmModal` (mensaje "¿Abandonar vehículo?"). El modal de compartir reúne campo email, pendientes con "Cancelar solicitud", invitados con "Revocar acceso" (confirmación con `ConfirmModal`) y el botón "Cerrar". Mensaje neutral exacto del caso de uso en el envío.
- Verificación: V frontend + prueba manual en web y móvil de que el OWNER ve compartir pero no abandonar, el GUEST ve abandonar pero no compartir, y que cancelar un modal no muta nada.
- Commit: `feat(paso 6): modales para compartir, revocar y abandonar`

### Paso 7 — modal de notificación del receptor

- Archivos: `frontend/src/features/notifications/components/SharingRequestModal.tsx`, `frontend/src/features/notifications/screens/NotificationsScreen.tsx`.
- Cambios: abrir el modal local SOLO cuando `notification.type === 'SHARING_REQUEST_RECEIVED'` y haya `sharingRequestId`: marcarla como leída y pedir el detalle con `GET /sharing-requests/:requestId`. Las notificaciones `SHARING_REQUEST_ACCEPTED` y `SHARING_REQUEST_REJECTED` van al emisor: solo se marcan como leídas, sin abrir el modal ni llamar a `GET /sharing-requests/:requestId` (para el emisor respondería 404). Si la solicitud ya no está PENDING, el modal muestra "Ya respondiste esta solicitud". Sin rutas en `app/`.
- Verificación: V frontend + prueba manual de que el modal muestra "Un usuario de AutoStory" cuando el emisor no tiene nombre, y de que tras aceptar aparece el vehículo en la lista y la notificación del emisor llega al otro usuario; tocar una notificación `SHARING_REQUEST_ACCEPTED` o `SHARING_REQUEST_REJECTED` solo la marca como leída, sin abrir modal ni disparar `GET /sharing-requests/:requestId` (comprobar en la pestaña de red); abrir una `SHARING_REQUEST_RECEIVED` cuya solicitud ya fue respondida muestra "Ya respondiste esta solicitud".
- Commit: `feat(paso 7): modal de solicitud de compartir en notificaciones`

### Paso 8 — cierre y documentación

- Archivos: `README.md`, `backend/AGENTS.md`, sección 8 de este plan.
- Cambios: línea 22 y 297 del README; en `backend/AGENTS.md` cambiar "10 entidades" por 11 y "6 migraciones" por 7, y añadir los archivos nuevos al árbol de la sección "Estructura objetivo". Completar la sección 8 con los SHAs reales.
- Verificación: V backend + V frontend + `git status --short` (solo archivos esperados) + `git log --oneline -10`.
- Commit: `docs(paso 8): actualizar documentación de compartir vehículo`

## 6. Riesgos y cómo verificarlos

| Riesgo | Detalle y estado | Verificación |
| --- | --- | --- |
| Versión de PostgreSQL | **No verificado.** PG 11 prohíbe `ADD VALUE` en transacción; PG 12+ no permite usar el valor hasta el commit. | `SELECT version();` en Neon y en la BD de tests antes del paso 1. El diseño de dos migraciones funciona en ambos. |
| `ForbiddenTransactionModeOverrideError` | **Confirmado** en la API de TypeORM 0.3.31: `transaction = false` exige `migrationsTransactionMode` distinto de `all`. | `npm run typecheck` no lo detecta; comprobar el valor en ambos data sources y ejecutar la integración en BD de tests. |
| `down` de enums con pérdida semántica | **Confirmado:** PostgreSQL no permite quitar valores de un enum; reconstruir el tipo mapa `CANCELLED → REJECTED` y los 3 tipos nuevos a valores antiguos. | Revisar el `down` en el diff; ejecutar `up`/`down`/`up` solo en la BD de tests. No ejecutar `down` en Neon sin avisar. |
| La lista de pendientes revela correos | **Riesgo aceptado:** el dueño puede inferir si un correo existe (a) por el 409 al reenviar a una solicitud PENDING previa y (b) porque la lista solo contiene solicitudes creadas; el mensaje 202 neutral solo evita la señal inmediata. Mitigado por el límite de 10 envíos/minuto y por requerir autenticación y vehículo propio. | Test: correo inexistente da 202 y no inserta fila ni notificación; comprobar que el 409 de duplicado y el contenido de la lista son el canal de inferencia documentado, sin afirmar que no hay fuga. |
| Notificación borrada por retención R26 | **Confirmado:** si se borra la notificación de una solicitud PENDING, el receptor pierde su único punto de entrada; no hay lista de recibidas. Mitigación: el dueño ve la pendiente y puede cancelarla. | Test: tras simular limpieza de notificaciones, el dueño sigue viendo la pendiente y puede cancelarla. |
| Borrado de cuenta con la nueva FK | **Confirmado parcialmente:** `account-deletion.service.ts` borra `sharing_requests` antes que `users`, y las notificaciones pueden caer por cascada de ambos lados. Hay que comprobar el orden con la FK nueva de `notifications.sharing_request_id`. | `npm run test:integration` (suite `account-deletion`) contra la BD de tests; si aparece violación de FK, ajustar solo el orden de borrado en ese service. |
| Foto firmada del ex invitado | **No verificado en ejecución:** al revocar/abandonar, la URL firmada podría seguir sirviendo la foto hasta caducar; el acceso al vehículo sí debe desaparecer. | Test de que `GET /vehicles` ya no lista el vehículo para el ex invitado; la foto se sirve desde URL firmada con caducidad (R30). |
| Notificaciones antiguas de citas de un ex invitado | **Confirmado:** R26 las conserva 90 días, pero no se generan nuevas porque `recipientsFor` consulta miembros actuales. | Test: revocar a un GUEST, programar una cita y comprobar que no recibe notificación nueva. |
| Rate limiter en memoria por proceso | **Confirmado:** mismo patrón que el de VIN; con varias réplicas el límite real puede superar 10/min. Riesgo aceptado, sin Redis. | Revisar `keyGenerator` y `limit: 10`; no usar `max`. |
| Carrera por tope de 10 PENDING | **Confirmado:** dos envíos simultáneos pueden pasar un `count` sin lock. | `SELECT pg_advisory_xact_lock(hashtext($1))` dentro de la transacción antes de contar e insertar; test con dos peticiones concurrentes en integración. |
| Duplicado PENDING concurrente | **Confirmado:** el índice parcial convierte la carrera en `23505`. | Mapear `23505` a 409 en `send`; test de doble envío. |
| Fuga de datos del vehículo antes de aceptar | **Confirmado por diseño:** el detalle se construye explícitamente con 4 campos. | Test sobre el JSON de `GET /sharing-requests/:requestId`: que no aparezcan `licensePlate`, `vin`, `photoUrl`, `maintenances`, `parts` ni `appointments`. |
| `me` capturado como `userId` | **Confirmado por orden de Express:** si `DELETE /:userId` se declara primero, el DUEÑO recibe 409 al intentar salir. | Leer el orden de rutas en el diff; test de `DELETE /vehicles/:id/members/me` con DUEÑO y con GUEST. |
| Sin tests frontend | **Confirmado:** no hay suites en `frontend/`. | V frontend completa (tsc, lint comparado por totales, `expo export`) + prueba manual anotada en los pasos 6 y 7. |
| Estado git ajeno | **Confirmado:** hay archivos sin trackear de otras tareas (`backend/docs/`, `backend/scripts-local/`, `docs/audit-report.md`, `docs/plan-a01-fotos.md`, `frontend/docs/`). | `git status --short` antes de cada `git add`; añadir solo la ruta del paso, nunca `git add -A`. |
| Integración sin BD | **No ejecutada en la redacción.** Si `TEST_DATABASE_URL` falta o apunta a Neon, no ejecutar. | `requireTestDatabaseUrl()` exige URL distinta, con "test" en el nombre; el usuario ejecuta la suite y reporta el resultado. |

## 7. Qué NO se toca y por qué

- `normalizeEmail` en `backend/src/services/user-sync.service.ts`: cambiaría emails ya guardados; R33 solo exige comparar sin mayúsculas.
- `recipientsFor` en `backend/src/jobs/notify.ts`: pertenece a citas (R22); los destinatarios de compartir son explícitos.
- Las 6 migraciones existentes y el esquema de otras tablas: solo se añaden 2 migraciones nuevas.
- Las tablas `users`, `user_vehicles` y `vehicles`: sus columnas, checks e índices actuales quedan iguales.
- `cleanupExpiredData` y la retención de 90 días (R26): no se acorta para notificaciones de compartir.
- Dependencias y versiones de `backend/package.json` y `frontend/package.json`: `express-rate-limit` ya está instalado.
- `.env`, `.env.example` y `config/env.ts`: no hay variables nuevas.
- `frontend/app/**`: no se crean rutas; los modales son componentes locales.
- El diseño, la paleta y `frontend/docs/ui-design.md`: se reutilizan `ConfirmModal`, `Card`, `Button`, `Icon` y `theme.ts`.
- La lógica de borrado de cuenta salvo el ajuste de orden que exija la FK nueva, y solo si la integración lo demuestra.
- Los cambios ajenos visibles en `git status`: no se escanean, no se commitean.
- Los tests y archivos de otras tareas (`plan-a01-fotos`, auditoría, etc.).

## 8. Tabla de seguimiento

| Paso | Estado | SHA del commit |
| ---- | ------ | -------------- |
| 1 | hecho | 2ff740a |
| 2 | hecho | 5133fd7 |
| 3 | hecho | cc06ee3 |
| 4 | hecho | 241d19f |
| 5 | hecho | 26cf1b2 |
| 6 | hecho | 5ec08a8 |
| 7 | hecho | 6aab001 |
| 8 | hecho | — |

Regla: cuando se empieza el paso N+1, se escribe aquí el SHA del commit del paso N (`git rev-parse --short HEAD`). El commit de este documento (`docs: plan de implementación de compartir vehículo`) no aparece en la tabla porque no es un paso. El prerrequisito de PostgreSQL (sección 3) tampoco es paso y no tiene commit.

Paso 1: no hay paso 0, así que no hay SHA anterior que anotar. El último commit previo fue `43e4d60` (`docs: corregir plan de compartir vehículo`). El SHA de este paso se registrará al iniciar el paso 2, según la regla de esta sección.

Paso 2: el SHA se anotará al iniciar el paso 3, según la misma regla.

Paso 3: el SHA se anotó al iniciar el paso 4 (`cc06ee3`).

Paso 4: el SHA se anotó al iniciar el paso 5 (`241d19f`). Entre ese commit y este paso hubo un fix posterior (`8644a3f`) que corrige el resultado crudo de `UPDATE` en compartir vehículo; no cambia el alcance del paso 5.

Paso 5: el SHA se anotó al iniciar el paso 6 (`26cf1b2`).

Paso 6: el SHA se anotó al iniciar el paso 7 (`5ec08a8`).

Paso 7: el SHA se anotó al iniciar el paso 8 (`6aab001`).

Paso 8: cierre y documentación. El SHA de este commit queda registrado en `git log`; no puede anotarse dentro de él. El recuento real es 10 entidades y 8 migraciones (el plan estimó 11 y 7), con 16 suites unitarias y 13 de integración.

## 9. Cómo retomar en una sesión nueva

1. Leer este archivo completo desde `docs/plan-compartir-vehiculo.md`; no hace falta leer otras conversaciones.
2. Ejecutar `git log --oneline -12` y contrastar con la sección 8 para saber qué pasos están hechos. Si algún SHA no coincide, parar y reportar.
3. Si el paso 1 sigue pendiente, pedir al usuario `SELECT version();` en Neon y en la BD de tests antes de tocar migraciones. Nunca ejecutar migraciones contra Neon.
4. Ejecutar SOLO el siguiente paso pendiente, con su verificación y su mensaje de commit. No adelantar pasos ni mezclar cambios ajenos.
5. Al terminar el paso, proponer el mensaje de commit: el agente NO commitea ni hace push; el usuario revisa el diff y commitea. El usuario reporta el SHA para la sección 8.
6. Si aparece una contradicción nueva entre casos de uso, MER y código, reportarla por escrito sin resolverla en silencio.
