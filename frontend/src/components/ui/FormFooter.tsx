import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, layout, spacing } from '../../theme';
import { Button } from './Button';

export interface FormFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FormFooter({
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = 'Cancelar',
  loading = false,
  disabled = false,
  style,
}: FormFooterProps) {
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();

  if (isWide) {
    return (
      <View style={[styles.wideFooter, style]}>
        <Button
          disabled={disabled || loading}
          label={cancelLabel}
          onPress={onCancel}
          style={styles.wideButton}
          variant="secondary"
        />
        <Button
          disabled={disabled}
          label={submitLabel}
          loading={loading}
          onPress={onSubmit}
          style={styles.wideButton}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: insets.bottom + spacing.md },
        style,
      ]}
    >
      <Button
        disabled={disabled || loading}
        label={cancelLabel}
        onPress={onCancel}
        style={styles.cancel}
        variant="secondary"
      />
      <Button
        disabled={disabled}
        label={submitLabel}
        loading={loading}
        onPress={onSubmit}
        style={styles.submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
    bottom: spacing.none,
    flexDirection: 'row',
    gap: spacing.md,
    left: spacing.none,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    position: 'absolute',
    right: spacing.none,
  },
  wideFooter: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
    // El contenedor del formulario ya separa a sus hijos con 12 px.
    marginTop: spacing.md,
    paddingTop: spacing.lg,
  },
  wideButton: {
    maxWidth: layout.buttonMaxWidth,
    minWidth: layout.buttonMinWidth,
    paddingHorizontal: spacing.xl,
  },
  cancel: {
    flex: 1,
  },
  submit: {
    flex: 2,
  },
});
