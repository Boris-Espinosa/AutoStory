# Auditoría de refactor: vehículo multi-usuario

Fecha: 2026-11-04.
Alcance: `backend/`, `frontend/`, `docs/` y `AGENTS.md`.
Esta auditoría se hizo sin modificar código. Después se corrigieron los documentos de alcance (`docs/modelo-er.md`, `docs/caso-de-uso-registrar-vehiculo.md` y `AGENTS.md`) y todo el backend; el estado de cada hallazgo se indica en la tabla.

## Reglas objetivo usadas como referencia

- Patente: obligatoria, normalizada, no única (ni siquiera parcialmente).
- VIN: opcional, normalizado si existe, no único.
- Duplicado por usuario: un usuario no puede ser `OWNER` de dos vehículos con la misma patente, ni con el mismo VIN cuando hay VIN.
- Ninguna consulta puede resolver un vehículo por patente o VIN sin limitarlo a los vehículos donde el usuario autenticado tiene membresía.
- Ninguna respuesta ni mensaje puede revelar si otra persona registró una patente o un VIN.
- No existe verificación de propiedad.

## Resumen ejecutivo

- Hay 9 hallazgos de riesgo alto, 10 medios y 11 bajos.
- Los bloqueos principales estaban en el esquema: VIN `NOT NULL` y único, patente única global y ausencia de la validación de duplicado por usuario. Ya están corregidos en `backend/`.
- No se encontró ninguna consulta por patente o VIN en el backend. Las consultas existentes se resuelven por `vehicleId` y están limitadas por membresía en las rutas.
- No se encontró código de verificación de propiedad (`verificationStatus`, `verifiedAt`, `VERIFIED`, `OwnershipVerification`, endpoints `/verification` o `/admin`, `requireAdmin`, `requireVerifiedVehicle`, `ADMIN_USER_IDS`, `backend/private`, insignias, pantalla de verificar ni `expo-document-picker`). No hay nada de eso que eliminar en este repo.
- El alta de vehículo ya existe (`POST /vehicles`): valida el duplicado solo entre los vehículos del usuario autenticado, dentro de una transacción con `pg_advisory_xact_lock`.
- No se requiere deduplicar datos existentes: la unicidad global anterior impide que ya haya patentes o VIN repetidos.
- La migración `1767225601000-VehicleMultiUser` conserva los vehículos existentes: quita los índices únicos, hace `vin` nullable y crea índices normales.
- La documentación y el backend ya reflejan el modelo multi-usuario; solo quedan pendientes los hallazgos de frontend (F-22 a F-26).

## Hallazgos

Estado: `Hecho` = corregido en este repo; `Parcial` = corregido en documentación, falta código; `Pendiente` = sin cambios. Las líneas citadas corresponden al estado anterior a la corrección.

