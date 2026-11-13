import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  StorageConfig,
  StorageService,
  VEHICLE_UPLOADS_DIR,
} from './storage.service';

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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeClient() {
  return { send: jest.fn().mockResolvedValue({}) };
}

describe('StorageService con driver s3', () => {
  it('sube la foto y devuelve la URL pública completa', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    const url = await storage.save(PNG, 'png');

    expect(url).toMatch(
      /^https:\/\/fotos\.example\.com\/vehicles\/[0-9a-f-]{36}\.png$/,
    );

    const [command] = client.send.mock.calls[0] as [PutObjectCommand];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'autostory-fotos',
      Key: url.replace('https://fotos.example.com/', ''),
      Body: PNG,
      ContentType: 'image/png',
    });
  });

  it('al reemplazar una foto borra la anterior del bucket', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    const first = await storage.save(PNG, 'png');
    const second = await storage.save(PNG, 'webp');
    await storage.remove(first);

    expect(second).not.toBe(first);

    const [command] = client.send.mock.calls[2] as [DeleteObjectCommand];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'autostory-fotos',
      Key: first.replace('https://fotos.example.com/', ''),
    });
  });

  it('ignora las photoUrl relativas y las que no son del bucket', async () => {
    const client = fakeClient();
    const storage = new StorageService(S3_CONFIG, client);

    await storage.remove('/uploads/vehicles/legacy.png');
    await storage.remove('https://otro.example.com/vehicles/foto.png');
    await storage.remove(null);

    expect(client.send).not.toHaveBeenCalled();
  });

  it('propaga el error del bucket para que quien llama decida', async () => {
    const client = fakeClient();
    client.send.mockRejectedValueOnce(new Error('sin conexión'));
    const storage = new StorageService(S3_CONFIG, client);

    await expect(storage.save(PNG, 'jpg')).rejects.toThrow('sin conexión');
  });
});

describe('StorageService con driver disk', () => {
  it('mantiene las photoUrl relativas de siempre', async () => {
    const storage = new StorageService({ driver: 'disk', s3: {} });
    const tempPath = path.join(VEHICLE_UPLOADS_DIR, `${randomUUID()}.tmp`);

    await fs.mkdir(VEHICLE_UPLOADS_DIR, { recursive: true });
    await fs.writeFile(tempPath, PNG);

    const url = await storage.save(tempPath, 'png');

    expect(url).toMatch(/^\/uploads\/vehicles\/[0-9a-f-]{36}\.png$/);
    await expect(
      fs.access(path.join(VEHICLE_UPLOADS_DIR, path.basename(url))),
    ).resolves.toBeUndefined();

    await storage.remove(url);
    await expect(
      fs.access(path.join(VEHICLE_UPLOADS_DIR, path.basename(url))),
    ).rejects.toThrow();
  });
});
