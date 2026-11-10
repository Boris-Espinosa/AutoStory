import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, FieldErrors, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';
import { ApiError } from '../../../../src/api/client';
import { useVehicleMaintenances } from '../../../../src/api/maintenances';
import {
  PART_CATEGORIES,
  PartCategory,
  useCreatePart,
} from '../../../../src/api/parts';
import { useVehicles } from '../../../../src/api/vehicles';
import { MessageBanner } from '../../../../src/components/MessageBanner';
import { SelectField, SelectOption } from '../../../../src/components/SelectField';
import { TextField } from '../../../../src/components/TextField';
import { AppHeader } from '../../../../src/components/ui/AppHeader';
import { ConfirmModal } from '../../../../src/components/ui/ConfirmModal';
import { FormFooter } from '../../../../src/components/ui/FormFooter';
import { Screen } from '../../../../src/components/ui/Screen';
import { useBreakpoint } from '../../../../src/hooks/useBreakpoint';
import { useFormScroll } from '../../../../src/hooks/useFormScroll';
import {
  colors,
  fontSizes,
  layout,
  spacing,
  typography,
} from '../../../../src/theme';
import {
  digitsOnly,
  displayDateToIso,
  formatChileanAmount,
  formatDateInput,
  isoDateToDisplay,
  isValidDisplayDate,
  parseAmount,
  todayDisplayDate,
} from '../../../../src/utils/format';

