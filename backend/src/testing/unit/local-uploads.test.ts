import { shouldMountLocalUploads } from '../../storage/local-uploads';

describe('shouldMountLocalUploads', () => {
  const cases = [
    { nodeEnv: 'development', storageDriver: 'disk', expected: true },
    { nodeEnv: 'test', storageDriver: 'disk', expected: true },
    { nodeEnv: 'production', storageDriver: 'disk', expected: false },
    { nodeEnv: 'production', storageDriver: 's3', expected: false },
    { nodeEnv: 'development', storageDriver: 's3', expected: false },
  ] as const;

  it.each(cases)(
    '$nodeEnv + $storageDriver → $expected',
    ({ nodeEnv, storageDriver, expected }) => {
      expect(shouldMountLocalUploads({ nodeEnv, storageDriver })).toBe(expected);
    },
  );
});
