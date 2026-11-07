import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { ErrorRequestHandler } from 'express';
import multer from 'multer';

export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
export const VEHICLE_UPLOADS_DIR = path.join(UPLOADS_DIR, 'vehicles');
export const VEHICLE_PHOTO_URL_PREFIX = '/uploads/vehicles/';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

fs.mkdir(VEHICLE_UPLOADS_DIR, { recursive: true }).catch(() => undefined);

export const vehiclePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: VEHICLE_UPLOADS_DIR,
    // La extensión real se decide después, leyendo la firma del archivo.
    filename: (_req, _file, callback) =>
      callback(null, `${randomUUID()}.tmp`),
  }),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

export const photoUploadErrors: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'La foto no puede superar los 5 MB.'
          : 'No se pudo subir la foto.',
    });
    return;
  }

  next(error);
};

export type ImageExtension = 'jpg' | 'png' | 'webp';

/** Detecta el tipo por la firma real del archivo, no por su nombre. */
export async function detectImageExtension(
  filePath: string,
): Promise<ImageExtension | null> {
  const header = await fs.readFile(filePath);

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'jpg';
  }

  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return 'png';
  }

  if (
    header.toString('ascii', 0, 4) === 'RIFF' &&
    header.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

/** Borra una foto guardada, ignorando rutas ajenas o inexistentes. */
export async function removeVehiclePhoto(photoUrl: string | null): Promise<void> {
  if (!photoUrl || !photoUrl.startsWith(VEHICLE_PHOTO_URL_PREFIX)) {
    return;
  }

  await fs.rm(path.join(VEHICLE_UPLOADS_DIR, path.basename(photoUrl)), {
    force: true,
  });
}
