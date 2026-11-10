// Smoke de citas y recordatorios contra una API en ejecución (Node 18+).
// Uso: API=http://localhost:3000 node scripts/smoke-appointments.mjs
// El paso 3 necesita un servidor con REMINDER_WORKER_INTERVAL_SECONDS=5.

const API = (process.env.API ?? 'http://localhost:3000').replace(/\/+$/, '');
const REMINDER_TIMEOUT_MS = 120_000;
const POLL_MS = 5_000;

let failures = 0;

async function api(method, path, { userId, body } = {}) {
  const headers = {};
  if (userId) headers['x-user-id'] = userId;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { status: response.status, body: parsed };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(response, expected, context) {
  assert(
    response.status === expected,
    `${context}: esperaba HTTP ${expected}, recibí HTTP ${response.status} ${JSON.stringify(response.body)}`,
  );
}

function assertEqual(actual, expected, context) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${context}: esperaba ${JSON.stringify(expected)}, recibí ${JSON.stringify(actual)}`,
  );
}

async function notifications(userId, type, appointmentId) {
  const response = await api('GET', '/notifications?limit=100', { userId });
  assertStatus(response, 200, `GET /notifications como ${userId}`);
  return response.body.items.filter(
    (item) =>
      (type === undefined || item.type === type) &&
      (appointmentId === undefined || item.appointmentId === appointmentId),
  );
}

function dateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateLabel(scheduledAt, now, timeZone) {
  const difference = Math.round(
    (Date.parse(`${dateKey(scheduledAt, timeZone)}T00:00:00Z`) -
      Date.parse(`${dateKey(now, timeZone)}T00:00:00Z`)) /
      86_400_000,
  );

  if (difference === 0) return 'hoy';
  if (difference === 1) return 'mañana';

  const [year, month, day] = dateKey(scheduledAt, timeZone).split('-');
  return `el ${day}/${month}/${year}`;
}

function timeLabel(date, timeZone) {
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')}`;
}

function expectedReminderBody(appointment, now) {
  const scheduledAt = new Date(appointment.scheduledAt);
  return `${dateLabel(scheduledAt, now, appointment.timezone)} a las ${timeLabel(scheduledAt, appointment.timezone)} · ${appointment.reason} · ${appointment.vehicle.brand} ${appointment.vehicle.model} ${appointment.vehicle.licensePlate}`;
}

function todayInSantiago() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function inMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs, intervalMs) {
  const startedAt = Date.now();

  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() - startedAt >= timeoutMs) return null;
    await wait(intervalMs);
  }
}

