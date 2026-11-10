export interface LocalDateParts {
  day: number;
  month: number;
  year: number;
}

export interface LocalTimeParts {
  hours: number;
  minutes: number;
}

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

/** dd/mm/aaaa -> partes de fecha, o null si el formato o el día no existen. */
export function parseDateDMY(value: string): LocalDateParts | null {
  const match = DATE_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

/** HH:mm (24 h) -> partes de hora, o null si está fuera de rango. */
export function parseTimeHM(value: string): LocalTimeParts | null {
  const match = TIME_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/**
 * Construye el instante en la zona del dispositivo. Devuelve null si la fecha
 * u hora no existe, por ejemplo el 31/02 o una hora saltada por el horario de verano.
 */
export function buildInstantFromLocal(
  date: string,
  time: string,
): Date | null {
  const localDate = parseDateDMY(date);
  const localTime = parseTimeHM(time);

  if (!localDate || !localTime) {
    return null;
  }

  const instant = new Date(
    localDate.year,
    localDate.month - 1,
    localDate.day,
    localTime.hours,
    localTime.minutes,
    0,
    0,
  );

  if (
    instant.getFullYear() !== localDate.year ||
    instant.getMonth() !== localDate.month - 1 ||
    instant.getDate() !== localDate.day ||
    instant.getHours() !== localTime.hours ||
    instant.getMinutes() !== localTime.minutes
  ) {
    return null;
  }

  return instant;
}

/** Día y mes abreviado en mayúsculas según la zona en que se guardó la cita. */
export function formatDayMonth(
  isoInstant: string,
  timezone: string,
): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  }).formatToParts(new Date(isoInstant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: value('day'),
    month: value('month').replace(/\.$/, '').toUpperCase(),
  };
}

/** Fecha dd/mm/aaaa según la zona en que se guardó la cita. */
export function formatDisplayDate(
  isoInstant: string,
  timezone: string,
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoInstant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('day')}/${value('month')}/${value('year')}`;
}

/** Fecha dd/mm/aaaa del calendario del dispositivo, desplazada N días. */
export function displayDateWithOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}/${month}/${date.getFullYear()}`;
}

/** "sábado 14 de noviembre" en la zona de la cita. */
export function formatLongDate(isoInstant: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(new Date(isoInstant))
    .replace(',', '');
}

/** Máscara progresiva HH:mm para el campo de hora. */
export function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Hora HH:mm de 24 horas según la zona en que se guardó la cita. */
export function formatTime24(isoInstant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(isoInstant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('hour')}:${value('minute')}`;
}

/** Hoy, Mañana, En N días, Ayer o Hace N días según la zona de la cita. */
export function formatRelativeDay(
  isoInstant: string,
  timezone: string,
  now: Date = new Date(),
): string {
  const days =
    calendarDayNumber(new Date(isoInstant), timezone) -
    calendarDayNumber(now, timezone);

  if (days === 0) {
    return 'Hoy';
  }

  if (days === 1) {
    return 'Mañana';
  }

  if (days > 1) {
    return `En ${days} días`;
  }

  if (days === -1) {
    return 'Ayer';
  }

  return `Hace ${Math.abs(days)} días`;
}

export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
}

function calendarDayNumber(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return Date.UTC(value('year'), value('month') - 1, value('day')) / DAY_MS;
}
