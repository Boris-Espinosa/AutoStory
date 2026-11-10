import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../theme';
import { Icon } from './ui/Icon';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecciona una opción',
  error,
  disabled = false,
}: SelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  const open = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const close = () => setIsOpen(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        style={[
          styles.control,
          Boolean(error) && styles.controlError,
          disabled && styles.controlDisabled,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.valueText, !selectedOption && styles.placeholder]}
        >
          {selectedOption?.label ?? placeholder}
        </Text>
        <Icon color={colors.textSecondary} name="chevron-down" size={18} />
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={isOpen}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Cerrar selector"
            accessibilityRole="button"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                accessibilityLabel="Cerrar"
                accessibilityRole="button"
                onPress={close}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>Cerrar</Text>
              </Pressable>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item) => item.value || 'empty'}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>No hay opciones disponibles.</Text>
              }
              renderItem={({ item }) => {
                const isSelected = item.value === value;

                return (
                  <Pressable
                    accessibilityLabel={item.label}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(item.value);
                      close();
                    }}
                    style={[styles.option, isSelected && styles.optionSelected]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected ? (
                      <Icon
                        color={colors.primaryDark}
                        name="checkmark"
                        size={18}
                      />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
  },
  label: {
    color: colors.textLabel,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  control: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.inputMinHeight,
    paddingHorizontal: spacing.input,
    paddingVertical: spacing.md,
  },
  controlError: {
    borderColor: colors.danger,
  },
  controlDisabled: {
    opacity: 0.6,
  },
  valueText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.lg,
    marginRight: spacing.sm,
  },
  placeholder: {
    color: colors.placeholder,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlayLight,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg + spacing.xs,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: '70%',
    maxWidth: layout.selectSheetMaxWidth,
    overflow: 'hidden',
    width: '100%',
  },
  sheetHeader: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: layout.borderWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.input,
  },
  sheetTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: '700',
  },
  closeButton: {
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.sm,
  },
  closeText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  option: {
    alignItems: 'center',
    borderBottomColor: colors.background,
    borderBottomWidth: layout.borderWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.input,
  },
  optionSelected: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.base,
    marginRight: spacing.sm,
  },
  optionTextSelected: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textSecondary,
    padding: spacing.xl,
    textAlign: 'center',
  },
});