async function runStep(name, run) {
  try {
    const result = await run();

    if (result?.skipped) {
      console.log(`AVISO - ${name}: ${result.detail}`);
      return;
    }

    console.log(`OK - ${name}: ${typeof result === 'string' ? result : result.detail}`);
  } catch (error) {
    failures += 1;
    console.log(
      `FALLO - ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const state = {
  user1Vehicles: [],
  user2Vehicles: [],
  vehicleA: null,
  vehicleC: null,
  appointment1: null,
  appointment3: null,
  foreignAppointment: null,
};

async function setup() {
  const health = await api('GET', '/health');
  assertStatus(health, 200, 'GET /health');

  const [user1, user2] = await Promise.all([
    api('GET', '/vehicles', { userId: 'user-1' }),
    api('GET', '/vehicles', { userId: 'user-2' }),
  ]);
  assertStatus(user1, 200, 'GET /vehicles como user-1');
  assertStatus(user2, 200, 'GET /vehicles como user-2');

  state.user1Vehicles = user1.body;
  state.user2Vehicles = user2.body;

  // A es el vehículo compartido: user-2 aparece como GUEST.
  state.vehicleA =
    state.user2Vehicles.find((vehicle) => vehicle.role === 'GUEST') ?? null;

  // C es el vehículo propio de user-2 con patente distinta a A.
  state.vehicleC =
    state.user2Vehicles.find(
      (vehicle) =>
        vehicle.role === 'OWNER' &&
        vehicle.id !== state.vehicleA?.id &&
        vehicle.licensePlate !== state.vehicleA?.licensePlate,
    ) ?? null;

  assert(
    state.vehicleA && state.vehicleC,
    `no encontré el seed esperado: A=${JSON.stringify(state.vehicleA)}, C=${JSON.stringify(state.vehicleC)}`,
  );

  console.log(
    `OK - Preparación: API ${API}; A=${state.vehicleA.licensePlate} (${state.vehicleA.id}); C=${state.vehicleC.licensePlate} (${state.vehicleC.id})`,
  );
}

async function step1() {
  const reason = 'Revisión de frenos – Ñandú';
  const response = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/appointments`,
    {
      userId: 'user-2',
      body: {
        scheduledAt: inMinutes(3 * 60),
        timezone: 'America/Santiago',
        reason,
        reminders: [10080, 1440, 120, 30],
      },
    },
  );

  assertStatus(response, 201, 'crear cita como user-2 en A');
  const appointment = response.body;
  state.appointment1 = appointment;

  assertEqual(
    appointment.skippedReminders,
    [10080, 1440],
    'skippedReminders',
  );
  assertEqual(appointment.reminders.length, 2, 'cantidad de recordatorios');
  assertEqual(appointment.reason, reason, 'motivo devuelto');

  return `cita ${appointment.id}; skippedReminders [10080, 1440]; ${appointment.reminders.length} recordatorios; motivo idéntico`;
}

async function step2() {
  assert(state.appointment1, 'no hay cita del paso 1');
  const notices = await notifications(
    'user-1',
    'APPOINTMENT_CREATED',
    state.appointment1.id,
  );

  assertEqual(
    notices.length,
    1,
    'notificaciones APPOINTMENT_CREATED de user-1 para la cita',
  );

  return `user-1 recibió 1 APPOINTMENT_CREATED para la cita ${state.appointment1.id}`;
}

async function step3() {
  const configuredInterval = process.env.REMINDER_WORKER_INTERVAL_SECONDS;

  if (configuredInterval !== undefined && configuredInterval !== '5') {
    return {
      skipped: true,
      detail: `el script se ejecutó con REMINDER_WORKER_INTERVAL_SECONDS=${configuredInterval}; se requiere 5`,
    };
  }

  const response = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/appointments`,
    {
      userId: 'user-2',
      body: {
        scheduledAt: inMinutes(32),
        timezone: 'America/Santiago',
        reason: 'Cita con recordatorio cercano',
        reminders: [30],
      },
    },
  );

  assertStatus(response, 201, 'crear cita con recordatorio en 2 minutos');
  const appointment = response.body;
  state.appointment3 = appointment;

  // El recordatorio vence a los 120 s de crear la cita; se deja un ciclo de
  // margen para que el worker lo procese justo después de vencer.
  const dueAt = new Date(appointment.scheduledAt).getTime() - 30 * 60_000;
  const deadline = Math.max(Date.now() + REMINDER_TIMEOUT_MS, dueAt + 10_000);
  const waitStartedAt = Date.now();

  const found = await waitFor(
    async () => {
      const [user1, user2] = await Promise.all([
        notifications('user-1', 'APPOINTMENT_REMINDER', appointment.id),
        notifications('user-2', 'APPOINTMENT_REMINDER', appointment.id),
      ]);
      return user1.length > 0 && user2.length > 0 ? { user1, user2 } : null;
    },
    deadline - Date.now(),
    POLL_MS,
  );

  if (!found) {
    return {
      skipped: true,
      detail: `no llegaron recordatorios en ${Math.round((Date.now() - waitStartedAt) / 1000)}s; se asume que el servidor no usa REMINDER_WORKER_INTERVAL_SECONDS=5`,
    };
  }

  assertEqual(found.user1.length, 1, 'recordatorios APPOINTMENT_REMINDER de user-1');
  assertEqual(found.user2.length, 1, 'recordatorios APPOINTMENT_REMINDER de user-2');

  for (const [userId, notice] of [
    ['user-1', found.user1[0]],
    ['user-2', found.user2[0]],
  ]) {
    const expected = expectedReminderBody(
      appointment,
      new Date(notice.createdAt),
    );
    assertEqual(notice.title, 'Recordatorio de cita', `título para ${userId}`);
    assertEqual(notice.body, expected, `texto para ${userId}`);
  }

  return `user-1 y user-2 recibieron 1 APPOINTMENT_REMINDER cada uno; texto idéntico al esperado`;
}

async function step4() {
  assert(state.appointment1, 'no hay cita del paso 1');

  const newScheduledAt = inMinutes(4 * 60);
  const rescheduled = await api(
    'PATCH',
    `/appointments/${state.appointment1.id}`,
    {
      userId: 'user-1',
      body: { scheduledAt: newScheduledAt },
    },
  );

  assertStatus(rescheduled, 200, 'reprogramar como dueño');
  assertEqual(
    rescheduled.body.scheduledAt,
    newScheduledAt,
    'fecha reprogramada',
  );

  const [user2Notices, user1Notices] = await Promise.all([
    notifications(
      'user-2',
      'APPOINTMENT_RESCHEDULED',
      state.appointment1.id,
    ),
    notifications(
      'user-1',
      'APPOINTMENT_RESCHEDULED',
      state.appointment1.id,
    ),
  ]);
  assertEqual(
    user2Notices.length,
    1,
    'notificaciones APPOINTMENT_RESCHEDULED de user-2',
  );
  assertEqual(
    user1Notices.length,
    0,
    'notificaciones APPOINTMENT_RESCHEDULED de user-1',
  );

  const ownerAppointment = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/appointments`,
    {
      userId: 'user-1',
      body: {
        scheduledAt: inMinutes(5 * 60),
        timezone: 'America/Santiago',
        reason: 'Cita del dueño',
      },
    },
  );
  assertStatus(ownerAppointment, 201, 'crear cita como user-1');

  const forbidden = await api(
    'PATCH',
    `/appointments/${ownerAppointment.body.id}`,
    {
      userId: 'user-2',
      body: { scheduledAt: inMinutes(6 * 60) },
    },
  );
  assertStatus(forbidden, 403, 'user-2 reprograma una cita de user-1');

  return `user-1 reprogramó; user-2 recibió 1 APPOINTMENT_RESCHEDULED y user-1 ninguna; reprogramar cita ajena respondió 403`;
}

