import { VinDecoderService } from './vin-decoder.service';

const VIN = '1HGCM82633A004352';
const OTHER_VIN = 'WVWZZZ6RZMY000001';

const UNRECOGNIZED = {
  status: 'unrecognized',
  brand: null,
  model: null,
  year: null,
};

const UNAVAILABLE = {
  status: 'unavailable',
  brand: null,
  model: null,
  year: null,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function nhtsaBody(overrides: Record<string, string> = {}): unknown {
  return {
    Results: [
      {
        Make: 'VOLKSWAGEN',
        Model: 'Polo',
        ModelYear: '2021',
        ErrorCode: '0',
        ...overrides,
      },
    ],
  };
}

let service: VinDecoderService;
let fetchMock: jest.SpyInstance;

beforeEach(() => {
  service = new VinDecoderService();
  fetchMock = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('VinDecoderService', () => {
  it('devuelve "full" cuando ErrorCode incluye 0', async () => {
    fetchMock.mockResolvedValue(jsonResponse(nhtsaBody()));

    await expect(service.decode(VIN)).resolves.toEqual({
      status: 'full',
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${VIN}?format=json`,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('devuelve "partial" cuando ErrorCode incluye 0 pero falta modelo o año', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(nhtsaBody({ Make: 'TOYOTA', Model: '', ModelYear: '' })),
    );

    await expect(service.decode(VIN)).resolves.toEqual({
      status: 'partial',
      brand: 'Toyota',
      model: null,
      year: null,
    });
  });

  it.each(['1', '5,11', '6', '11'])(
    'devuelve "unrecognized" sin datos con ErrorCode %s',
    async (errorCode) => {
      fetchMock.mockResolvedValue(
        jsonResponse(nhtsaBody({ ErrorCode: errorCode })),
      );

      await expect(service.decode(VIN)).resolves.toEqual(UNRECOGNIZED);
    },
  );

  it('devuelve "unrecognized" cuando no hay Make', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        Results: [{ Make: '', Model: 'Polo', ModelYear: '2021', ErrorCode: '0' }],
      }),
    );

    await expect(service.decode(VIN)).resolves.toEqual(UNRECOGNIZED);
  });

  it('devuelve "partial" con ErrorCode 7 y Make presente', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(nhtsaBody({ Make: 'TOYOTA', ErrorCode: '7' })),
    );

    await expect(service.decode(VIN)).resolves.toEqual({
      status: 'partial',
      brand: 'Toyota',
      model: 'Polo',
      year: 2021,
    });
  });

  it('acepta ErrorCode 7,8 como información limitada del fabricante', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(nhtsaBody({ Make: 'TOYOTA', ErrorCode: '7, 8' })),
    );

    await expect(service.decode(VIN)).resolves.toMatchObject({
      status: 'partial',
      brand: 'Toyota',
    });
  });

  it('devuelve "unavailable" ante un timeout', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );

    const promise = service.decode(VIN);
    jest.advanceTimersByTime(5_000);

    await expect(promise).resolves.toEqual(UNAVAILABLE);
  });

  it('devuelve "unavailable" ante un error de red', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(service.decode(VIN)).resolves.toEqual(UNAVAILABLE);
  });

  it('devuelve "unavailable" ante 429', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 429));

    await expect(service.decode(VIN)).resolves.toEqual(UNAVAILABLE);
  });

  it('devuelve "unavailable" ante una respuesta mal formada', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ Results: [] }));

    await expect(service.decode(VIN)).resolves.toEqual(UNAVAILABLE);
  });

  it('devuelve "unavailable" cuando el cuerpo no es JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);

    await expect(service.decode(VIN)).resolves.toEqual(UNAVAILABLE);
  });

  it('no llama a la red con un VIN inválido', async () => {
    await expect(service.decode('1HGCM82603A004352')).resolves.toEqual(
      UNRECOGNIZED,
    );
    await expect(service.decode('NO-ES-UN-VIN')).resolves.toEqual(
      UNRECOGNIZED,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mapea una marca desconocida a "Otra"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(nhtsaBody({ Make: 'MARCA RARA' })),
    );

    await expect(service.decode(OTHER_VIN)).resolves.toMatchObject({
      brand: 'Otra',
      status: 'full',
    });
  });

  it('usa la caché en la segunda consulta del mismo VIN', async () => {
    fetchMock.mockResolvedValue(jsonResponse(nhtsaBody()));

    await service.decode(VIN);
    await service.decode(VIN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no guarda en caché un fallo de red', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(service.decode(VIN)).resolves.toEqual(UNAVAILABLE);

    fetchMock.mockResolvedValueOnce(jsonResponse(nhtsaBody()));

    await expect(service.decode(VIN)).resolves.toMatchObject({
      status: 'full',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
