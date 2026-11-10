import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useCreateWorkshop, Workshop } from '../api/workshops';
import { colors, fontSizes, layout, radius, spacing } from '../theme';
import { MessageBanner } from './MessageBanner';
import { TextField } from './TextField';
import { Button } from './ui/Button';

export interface CreateWorkshopModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (workshop: Workshop) => void;
}

/** Modal compartido por los formularios de mantención y cita. */
export function CreateWorkshopModal({
  visible,
  onClose,
  onCreated,
}: CreateWorkshopModalProps) {
  const createWorkshopMutation = useCreateWorkshop();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName('');
    setAddress('');
    setPhone('');
    setNameError(null);
    setError(null);
  }, [visible]);

  const close = () => {
    if (createWorkshopMutation.isPending) {
      return;
    }

    onClose();
  };

  const save = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError('El nombre del taller es obligatorio.');
      return;
    }

    setNameError(null);
    setError(null);

    try {
      const workshop = await createWorkshopMutation.mutateAsync({
        name: trimmedName,
        address: address.trim() || null,
        phone: phone.trim() || null,
      });

      onCreated(workshop);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.status === 409
            ? 'Ya tienes un taller con ese nombre'
            : caught.message,
        );
      } else {
        setError('No se pudo crear el taller. Intenta nuevamente.');
      }
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Nuevo taller</Text>

          <TextField
            error={nameError ?? undefined}
            label="Nombre"
            maxLength={100}
            onChangeText={(text) => {
              setName(text);
              setNameError(null);
            }}
            placeholder="Ej: Taller Central"
            value={name}
          />

          <TextField
            label="Dirección (opcional)"
            maxLength={200}
            onChangeText={setAddress}
            placeholder="Ej: Av. Siempre Viva 123"
            value={address}
          />

          <TextField
            keyboardType="phone-pad"
            label="Teléfono (opcional)"
            maxLength={30}
            onChangeText={setPhone}
            placeholder="Ej: +56 9 1234 5678"
            value={phone}
          />

          <MessageBanner message={error} tone="error" />

          <View style={styles.actions}>
            <Button
              disabled={createWorkshopMutation.isPending}
              label="Cancelar"
              onPress={close}
              style={styles.button}
              variant="secondary"
            />

            <Button
              label="Guardar"
              loading={createWorkshopMutation.isPending}
              onPress={() => void save()}
              style={styles.button}
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.md,
    maxWidth: layout.modalMaxWidth,
    padding: spacing.xl,
    width: '100%',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
  },
});
