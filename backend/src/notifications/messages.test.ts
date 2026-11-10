import {
  appointmentNotificationBody,
  appointmentNotificationTitle,
} from './messages';

describe('appointmentNotificationTitle', () => {
  it('devuelve el título en español de cada aviso', () => {
    expect(appointmentNotificationTitle('created')).toBe(
      'Nueva cita programada',
    );
    expect(appointmentNotificationTitle('rescheduled')).toBe(
      'Cita reprogramada',
    );
    expect(appointmentNotificationTitle('cancelled')).toBe('Cita cancelada');
    expect(appointmentNotificationTitle('reminder')).toBe(
      'Recordatorio de cita',
    );
  });
});

describe('appointmentNotificationBody', () => {
  const now = new Date('2026-01-10T12:00:00.000Z');
  const vehicle = {
    brand: 'Volkswagen',
    model: 'Polo',
    licensePlate: 'BCDF12',
  };

  it('usa "hoy" con la hora en la zona de la cita', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-01-10T15:30:00.000Z'),
        timezone: 'America/Santiago',
        reason: 'Cambio de aceite',
        vehicle,
      },
      now,
    );

    expect(body).toBe('hoy a las 12:30 · Cambio de aceite · Volkswagen Polo BCDF12');
  });

  it('usa "mañana" según el calendario de la zona de la cita', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-01-10T20:00:00.000Z'),
        timezone: 'Asia/Tokyo',
        reason: 'Revisión',
        vehicle,
      },
      now,
    );

    expect(body).toBe('mañana a las 05:00 · Revisión · Volkswagen Polo BCDF12');
  });

  it('usa la fecha completa para días más lejanos', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-02-05T15:30:00.000Z'),
        timezone: 'America/Santiago',
        reason: 'Alineación',
        vehicle,
      },
      now,
    );

    expect(body).toBe(
      'el 05/02/2026 a las 12:30 · Alineación · Volkswagen Polo BCDF12',
    );
  });

  it('mantiene tildes, ñ y emoji del motivo', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-01-10T15:30:00.000Z'),
        timezone: 'America/Santiago',
        reason: 'Revisión ñandú 🚗',
        vehicle,
      },
      now,
    );

    expect(body).toContain('Revisión ñandú 🚗');
  });

  it('agrega el taller al final cuando existe', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-01-10T15:30:00.000Z'),
        timezone: 'America/Santiago',
        reason: 'Cambio de aceite',
        vehicle,
        workshop: 'Taller Central',
      },
      now,
    );

    expect(body).toBe(
      'hoy a las 12:30 · Cambio de aceite · Volkswagen Polo BCDF12 · Taller Central',
    );
  });

  it('usa "mañana" cerca de medianoche en la zona de la cita', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-01-10T03:30:00.000Z'),
        timezone: 'America/Santiago',
        reason: 'Revisión',
        vehicle,
      },
      // 23:00 del 9 de enero en Santiago.
      new Date('2026-01-10T02:00:00.000Z'),
    );

    expect(body).toBe(
      'mañana a las 00:30 · Revisión · Volkswagen Polo BCDF12',
    );
  });

  it('escribe las horas con cero a la izquierda', () => {
    const body = appointmentNotificationBody(
      {
        scheduledAt: new Date('2026-01-10T12:05:00.000Z'),
        timezone: 'America/Santiago',
        reason: 'Revisión',
        vehicle,
      },
      now,
    );

    expect(body).toContain('hoy a las 09:05');
  });
});
