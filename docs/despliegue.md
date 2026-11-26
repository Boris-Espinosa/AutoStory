# Despliegue de fotos en Cloudflare R2

La API guarda las fotos de los vehículos con un `StorageService` que tiene dos
drivers:

- `disk`: solo para desarrollo y tests. Escribe en `backend/uploads/vehicles/` y
  guarda en `photoUrl` la clave interna `vehicles/<userId>/<vehicleId>/<uuid>.<ext>`.
  La API devuelve esa clave como URL local
  (`/uploads/vehicles/<userId>/<vehicleId>/<uuid>.<ext>`). No se permite en
  producción.
- `s3`: obligatorio en producción (compatible con R2). Escribe en un bucket
  privado y guarda en `photoUrl` la misma clave interna. La API devuelve una URL
  firmada de lectura que caduca; no hay URL pública del bucket.

El driver se elige con `STORAGE_DRIVER` (`s3` es obligatorio cuando
`NODE_ENV=production`). En ambos modos se valida la firma real del archivo
(JPG, PNG o WEBP) y el límite de 8 MB.

## 1. Crear el bucket

1. Entra a Cloudflare y abre **R2 Object Storage**.
2. Pulsa **Create bucket**, elige un nombre (por ejemplo `autostory-fotos`) y
   crea el bucket.
3. Anota el **Account ID** de Cloudflare: forma parte del endpoint S3.

## 2. Crear el token de API

1. En el panel de R2, dentro de **Account Details**, selecciona **Manage** junto
   a **API Tokens** y crea un token de cuenta o de usuario. El nombre exacto de
   la opción en el panel: **por verificar**. La guía oficial está en
   https://developers.cloudflare.com/r2/api/tokens/.
2. Permisos: **Object Read & Write**, el mínimo que permite leer y escribir
   objetos. No des permisos de administrador.
3. Limita el token solo al bucket creado. Cloudflare documenta que este permiso
   se puede restringir a un conjunto de buckets; el nombre exacto de esa opción
   en el panel: **por verificar**.
4. Al crearlo, copia el **Access Key ID** y el **Secret Access Key**. El secreto
   se muestra una sola vez.
5. El endpoint S3 del bucket es:

   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

   La región para R2 es siempre `auto`.

## 3. Mantener el bucket privado

El bucket **no debe tener acceso público**: no habilites el subdominio `r2.dev`
ni conectes un custom domain para lectura. No hay URL pública base que
configurar.

Las fotos se entregan con URLs firmadas que genera el backend, así que el
navegador no necesita credenciales ni una URL pública del bucket. Las firmas se
agrupan en ventanas de 30 minutos y cada URL tiene entre 1 y 1,5 horas de vida
restante según cuándo se pidió.

## 4. Configurar el backend

En `backend/.env` (nunca en el frontend ni en el repositorio):

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=autostory-fotos
S3_ACCESS_KEY_ID=<access-key-id>
S3_SECRET_ACCESS_KEY=<secret-access-key>
```

`backend/.env.example` mantiene las mismas variables sin secretos. No hay
`S3_PUBLIC_BASE_URL`: el bucket es privado y la API firma las URLs.

Con `NODE_ENV=production` y `STORAGE_DRIVER=s3`, si falta alguna variable
obligatoria el servidor no arranca y muestra las que faltan. Las claves nunca se
registran en los logs.

## 5. Desplegar y verificar

1. Ejecuta las migraciones y arranca la API como siempre
   (`npm run start:prod`).
2. Sube una foto desde la app o con `curl`:

   ```bash
   curl -X POST https://api.tudominio.cl/vehicles/<id>/photo \
     -H "Authorization: Bearer <token>" \
     -F "photo=@foto.png"
   ```

3. La respuesta trae una `photoUrl` firmada con la clave
   `vehicles/<userId>/<vehicleId>/<uuid>.<ext>`, por ejemplo:

   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/vehicles/<userId>/<vehicleId>/<uuid>.<ext>?X-Amz-Algorithm=...&X-Amz-Signature=...
   ```

   Ábrela en el navegador: debe cargar aunque el bucket sea privado. La URL
   caduca (ventana de firma de 30 min, 1-1,5 h de vida restante).
