/** Deja solo dígitos y recorta a 12 caracteres para evitar montos desmedidos. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12);
}

/** Formatea dígitos como monto chileno: 25000 -> "25.000". */
export function formatChileanAmount(digits: string): string {
  if (!digits) {
    return '';
  }

  const normalized = digits.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Convierte "25000" (dígitos) a entero para enviarlo al backend. */
export function parseAmount(digits: string): number {
  return Number.parseInt(digits, 10);
}

/** Formatea progresivamente lo que escribe el usuario como dd/mm/aaaa. */
export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function todayDisplayDate(): string {
  // Misma zona que valida el backend (R9), sin depender del reloj del equipo.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('day')}/${value('month')}/${value('year')}`;
}

export function isValidDisplayDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** dd/mm/aaaa -> YYYY-MM-DD (formato que espera el backend). */
export function displayDateToIso(value: string): string {
  const [day, month, year] = value.split('/');
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD -> dd/mm/aaaa para mostrar. */
export function isoDateToDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}
