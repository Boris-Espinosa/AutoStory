import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

export type ImageExtension = 'jpg' | 'png' | 'webp';

export const UPLOADS_DIR = env.uploadsDir;
export const VEHICLE_UPLOADS_DIR = path.join(UPLOADS_DIR, 'vehicles');
export const VEHICLE_PHOTO_URL_PREFIX = '/uploads/vehicles/';
export const VEHICLE_PHOTO_KEY_PREFIX = 'vehicles/';
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

const VEHICLE_PHOTO_KEY =
  /^vehicles\/(?!\.{1,2}(?=\/|$))[^/\\]+\/(?!\.{1,2}(?=\/|$))[^/\\]+\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

export function isVehiclePhotoKeyFormat(photo: string | null): photo is string {
  return typeof photo === 'string' && VEHICLE_PHOTO_KEY.test(photo);
}

export function isVehiclePhotoKey(
  photo: string | null,
  userId: string,
  vehicleId: string,
): photo is string {
  return (
    isVehiclePhotoKeyFormat(photo) &&
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

/**
 * Guarda fotos en disco (desarrollo) o en un bucket S3 compatible (R2).
 * `save` recibe un Buffer (modo s3, Multer en memoria) o una ruta temporal
 * (modo disk, Multer en disco) y devuelve la key a guardar en la BD.
 */
export class StorageService {
  private readonly s3: S3Client | null;
  private readonly s3Config: Required<S3StorageConfig> | null;
  private readonly publicBase: string;

  constructor(
    private readonly config: StorageConfig,
    client?: S3Client,
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

    if (!isVehiclePhotoKeyFormat(key)) {
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
    const baseDir = path.resolve(VEHICLE_UPLOADS_DIR);
    const finalPath = path.resolve(baseDir, relativePath);
    if (!finalPath.startsWith(baseDir + path.sep)) {
      throw new Error('Ruta de foto inválida.');
    }
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.rename(source, finalPath);

    return key;
  }

  /** Devuelve la URL pública de una key válida; cualquier otro valor se descarta. */
  publicUrl(photo: string | null): string | null {
    if (!isVehiclePhotoKeyFormat(photo)) {
      return null;
    }

    return `${this.publicBase}${photo}`;
  }

  /** Devuelve una URL de lectura firmada (s3) o la URL local (disk). */
  async signedUrl(
    photo: string | null,
    ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    if (!isVehiclePhotoKeyFormat(photo)) {
      return null;
    }

    if (!this.s3) {
      return this.publicUrl(photo);
    }

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.s3Config!.bucket, Key: photo }),
      { expiresIn: ttlSeconds },
    );
  }

  /** Borra solo keys válidas de este almacenamiento. */
  async remove(photoKey: string | null): Promise<void> {
    if (!isVehiclePhotoKeyFormat(photoKey)) {
      throw new Error('Key de foto inválida.');
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

    const baseDir = path.resolve(VEHICLE_UPLOADS_DIR);
    const targetPath = path.resolve(
      baseDir,
      photoKey.slice(VEHICLE_PHOTO_KEY_PREFIX.length),
    );
    if (!targetPath.startsWith(baseDir + path.sep)) {
      throw new Error('Ruta de foto inválida.');
    }

    await fs.rm(targetPath, { force: true });
  }
}

export function createStorageService(
  config: StorageConfig = env.storage,
): StorageService {
  return new StorageService(config);
}
