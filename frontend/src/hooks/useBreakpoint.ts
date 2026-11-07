import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export interface BreakpointInfo {
  size: Breakpoint;
  columns: 1 | 2 | 3;
  isWide: boolean;
}

export function useBreakpoint(): BreakpointInfo {
  const { width } = useWindowDimensions();

  if (width >= 1100) {
    return { size: 'expanded', columns: 3, isWide: true };
  }

  if (width >= 720) {
    return { size: 'medium', columns: 2, isWide: true };
  }

  return { size: 'compact', columns: 1, isWide: false };
}
