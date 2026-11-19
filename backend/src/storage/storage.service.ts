import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';

export type ImageExtension = 'jpg' | 'png' | 'webp';

export const UPLOADS_DIR = env.uploadsDir;
export const VEHICLE_UPLOADS_DIR = path.join(UPLOADS_DIR, 'vehicles');
export const VEHICLE_PHOTO_URL_PREFIX = '/uploads/vehicles/';
export const VEHICLE_PHOTO_KEY_PREFIX = 'vehicles/';

const VEHICLE_PHOTO_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Legacy es cualquier valor que no sea una key nueva: URL pública antigua,
 * ruta /uploads o texto arbitrario que el cliente pudo guardar antes.
 */
export function isLegacyPhotoUrl(photo: string | null): boolean {
  if (photo === null) {
    return false;
  }

  const [root, owner, vehicle, file, ...rest] = photo.split('/');

  return !(
    rest.length === 0 &&
    root === 'vehicles' &&
    owner.length > 0 &&
    vehicle.length > 0 &&
    ![owner, vehicle].some(
      (part) => part === '.' || part === '..' || part.includes('\\'),
    ) &&
    VEHICLE_PHOTO_FILE.test(file)
  );
}

export function isVehiclePhotoKey(
  photo: string | null,
  userId: string,
  vehicleId: string,
): photo is string {
  return (
    photo !== null &&
    !isLegacyPhotoUrl(photo) &&
    photo.startsWith(`${VEHICLE_PHOTO_KEY_PREFIX}${userId}/${vehicleId}/`)
  );
}

const CONTENT_TYPES: Record<ImageExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface S3StorageConfig {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
}

export interface StorageConfig {
  driver: 'disk' | 's3';
  s3: S3StorageConfig;
}

type S3Sender = Pick<S3Client, 'send'>;

/**
 * Guarda fotos en disco (desarrollo) o en un bucket S3 compatible (R2).
 * `save` recibe un Buffer (modo s3, Multer en memoria) o una ruta temporal
 * (modo disk, Multer en disco) y devuelve la key a guardar en la BD.
 */
export class StorageService {
  private readonly s3: S3Sender | null;
  private readonly s3Config: Required<S3StorageConfig> | null;
  private readonly publicBase: string;

  constructor(
    private readonly config: StorageConfig,
    client?: S3Sender,
  ) {
    if (config.driver === 'disk') {
      this.s3 = null;
      this.s3Config = null;
      this.publicBase = '/uploads/';
      return;
    }

    const s3 = config.s3;
    const required = {
      endpoint: s3.endpoint,
      region: s3.region,
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      publicBaseUrl: s3.publicBaseUrl,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Almacenamiento S3 incompleto: falta ${missing.join(', ')}.`,
      );
    }

    this.s3Config = required as Required<S3StorageConfig>;
    this.publicBase = `${this.s3Config.publicBaseUrl}/`;
    this.s3 =
      client ??
      new S3Client({
        endpoint: this.s3Config.endpoint,
        region: this.s3Config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.s3Config.accessKeyId,
          secretAccessKey: this.s3Config.secretAccessKey,
        },
      });
  }

  async save(
    source: Buffer | string,
    extension: ImageExtension,
    userId: string,
    vehicleId: string,
  ): Promise<string> {
    const key = `${VEHICLE_PHOTO_KEY_PREFIX}${userId}/${vehicleId}/${randomUUID()}.${extension}`;

    if (isLegacyPhotoUrl(key)) {
      throw new Error('Identificadores de foto inválidos.');
    }

    if (this.s3) {
      if (!Buffer.isBuffer(source)) {
        throw new Error('El driver s3 requiere la foto en memoria.');
      }

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.s3Config!.bucket,
          Key: key,
          Body: source,
          ContentType: CONTENT_TYPES[extension],
        }),
      );

      return key;
    }

    if (typeof source !== 'string') {
      throw new Error('El driver disk requiere un archivo temporal.');
    }

    const relativePath = key.slice(VEHICLE_PHOTO_KEY_PREFIX.length);
    const finalPath = path.join(VEHICLE_UPLOADS_DIR, relativePath);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.rename(source, finalPath);

    return key;
  }

  /** Devuelve la URL pública de una key; los valores legacy pasan tal cual. */
  publicUrl(photo: string | null): string | null {
    if (photo === null || isLegacyPhotoUrl(photo)) {
      return photo;
    }

    return `${this.publicBase}${photo}`;
  }

  /** Borra solo keys nuevas de este almacenamiento; ignora datos legacy. */
  async remove(photoKey: string | null): Promise<void> {
    if (photoKey === null || isLegacyPhotoUrl(photoKey)) {
      return;
    }

    if (this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.s3Config!.bucket,
          Key: photoKey,
        }),
      );
      return;
    }

    await fs.rm(
      path.join(
        VEHICLE_UPLOADS_DIR,
        photoKey.slice(VEHICLE_PHOTO_KEY_PREFIX.length),
      ),
      { force: true },
    );
  }
}

export function createStorageService(
  config: StorageConfig = env.storage,
): StorageService {
  return new StorageService(config);
}
