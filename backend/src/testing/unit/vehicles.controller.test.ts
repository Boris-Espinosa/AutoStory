import { withPhotoUrl } from '../../controllers/vehicles.controller';
import { StorageService } from '../../storage/storage.service';

const KEY = `vehicles/user-1/11111111-1111-4111-8111-111111111111/${'a'.repeat(36)}.png`;
const FIRMADA = 'https://endpoint.test/firmada?X-Amz-Signature=redactada';

function fakeStorage(signedUrl: jest.Mock): StorageService {
  return { signedUrl } as unknown as StorageService;
}

describe('withPhotoUrl', () => {
  it('usa la URL firmada del storage', async () => {
    const signedUrl = jest.fn().mockResolvedValue(FIRMADA);
    const storage = fakeStorage(signedUrl);

    await expect(
      withPhotoUrl({ id: 'v1', photoUrl: KEY }, storage),
    ).resolves.toEqual({ id: 'v1', photoUrl: FIRMADA });
    expect(signedUrl).toHaveBeenCalledWith(KEY);
  });

  it('devuelve null sin foto y no llama al storage', async () => {
    const signedUrl = jest.fn();
    const storage = fakeStorage(signedUrl);

    await expect(
      withPhotoUrl({ id: 'v1', photoUrl: null }, storage),
    ).resolves.toEqual({ id: 'v1', photoUrl: null });
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it('devuelve null y registra solo el tipo de error si falla la firma', async () => {
    const signedUrl = jest.fn().mockRejectedValue(new Error('firma rechazada'));
    const storage = fakeStorage(signedUrl);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        withPhotoUrl({ id: 'v1', photoUrl: KEY }, storage),
      ).resolves.toEqual({ id: 'v1', photoUrl: null });

      expect(consoleError).toHaveBeenCalledTimes(1);
      const logged = consoleError.mock.calls[0].join(' ');
      expect(logged).not.toContain(KEY);
      expect(logged).not.toContain('https://');
      expect(logged).not.toContain('clave');
    } finally {
      consoleError.mockRestore();
    }
  });
});
