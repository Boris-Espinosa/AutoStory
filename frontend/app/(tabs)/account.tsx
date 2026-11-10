import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

import { CURRENT_USER_ID } from '../../src/api/client';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Screen } from '../../src/components/ui/Screen';
import { colors, layout, radius, spacing, typography } from '../../src/theme';

const AVATAR_SIZE = layout.avatarSize;

export default function AccountScreen() {
  const initial = CURRENT_USER_ID.charAt(0).toUpperCase();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen edges={['top']} maxWidth={layout.formMaxWidth} scroll>
      <AppHeader title="Cuenta" />

      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.profileText}>
          <Text style={styles.profileName}>Sesión de desarrollo</Text>
          {__DEV__ ? <Text style={styles.userId}>{CURRENT_USER_ID}</Text> : null}
        </View>
      </Card>

      <Card>
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Versión de la aplicación</Text>
          <Text style={styles.versionValue}>{version}</Text>
        </View>
      </Card>

      <View style={styles.logout}>
        <Button
          disabled
          label="Cerrar sesión"
          onPress={() => undefined}
          variant="ghost"
        />
        <Text style={styles.support}>
          Disponible cuando se integre el inicio de sesión
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: AVATAR_SIZE,
    justifyContent: 'center',
    width: AVATAR_SIZE,
  },
  avatarText: {
    ...typography.title,
    color: colors.primary,
    fontWeight: '800',
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  profileName: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  userId: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  versionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.touchTarget,
  },
  versionLabel: {
    ...typography.body,
    color: colors.textLabel,
  },
  versionValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  logout: {
    gap: spacing.xs,
  },
  support: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
