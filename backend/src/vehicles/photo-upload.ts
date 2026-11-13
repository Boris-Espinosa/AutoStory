import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import {
  ImageExtension,
  VEHICLE_UPLOADS_DIR,
} from '../storage/storage.service';

export {
  UPLOADS_DIR,
  VEHICLE_UPLOADS_DIR,
  VEHICLE_PHOTO_URL_PREFIX,
} from '../storage/storage.service';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

fs.mkdir(VEHICLE_UPLOADS_DIR, { recursive: true }).catch(() => undefined);

export const vehiclePhotoUpload = multer({
  storage:
    env.storage.driver === 's3'
      ? multer.memoryStorage()
      : multer.diskStorage({
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

/** Detecta el tipo por la firma real del archivo, no por su nombre. */
export async function detectImageExtension(
  source: Buffer | string,
): Promise<ImageExtension | null> {
  const header = Buffer.isBuffer(source) ? source : await fs.readFile(source);

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
