import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  isLegacyPhotoUrl,
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
    expect(isLegacyPhotoUrl(key)).toBe(false);
    expect(storage.publicUrl(key)).toBe(`https://fotos.example.com/${key}`);
    expect(storage.publicUrl('/uploads/vehicles/legacy.png')).toBe(
      '/uploads/vehicles/legacy.png',
    );

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

  it('nunca envía valores legacy al bucket', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    expect(isLegacyPhotoUrl('/uploads/vehicles/legacy.png')).toBe(true);
    expect(
      isLegacyPhotoUrl('https://fotos.example.com/vehicles/ajena.png'),
    ).toBe(true);
    expect(isLegacyPhotoUrl(null)).toBe(false);

    await storage.remove('/uploads/vehicles/legacy.png');
    await storage.remove('https://fotos.example.com/vehicles/ajena.png');
    await storage.remove(null);

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
});