| # | Archivo y línea | Qué supone el código antiguo | Riesgo | Acción necesaria | Estado |
|---|---|---|---|---|---|
| F-01 | `backend/src/entities/Vehicle.ts:19-21` | El VIN es obligatorio y globalmente único: `@Index('UQ_vehicles_vin', { unique: true })`, columna `varchar(17)` no nullable y propiedad `vin!: string`. Asume que un VIN identifica un solo vehículo en todo el sistema. | Alto | Quitar la unicidad; hacer `vin` nullable (`string \| null`); aceptar `null` o cadena vacía como ausencia; mantener normalización. El mismo VIN podrá repetirse en registros de usuarios distintos. | Hecho |
| F-02 | `backend/src/entities/Vehicle.ts:23-30` | La patente es globalmente única: `@Index('UQ_vehicles_license_plate', { unique: true })`. Asume que la patente identifica un vehículo en todo el sistema. | Alto | Quitar el índice único; conservar `NOT NULL` y el transformer de normalización. No crear unicidad global ni parcial sobre la patente. | Hecho |
| F-03 | `backend/src/entities/Vehicle.ts:9-12,19-21` | Solo se normaliza la patente. El VIN se guarda tal como lo escribe el usuario; la unicidad global ocultaba las variantes de formato. | Medio | Agregar un transformer de VIN (trim, mayúsculas, sin espacios ni guiones) y normalizar antes de comparar. Debe ser null-safe. No usar el VIN para buscar fuera de las membresías del usuario. | Hecho |
| F-04 | `backend/src/migrations/1767225600000-InitialSchema.ts:35` | `vin character varying(17) NOT NULL`: el esquema exige VIN. | Alto | Nueva migración con `ALTER TABLE "vehicles" ALTER COLUMN "vin" DROP NOT NULL`; actualizar la entidad. No editar una migración ya aplicada. En `down`, restaurar `NOT NULL` solo si no hay VIN nulos; documentar que el rollback puede fallar con datos nuevos. | Hecho |
| F-05 | `backend/src/migrations/1767225600000-InitialSchema.ts:47` | `CREATE UNIQUE INDEX "UQ_vehicles_vin"`: unicidad global de VIN. | Alto | Nueva migración con `DROP INDEX "UQ_vehicles_vin"`; quitar también el decorador de la entidad. En `down`, recrear la unicidad puede fallar si ya hay VIN repetidos; documentarlo. | Hecho |
| F-06 | `backend/src/migrations/1767225600000-InitialSchema.ts:50` | `CREATE UNIQUE INDEX "UQ_vehicles_license_plate"`: unicidad global de patente. | Alto | Nueva migración con `DROP INDEX "UQ_vehicles_license_plate"`; quitar también el decorador de la entidad. En `down`, recrear la unicidad puede fallar si ya hay patentes repetidas; documentarlo. | Hecho |
| F-07 | `backend/src/entities/UserVehicle.ts:18-22`; `backend/src/migrations/1767225600000-InitialSchema.ts:74-76` | El índice parcial `UQ_user_vehicles_owner` sobre `vehicle_id` donde `role = 'OWNER'` exige un solo dueño por vehículo. | Bajo | Sin cambio: es compatible con "un solo dueño por registro" y no depende de la verificación de propiedad. No confundirlo con unicidad de patente o VIN. | Hecho |
| F-08 | `backend/src/vehicles/vehicles.service.ts:13-34`; `backend/src/entities/UserVehicle.ts:18-22` | No existe alta de vehículo ni validación de duplicado por usuario. La unicidad global era lo único que impedía que un `OWNER` repitiera patente o VIN. | Alto | Al implementar el alta, validar en una transacción contra los vehículos donde el usuario es `OWNER`: misma patente normalizada, y mismo VIN normalizado solo si ambos existen. Considerar únicamente membresías `OWNER` del usuario autenticado. No consultar vehículos de otros usuarios ni usar patente/VIN como clave global. Con el esquema actual no hay un índice único directo posible; si se necesita garantía ante concurrencia, evaluar un trigger. | Hecho |
| F-09 | `backend/src/vehicles/vehicles.service.ts:28-33` | `listMaintenances(vehicleId)` no recibe `userId`; confía en que el router ya validó la membresía. | Medio | Mantener el middleware en todas las rutas o pasar `userId` y validar membresía dentro del servicio. Hoy no hay fuga porque `vehicles.controller.ts:45-54` usa `requireVehicleMember`. | Hecho |
| F-10 | `backend/src/vehicles/vehicle-access.service.ts:11-30`; `backend/src/vehicles/vehicles.service.ts:16-26` | Las consultas existentes resuelven por `vehicleId` y están limitadas por `userId`/membresía. No hay consultas por patente ni VIN. | Bajo | Sin cambio. Cualquier búsqueda futura por patente o VIN debe partir de `user_vehicles` del usuario autenticado, nunca de la tabla `vehicles` completa. | Hecho |
| F-11 | `backend/src/vehicles/vehicles.controller.ts:19-54`; `backend/src/parts/parts.controller.ts:17-25` | Todas las rutas con `:vehicleId` pasan por `requireVehicleMember`; el alta de repuesto valida membresía antes de crear. | Bajo | Sin cambio: mantener el patrón. No agregar rutas que reciban patente o VIN como identificador sin ese mismo filtro. | Hecho |
| F-12 | `backend/src/parts/parts.service.ts:26-33` | La mantención se busca por `id` y luego se compara `vehicleId`; no se consulta por patente ni VIN. | Bajo | Sin cambio: la autorización sobre `vehicleId` ya ocurre en `parts.controller.ts:22`. | Hecho |
| F-13 | `docs/caso-de-uso-registrar-vehiculo.md:10` | "Si el VIN ya está registrado en el sistema, la aplicación notifica al usuario que el vehículo ya existe". Eso confirma globalmente y revela que otra persona lo registró. | Alto | Eliminar la validación global. Validar duplicado solo entre los vehículos del usuario autenticado y responder con un mensaje genérico de duplicado propio; nunca decir que existe en el sistema o que lo registró otra persona. | Hecho |
| F-14 | `docs/caso-de-uso-registrar-vehiculo.md:12` | "El vehículo queda creado de forma única" y "el VIN se encarga de llenar el resto de datos": asume VIN como clave global y unicidad del registro. | Alto | Reescribir: cada usuario crea un registro independiente con id propio; el VIN es opcional; si se decodifica para autocompletar marca/modelo/año, no se usa para buscar registros de otros usuarios. | Hecho |
| F-15 | `docs/caso-de-uso-registrar-vehiculo.md:5,13` | El formulario lista el VIN como dato base sin indicar que es opcional. | Medio | Marcar el VIN como opcional y la patente como obligatoria; aclarar que no se valida contra otros usuarios. | Hecho |
| F-16 | `docs/modelo-er.md:2` | "Patente (única)" contradice la regla objetivo. El VIN ya figura como opcional, pero no se declara no único. | Alto | Cambiar a: "Patente (obligatoria, normalizada, no única); VIN (opcional, normalizado, no único)". | Hecho |
| F-17 | `docs/modelo-er.md:13` | "La patente queda libre para volver a registrarse" presupone que la patente se reserva globalmente. | Medio | Reescribir: cada registro es independiente; borrar uno no libera ni bloquea registros de otros usuarios. | Hecho |
| F-18 | `docs/modelo-er.md:11` | "Cada vehículo tiene exactamente un DUEÑO... más validación en el servicio" es correcto por registro, pero esa validación de servicio no existe hoy (ver F-08). | Bajo | Mantener la regla por registro y aclarar que muchos vehículos distintos pueden compartir patente o VIN entre dueños. Implementar la validación al dar de alta. | Hecho |
| F-19 | `backend/src/seed.ts:38-76` | Los fixtures usan patentes y VIN únicos y un vehículo compartido (`VEHICLE_A`: `user-1` `OWNER`, `user-2` `GUEST`). No cubren dos registros independientes con la misma patente o VIN. | Medio | Agregar al seed dos vehículos con la misma patente (y el mismo VIN) con ids propios y dueños distintos; agregar un vehículo con VIN `null`. Mantener el ejemplo de invitado solo si compartir sigue vigente. | Hecho |
| F-20 | `backend/src/testing/model.integration.test.ts:47-57` | `vehicleData()` siempre setea VIN y aleatoriza patente y VIN para evitar los índices únicos globales. | Medio | Permitir `vin: null`; usar valores fijos; agregar casos de misma patente/VIN entre usuarios y de duplicado dentro del mismo usuario. | Hecho |
| F-21 | `backend/src/testing/model.integration.test.ts:128-152` | Solo se prueba el índice de un `OWNER` por vehículo. No se prueba la regla de duplicado por usuario ni la independencia entre usuarios. | Medio | Mantener el test del índice; agregar tests de duplicado por usuario (debe rechazar) y de misma patente/VIN en usuarios distintos (debe permitir). | Hecho |
| F-22 | `frontend/src/api/parts.ts:19-28` | El tipo `Vehicle` exige `userId`, `vin: string` y usa `kilometers`; el backend devuelve `role` y `currentMileage`, y el VIN pasará a ser opcional. Asume dueño global y VIN obligatorio. | Medio | Quitar `userId`; cambiar a `vin: string \| null`; alinear `kilometers` con `currentMileage` o mapearlo en la capa API. | Pendiente |
| F-23 | `frontend/src/api/client.ts:4,56` | `CURRENT_USER_ID = 'user-1'` fijo en todas las peticiones. No rompe el scoping del servidor, pero impide probar dos usuarios y puede ocultar fugas. | Medio | Mantener el stub mientras no haya autenticación real, pero probar el backend con `user-1` y `user-2`; no derivar permisos de ids enviados por el cliente. | Pendiente |
| F-24 | `frontend/app/index.tsx:31-33,73-76` | Muestra la patente como texto secundario, pero usa `id` como key y `vehicleId` para navegar; no asume que la patente identifica el vehículo. | Bajo | Sin cambio. Si dos registros del mismo usuario muestran la misma patente, la lista sigue funcionando por id. | Pendiente |
| F-25 | `frontend/app/vehicles/[vehicleId]/parts/index.tsx:16-24`; `frontend/app/vehicles/[vehicleId]/parts/new.tsx:84-113` | Las pantallas de repuestos usan `vehicleId`, no patente ni VIN. | Bajo | Sin cambio. | Pendiente |
| F-26 | `frontend/` (no existe archivo de alta de vehículo) | No existe pantalla de registro de vehículo ni validaciones de VIN o patente en el frontend; el caso de uso documentado no está implementado. | Bajo | Al crearla: VIN opcional, patente obligatoria y normalizada, sin consulta global de duplicados; mensajes de duplicado solo del propio usuario. | Pendiente |
| F-27 | `backend/src/` (no existe archivo con esa lógica) | No había `409`, `ConflictException` ni mensajes "ya está registrado" o "ya existe" en el código anterior. | Bajo | Sin cambio por ahora. Al implementar el alta, reservar `409` para duplicado dentro del mismo usuario y usar un mensaje que no confirme datos de otros. | Hecho |
| F-28 | `backend/README.md:20,28` | Dice que el esquema se crea automáticamente con `synchronize` en desarrollo, pero `backend/src/data-source.ts:29` usa `synchronize: false` y migraciones. La descripción del seed (un usuario, dos vehículos) también está desactualizada. | Medio | Actualizar el README: los cambios de índices y columnas requieren migración; describir el seed real y el caso multi-usuario. | Hecho |
| F-29 | `docs/modelo-er.md:3-4`; `backend/src/seed.ts:71-76` | El modelo conserva membresías `GUEST` y solicitudes de compartir. No es un supuesto de unicidad global; solo sería contradicción si "no se enlaza" se interpreta como prohibir todo compartir. | Bajo | Aclarar alcance con el producto. La regla nueva prohíbe fusionar registros duplicados; no obliga a eliminar el compartir explícito. No cambiar sin decisión. | Hecho |
| F-30 | `AGENTS.md:17` | Fija la normalización de patente, pero no dice que patente y VIN no son únicos ni que el duplicado es por usuario. No contradice, pero deja el hueco para que se reintroduzca la unicidad. | Bajo | Añadir las reglas objetivo a `AGENTS.md` junto con el cambio de modelo. | Hecho |