const formSchema = z.object({
  vehicleId: z.string().min(1, 'Selecciona un vehículo.'),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre del repuesto es obligatorio.')
    .max(120, 'El nombre del repuesto no puede superar los 120 caracteres.'),
  category: z.string().min(1, 'Selecciona una categoría.'),
  cost: z
    .string()
    .min(1, 'El costo es obligatorio.')
    .regex(/^\d+$/, 'El costo debe ser un número entero.'),
  purchaseDate: z
    .string()
    .min(1, 'La fecha de compra es obligatoria.')
    .refine(isValidDisplayDate, 'Ingresa una fecha válida con formato dd/mm/aaaa.'),
  maintenanceId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_FIELDS: (keyof FormValues)[] = [
  'vehicleId',
  'name',
  'category',
  'cost',
  'purchaseDate',
  'maintenanceId',
];

function shortDescription(description: string): string {
  return description.length > 40
    ? `${description.slice(0, 40).trimEnd()}…`
    : description;
}

function showSuccessMessage(onAccept: () => void) {
  const title = 'Repuesto guardado';
  const message = 'El repuesto se registró correctamente.';

  if (Platform.OS === 'web') {
    const webAlert = (globalThis as { alert?: (text: string) => void }).alert;
    webAlert?.(`${title}\n\n${message}`);
    onAccept();
    return;
  }

  Alert.alert(title, message, [{ text: 'Aceptar', onPress: onAccept }]);
}

export default function AddPartScreen() {
  const params = useLocalSearchParams<{ vehicleId?: string | string[] }>();
  const routeVehicleId = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';

  const vehiclesQuery = useVehicles();
  const { isWide } = useBreakpoint();
  const { scrollViewRef, trackField, scrollToFirst } = useFormScroll();

  const {
    control,
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleId: routeVehicleId,
      name: '',
      category: '',
      cost: '',
      purchaseDate: todayDisplayDate(),
      maintenanceId: '',
    },
  });

  const selectedVehicleId = watch('vehicleId');
  const maintenancesQuery = useVehicleMaintenances(selectedVehicleId || null);
  const createPartMutation = useCreatePart();

  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [discardVisible, setDiscardVisible] = useState(false);

  const isSaving = isSubmitting || createPartMutation.isPending;

  const vehicleOptions: SelectOption[] = (vehiclesQuery.data ?? []).map(
    (vehicle) => ({
      value: vehicle.id,
      label: `${vehicle.brand} ${vehicle.model} (${vehicle.year})`,
    }),
  );

  const maintenanceOptions: SelectOption[] = [
    { label: 'No Asignar', value: '' },
    ...(maintenancesQuery.data?.items ?? []).map((maintenance) => ({
      value: maintenance.id,
      label: `${isoDateToDisplay(maintenance.serviceDate)} · ${shortDescription(maintenance.description)}`,
    })),
  ];

  const categoryOptions: SelectOption[] = PART_CATEGORIES.map((category) => ({
    label: category,
    value: category,
  }));

  const handleVehicleChange = (vehicleId: string) => {
    setValue('vehicleId', vehicleId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue('maintenanceId', '', { shouldDirty: true });
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const handleCancel = () => {
    if (isSaving) {
      return;
    }

    if (isDirty) {
      setDiscardVisible(true);
      return;
    }

    reset();
    goBack();
  };

  const discardChanges = () => {
    setDiscardVisible(false);
    reset();
    goBack();
  };

  const onSubmit = async (values: FormValues) => {
    setFormMessage(null);
    setServerError(null);

    try {
      await createPartMutation.mutateAsync({
        vehicleId: values.vehicleId,
        maintenanceId: values.maintenanceId ? values.maintenanceId : null,
        name: values.name.trim(),
        category: values.category as PartCategory,
        cost: parseAmount(values.cost),
        purchaseDate: displayDateToIso(values.purchaseDate),
      });

      showSuccessMessage(goBack);
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);

        for (const detail of error.details) {
          if (FORM_FIELDS.includes(detail.field as keyof FormValues)) {
            setError(detail.field as keyof FormValues, {
              message: detail.message,
            });
          }
        }

        scrollToFirst(
          FORM_FIELDS.filter((field) =>
            error.details.some((detail) => detail.field === field),
          ),
        );
      } else {
        setServerError('No se pudo guardar el repuesto. Intenta nuevamente.');
      }
    }
  };

  const onInvalid = (formErrors: FieldErrors<FormValues>) => {
    setServerError(null);

    const firstError = FORM_FIELDS.find((field) => formErrors[field]);

    if (firstError) {
      scrollToFirst([firstError]);
    }

    if (formErrors.name || formErrors.cost) {
      setFormMessage('Completa los campos obligatorios');
      return;
    }

    setFormMessage('Revisa los datos ingresados');
  };

  const footer = (
    <FormFooter
      loading={isSaving}
      onCancel={handleCancel}
      onSubmit={() => {
        void handleSubmit(onSubmit, onInvalid)();
      }}
      submitLabel="Guardar Repuesto"
    />
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <Screen
        contentContainerStyle={styles.screenContent}
        edges={['top']}
        footer={isWide ? undefined : footer}
        maxWidth={layout.formMaxWidth}
      >
        <AppHeader onBack={handleCancel} title="Añadir Repuesto" />

        <ScrollView
          contentContainerStyle={[styles.content, isWide && styles.contentWide]}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
          style={styles.flex}
        >
          <View onLayout={trackField('vehicleId')} style={styles.fieldGroup}>
            <SelectField
              disabled={vehiclesQuery.isLoading}
              error={errors.vehicleId?.message}
              label="Seleccionar Vehículo"
              onChange={handleVehicleChange}
              options={vehicleOptions}
              placeholder={
                vehiclesQuery.isLoading
                  ? 'Cargando vehículos...'
                  : 'Selecciona un vehículo'
              }
              value={selectedVehicleId}
            />

            {vehiclesQuery.isError ? (
              <Text style={styles.hintError}>
                No se pudieron cargar los vehículos.
              </Text>
            ) : null}
          </View>

          <View onLayout={trackField('name')}>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  label="Nombre del Repuesto"
                  maxLength={120}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Ej: Bujías Bosch"
                  value={field.value}
                />
              )}
            />
          </View>

          <View onLayout={trackField('category')}>
            <Controller
              control={control}
              name="category"
              render={({ field, fieldState }) => (
                <SelectField
                  error={fieldState.error?.message}
                  label="Categoría/Tipo"
                  onChange={field.onChange}
                  options={categoryOptions}
                  placeholder="Selecciona una categoría"
                  value={field.value}
                />
              )}
            />
          </View>

          <View onLayout={trackField('cost')}>
            <Controller
              control={control}
              name="cost"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  label="Costo ($)"
                  onBlur={field.onBlur}
                  onChangeText={(text) => field.onChange(digitsOnly(text))}
                  placeholder="25.000"
                  value={formatChileanAmount(field.value)}
                />
              )}
            />
          </View>

          <View onLayout={trackField('purchaseDate')}>
            <Controller
              control={control}
              name="purchaseDate"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  label="Fecha de Compra"
                  maxLength={10}
                  onBlur={field.onBlur}
                  onChangeText={(text) => field.onChange(formatDateInput(text))}
                  placeholder="dd/mm/aaaa"
                  value={field.value}
                />
              )}
            />
          </View>

          <View onLayout={trackField('maintenanceId')} style={styles.fieldGroup}>
            <Controller
              control={control}
              name="maintenanceId"
              render={({ field, fieldState }) => (
                <SelectField
                  disabled={!selectedVehicleId || maintenancesQuery.isLoading}
                  error={fieldState.error?.message}
                  label="Asignar a Cita/Mantención"
                  onChange={field.onChange}
                  options={maintenanceOptions}
                  placeholder={
                    maintenancesQuery.isLoading
                      ? 'Cargando mantenciones...'
                      : 'No Asignar'
                  }
                  value={field.value}
                />
              )}
            />

            {maintenancesQuery.isError ? (
              <Text style={styles.hintError}>
                No se pudieron cargar las mantenciones del vehículo.
              </Text>
            ) : null}
          </View>

          {formMessage ? (
            <Text style={styles.formMessage}>{formMessage}</Text>
          ) : null}

          <MessageBanner message={serverError} tone="error" />

          {isWide ? footer : null}
        </ScrollView>

        <ConfirmModal
          cancelLabel="Seguir editando"
          confirmLabel="Descartar"
          message="Se perderán los datos que ingresaste."
          onCancel={() => setDiscardVisible(false)}
          onConfirm={discardChanges}
          title="¿Descartar los cambios?"
          visible={discardVisible}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
    paddingBottom: spacing.none,
  },
  content: {
    gap: spacing.md,
    paddingBottom: layout.touchTarget + spacing.xxl * 2,
  },
  contentWide: {
    paddingBottom: spacing.xxl,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  hintError: {
    ...typography.caption,
    color: colors.dangerText,
  },
  formMessage: {
    color: colors.dangerText,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
