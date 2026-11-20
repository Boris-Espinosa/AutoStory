import type { DataSource } from 'typeorm';
import type { ReminderWorkerHooks } from '../../jobs/reminder-worker';

type Worker = typeof import('../../jobs/reminder-worker');

const NOW = new Date('2026-11-20T12:00:00.000Z');
const REMINDER_ID = '11111111-1111-4111-8111-111111111111';
const clock = { now: () => NOW };

let processDueReminders: Worker['processDueReminders'];

beforeEach(() => {
  jest.resetModules();
  require('reflect-metadata');
  ({ processDueReminders } = require('../../jobs/reminder-worker') as Worker);
});

afterEach(() => {
  jest.restoreAllMocks();
});

interface FakeManager {
  find: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
}

function buildDataSource() {
  const pending: string[] = [];
  const cleanupFind = jest.fn(async () => pending.map((id) => ({ id })));
  const dueFind = jest.fn(async () => pending.map((id) => ({ id })));
  const update = jest.fn(async () => ({ affected: 1 }));

  const manager: FakeManager = {
    find: dueFind,
    update,
    transaction: jest.fn(),
  };
  manager.transaction.mockImplementation(
    async (callback: (inner: FakeManager) => Promise<void>) => callback(manager),
  );

  const dataSource = {
    getRepository: jest.fn(() => ({ find: cleanupFind })),
    transaction: jest.fn(),
  };
  dataSource.transaction.mockImplementation(
    async (callback: (inner: FakeManager) => Promise<number>) =>
      callback(manager),
  );

  return {
    dataSource: dataSource as unknown as DataSource,
    pending,
    cleanupFind,
    dueFind,
    update,
  };
}

const failingHooks: ReminderWorkerHooks = {
  beforeProcess: () => {
    throw new Error('fallo simulado');
  },
};

function attempts(errorSpy: jest.SpyInstance): string[] {
  return errorSpy.mock.calls.map(([line]) => {
    const match = /attempt=(\d+)/.exec(String(line));
    return match?.[1] ?? '';
  });
}

describe('limpieza de consecutiveFailures', () => {
  it('descarta el contador de un recordatorio que desaparece', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { dataSource, pending, cleanupFind } = buildDataSource();
    pending.push(REMINDER_ID);

    await processDueReminders(dataSource, clock, NOW, failingHooks);
    await processDueReminders(dataSource, clock, NOW, failingHooks);
    expect(attempts(errorSpy)).toEqual(['1', '2']);

    pending.length = 0;
    await processDueReminders(dataSource, clock, NOW, failingHooks);
    expect(errorSpy).toHaveBeenCalledTimes(2);

    pending.push(REMINDER_ID);
    await processDueReminders(dataSource, clock, NOW, failingHooks);

    expect(attempts(errorSpy)).toEqual(['1', '2', '1']);
    expect(cleanupFind).toHaveBeenCalledTimes(2);
  });

  it('conserva el contador mientras el recordatorio sigue existiendo', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { dataSource, pending, cleanupFind } = buildDataSource();
    pending.push(REMINDER_ID);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await processDueReminders(dataSource, clock, NOW, failingHooks);
    }

    expect(attempts(errorSpy)).toEqual(['1', '2', '3']);
    expect(cleanupFind).toHaveBeenCalledTimes(2);
  });

  it('mantiene el comportamiento actual al llegar a 5 fallos', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { dataSource, pending, update } = buildDataSource();
    pending.push(REMINDER_ID);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await processDueReminders(dataSource, clock, NOW, failingHooks);
    }

    expect(attempts(errorSpy)).toEqual(['1', '2', '3', '4', '5']);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      { id: REMINDER_ID },
      { processedAt: NOW },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `5 fallos seguidos. reminderId=${REMINDER_ID}`,
      ),
    );
  });

  it('no consulta los ids existentes cuando el Map está vacío', async () => {
    const { dataSource, cleanupFind, dueFind } = buildDataSource();

    expect(await processDueReminders(dataSource, clock, NOW)).toBe(0);
    expect(cleanupFind).not.toHaveBeenCalled();
    expect(dueFind).toHaveBeenCalledTimes(1);
  });

  it('continúa el ciclo y conserva el contador si falla la consulta de limpieza', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { dataSource, pending, cleanupFind, dueFind } = buildDataSource();
    pending.push(REMINDER_ID);

    await processDueReminders(dataSource, clock, NOW, failingHooks);
    cleanupFind.mockRejectedValueOnce(new Error('consulta fallida'));
    await processDueReminders(dataSource, clock, NOW, failingHooks);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'No se pudo depurar los fallos de recordatorios inexistentes. Error',
      ),
    );
    expect(dueFind).toHaveBeenCalledTimes(2);
    expect(attempts(errorSpy)).toEqual(['1', '2']);
  });
});
