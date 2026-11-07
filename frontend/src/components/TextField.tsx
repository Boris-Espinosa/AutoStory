import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
} from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  suffix?: string;
}

export function TextField({
  label,
  error,
  suffix,
  style,
  ...inputProps
}: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          {...inputProps}
          placeholderTextColor={colors.placeholder}
          style={[
            styles.input,
            Boolean(suffix) && styles.inputWithSuffix,
            Boolean(error) && styles.inputError,
            style,
          ]}
        />
        {suffix ? (
          <View pointerEvents="none" style={styles.suffixWrapper}>
            <Text style={styles.suffix}>{suffix}</Text>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  inputWrapper: {
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    paddingHorizontal: spacing.input,
    paddingVertical: spacing.md,
  },
  inputWithSuffix: {
    paddingRight: layout.suffixReserve,
  },
  inputError: {
    borderColor: colors.danger,
  },
  suffixWrapper: {
    bottom: spacing.none,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.input,
    top: spacing.none,
  },
  suffix: {
    color: colors.textSecondary,
    fontSize: fontSizes.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
});
