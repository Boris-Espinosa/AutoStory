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

const S3_KEY_PREFIX = 'vehicles/';

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
 * (modo disk, Multer en disco) y devuelve la photoUrl a guardar.
 */
export class StorageService {
  private readonly s3: S3Sender | null;
  private readonly s3Config: Required<S3StorageConfig> | null;

  constructor(
    private readonly config: StorageConfig,
    client?: S3Sender,
  ) {
    if (config.driver === 'disk') {
      this.s3 = null;
      this.s3Config = null;
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
  ): Promise<string> {
    const key = `${S3_KEY_PREFIX}${randomUUID()}.${extension}`;

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

      return `${this.s3Config!.publicBaseUrl}/${key}`;
    }

    if (typeof source !== 'string') {
      throw new Error('El driver disk requiere un archivo temporal.');
    }

    const finalPath = source.replace(/\.tmp$/, `.${extension}`);
    await fs.rename(source, finalPath);

    return `${VEHICLE_PHOTO_URL_PREFIX}${path.basename(finalPath)}`;
  }

  /** Borra la foto si pertenece a este almacenamiento; ignora el resto. */
  async remove(photoUrl: string | null): Promise<void> {
    if (!photoUrl) {
      return;
    }

    if (this.s3) {
      const base = `${this.s3Config!.publicBaseUrl}/`;

      if (!photoUrl.startsWith(base)) {
        return;
      }

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.s3Config!.bucket,
          Key: photoUrl.slice(base.length),
        }),
      );
      return;
    }

    if (!photoUrl.startsWith(VEHICLE_PHOTO_URL_PREFIX)) {
      return;
    }

    await fs.rm(path.join(VEHICLE_UPLOADS_DIR, path.basename(photoUrl)), {
      force: true,
    });
  }
}

export function createStorageService(
  config: StorageConfig = env.storage,
): StorageService {
  return new StorageService(config);
}
