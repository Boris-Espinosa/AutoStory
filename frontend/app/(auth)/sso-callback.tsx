import { useClerk } from '@clerk/expo';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../../src/theme';

/**
 * Ruta de retorno del flujo OAuth en web: completa la sesión con Clerk
 * y deja que Clerk navegue al destino final. En nativo nunca se monta.
 */
export default function SsoCallbackScreen() {
  const clerk = useClerk();

  useEffect(() => {
    // En la ventana emergente la URL ya viajó a la pantalla que abrió el flujo.
    if (typeof window === 'undefined' || window.opener) {
      return;
    }

    void clerk.handleRedirectCallback({});
  }, [clerk]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
