import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, layout, radius, spacing } from '../theme';

type BannerTone = 'success' | 'error';

interface MessageBannerProps {
  message: string | null;
  tone?: BannerTone;
}

export function MessageBanner({ message, tone = 'success' }: MessageBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.banner, tone === 'error' ? styles.error : styles.success]}
    >
      <Text
        style={[
          styles.text,
          tone === 'error' ? styles.errorText : styles.successText,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    padding: spacing.md,
  },
  success: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder,
  },
  error: {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
  },
  text: {
    fontSize: fontSizes.md,
  },
  successText: {
    color: colors.successDark,
  },
  errorText: {
    color: colors.dangerDark,
  },
});