## Consultas por patente o VIN

No hay consultas por patente o VIN abiertas a todos los usuarios. La única es la comprobación de duplicado de `VehiclesService.create` (`backend/src/vehicles/vehicles.service.ts`), que parte de `user_vehicles` del usuario autenticado y solo compara contra sus vehículos con rol `OWNER`.

Las consultas existentes sobre vehículos están limitadas así:

- `backend/src/vehicles/vehicles.service.ts:16-26`: `listByUser` filtra por `membership.userId`.
- `backend/src/vehicles/vehicle-access.service.ts:11-20`: `getMembership` filtra por `userId` y `vehicleId`.
- `backend/src/vehicles/vehicles.controller.ts:27-54`: las rutas con `:vehicleId` usan `requireVehicleMember`.
- `backend/src/parts/parts.controller.ts:17-25`: valida membresía sobre `input.vehicleId` antes de crear.
- `backend/src/parts/parts.service.ts:48-52`: lista repuestos por `vehicleId`; la autorización ocurre en el controlador.

Regla para el futuro: si se agrega una búsqueda por patente o VIN, debe empezar desde las membresías del usuario autenticado y no desde la tabla `vehicles` completa.

## Supuestos de dueño global

- El `Vehicle` del backend no tiene `ownerId` ni `userId`; la propiedad vive en `user_vehicles`. Eso es compatible con el modelo objetivo.
- El único `userId` dentro de un tipo `Vehicle` está en el frontend (`frontend/src/api/parts.ts:21`) y está desactualizado; ver F-22.
- No hay joins ni consultas que asuman un solo registro por patente o VIN.
- El seed comparte un vehículo entre un `OWNER` y un `GUEST` (`backend/src/seed.ts:71-76`). Eso no es una fusión automática de registros duplicados; es el módulo de compartir. Ver F-19 y F-29.
- El único índice parcial del esquema es `UQ_user_vehicles_owner` (un `OWNER` por vehículo), no relacionado con patente/VIN ni con verificación.

