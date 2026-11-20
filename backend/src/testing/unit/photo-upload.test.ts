import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { detectImageExtension } from '../../middlewares/photo-upload';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.from('RIFF????WEBP');

const SIGNATURES = [
  ['JPEG', JPEG, 'jpg'],
  ['PNG', PNG, 'png'],
  ['WebP', WEBP, 'webp'],
] as const;

const temporaryFiles: string[] = [];

async function tempFile(name: string, content: Buffer): Promise<string> {
  const file = path.join(os.tmpdir(), `autostory-firma-${randomUUID()}-${name}`);
  await fs.writeFile(file, content);
  temporaryFiles.push(file);
  return file;
}

afterEach(async () => {
  jest.restoreAllMocks();
  const files = temporaryFiles.splice(0);
  await Promise.all(files.map((file) => fs.rm(file, { force: true })));
});

describe('detectImageExtension', () => {
  it.each(SIGNATURES)(
    'detecta %s desde un Buffer (modo memoria)',
    async (_name, content, expected) => {
      await expect(detectImageExtension(content)).resolves.toBe(expected);
    },
  );

  it.each(SIGNATURES)(
    'detecta %s desde una ruta (modo disco)',
    async (_name, content, expected) => {
      const file = await tempFile(`${_name.toLowerCase()}.bin`, content);
      await expect(detectImageExtension(file)).resolves.toBe(expected);
    },
  );

  it('rechaza un archivo vacío', async () => {
    await expect(detectImageExtension(Buffer.alloc(0))).resolves.toBeNull();

    const file = await tempFile('vacio.jpg', Buffer.alloc(0));
    await expect(detectImageExtension(file)).resolves.toBeNull();
  });

  it('rechaza un archivo corto sin firma', async () => {
    const short = Buffer.from([0x01, 0x02, 0x03]);

    await expect(detectImageExtension(short)).resolves.toBeNull();

    const file = await tempFile('corto.jpg', short);
    await expect(detectImageExtension(file)).resolves.toBeNull();
  });

  it('detecta un JPEG de menos de 12 bytes', async () => {
    const shortJpeg = Buffer.from([0xff, 0xd8, 0xff]);

    await expect(detectImageExtension(shortJpeg)).resolves.toBe('jpg');

    const file = await tempFile('corto-valido.jpg', shortJpeg);
    await expect(detectImageExtension(file)).resolves.toBe('jpg');
  });

  it('rechaza un archivo de texto con extensión .jpg', async () => {
    const text = Buffer.from('esto es texto, no una imagen');

    await expect(detectImageExtension(text)).resolves.toBeNull();

    const file = await tempFile('texto.jpg', text);
    await expect(detectImageExtension(file)).resolves.toBeNull();
  });

  it('lee solo 12 bytes de un archivo grande y cierra el descriptor', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]);
    const file = await tempFile('grande.jpg', big);

    const readFileSpy = jest.spyOn(fs, 'readFile');
    const lengths: number[] = [];
    let closes = 0;

    const originalOpen = fs.open.bind(fs);
    jest.spyOn(fs, 'open').mockImplementation(
      async (...args: Parameters<typeof fs.open>) => {
        const handle = await originalOpen(...args);

        const originalRead = handle.read.bind(handle);
        const readSpy = jest.spyOn(handle, 'read') as unknown as jest.SpyInstance<
          Promise<{ bytesRead: number; buffer: Buffer }>,
          [Buffer, number, number, number]
        >;
        readSpy.mockImplementation(async (buffer, offset, length, position) => {
          lengths.push(length);
          return originalRead(buffer, offset, length, position);
        });

        const originalClose = handle.close.bind(handle);
        const closeSpy = jest.spyOn(handle, 'close') as unknown as jest.SpyInstance<
          Promise<void>,
          []
        >;
        closeSpy.mockImplementation(async () => {
          closes += 1;
          return originalClose();
        });

        return handle;
      },
    );

    await expect(detectImageExtension(file)).resolves.toBe('jpg');
    expect(readFileSpy).not.toHaveBeenCalled();
    expect(lengths).toEqual([12]);
    expect(closes).toBe(1);
  });
});
