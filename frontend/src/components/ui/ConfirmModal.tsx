import {
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  colors,
  fontSizes,
  layout,
  radius,
  shadow,
  spacing,
  typography,
} from '../../theme';
import { MessageBanner } from '../MessageBanner';
import { Button } from './Button';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string | null;
  tone?: 'danger' | 'primary';
}

export function ConfirmModal({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  loading = false,
  error,
  tone = 'danger',
}: ConfirmModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <MessageBanner message={error ?? null} tone="error" />

          <View style={styles.actions}>
            <Button
              disabled={loading}
              label={cancelLabel}
              onPress={onCancel}
              style={styles.button}
              variant="secondary"
            />
            <Button
              label={confirmLabel}
              loading={loading}
              onPress={onConfirm}
              style={styles.button}
              variant={tone === 'danger' ? 'danger' : 'primary'}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    ...shadow,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.md,
    maxWidth: layout.modalMaxWidth,
    padding: spacing.xl,
    width: '100%',
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
  },
});
