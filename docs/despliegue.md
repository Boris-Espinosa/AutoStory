# Despliegue de fotos en Cloudflare R2

La API guarda las fotos de los vehículos con un `StorageService` que tiene dos
drivers:

- `disk` (por defecto): escribe en `backend/uploads/vehicles/` y guarda en
  `photoUrl` una ruta relativa (`/uploads/vehicles/<uuid>.png`). Es el modo de
  desarrollo.
- `s3`: escribe en un bucket compatible con S3 (Cloudflare R2) y guarda en
  `photoUrl` la URL pública completa. Es el modo recomendado en producción.

El driver se elige con `STORAGE_DRIVER`. En ambos modos se valida la firma real
del archivo (JPG, PNG o WEBP) y el límite de 5 MB.

## 1. Crear el bucket

1. Entra a Cloudflare y abre **R2 Object Storage**.
2. Pulsa **Create bucket**, elige un nombre (por ejemplo `autostory-fotos`) y
   crea el bucket.
3. Anota el **Account ID** de Cloudflare: forma parte del endpoint S3.

## 2. Crear el token de API

1. En R2 abre **Manage R2 API Tokens** y pulsa **Create API token**.
2. Permisos: **Object Read & Write**.
3. Limita el token al bucket creado (opción "Only apply to specific buckets").
4. Al crearlo, copia el **Access Key ID** y el **Secret Access Key**. El secreto
   se muestra una sola vez.
5. El endpoint S3 del bucket es:

   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

   La región para R2 es siempre `auto`.

## 3. Activar el acceso público

Las fotos se muestran desde una URL pública, sin credenciales:

1. Abre el bucket y entra en **Settings** > **Public access**.
2. Opción rápida: habilita el subdominio **r2.dev**. Cloudflare lo marca como
   solo para desarrollo (tiene límites de tráfico).
3. Opción recomendada para producción: conecta un **custom domain** (por
   ejemplo `fotos.tudominio.cl`) y verifica el DNS que Cloudflare indica.
4. Copia la URL pública resultante, sin barra final. Será
   `S3_PUBLIC_BASE_URL`.

## 4. Configurar el backend

En `backend/.env` (nunca en el frontend ni en el repositorio):

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=autostory-fotos
S3_ACCESS_KEY_ID=<access-key-id>
S3_SECRET_ACCESS_KEY=<secret-access-key>
S3_PUBLIC_BASE_URL=https://fotos.tudominio.cl
```

`backend/.env.example` mantiene las mismas variables sin secretos.

Con `NODE_ENV=production` y `STORAGE_DRIVER=s3`, si falta cualquiera de las seis
variables el servidor no arranca y muestra las que faltan. Las claves nunca se
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

3. La respuesta trae una `photoUrl` del tipo
   `https://fotos.tudominio.cl/vehicles/<uuid>.png`. Ábrela en el navegador:
   debe cargar sin credenciales.
4. Reemplaza la foto y confirma que la anterior desapareció del bucket.
5. Elimina el vehículo y confirma que su foto también se borró.

## Notas

- Las fotos se guardan con la clave `vehicles/<uuid>.<ext>`.
- Al reemplazar o eliminar un vehículo se borra la foto anterior. Si el bucket
  falla, el error queda en el log pero la respuesta de la API no se bloquea.
- Las `photoUrl` relativas existentes (`/uploads/vehicles/...`) siguen
  funcionando mientras se sirva `/uploads` con el driver `disk`. Al pasar a
  `s3` no se migran solas: copia los archivos al bucket y actualiza sus URLs, o
  mantén el disco montado para las fotos antiguas.
- No expongas `S3_ACCESS_KEY_ID` ni `S3_SECRET_ACCESS_KEY` en el frontend:
  el navegador solo necesita la URL pública.