async function step5() {
  const past = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/appointments`,
    {
      userId: 'user-1',
      body: {
        scheduledAt: inMinutes(-60),
        timezone: 'America/Santiago',
        reason: 'Cita en el pasado',
      },
    },
  );
  assertStatus(past, 400, 'crear cita con fecha pasada');

  const noAccess = await api(
    'POST',
    `/vehicles/${state.vehicleC.id}/appointments`,
    {
      userId: 'user-1',
      body: {
        scheduledAt: inMinutes(60),
        timezone: 'America/Santiago',
        reason: 'Cita sin acceso',
      },
    },
  );
  assertStatus(noAccess, 404, 'user-1 crea cita en el vehículo C de user-2');

  const foreign = await api(
    'POST',
    `/vehicles/${state.vehicleC.id}/appointments`,
    {
      userId: 'user-2',
      body: {
        scheduledAt: inMinutes(6 * 60),
        timezone: 'America/Santiago',
        reason: 'Cita privada de C',
      },
    },
  );
  assertStatus(foreign, 201, 'crear cita de user-2 en C');
  state.foreignAppointment = foreign.body;

  const byId = await api(
    'GET',
    `/appointments/${state.foreignAppointment.id}`,
    { userId: 'user-1' },
  );
  assertStatus(byId, 404, 'user-1 consulta una cita de user-2 por id');

  return `fecha pasada 400; sin acceso al vehículo 404; cita ajena por id 404`;
}

async function step6() {
  assert(state.appointment1, 'no hay cita del paso 1');

  const cancelled = await api(
    'POST',
    `/appointments/${state.appointment1.id}/cancel`,
    { userId: 'user-2' },
  );
  assertStatus(cancelled, 200, 'user-2 cancela su cita');
  assertEqual(cancelled.body.status, 'CANCELLED', 'estado tras cancelar');

  const notices = await notifications(
    'user-1',
    'APPOINTMENT_CANCELLED',
    state.appointment1.id,
  );
  assertEqual(
    notices.length,
    1,
    'notificaciones APPOINTMENT_CANCELLED de user-1',
  );

  const cancelAgain = await api(
    'POST',
    `/appointments/${state.appointment1.id}/cancel`,
    { userId: 'user-2' },
  );
  assertStatus(cancelAgain, 409, 'cancelar de nuevo');

  const editAgain = await api(
    'PATCH',
    `/appointments/${state.appointment1.id}`,
    { userId: 'user-2', body: { reason: 'Cambio no permitido' } },
  );
  assertStatus(editAgain, 409, 'editar una cita cancelada');

  return `cita cancelada; user-1 recibió 1 APPOINTMENT_CANCELLED; cancelar o editar de nuevo respondió 409`;
}

async function step7() {
  const before = await api('GET', '/notifications/unread-count', {
    userId: 'user-1',
  });
  assertStatus(before, 200, 'GET /notifications/unread-count');
  assert(before.body.unreadCount > 0, 'user-1 no tiene notificaciones sin leer');

  const unread = await api('GET', '/notifications?unread=true&limit=100', {
    userId: 'user-1',
  });
  assertStatus(unread, 200, 'GET /notifications?unread=true');
  assert(unread.body.items.length > 0, 'no hay notificaciones sin leer');

  const marked = await api(
    'POST',
    `/notifications/${unread.body.items[0].id}/read`,
    { userId: 'user-1' },
  );
  assertStatus(marked, 200, 'marcar una notificación como leída');
  assert(marked.body.readAt, 'la notificación no quedó con readAt');

  const afterOne = await api('GET', '/notifications/unread-count', {
    userId: 'user-1',
  });
  assertStatus(afterOne, 200, 'GET /notifications/unread-count tras leer una');
  assertEqual(
    afterOne.body.unreadCount,
    before.body.unreadCount - 1,
    'unreadCount tras leer una',
  );

  const readAll = await api('POST', '/notifications/read-all', {
    userId: 'user-1',
  });
  assertStatus(readAll, 200, 'POST /notifications/read-all');

  const afterAll = await api('GET', '/notifications/unread-count', {
    userId: 'user-1',
  });
  assertStatus(afterAll, 200, 'GET /notifications/unread-count tras read-all');
  assertEqual(afterAll.body.unreadCount, 0, 'unreadCount tras read-all');

  return `unreadCount bajó de ${before.body.unreadCount} a ${afterOne.body.unreadCount}; read-all lo dejó en 0`;
}

async function step8() {
  const appointment = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/appointments`,
    {
      userId: 'user-2',
      body: {
        scheduledAt: inMinutes(10 * 60),
        timezone: 'America/Santiago',
        reason: 'Cita para mantención smoke',
        reminders: [],
      },
    },
  );
  assertStatus(appointment, 201, 'crear cita para mantención');
  const appointmentId = appointment.body.id;

  const maintenance = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/maintenances`,
    {
      userId: 'user-1',
      body: {
        serviceDate: todayInSantiago(),
        serviceMileage: 33_000,
        description: 'Mantención desde cita smoke',
        laborCost: 0,
        appointmentId,
      },
    },
  );
  assertStatus(maintenance, 201, 'crear mantención con appointmentId');

  const detail = await api('GET', `/appointments/${appointmentId}`, {
    userId: 'user-2',
  });
  assertStatus(detail, 200, 'consultar la cita tras la mantención');
  assertEqual(detail.body.status, 'COMPLETED', 'estado de la cita');
  assertEqual(
    detail.body.maintenanceId,
    maintenance.body.id,
    'mantención vinculada',
  );

  const repeated = await api(
    'POST',
    `/vehicles/${state.vehicleA.id}/maintenances`,
    {
      userId: 'user-1',
      body: {
        serviceDate: todayInSantiago(),
        serviceMileage: 33_100,
        description: 'Mantención repetida smoke',
        laborCost: 0,
        appointmentId,
      },
    },
  );
  assertStatus(repeated, 400, 'repetir la mantención con la misma cita');

  return `cita ${appointmentId} quedó COMPLETED y vinculada; repetir respondió 400`;
}

async function step9() {
  const user2Ids = new Set(state.user2Vehicles.map((vehicle) => vehicle.id));
  const user1OnlyVehicle = state.user1Vehicles.find(
    (vehicle) => !user2Ids.has(vehicle.id),
  );
  assert(user1OnlyVehicle, 'no encontré un vehículo solo de user-1');

  const foreign = await api(
    'POST',
    `/vehicles/${user1OnlyVehicle.id}/appointments`,
    {
      userId: 'user-1',
      body: {
        scheduledAt: inMinutes(11 * 60),
        timezone: 'America/Santiago',
        reason: 'Cita de vehículo ajeno smoke',
      },
    },
  );
  assertStatus(foreign, 201, 'crear cita en un vehículo solo de user-1');

  const upcoming = await api(
    'GET',
    '/appointments?scope=upcoming&limit=100',
    { userId: 'user-2' },
  );
  assertStatus(upcoming, 200, 'GET /appointments?scope=upcoming');

  const items = upcoming.body.items;
  assert(items.length > 0, 'user-2 no tiene citas próximas para comprobar');
  assert(
    items.every((item) => user2Ids.has(item.vehicle.id)),
    `apareció una cita de un vehículo ajeno: ${JSON.stringify(
      items
        .filter((item) => !user2Ids.has(item.vehicle.id))
        .map((item) => ({ id: item.id, vehicleId: item.vehicle.id })),
    )}`,
  );
  assert(
    !items.some((item) => item.id === foreign.body.id),
    'la cita del vehículo solo de user-1 apareció en el listado de user-2',
  );

  return `${items.length} citas próximas, todas de vehículos de user-2; la cita de ${user1OnlyVehicle.licensePlate} no apareció`;
}

async function main() {
  console.log(`Smoke de citas contra ${API}`);

  try {
    await setup();
  } catch (error) {
    console.log(
      `FALLO - Preparación: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  await runStep('Paso 1', step1);
  await runStep('Paso 2', step2);
  await runStep('Paso 3', step3);
  await runStep('Paso 4', step4);
  await runStep('Paso 5', step5);
  await runStep('Paso 6', step6);
  await runStep('Paso 7', step7);
  await runStep('Paso 8', step8);
  await runStep('Paso 9', step9);

  if (failures > 0) {
    console.log(`Resultado: ${failures} paso(s) con FALLO.`);
    process.exitCode = 1;
  } else {
    console.log('Resultado: todos los pasos OK.');
  }
}

main().catch((error) => {
  console.error('FALLO inesperado:', error);
  process.exitCode = 1;
});