4. Reemplaza la foto y confirma que la anterior desapareció del bucket.
5. Elimina el vehículo y confirma que su foto también se borró.

## 6. Checklist de despliegue de fotos

1. En Render, configura las variables de producción: `STORAGE_DRIVER=s3`,
   `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y
   `S3_SECRET_ACCESS_KEY`. Quita las que ya no se usen, en particular
   `S3_PUBLIC_BASE_URL`.
2. Confirma que el bucket no tiene acceso público: `r2.dev` desactivado y sin
   dominios personalizados de lectura.
3. Obtén una `photoUrl` recién firmada de la API y ábrela en el navegador:
   debe cargar.
4. A esa misma URL quítale los parámetros de firma (`X-Amz-*`) y ábrela de nuevo:
   no debe cargar.
5. Abre la foto desde la app web y desde la móvil: debe cargar en ambas.

## Notas

- Las fotos se guardan con la clave `vehicles/<userId>/<vehicleId>/<uuid>.<ext>`.
- Al reemplazar o eliminar un vehículo se borra la foto anterior. Si el bucket
  falla, el error queda en el log pero la respuesta de la API no se bloquea.
- Las `photoUrl` relativas antiguas (`/uploads/vehicles/...`) ya no funcionan en
  producción: `/uploads` solo existe en desarrollo con `disk`. Copia esas fotos
  al bucket y actualiza sus claves en la BD para que la API pueda firmarlas.
- No expongas `S3_ACCESS_KEY_ID` ni `S3_SECRET_ACCESS_KEY` en el frontend:
  el navegador solo necesita la URL firmada.

## Antes de escalar a más de una instancia

Hoy corre una sola instancia de la API. Los tres puntos siguientes no fallan en
ese escenario, pero sí al levantar varias réplicas.

### 1. Migraciones en el arranque

- **Ubicación:** `backend/package.json`, script `start:prod` (línea 14), que
  ejecuta `dist/db/run-migrations.js` antes de `dist/server.js`; código en
  `backend/src/db/run-migrations.ts`.
- **Problema:** con varios procesos arrancando a la vez, las migraciones pueden
  ejecutarse en paralelo contra la misma base de datos.
- **Por qué hoy no afecta:** solo hay un proceso que arranca y las corre una vez.
- **Solución recomendada:** sacar las migraciones del arranque y dejarlas como
  un paso explícito del despliegue, o bien ejecutarlas con un lock que solo
  permita a una instancia correrlas.

### 2. Limitador de consultas VIN en memoria

- **Ubicación:** `backend/src/routes/vehicles.routes.ts`, líneas 79-90
  (`vinDecodeLimiter`, con `express-rate-limit` y su almacén en memoria por
  defecto), aplicado a la ruta `/vin/:vin/decode`.
- **Problema:** cada proceso cuenta sus propias solicitudes; con N réplicas el límite
  efectivo por usuario es N veces mayor (20 por minuto por proceso).
- **Por qué hoy no afecta:** con una sola instancia hay un único contador.
- **Solución recomendada:** usar un almacén compartido para el rate limit, o
  aplicar el límite en el proxy/capa de entrada frente a todas las réplicas.

### 3. Contador de fallos del reminder worker en memoria

- **Ubicación:** `backend/src/jobs/reminder-worker.ts`, mapa
  `consecutiveFailures` (línea 31), usado al registrar y descartar fallos
  (líneas 105-120 y 147-163).
- **Problema:** el contador queda repartido entre procesos y se pierde al
  reiniciar, así que el descarto tras fallos seguidos deja de ser confiable.
- **Por qué hoy no afecta:** una sola instancia concentra todos los intentos,
  aunque ya se reinicia con el contador en cero.
- **Solución recomendada:** guardar el contador de fallos en la base de datos
  para que sea compartido y persista entre reinicios.