## Verificación de propiedad

| Elemento buscado | Resultado en el repo | Acción |
|---|---|---|
| `verificationStatus`, `verifiedAt` | No encontrados. | Nada que eliminar. |
| `VERIFIED` | No encontrado. | Nada que eliminar. |
| `PENDING` | Aparece solo en `SharingRequestStatus` (`backend/src/entities/SharingRequest.ts:14,41` y migración), que es estado de solicitud de compartir, no verificación de propiedad. | No eliminar; no confundir con verificación. |
| `OwnershipVerification` | No encontrado. | Nada que eliminar. |
| Endpoints `/verification` y `/admin` | No existen en `backend/src/app.ts` ni en los routers. | Nada que eliminar. |
| `requireAdmin`, `requireVerifiedVehicle` | No encontrados. | Nada que eliminar. |
| `ADMIN_USER_IDS` | No encontrado. | Nada que eliminar. |
| Carpeta `backend/private` | No existe. | Nada que eliminar. |
| Insignias de verificación | No hay. El único "badge" es la etiqueta de categoría de repuesto en `frontend/app/vehicles/[vehicleId]/parts/index.tsx:79-81,165-175`, no relacionada. | Nada que eliminar. |
| Pantalla de verificar | No existe en `frontend/app/`. | Nada que eliminar. |
| `expo-document-picker` | No está en `frontend/package.json`, `frontend/package-lock.json` ni `frontend/app.json`. | Nada que eliminar. |
| Índices parciales de verificación | No hay. El único índice parcial es `UQ_user_vehicles_owner` (rol `OWNER`), que no depende de verificación. | Conservar `UQ_user_vehicles_owner`. |

