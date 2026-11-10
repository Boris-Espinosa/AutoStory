import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FieldErrors, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';
import { useAppointment } from '../../../../src/api/appointments';
import { ApiError } from '../../../../src/api/client';
import {
  useCreateMaintenance,
  useMaintenance,
  useUpdateMaintenance,
} from '../../../../src/api/maintenances';
import { useUnassignedVehicleParts } from '../../../../src/api/parts';
import { useVehicles } from '../../../../src/api/vehicles';
import { Workshop, useWorkshops } from '../../../../src/api/workshops';
import { CreateWorkshopModal } from '../../../../src/components/CreateWorkshopModal';
import { MessageBanner } from '../../../../src/components/MessageBanner';
import { SelectField, SelectOption } from '../../../../src/components/SelectField';
import { TextField } from '../../../../src/components/TextField';
import { AppHeader } from '../../../../src/components/ui/AppHeader';
import { Button } from '../../../../src/components/ui/Button';
import { ConfirmModal } from '../../../../src/components/ui/ConfirmModal';
import { FormFooter } from '../../../../src/components/ui/FormFooter';
import { Icon } from '../../../../src/components/ui/Icon';
import { Screen } from '../../../../src/components/ui/Screen';
import { SectionHeader } from '../../../../src/components/ui/SectionHeader';
import { useBreakpoint } from '../../../../src/hooks/useBreakpoint';
import { useFormScroll } from '../../../../src/hooks/useFormScroll';
import {
  colors,
  fontSizes,
  layout,
  radius,
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
import { formatDisplayDate } from '../../../../src/utils/datetime';

const NEW_WORKSHOP_VALUE = '__new_workshop__';
const MAX_MILEAGE = 2_000_000;

function isAfterToday(displayDate: string): boolean {
  return displayDateToIso(displayDate) > displayDateToIso(todayDisplayDate());
}

const formSchema = z.object({
  serviceDate: z
    .string()
    .min(1, 'La fecha es obligatoria.')
    .refine(isValidDisplayDate, 'Ingresa una fecha válida con formato dd/mm/aaaa.')
    .refine(
      (value) => !isValidDisplayDate(value) || !isAfterToday(value),
      'La fecha no puede ser posterior a hoy.',
    ),
  serviceMileage: z
    .string()
    .min(1, 'El kilometraje es obligatorio.')
    .regex(/^\d+$/, 'El kilometraje debe ser un número entero.')
    .refine(
      (value) => !/^\d+$/.test(value) || Number(value) <= MAX_MILEAGE,
      'El kilometraje no puede superar 2.000.000.',
    ),
  description: z
    .string()
    .trim()
    .min(1, 'La descripción es obligatoria.')
    .max(500, 'La descripción no puede tener más de 500 caracteres.'),
  diagnosis: z
    .string()
    .max(1000, 'El diagnóstico no puede tener más de 1000 caracteres.'),
  laborCost: z.string(),
  workshopId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_FIELDS: (keyof FormValues)[] = [
  'serviceDate',
  'serviceMileage',
  'description',
  'diagnosis',
  'workshopId',
  'laborCost',
];

export default function NewMaintenanceScreen() {
  const params = useLocalSearchParams<{
    vehicleId?: string | string[];
    maintenanceId?: string | string[];
    appointmentId?: string | string[];
  }>();
  const vehicleId = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';
  const maintenanceId = Array.isArray(params.maintenanceId)
    ? params.maintenanceId[0] ?? ''
    : params.maintenanceId ?? '';
  const appointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0] ?? ''
    : params.appointmentId ?? '';
  const isEdit = Boolean(maintenanceId);

  const [linkedAppointmentId, setLinkedAppointmentId] = useState<
    string | null
  >(appointmentId || null);
  const linkedAppointmentIdRef = useRef<string | null>(appointmentId || null);

  const vehiclesQuery = useVehicles();
  const vehicle = vehiclesQuery.data?.find((item) => item.id === vehicleId);

  const partsQuery = useUnassignedVehicleParts(vehicleId || null);
  const maintenanceQuery = useMaintenance(
    vehicleId || null,
    maintenanceId || null,
  );
  const appointmentQuery = useAppointment(
    isEdit ? null : linkedAppointmentId,
  );
  const workshopsQuery = useWorkshops();
  const createMaintenanceMutation = useCreateMaintenance(vehicleId);
  const updateMaintenanceMutation = useUpdateMaintenance(
    vehicleId,
    maintenanceId,
  );

  const { isWide } = useBreakpoint();
  const { scrollViewRef, trackField, scrollToFirst } = useFormScroll();

  const {
    control,
    formState: { isDirty, isSubmitting },
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      serviceDate: todayDisplayDate(),
      serviceMileage: '',
      description: '',
      diagnosis: '',
      laborCost: '0',
      workshopId: '',
    },
  });

  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdWorkshop, setCreatedWorkshop] = useState<Workshop | null>(null);
  const [workshopModalVisible, setWorkshopModalVisible] = useState(false);
  const [appointmentInvalid, setAppointmentInvalid] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const initialPartIds = useRef<string[]>([]);
  const preloadedAppointmentRef = useRef(false);

  const serviceMileage = watch('serviceMileage');
  const laborCost = watch('laborCost');
  const workshopId = watch('workshopId');

  const maintenance = maintenanceQuery.data;

  // En edición se suman los repuestos ya asignados a los que están libres.
  const parts = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; category: string; cost: number }
    >();

    for (const part of maintenance?.parts ?? []) {
      byId.set(part.id, part);
    }

    for (const part of partsQuery.data?.items ?? []) {
      if (!byId.has(part.id)) {
        byId.set(part.id, part);
      }
    }

    return [...byId.values()];
  }, [maintenance?.parts, partsQuery.data]);

  const workshops = workshopsQuery.data ?? [];
  const allWorkshops = createdWorkshop
    ? [...workshops.filter((item) => item.id !== createdWorkshop.id), createdWorkshop]
    : workshops;
  const linkedAppointment = appointmentQuery.data;

  const isSaving =
    isSubmitting ||
    createMaintenanceMutation.isPending ||
    updateMaintenanceMutation.isPending;

  const selectedParts = parts.filter((part) => selectedPartIds.includes(part.id));
  const partsTotal = selectedParts.reduce((total, part) => total + part.cost, 0);
  const laborTotal = laborCost ? parseAmount(laborCost) : 0;
  const total = laborTotal + partsTotal;

  // Precarga el formulario y los repuestos actuales al editar.
  useEffect(() => {
    if (!maintenance) {
      return;
    }

    const partIds = maintenance.parts.map((part) => part.id);

    reset({
      serviceDate: isoDateToDisplay(maintenance.serviceDate),
      serviceMileage: String(maintenance.serviceMileage),
      description: maintenance.description,
      diagnosis: maintenance.diagnosis ?? '',
      laborCost: String(maintenance.laborCost),
      workshopId: maintenance.workshop?.id ?? '',
    });
    initialPartIds.current = partIds;
    setSelectedPartIds(partIds);
  }, [maintenance?.id, reset]);

  // Al venir desde una cita se precargan solo taller y descripción, editables.
  useEffect(() => {
    if (isEdit || !linkedAppointment || preloadedAppointmentRef.current) {
      return;
    }

    preloadedAppointmentRef.current = true;
    setValue('description', linkedAppointment.reason, { shouldValidate: true });

    if (linkedAppointment.workshop) {
      setValue('workshopId', linkedAppointment.workshop.id, {
        shouldValidate: true,
      });
    }
  }, [isEdit, linkedAppointment, setValue]);

  // Un repuesto ya asignado deja de estar disponible y se quita de la selección.
  useEffect(() => {
    if (!partsQuery.data) {
      return;
    }

    const available = new Set([
      ...partsQuery.data.items.map((part) => part.id),
      ...(maintenance?.parts ?? []).map((part) => part.id),
    ]);
    setSelectedPartIds((current) => current.filter((id) => available.has(id)));
  }, [partsQuery.data, maintenance?.parts]);

  // El kilometraje inicial es el actual del vehículo (solo al registrar).
  useEffect(() => {
    if (!isEdit && vehicle) {
      setValue('serviceMileage', String(vehicle.currentMileage));
    }
  }, [isEdit, vehicle?.id, vehicle?.currentMileage, setValue]);

  const vehicleLabel = vehicle
    ? `${vehicle.brand} ${vehicle.model} ${vehicle.year} · ${vehicle.licensePlate}`
    : vehiclesQuery.isLoading
      ? 'Cargando vehículo...'
      : 'Vehículo';

  const currentWorkshop = maintenance?.workshop ?? linkedAppointment?.workshop;
  const workshopOptions: SelectOption[] = [
    { label: 'Sin taller', value: '' },
    ...(currentWorkshop &&
    !allWorkshops.some((workshop) => workshop.id === currentWorkshop.id)
      ? [{ label: currentWorkshop.name, value: currentWorkshop.id }]
      : []),
    ...allWorkshops.map((workshop) => ({
      label: workshop.name,
      value: workshop.id,
    })),
    { label: '+ Nuevo taller', value: NEW_WORKSHOP_VALUE },
  ];

  const willUpdateMileage =
    Boolean(serviceMileage) &&
    vehicle !== undefined &&
    parseAmount(serviceMileage) > vehicle.currentMileage;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const partSelectionChanged = () => {
    const initial = initialPartIds.current;

    return (
      selectedPartIds.length !== initial.length ||
      selectedPartIds.some((id) => !initial.includes(id))
    );
  };

  const handleCancel = () => {
    if (isSaving) {
      return;
    }

    if (isDirty || partSelectionChanged()) {
      setDiscardVisible(true);
      return;
    }

    goBack();
  };

  const discardChanges = () => {
    setDiscardVisible(false);
    goBack();
  };

  const togglePart = (partId: string) => {
    setSelectedPartIds((current) =>
      current.includes(partId)
        ? current.filter((id) => id !== partId)
        : [...current, partId],
    );
  };

  const onSubmit = async (values: FormValues) => {
    setFormMessage(null);
    setServerError(null);

    try {
      const payload = {
        serviceDate: displayDateToIso(values.serviceDate),
        serviceMileage: parseAmount(values.serviceMileage),
        description: values.description.trim(),
        diagnosis: values.diagnosis.trim() || null,
        laborCost: values.laborCost ? parseAmount(values.laborCost) : 0,
        workshopId: values.workshopId || null,
        appointmentId: linkedAppointmentIdRef.current,
        partIds: selectedPartIds,
      };

      if (isEdit) {
        await updateMaintenanceMutation.mutateAsync(payload);
      } else {
        await createMaintenanceMutation.mutateAsync(payload);
      }

      router.dismissTo({
        pathname: '/vehicles/[vehicleId]',
        params: {
          vehicleId,
          tab: 'maintenances',
          flash: isEdit ? 'Mantención actualizada' : 'Mantención registrada',
        },
      });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setServerError(
          'No se pudo guardar la mantención. Intenta nuevamente.',
        );
        return;
      }

      setServerError(error.message);

      if (
        !isEdit &&
        error.status === 400 &&
        error.message.toLowerCase().includes('cita')
      ) {
        setAppointmentInvalid(true);
      }

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

      // Un repuesto pudo asignarse en otra mantención mientras el formulario
      // estaba abierto: se recarga la lista para mostrar solo los disponibles.
      if (error.status === 400 && error.message.includes('repuesto')) {
        const result = await partsQuery.refetch();
        const available = new Set([
          ...(result.data?.items ?? []).map((part) => part.id),
          ...(maintenance?.parts ?? []).map((part) => part.id),
        ]);
        setSelectedPartIds((current) =>
          current.filter((id) => available.has(id)),
        );
      }
    }
  };

  const onInvalid = (formErrors: FieldErrors<FormValues>) => {
    setServerError(null);

    const firstError = FORM_FIELDS.find((field) => formErrors[field]);

    if (firstError) {
      scrollToFirst([firstError]);
    }

    const hasMissingField =
      !watch('serviceDate') ||
      !watch('serviceMileage') ||
      !watch('description').trim();

    setFormMessage(
      hasMissingField
        ? 'Completa los campos obligatorios'
        : 'Revisa los datos ingresados',
    );
  };

  const continueWithoutAppointment = () => {
    linkedAppointmentIdRef.current = null;
    setLinkedAppointmentId(null);
    setAppointmentInvalid(false);
    setServerError(null);
    void handleSubmit(onSubmit, onInvalid)();
  };

  if (isEdit && maintenanceQuery.isLoading) {
    return (
      <Screen
        contentContainerStyle={styles.screenContent}
        edges={['top']}
        maxWidth={layout.formMaxWidth}
      >
        <AppHeader onBack={handleCancel} title="Editar Mantención" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isEdit && (maintenanceQuery.isError || !maintenance)) {
    return (
      <Screen
        contentContainerStyle={styles.screenContent}
        edges={['top']}
        maxWidth={layout.formMaxWidth}
      >
        <AppHeader onBack={handleCancel} title="Editar Mantención" />
        <View style={styles.centered}>
          <Text style={styles.hintError}>
            No se pudo cargar la mantención.
          </Text>
          <Button
            label="Reintentar"
            onPress={() => void maintenanceQuery.refetch()}
            variant="secondary"
          />
        </View>
      </Screen>
    );
  }

  const footer = (
    <FormFooter
      loading={isSaving}
      onCancel={handleCancel}
      onSubmit={() => {
        void handleSubmit(onSubmit, onInvalid)();
      }}
      submitLabel={isEdit ? 'Guardar cambios' : 'Guardar Mantención'}
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
        <AppHeader
          onBack={handleCancel}
          title={isEdit ? 'Editar Mantención' : 'Registrar Mantención'}
        />

        <ScrollView
          contentContainerStyle={[styles.content, isWide && styles.contentWide]}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
          style={styles.flex}
        >
          <Text style={styles.vehicleLabel}>{vehicleLabel}</Text>

          {linkedAppointment ? (
            <Text style={styles.appointmentNote}>
              Desde la cita del{' '}
              {formatDisplayDate(
                linkedAppointment.scheduledAt,
                linkedAppointment.timezone,
              )}
            </Text>
          ) : null}

          <MessageBanner message={formMessage} tone="error" />

          <SectionHeader title="Servicio" />

          <View
            onLayout={trackField('serviceDate', 'serviceMileage')}
            style={[styles.fieldRow, isWide && styles.fieldRowWide]}
          >
            <View style={isWide ? styles.fieldRowItem : undefined}>
              <Controller
                control={control}
                name="serviceDate"
                render={({ field, fieldState }) => (
                  <TextField
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                    label="Fecha"
                    maxLength={10}
                    onBlur={field.onBlur}
                    onChangeText={(text) =>
                      field.onChange(formatDateInput(text))
                    }
                    placeholder="dd/mm/aaaa"
                    value={field.value}
                  />
                )}
              />
            </View>

            <View style={isWide ? styles.fieldRowItem : undefined}>
              <Controller
                control={control}
                name="serviceMileage"
                render={({ field, fieldState }) => (
                  <TextField
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                    label="Kilometraje del servicio"
                    onBlur={field.onBlur}
                    onChangeText={(text) => field.onChange(digitsOnly(text))}
                    placeholder="100.000"
                    suffix=" km"
                    value={formatChileanAmount(field.value)}
                  />
                )}
              />
            </View>
          </View>

          {willUpdateMileage ? (
            <Text style={styles.mileageWarning}>
              Se actualizará el kilometraje del vehículo a{' '}
              {formatChileanAmount(serviceMileage)} km
            </Text>
          ) : null}

          <View onLayout={trackField('description')}>
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  label="Descripción"
                  maxLength={500}
                  multiline
                  numberOfLines={4}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Ej: Cambio de aceite y filtros"
                  style={styles.multilineInput}
                  value={field.value}
                />
              )}
            />
          </View>

          <View onLayout={trackField('diagnosis')}>
            <Controller
              control={control}
              name="diagnosis"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  label="Diagnóstico (opcional)"
                  maxLength={1000}
                  multiline
                  numberOfLines={4}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Observaciones del diagnóstico"
                  style={styles.multilineInput}
                  value={field.value}
                />
              )}
            />
          </View>

          <View onLayout={trackField('workshopId')} style={styles.fieldGroup}>
            <Controller
              control={control}
              name="workshopId"
              render={({ field }) => (
                <SelectField
                  disabled={workshopsQuery.isLoading}
                  label="Taller (opcional)"
                  onChange={(value) => {
                    if (value === NEW_WORKSHOP_VALUE) {
                      setWorkshopModalVisible(true);
                      return;
                    }

                    field.onChange(value);
                  }}
                  options={workshopOptions}
                  placeholder={
                    workshopsQuery.isLoading
                      ? 'Cargando talleres...'
                      : 'Sin taller'
                  }
                  value={field.value}
                />
              )}
            />

            {workshopsQuery.isError ? (
              <Text style={styles.hintError}>
                No se pudieron cargar los talleres.
              </Text>
            ) : null}
          </View>

          <View onLayout={trackField('laborCost')}>
            <Controller
              control={control}
              name="laborCost"
              render={({ field }) => (
                <TextField
                  keyboardType="number-pad"
                  label="Costo de mano de obra ($)"
                  onBlur={field.onBlur}
                  onChangeText={(text) => field.onChange(digitsOnly(text))}
                  placeholder="30.000"
                  value={formatChileanAmount(field.value)}
                />
              )}
            />
          </View>

          <SectionHeader title="Repuestos" />

          <View style={styles.partsSection}>
            {partsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : null}

            {partsQuery.isError ? (
              <Text style={styles.hintError}>
                No se pudieron cargar los repuestos del vehículo.
              </Text>
            ) : null}

            {!partsQuery.isLoading &&
            !partsQuery.isError &&
            parts.length === 0 ? (
              <Text style={styles.emptyParts}>No hay repuestos sin asignar</Text>
            ) : null}

            {parts.map((part) => {
              const isSelected = selectedPartIds.includes(part.id);

              return (
                <Pressable
                  accessibilityLabel={`${part.name}, $${formatChileanAmount(String(part.cost))}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  key={part.id}
                  onPress={() => togglePart(part.id)}
                  style={[styles.partRow, isSelected && styles.partRowSelected]}
                >
                  <View
                    style={[styles.checkbox, isSelected && styles.checkboxChecked]}
                  >
                    {isSelected ? (
                      <Icon
                        color={colors.primaryText}
                        name="checkmark"
                        size={fontSizes.md}
                      />
                    ) : null}
                  </View>

                  <Text style={styles.partName}>{part.name}</Text>
                  <Text style={styles.partCost}>
                    ${formatChileanAmount(String(part.cost))}
                  </Text>
                </Pressable>
              );
            })}

            <Button
              label="Añadir repuesto nuevo"
              onPress={() =>
                router.push({
                  pathname: '/vehicles/[vehicleId]/parts/new',
                  params: { vehicleId },
                })
              }
              style={isWide ? styles.naturalButton : undefined}
              variant="secondary"
            />
          </View>

          <MessageBanner message={serverError} tone="error" />

          {appointmentInvalid ? (
            <Button
              label="Continuar sin vincular"
              onPress={continueWithoutAppointment}
              style={isWide ? styles.naturalButton : undefined}
              variant="secondary"
            />
          ) : null}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Costo total:</Text>
            <Text style={styles.totalValue}>
              ${formatChileanAmount(String(total))}
            </Text>
          </View>

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

        <CreateWorkshopModal
          onClose={() => setWorkshopModalVisible(false)}
          onCreated={(workshop) => {
            setCreatedWorkshop(workshop);
            setValue('workshopId', workshop.id, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          visible={workshopModalVisible}
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
  naturalButton: {
    alignSelf: 'flex-start',
    maxWidth: layout.buttonMaxWidth,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  vehicleLabel: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  appointmentNote: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  fieldRow: {
    gap: spacing.md,
  },
  fieldRowWide: {
    flexDirection: 'row',
  },
  fieldRowItem: {
    flex: 1,
  },
  multilineInput: {
    minHeight: layout.multilineMinHeight,
    textAlignVertical: 'top',
  },
  mileageWarning: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  hintError: {
    ...typography.caption,
    color: colors.dangerText,
  },
  partsSection: {
    gap: spacing.sm,
  },
  emptyParts: {
    ...typography.body,
    color: colors.textSecondary,
  },
  partRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  partRowSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: layout.borderWidthStrong,
    height: layout.checkboxSize,
    justifyContent: 'center',
    width: layout.checkboxSize,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  partName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.base,
    fontWeight: '600',
  },
  partCost: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: '700',
  },
  totalRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  totalLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: '700',
  },
  totalValue: {
    color: colors.primaryDark,
    fontSize: fontSizes.display,
    fontWeight: '800',
  },
  fieldGroup: {
    gap: spacing.xs,
  },
});
