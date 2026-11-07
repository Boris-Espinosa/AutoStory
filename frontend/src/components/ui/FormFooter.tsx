import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  cancel: {
    flex: 1,
  },
  submit: {
    flex: 2,
  },
});