## Orden sugerido de cambios

1. Actualizar la fuente de verdad: `docs/modelo-er.md` y `docs/caso-de-uso-registrar-vehiculo.md` para eliminar la unicidad global y el VIN obligatorio, y para que ningún mensaje revele registros de otros usuarios. (Hecho.)
2. Ajustar la entidad `Vehicle`: VIN nullable, sin índices únicos, con normalización; patente sigue obligatoria y normalizada.
3. Crear una migración nueva que elimine `UQ_vehicles_vin` y `UQ_vehicles_license_plate` y que haga `vin` nullable. No editar la migración inicial ya aplicada. Documentar los límites del `down`.
4. Implementar la validación de duplicado por usuario en el alta de vehículo: solo membresías `OWNER`, patente normalizada y VIN normalizado cuando exista, dentro de una transacción y con un mensaje que no revele datos de otros usuarios.
5. Actualizar el seed con dos registros independientes que compartan patente y VIN, dueños distintos, y un caso con VIN `null`.
6. Actualizar los tests de integración: misma patente/VIN entre usuarios permitido; duplicado dentro del mismo usuario rechazado; VIN `null` permitido; el índice de un `OWNER` por vehículo sigue pasando.
7. Ajustar el tipo `Vehicle` del frontend: quitar `userId`, hacer `vin` opcional y alinear el kilometraje con el backend. Si se crea la pantalla de alta, no validar VIN como obligatorio ni consultar duplicados globales.
8. Actualizar `backend/README.md` para reflejar migraciones y el seed real; añadir las reglas objetivo a `AGENTS.md`.
9. Verificar con búsquedas que no queden restos de verificación de propiedad ni consultas por patente/VIN fuera de membresía.
10. Ejecutar typecheck, build y tests del backend, y typecheck del frontend.

