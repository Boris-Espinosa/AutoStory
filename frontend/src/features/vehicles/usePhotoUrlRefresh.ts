import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { vehiclesQueryKey } from '../../api/vehicles';

const REFRESH_COOLDOWN_MS = 30_000;

const refreshedUrls = new Set<string>();
let lastInvalidationAt = 0;

function isRemotePhotoUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export function usePhotoUrlRefresh() {
  const queryClient = useQueryClient();

  return useCallback(
    (url: string | null | undefined) => {
      const now = Date.now();

      if (
        !isRemotePhotoUrl(url) ||
        refreshedUrls.has(url) ||
        now - lastInvalidationAt < REFRESH_COOLDOWN_MS
      ) {
        return;
      }

      refreshedUrls.add(url);
      lastInvalidationAt = now;
      void queryClient.invalidateQueries({ queryKey: vehiclesQueryKey });
    },
    [queryClient],
  );
}
