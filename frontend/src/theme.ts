import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Tokens visuales del sistema de diseño.
 * Los valores conservan exactamente la paleta que ya usaba la app.
 */
export const colors = {
  background: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#D1D5DB',
  borderSubtle: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textLabel: '#374151',
  placeholder: '#9CA3AF',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryText: '#FFFFFF',
  primarySoft: '#EFF6FF',
  danger: '#DC2626',
  dangerDark: '#991B1B',
  dangerText: '#B91C1C',
  dangerBackground: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  success: '#15803D',
  successDark: '#166534',
  successBackground: '#DCFCE7',
  successBorder: '#86EFAC',
  warning: '#B45309',
  warningBackground: '#FEF3C7',
  info: '#1D4ED8',
  infoBackground: '#EFF6FF',
  neutral: '#6B7280',
  neutralBackground: '#F3F4F6',
  overlay: 'rgba(17, 24, 39, 0.5)',
  overlayLight: 'rgba(17, 24, 39, 0.45)',
  transparent: 'transparent',
} as const;

export const spacing = {
  none: 0,
  xxs: 6,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  input: 14,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 13,
  md: 14,
  base: 15,
  lg: 16,
  xl: 18,
  xxl: 20,
  display: 22,
  hero: 32,
} as const;

export const tracking = {
  wide: 1,
} as const;

export const typography: Record<'title' | 'subtitle' | 'body' | 'caption', TextStyle> = {
  title: { fontSize: fontSizes.xxl, fontWeight: '700', lineHeight: 26 },
  subtitle: { fontSize: fontSizes.lg, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: fontSizes.base, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: fontSizes.sm, fontWeight: '400', lineHeight: 18 },
};

export const shadow: ViewStyle = {
  shadowColor: colors.textPrimary,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

export const layout = {
  touchTarget: 44,
  headerHeight: 56,
  fabSize: 56,
  contentMaxWidth: 1100,
  detailMaxWidth: 900,
  formMaxWidth: 640,
  sidebarWidth: 220,
  avatarSize: 56,
  photoSize: 72,
  iconCircleSize: 64,
  heroPhotoHeight: 180,
  heroPhotoWideWidth: 240,
  countBadgeMinWidth: 22,
  checkboxSize: 22,
  multilineMinHeight: 96,
  modalMaxWidth: 420,
  selectSheetMaxWidth: 520,
  inputMinHeight: 48,
  suffixReserve: 46,
  emptyMinHeight: 160,
  buttonMinWidth: 120,
  buttonMaxWidth: 320,
  menuHandleWidth: 40,
  menuHandleHeight: 4,
  borderWidth: 1,
  borderWidthStrong: 2,
  hairline: 1,
} as const;
