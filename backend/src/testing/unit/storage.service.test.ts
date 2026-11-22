import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  MIN_SIGNED_URL_TTL_SECONDS,
  SIGNING_WINDOW_SECONDS,
  StorageConfig,
  StorageService,
  VEHICLE_UPLOADS_DIR,
  isVehiclePhotoKeyFormat,
} from '../../storage/storage.service';

const S3_CONFIG: StorageConfig = {
  driver: 's3',
  s3: {
    endpoint: 'https://cuenta.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'autostory-fotos',
    accessKeyId: 'clave',
    secretAccessKey: 'secreto',
  },
};

const USER_ID = 'user-1';
const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function keyPattern(extension: string): RegExp {
  return new RegExp(
    `^vehicles/${USER_ID}/${VEHICLE_ID}/[0-9a-f-]{36}\\.${extension}$`,
  );
}

function fakeClient() {
  const client = new S3Client({
    endpoint: 'https://cuenta.r2.cloudflarestorage.com',
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: 'clave', secretAccessKey: 'secreto' },
  });
  const send = jest
    .spyOn(client, 'send')
    .mockResolvedValue({} as never) as unknown as jest.Mock;

  return { client, send };
}

function secondsFromAmzDate(url: URL): number {
  const value = url.searchParams.get('X-Amz-Date');
  if (!value) {
    throw new Error('falta X-Amz-Date');
  }

  return (
    Date.parse(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`,
    ) / 1000
  );
}

describe('StorageService con driver s3', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-22T10:07:13Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sube la foto con prefijo de dueño y vehículo y devuelve la key', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    const key = await storage.save(PNG, 'png', USER_ID, VEHICLE_ID);

    expect(key).toMatch(keyPattern('png'));

    const [command] = send.mock.calls[0] as [PutObjectCommand];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'autostory-fotos',
      Key: key,
      Body: PNG,
      ContentType: 'image/png',
    });
  });

  it('al reemplazar una foto borra la anterior del bucket', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    const first = await storage.save(PNG, 'png', USER_ID, VEHICLE_ID);
    const second = await storage.save(PNG, 'webp', USER_ID, VEHICLE_ID);
    await storage.remove(first);

    expect(second).not.toBe(first);

    const [command] = send.mock.calls[2] as [DeleteObjectCommand];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'autostory-fotos',
      Key: first,
    });
  });

  it('devuelve null para un valor antiguo y rechaza remove sin tocar el bucket', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    expect(await storage.signedUrl('foto-antigua')).toBeNull();
    expect(await storage.signedUrl('otra-foto-invalida')).toBeNull();
    expect(await storage.signedUrl(null)).toBeNull();

    await expect(storage.remove('foto-antigua')).rejects.toThrow(
      'Key de foto inválida.',
    );
    await expect(storage.remove('otra-foto-invalida')).rejects.toThrow(
      'Key de foto inválida.',
    );
    await expect(storage.remove(null)).rejects.toThrow(
      'Key de foto inválida.',
    );

    expect(send).not.toHaveBeenCalled();
  });

  it('nunca lanza y rechaza keys malformadas sin tocar el bucket', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);
    const valid = `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png`;
    const long = `vehicles/${USER_ID}/${VEHICLE_ID}/${'a'.repeat(10_000)}.png`;

    expect(isVehiclePhotoKeyFormat('vehicles/user-1')).toBe(false);
    expect(isVehiclePhotoKeyFormat('')).toBe(false);
    expect(isVehiclePhotoKeyFormat('vehicles//x/y')).toBe(false);
    expect(isVehiclePhotoKeyFormat(`vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png/extra`)).toBe(false);
    expect(isVehiclePhotoKeyFormat(long)).toBe(false);
    expect(isVehiclePhotoKeyFormat(valid)).toBe(true);

    for (const key of ['vehicles/user-1', '', 'vehicles//x/y', `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png/extra`, long]) {
      await expect(storage.signedUrl(key)).resolves.toBeNull();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('firma una URL de lectura GET en el endpoint S3', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);
    const key = `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png`;

    const signed = await storage.signedUrl(key);

    expect(signed).not.toBeNull();
    const url = new URL(signed!);
    expect(url.host).toBe('cuenta.r2.cloudflarestorage.com');
    expect(url.pathname).toContain(`/${S3_CONFIG.s3.bucket}/${key}`);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(
      String(MIN_SIGNED_URL_TTL_SECONDS + SIGNING_WINDOW_SECONDS),
    );
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261122T100000Z');
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('alinea la fecha de firma a ventanas de 30 minutos y expira en 5400 s', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);
    const key = `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png`;

    const url = new URL((await storage.signedUrl(key))!);

    expect(url.searchParams.get('X-Amz-Expires')).toBe(
      String(MIN_SIGNED_URL_TTL_SECONDS + SIGNING_WINDOW_SECONDS),
    );
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261122T100000Z');
    expect(send).not.toHaveBeenCalled();
  });

  it('repite la misma URL dentro de una ventana y cambia en la siguiente', async () => {
    const { client } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);
    const key = `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png`;

    const primera = await storage.signedUrl(key);

    jest.setSystemTime(new Date('2026-11-22T10:29:59Z'));
    expect(await storage.signedUrl(key)).toBe(primera);

    jest.setSystemTime(new Date('2026-11-22T10:30:00Z'));
    expect(await storage.signedUrl(key)).not.toBe(primera);
  });

  it('mantiene entre 3600 y 5400 s de vida al inicio y al final de la ventana', async () => {
    const { client } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);
    const key = `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png`;

    for (const instante of [
      '2026-11-22T10:00:00Z',
      '2026-11-22T10:29:59Z',
    ]) {
      jest.setSystemTime(new Date(instante));
      const url = new URL((await storage.signedUrl(key))!);
      const expira =
        secondsFromAmzDate(url) +
        Number(url.searchParams.get('X-Amz-Expires'));
      const restante = expira - Math.floor(Date.now() / 1000);

      expect(restante).toBeGreaterThanOrEqual(MIN_SIGNED_URL_TTL_SECONDS);
      expect(restante).toBeLessThanOrEqual(
        MIN_SIGNED_URL_TTL_SECONDS + SIGNING_WINDOW_SECONDS,
      );
    }
  });

  it('devuelve null para keys inválidas al firmar y no toca el bucket', async () => {
    const { client, send } = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    for (const invalid of ['', '../../foto.png', null]) {
      expect(await storage.signedUrl(invalid)).toBeNull();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('propaga el error del bucket para que quien llama decida', async () => {
    const { client, send } = fakeClient();
    send.mockRejectedValueOnce(new Error('sin conexión'));
    const storage = new StorageService(S3_CONFIG, client);

    await expect(
      storage.save(PNG, 'jpg', USER_ID, VEHICLE_ID),
    ).rejects.toThrow('sin conexión');
  });
});

describe('StorageService con driver disk', () => {
  it('guarda la key en la carpeta del dueño y del vehículo', async () => {
    const storage = new StorageService({ driver: 'disk', s3: {} });
    const tempPath = path.join(VEHICLE_UPLOADS_DIR, `${randomUUID()}.tmp`);
    const ownerDir = path.join(VEHICLE_UPLOADS_DIR, USER_ID, VEHICLE_ID);

    await fs.mkdir(VEHICLE_UPLOADS_DIR, { recursive: true });
    await fs.writeFile(tempPath, PNG);

    const key = await storage.save(tempPath, 'png', USER_ID, VEHICLE_ID);
    const finalPath = path.join(ownerDir, path.basename(key));

    expect(key).toMatch(keyPattern('png'));
    expect(storage.publicUrl(key)).toBe(`/uploads/${key}`);
    await expect(fs.access(finalPath)).resolves.toBeUndefined();

    await storage.remove(key);
    await expect(fs.access(finalPath)).rejects.toThrow();

    await fs.rm(ownerDir, { recursive: true, force: true });
  });

  it('en disk devuelve la misma URL que publicUrl', async () => {
    const storage = new StorageService({ driver: 'disk', s3: {} });
    const key = `vehicles/${USER_ID}/${VEHICLE_ID}/${randomUUID()}.png`;

    expect(await storage.signedUrl(key)).toBe(storage.publicUrl(key));
    expect(await storage.signedUrl(key)).toBe(`/uploads/${key}`);
    expect(await storage.signedUrl('../../foto.png')).toBeNull();
  });

  it('devuelve null para un valor antiguo y rechaza remove sin tocar disco', async () => {
    const storage = new StorageService({ driver: 'disk', s3: {} });
    const rmSpy = jest.spyOn(fs, 'rm');

    try {
      expect(storage.publicUrl('foto-antigua')).toBeNull();

      await expect(storage.remove('foto-antigua')).rejects.toThrow(
        'Key de foto inválida.',
      );
      await expect(storage.remove(null)).rejects.toThrow(
        'Key de foto inválida.',
      );

      expect(rmSpy).not.toHaveBeenCalled();
    } finally {
      rmSpy.mockRestore();
    }
  });

  it('rechaza keys que salen de uploads sin tocar el disco', async () => {
    const storage = new StorageService({ driver: 'disk', s3: {} });
    const sentinel = path.join(
      path.dirname(VEHICLE_UPLOADS_DIR),
      `${randomUUID()}.txt`,
    );
    const tempPath = path.join(VEHICLE_UPLOADS_DIR, `${randomUUID()}.tmp`);
    const outsideFile = `${randomUUID()}.png`;
    const absoluteOutside = path.sep === '\\' ? 'C:/Windows' : '/etc';
    const traversalSegments = ['..', String.raw`..\..`, absoluteOutside];

    await fs.mkdir(VEHICLE_UPLOADS_DIR, { recursive: true });
    await fs.writeFile(sentinel, PNG);
    await fs.writeFile(tempPath, PNG);

    const rmSpy = jest.spyOn(fs, 'rm');
    const renameSpy = jest.spyOn(fs, 'rename');

    try {
      for (const segment of traversalSegments) {
        await expect(
          storage.save(tempPath, 'png', segment, 'vehiculo'),
        ).rejects.toThrow();
        await expect(
          storage.save(tempPath, 'png', 'usuario', segment),
        ).rejects.toThrow();

        for (const key of [
          `vehicles/${segment}/vehiculo/${outsideFile}`,
          `vehicles/usuario/${segment}/${outsideFile}`,
        ]) {
          await expect(storage.remove(key)).rejects.toThrow();
        }
      }

      await expect(
        storage.save(tempPath, 'png', 'usuario', `vehiculo\0`),
      ).rejects.toThrow();
      await expect(
        storage.remove(`vehicles/usuario/vehiculo/${outsideFile}\0.png`),
      ).rejects.toThrow('Key de foto inválida.');

      expect(renameSpy).not.toHaveBeenCalled();
      expect(rmSpy).not.toHaveBeenCalled();
      await expect(fs.access(sentinel)).resolves.toBeUndefined();
      await expect(fs.access(tempPath)).resolves.toBeUndefined();
    } finally {
      rmSpy.mockRestore();
      renameSpy.mockRestore();
      await fs.rm(sentinel, { force: true });
      await fs.rm(tempPath, { force: true });
    }
  });
});
