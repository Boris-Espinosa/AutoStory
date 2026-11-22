export function shouldMountLocalUploads({
  nodeEnv,
  storageDriver,
}: {
  nodeEnv: 'development' | 'test' | 'production';
  storageDriver: 'disk' | 's3';
}): boolean {
  return nodeEnv !== 'production' && storageDriver === 'disk';
}
