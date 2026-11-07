import { matchBrand } from './brands';
import { normalizeVin, validateVin } from './vin';

const NHTSA_URL =
  'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 1_000;
const MIN_YEAR = 1950;

export type VinDecodeStatus =
  | 'full'
  | 'partial'
  | 'unrecognized'
  | 'unavailable';

export interface VinDecodeResult {
  status: VinDecodeStatus;
  brand: string | null;
  model: string | null;
  year: number | null;
}

const UNRECOGNIZED_RESULT: VinDecodeResult = {
  status: 'unrecognized',
  brand: null,
  model: null,
  year: null,
};

const UNAVAILABLE_RESULT: VinDecodeResult = {
  status: 'unavailable',
  brand: null,
  model: null,
  year: null,
};

interface NhtsaRow {
  Make?: unknown;
  Model?: unknown;
  ModelYear?: unknown;
  ErrorCode?: unknown;
}

interface CacheEntry {
  result: VinDecodeResult;
  expiresAt: number;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readErrorCodes(value: unknown): string[] {
  return readString(value)
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
}

export class VinDecoderService {
  private readonly cache = new Map<string, CacheEntry>();

  async decode(rawVin: string): Promise<VinDecodeResult> {
    const vin = normalizeVin(rawVin);

    // Un VIN inválido no llega a la red.
    if (!vin || !validateVin(vin).ok) {
      return UNRECOGNIZED_RESULT;
    }

    const cached = this.readCache(vin);

    if (cached) {
      return cached;
    }

    const result = await this.request(vin);

    // Timeout, red caída, 429 o respuesta rara: no se cachea.
    if (result.status !== 'unavailable') {
      this.writeCache(vin, result);
    }

    return result;
  }

  private readCache(vin: string): VinDecodeResult | null {
    const entry = this.cache.get(vin);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(vin);
      return null;
    }

    return entry.result;
  }

  private writeCache(vin: string, result: VinDecodeResult): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= Date.now()) {
          this.cache.delete(key);
        }
      }

      while (this.cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = this.cache.keys().next().value;

        if (oldest === undefined) {
          break;
        }

        this.cache.delete(oldest);
      }
    }

    this.cache.set(vin, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  private async request(vin: string): Promise<VinDecodeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${NHTSA_URL}/${vin}?format=json`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        return UNAVAILABLE_RESULT;
      }

      return this.parse(await response.json());
    } catch {
      // Timeout, error de red o cuerpo que no es JSON.
      return UNAVAILABLE_RESULT;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parse(payload: unknown): VinDecodeResult {
    if (typeof payload !== 'object' || payload === null) {
      return UNAVAILABLE_RESULT;
    }

    const results = (payload as { Results?: unknown }).Results;

    if (!Array.isArray(results) || results.length === 0) {
      return UNAVAILABLE_RESULT;
    }

    const row = results[0];

    if (typeof row !== 'object' || row === null) {
      return UNAVAILABLE_RESULT;
    }

    const data = row as NhtsaRow;
    const make = readString(data.Make);
    const codes = readErrorCodes(data.ErrorCode);

    // Sin Make no hay nada confiable que autocompletar.
    if (make === '') {
      return UNRECOGNIZED_RESULT;
    }

    // 0 = decodificación limpia; 7 y 8 = información limitada del fabricante.
    const clean = codes.includes('0');
    const limited =
      codes.length > 0 && codes.every((code) => code === '7' || code === '8');

    if (!clean && !limited) {
      return UNRECOGNIZED_RESULT;
    }

    const model = readString(data.Model) || null;
    const year = this.parseYear(data.ModelYear);

    return {
      status: clean && model !== null && year !== null ? 'full' : 'partial',
      brand: matchBrand(make),
      model,
      year,
    };
  }

  private parseYear(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    const year = Number.parseInt(String(value), 10);
    const maxYear = new Date().getFullYear() + 1;

    return Number.isInteger(year) && year >= MIN_YEAR && year <= maxYear
      ? year
      : null;
  }
}
