import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  StorageConfig,
  StorageService,
  VEHICLE_UPLOADS_DIR,
} from '../../storage/storage.service';

const S3_CONFIG: StorageConfig = {
  driver: 's3',
  s3: {
    endpoint: 'https://cuenta.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'autostory-fotos',
    accessKeyId: 'clave',
    secretAccessKey: 'secreto',
    publicBaseUrl: 'https://fotos.example.com',
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
  return { send: jest.fn().mockResolvedValue({}) };
}

describe('StorageService con driver s3', () => {
  it('sube la foto con prefijo de dueño y vehículo y devuelve la key', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    const key = await storage.save(PNG, 'png', USER_ID, VEHICLE_ID);

    expect(key).toMatch(keyPattern('png'));
    expect(storage.publicUrl(key)).toBe(`https://fotos.example.com/${key}`);

    const [command] = client.send.mock.calls[0] as [PutObjectCommand];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'autostory-fotos',
      Key: key,
      Body: PNG,
      ContentType: 'image/png',
    });
  });

  it('al reemplazar una foto borra la anterior del bucket', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    const first = await storage.save(PNG, 'png', USER_ID, VEHICLE_ID);
    const second = await storage.save(PNG, 'webp', USER_ID, VEHICLE_ID);
    await storage.remove(first);

    expect(second).not.toBe(first);

    const [command] = client.send.mock.calls[2] as [DeleteObjectCommand];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'autostory-fotos',
      Key: first,
    });
  });

  it('devuelve null para un valor antiguo y rechaza remove sin tocar el bucket', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    expect(storage.publicUrl('foto-antigua')).toBeNull();
    expect(storage.publicUrl('otra-foto-invalida')).toBeNull();
    expect(storage.publicUrl(null)).toBeNull();

    await expect(storage.remove('foto-antigua')).rejects.toThrow(
      'Key de foto inválida.',
    );
    await expect(storage.remove('otra-foto-invalida')).rejects.toThrow(
      'Key de foto inválida.',
    );
    await expect(storage.remove(null)).rejects.toThrow(
      'Key de foto inválida.',
    );

    expect(client.send).not.toHaveBeenCalled();
  });

  it('propaga el error del bucket para que quien llama decida', async () => {
    const client = fakeClient();
    client.send.mockRejectedValueOnce(new Error('sin conexión'));
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
