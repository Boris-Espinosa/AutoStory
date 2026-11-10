import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { CURRENT_USER_ID } from '../../src/api/client';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Screen } from '../../src/components/ui/Screen';
import {
  clearLocalReminders,
  configure,
  ensurePermission,
  isLocalRemindersEnabled,
  isPermissionGranted,
  setLocalRemindersEnabled,
  syncLocalReminders,
} from '../../src/notifications/local';
import { colors, layout, radius, spacing, typography } from '../../src/theme';

const AVATAR_SIZE = layout.avatarSize;

export default function AccountScreen() {
  const initial = CURRENT_USER_ID.charAt(0).toUpperCase();
  const version = Constants.expoConfig?.version ?? '—';

  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const remindersVisible = Platform.OS !== 'web';

  useEffect(() => {
    if (!remindersVisible) {
      return;
    }

    let active = true;

    void (async () => {
      const enabled = await isLocalRemindersEnabled();
      const granted = enabled ? await isPermissionGranted() : true;

      if (!active) {
        return;
      }

      setRemindersEnabled(enabled);
      setPermissionDenied(enabled && !granted);
      setRemindersLoaded(true);
    })();

    return () => {
      active = false;
    };
  }, [remindersVisible]);

  async function handleToggleReminders(value: boolean): Promise<void> {
    if (value) {
      configure();
      const granted = await ensurePermission();
      setPermissionDenied(!granted);

      if (granted) {
        await syncLocalReminders().catch(() => undefined);
      }
    } else {
      await clearLocalReminders().catch(() => undefined);
      setPermissionDenied(false);
    }

    await setLocalRemindersEnabled(value);
    setRemindersEnabled(value);
  }

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

      {remindersVisible ? (
        <Card>
          <View style={styles.remindersRow}>
            <View style={styles.remindersText}>
              <Text style={styles.remindersLabel}>Avisos en este teléfono</Text>
              <Text style={styles.remindersSupport}>
                {permissionDenied
                  ? 'Activa los permisos en los ajustes del teléfono'
                  : 'Recibe los recordatorios de tus citas en este teléfono'}
              </Text>
            </View>

            <Switch
              accessibilityLabel="Avisos en este teléfono"
              disabled={!remindersLoaded}
              onValueChange={(value) => void handleToggleReminders(value)}
              trackColor={{
                false: colors.border,
                true: colors.primary,
              }}
              value={remindersEnabled}
            />
          </View>

          {permissionDenied ? (
            <Button
              label="Abrir ajustes"
              onPress={() => void Linking.openSettings()}
              style={styles.remindersSettings}
              variant="secondary"
            />
          ) : null}
        </Card>
      ) : null}

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
          style={styles.logoutButton}
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
  remindersRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: layout.touchTarget,
  },
  remindersText: {
    flex: 1,
    gap: spacing.xs,
  },
  remindersLabel: {
    ...typography.body,
    color: colors.textLabel,
  },
  remindersSupport: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  remindersSettings: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
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
  logoutButton: {
    alignSelf: 'center',
    maxWidth: layout.buttonMaxWidth,
  },
  support: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
