export type AppointmentNotificationKind =
  | 'created'
  | 'rescheduled'
  | 'cancelled'
  | 'reminder';

const TITLES: Record<AppointmentNotificationKind, string> = {
  created: 'Nueva cita programada',
  rescheduled: 'Cita reprogramada',
  cancelled: 'Cita cancelada',
  reminder: 'Recordatorio de cita',
};

export interface AppointmentMessageData {
  scheduledAt: Date;
  timezone: string;
  reason: string;
  vehicle: {
    brand: string;
    model: string;
    licensePlate: string;
  };
  /** Nombre del taller, solo para los recordatorios. */
  workshop?: string | null;
}

export function appointmentNotificationTitle(
  kind: AppointmentNotificationKind,
): string {
  return TITLES[kind];
}

function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayDifference(from: Date, to: Date, timeZone: string): number {
  const fromMs = Date.parse(`${dateKey(from, timeZone)}T00:00:00Z`);
  const toMs = Date.parse(`${dateKey(to, timeZone)}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

function dateLabel(scheduledAt: Date, now: Date, timeZone: string): string {
  const difference = dayDifference(now, scheduledAt, timeZone);

  if (difference === 0) {
    return 'hoy';
  }

  if (difference === 1) {
    return 'mañana';
  }

  const [year, month, day] = dateKey(scheduledAt, timeZone).split('-');
  return `el ${day}/${month}/${year}`;
}

function timeLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('hour')}:${part('minute')}`;
}

export function appointmentNotificationBody(
  data: AppointmentMessageData,
  now: Date,
): string {
  const { vehicle } = data;
  const workshop = data.workshop ? ` · ${data.workshop}` : '';
  const body = `${dateLabel(data.scheduledAt, now, data.timezone)} a las ${timeLabel(data.scheduledAt, data.timezone)} · ${data.reason} · ${vehicle.brand} ${vehicle.model} ${vehicle.licensePlate}${workshop}`;

  // El cuerpo de la notificación admite 300 caracteres en la base.
  return Array.from(body).slice(0, 300).join('');
}