## Lista de verificación

- [x] `Vehicle.vin` es nullable en la entidad y en la base de datos.
- [x] `Vehicle.vin` se normaliza cuando viene y acepta `null` o vacío como ausencia.
- [x] `licensePlate` sigue siendo obligatoria y normalizada.
- [x] No queda ningún índice único global ni parcial sobre `license_plate`.
- [x] No queda ningún índice único global ni parcial sobre `vin`.
- [x] La migración nueva elimina `UQ_vehicles_vin` y `UQ_vehicles_license_plate`.
- [x] La migración nueva hace `ALTER COLUMN vin DROP NOT NULL`.
- [x] Se mantiene `UQ_user_vehicles_owner` como único dueño por vehículo.
- [x] Existe validación de duplicado por usuario para patente y para VIN cuando hay VIN.
- [x] La validación de duplicado considera solo membresías `OWNER` del usuario autenticado.
- [x] La validación de duplicado no consulta vehículos de otros usuarios.
- [x] El mensaje de duplicado no revela si otra persona registró la patente o el VIN.
- [x] No hay consultas por patente o VIN fuera de las membresías del usuario.
- [x] El seed incluye dos registros independientes con la misma patente y el mismo VIN, con dueños distintos.
- [x] El seed incluye un vehículo con VIN `null`.
- [x] Los tests permiten la misma patente/VIN en usuarios distintos.
- [x] Los tests rechazan la misma patente/VIN dentro del mismo usuario.
- [x] Los tests permiten VIN `null`.
- [x] El test del índice de un `OWNER` por vehículo sigue pasando.
- [ ] `frontend/src/api/parts.ts` ya no exige `userId` y declara `vin` opcional.
- [ ] El kilometraje del tipo `Vehicle` coincide con el campo real del backend.
- [x] `docs/modelo-er.md` ya no dice que la patente es única.
- [x] `docs/caso-de-uso-registrar-vehiculo.md` ya no revela registros de otros usuarios.
- [x] `AGENTS.md` refleja las reglas nuevas.
- [x] `backend/README.md` refleja las reglas nuevas.
- [x] No quedan `verificationStatus`, `verifiedAt`, `VERIFIED`, `OwnershipVerification`, endpoints `/verification` o `/admin`, `requireAdmin`, `requireVerifiedVehicle`, `ADMIN_USER_IDS`, `backend/private`, insignias de verificación, pantalla de verificar ni `expo-document-picker`.
- [x] Typecheck, build y tests ejecutados y reportados.
