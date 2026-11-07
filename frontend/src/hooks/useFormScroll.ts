import { useRef } from 'react';
import type { LayoutChangeEvent, ScrollViewInstance } from 'react-native';

import { spacing } from '../theme';

export function useFormScroll() {
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const fieldOffsets = useRef<Record<string, number>>({});

  const trackField =
    (...fields: string[]) =>
    (event: LayoutChangeEvent) => {
      for (const field of fields) {
        fieldOffsets.current[field] = event.nativeEvent.layout.y;
      }
    };

  const scrollToFirst = (fields: readonly string[]) => {
    const field = fields.find(
      (key) => fieldOffsets.current[key] !== undefined,
    );

    if (field === undefined) {
      return;
    }

    scrollViewRef.current?.scrollTo({
      animated: true,
      y: Math.max(fieldOffsets.current[field] - spacing.lg, 0),
    });
  };

  return { scrollViewRef, trackField, scrollToFirst };
}
