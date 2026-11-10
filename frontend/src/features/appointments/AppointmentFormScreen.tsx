import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
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

import {
  DEFAULT_REMINDER_OFFSETS,
  REMINDER_OPTIONS,
  useAppointment,
  useCreateAppointment,
  useUpdateAppointment,
} from '../../api/appointments';
import { ApiError } from '../../api/client';
import { useVehicles } from '../../api/vehicles';
import { Workshop, useWorkshops } from '../../api/workshops';
import { CreateWorkshopModal } from '../../components/CreateWorkshopModal';
import { MessageBanner } from '../../components/MessageBanner';
import { SelectField, SelectOption } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { AppHeader } from '../../components/ui/AppHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { FormFooter } from '../../components/ui/FormFooter';
import { Screen } from '../../components/ui/Screen';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormScroll } from '../../hooks/useFormScroll';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../../theme';
import {
  buildInstantFromLocal,
  displayDateWithOffset,
  formatDisplayDate,
  formatTime24,
  formatTimeInput,
  getDeviceTimezone,
  parseDateDMY,
  parseTimeHM,
} from '../../utils/datetime';
import { formatDateInput } from '../../utils/format';

const NEW_WORKSHOP_VALUE = '__new_workshop__';
const REASON_SUGGESTIONS = [
  'Cambio de aceite',
  'Revisión técnica',
  'Frenos',
  'Neumáticos',
  'Diagnóstico',
];

const formSchema = z
  .object({
    vehicleId: z.string().min(1, 'Selecciona un vehículo.'),
    reason: z
      .string()
      .trim()
      .min(1, 'El motivo es obligatorio.')
      .min(3, 'El motivo debe tener al menos 3 caracteres.')
      .max(200, 'El motivo no puede tener más de 200 caracteres.'),
    date: z
      .string()
      .min(1, 'La fecha es obligatoria.')
      .refine(
        (value) => parseDateDMY(value) !== null,
        'Ingresa una fecha válida con formato dd/mm/aaaa.',
      ),
    time: z
      .string()
      .min(1, 'La hora es obligatoria.')
      .refine(
        (value) => parseTimeHM(value) !== null,
        'Ingresa una hora válida con formato HH:mm.',
      ),
    workshopId: z.string(),
    notes: z
      .string()
      .max(1000, 'Las observaciones no pueden tener más de 1000 caracteres.'),
  })
  .superRefine((values, context) => {
    if (!parseDateDMY(values.date) || !parseTimeHM(values.time)) {
      return;
    }

    const instant = buildInstantFromLocal(values.date, values.time);

    if (!instant) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['time'],
        message: 'La fecha y hora elegidas no son válidas.',
      });
      return;
    }

    if (instant.getTime() <= Date.now()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['time'],
        message: 'La cita debe ser en una fecha y hora futuras',
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const FORM_FIELDS: (keyof FormValues)[] = [
  'vehicleId',
  'reason',
  'date',
  'time',
  'workshopId',
  'notes',
];

const SERVER_FIELD_MAP: Record<string, keyof FormValues> = {
  scheduledAt: 'time',
  reason: 'reason',
  notes: 'notes',
  workshopId: 'workshopId',
};

function Chip({
  disabled = false,
  label,
  onPress,
  selected = false,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          selected && styles.chipTextSelected,
          disabled && styles.chipTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function AppointmentFormScreen() {
  const params = useLocalSearchParams<{
    appointmentId?: string | string[];
    vehicleId?: string | string[];
  }>();
  const appointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0] ?? ''
    : params.appointmentId ?? '';
  const vehicleIdParam = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';
  const isEdit = Boolean(appointmentId);
  const timezone = getDeviceTimezone();

  const vehiclesQuery = useVehicles();
  const appointmentQuery = useAppointment(appointmentId || null);
  const workshopsQuery = useWorkshops();
  const createAppointmentMutation = useCreateAppointment();
  const updateAppointmentMutation = useUpdateAppointment(appointmentId);

  const { isWide } = useBreakpoint();
  const { scrollViewRef, trackField, scrollToFirst } = useFormScroll();

  const {
    control,
    formState: { isDirty, isSubmitting },
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleId: '',
      reason: '',
      date: displayDateWithOffset(0),
      time: '',
      workshopId: '',
      notes: '',
    },
  });

  const [selectedReminders, setSelectedReminders] = useState<number[]>(
    DEFAULT_REMINDER_OFFSETS,
  );
  const [createdWorkshop, setCreatedWorkshop] = useState<Workshop | null>(null);
  const [workshopModalVisible, setWorkshopModalVisible] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [discardVisible, setDiscardVisible] = useState(false);
  const initialReminders = useRef<number[]>(DEFAULT_REMINDER_OFFSETS);

  const date = watch('date');
  const time = watch('time');
  const reason = watch('reason');

  const appointment = appointmentQuery.data;
  const vehicles = vehiclesQuery.data ?? [];
  const workshops = workshopsQuery.data ?? [];
  const allWorkshops = createdWorkshop
    ? [
        ...workshops.filter((item) => item.id !== createdWorkshop.id),
        createdWorkshop,
      ]
    : workshops;

  const vehicleOptions = useMemo<SelectOption[]>(() => {
    const options = vehicles.map((vehicle) => ({
      label: `${vehicle.brand} ${vehicle.model} · ${vehicle.licensePlate}`,
      value: vehicle.id,
    }));

    if (
      appointment &&
      !options.some((option) => option.value === appointment.vehicle.id)
    ) {
      options.unshift({
        label: `${appointment.vehicle.brand} ${appointment.vehicle.model} · ${appointment.vehicle.licensePlate}`,
        value: appointment.vehicle.id,
      });
    }

    return options;
  }, [appointment, vehicles]);

  const appointmentWorkshop = appointment?.workshop;
  const workshopOptions: SelectOption[] = [
    { label: 'Sin taller', value: '' },
    ...(appointmentWorkshop &&
    !allWorkshops.some((workshop) => workshop.id === appointmentWorkshop.id)
      ? [{ label: appointmentWorkshop.name, value: appointmentWorkshop.id }]
      : []),
    ...allWorkshops.map((workshop) => ({
      label: workshop.name,
      value: workshop.id,
    })),
    { label: '+ Nuevo taller', value: NEW_WORKSHOP_VALUE },
  ];

  const scheduledAt = buildInstantFromLocal(date, time);
  const passedOffsets = new Set(
    scheduledAt
      ? REMINDER_OPTIONS.filter(
          (option) =>
            scheduledAt.getTime() - option.offsetMinutes * 60_000 <=
            Date.now(),
        ).map((option) => option.offsetMinutes)
      : [],
  );
  const activeReminders = selectedReminders.filter(
    (offset) => !passedOffsets.has(offset),
  );

  const isSaving =
    isSubmitting ||
    createAppointmentMutation.isPending ||
    updateAppointmentMutation.isPending;

  // Vehículo preseleccionado por ?vehicleId o cuando solo hay uno.
  useEffect(() => {
    if (isEdit || vehicles.length === 0 || getValues('vehicleId')) {
      return;
    }

    const requested = vehicles.find((vehicle) => vehicle.id === vehicleIdParam);
    const selected = requested ?? (vehicles.length === 1 ? vehicles[0] : null);

    if (selected) {
      setValue('vehicleId', selected.id);
    }
  }, [getValues, isEdit, setValue, vehicleIdParam, vehicles]);

  // En edición se precargan los datos en la zona del dispositivo.
  useEffect(() => {
    if (!appointment) {
      return;
    }

    reset({
      vehicleId: appointment.vehicle.id,
      reason: appointment.reason,
      date: formatDisplayDate(appointment.scheduledAt, timezone),
      time: formatTime24(appointment.scheduledAt, timezone),
      workshopId: appointment.workshop?.id ?? '',
      notes: appointment.notes ?? '',
    });

    const offsets = appointment.reminders.map(
      (reminder) => reminder.offsetMinutes,
    );
    initialReminders.current = offsets;
    setSelectedReminders(offsets);
  }, [appointment?.id, reset, timezone]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/appointments');
  };

  const remindersChanged = () => {
    const initial = initialReminders.current;

    return (
      selectedReminders.length !== initial.length ||
      selectedReminders.some((offset) => !initial.includes(offset))
    );
  };

  const handleCancel = () => {
    if (isSaving) {
      return;
    }

    if (isDirty || remindersChanged()) {
      setDiscardVisible(true);
      return;
    }

    goBack();
  };

  const discardChanges = () => {
    setDiscardVisible(false);
    goBack();
  };

  const toggleReminder = (offset: number) => {
    if (passedOffsets.has(offset)) {
      return;
    }

    setSelectedReminders((current) =>
      current.includes(offset)
        ? current.filter((value) => value !== offset)
        : [...current, offset],
    );
  };

  const onSubmit = async (values: FormValues) => {
    setFormMessage(null);
    setServerError(null);

    const instant = buildInstantFromLocal(values.date, values.time);

    if (!instant) {
      setError('time', { message: 'La fecha y hora elegidas no son válidas.' });
      return;
    }

    const payload = {
      scheduledAt: instant.toISOString(),
      timezone,
      reason: values.reason.trim(),
      notes: values.notes.trim() || null,
      workshopId: values.workshopId || null,
      reminders: activeReminders,
    };

    try {
      const result = isEdit
        ? await updateAppointmentMutation.mutateAsync(payload)
        : await createAppointmentMutation.mutateAsync({
            vehicleId: values.vehicleId,
            ...payload,
          });

      const baseMessage = isEdit ? 'Cita actualizada' : 'Cita programada';
      const flash =
        result.skippedReminders.length > 0
          ? `${baseMessage}. Algunos recordatorios ya habían pasado y no se programaron`
          : baseMessage;
      const target = {
        pathname: '/appointments/[appointmentId]' as const,
        params: { appointmentId: result.id, flash },
      };

      if (isEdit) {
        router.dismissTo(target);
      } else {
        router.replace(target);
      }
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setServerError('No se pudo guardar la cita. Intenta nuevamente.');
        return;
      }

      setServerError(error.message);
      const mappedFields: (keyof FormValues)[] = [];

      for (const detail of error.details) {
        const field = SERVER_FIELD_MAP[detail.field];

        if (field) {
          mappedFields.push(field);
          setError(field, { message: detail.message });
        }
      }

      scrollToFirst(mappedFields);
    }
  };

  const onInvalid = (formErrors: FieldErrors<FormValues>) => {
    setServerError(null);

    const firstError = FORM_FIELDS.find((field) => formErrors[field]);

    if (firstError) {
      scrollToFirst([firstError]);
    }

    const hasMissingField =
      !getValues('vehicleId') ||
      !getValues('reason').trim() ||
      !getValues('date') ||
      !getValues('time');

    setFormMessage(
      hasMissingField
        ? 'Completa los campos obligatorios'
        : 'Revisa los datos ingresados',
    );
  };

  if (isEdit && appointmentQuery.isLoading) {
    return (
      <Screen
        contentContainerStyle={styles.screenContent}
        edges={['top']}
        maxWidth={layout.formMaxWidth}
      >
        <AppHeader onBack={handleCancel} title="Editar cita" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isEdit && (appointmentQuery.isError || !appointment)) {
    return (
      <Screen
        contentContainerStyle={styles.screenContent}
        edges={['top']}
        maxWidth={layout.formMaxWidth}
      >
        <AppHeader onBack={handleCancel} title="Editar cita" />
        <View style={styles.centered}>
          <Text style={styles.hintError}>No se pudo cargar la cita.</Text>
          <Button
            label="Reintentar"
            onPress={() => void appointmentQuery.refetch()}
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
      submitLabel="Guardar cita"
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
        <Head>
          <title>
            {isEdit ? 'Editar cita · AutoStory' : 'Programar cita · AutoStory'}
          </title>
        </Head>

        <AppHeader
          onBack={handleCancel}
          title={isEdit ? 'Editar cita' : 'Programar cita'}
        />

        <ScrollView
          contentContainerStyle={[styles.content, isWide && styles.contentWide]}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
          style={styles.flex}
        >
          {!vehiclesQuery.isLoading && vehicles.length === 0 ? (
            <Text style={styles.hint}>
              Registra un vehículo para programar una cita.
            </Text>
          ) : null}

          <MessageBanner message={formMessage} tone="error" />

          <SectionHeader title="Cita" />

          <View onLayout={trackField('vehicleId')}>
            <Controller
              control={control}
              name="vehicleId"
              render={({ field, fieldState }) => (
                <SelectField
                  disabled={isEdit || vehiclesQuery.isLoading}
                  error={fieldState.error?.message}
                  label="Vehículo"
                  onChange={field.onChange}
                  options={vehicleOptions}
                  placeholder={
                    vehiclesQuery.isLoading
                      ? 'Cargando vehículos...'
                      : 'Selecciona un vehículo'
                  }
                  value={field.value}
                />
              )}
            />
          </View>

          <View onLayout={trackField('reason')} style={styles.fieldGroup}>
            <Controller
              control={control}
              name="reason"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  label="Motivo"
                  maxLength={200}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Ej: Cambio de aceite"
                  value={field.value}
                />
              )}
            />

            <View style={styles.chips}>
              {REASON_SUGGESTIONS.map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  onPress={() =>
                    setValue('reason', suggestion, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  selected={reason === suggestion}
                />
              ))}
            </View>
          </View>

          <View
            onLayout={trackField('date', 'time')}
            style={[styles.fieldRow, isWide && styles.fieldRowWide]}
          >
            <View style={isWide ? styles.fieldRowItem : undefined}>
              <Controller
                control={control}
                name="date"
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
                name="time"
                render={({ field, fieldState }) => (
                  <TextField
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                    label="Hora"
                    maxLength={5}
                    onBlur={field.onBlur}
                    onChangeText={(text) =>
                      field.onChange(formatTimeInput(text))
                    }
                    placeholder="HH:mm"
                    value={field.value}
                  />
                )}
              />
            </View>
          </View>

          <View style={styles.chips}>
            <Chip
              label="Hoy"
              onPress={() =>
                setValue('date', displayDateWithOffset(0), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              selected={date === displayDateWithOffset(0)}
            />
            <Chip
              label="Mañana"
              onPress={() =>
                setValue('date', displayDateWithOffset(1), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              selected={date === displayDateWithOffset(1)}
            />
            <Chip
              label="En 1 semana"
              onPress={() =>
                setValue('date', displayDateWithOffset(7), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              selected={date === displayDateWithOffset(7)}
            />
          </View>

          <Text style={styles.hint}>Hora de tu dispositivo ({timezone})</Text>

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

          <View onLayout={trackField('notes')}>
            <Controller
              control={control}
              name="notes"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  label="Observaciones (opcional)"
                  maxLength={1000}
                  multiline
                  numberOfLines={4}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Ej: Llevar la revisión técnica impresa"
                  style={styles.multilineInput}
                  value={field.value}
                />
              )}
            />
          </View>

          <SectionHeader title="Recordatorios" />

          <View style={styles.chips}>
            {REMINDER_OPTIONS.map((option) => {
              const passed = passedOffsets.has(option.offsetMinutes);

              return (
                <Chip
                  key={option.offsetMinutes}
                  disabled={passed}
                  label={
                    passed
                      ? `${option.label} · Ya pasó: no se programará`
                      : option.label
                  }
                  onPress={() => toggleReminder(option.offsetMinutes)}
                  selected={
                    !passed && selectedReminders.includes(option.offsetMinutes)
                  }
                />
              );
            })}
          </View>

          <Text style={styles.reminderSummary}>
            {activeReminders.length > 0
              ? `Se programarán ${activeReminders.length} ${
                  activeReminders.length === 1 ? 'recordatorio' : 'recordatorios'
                }`
              : 'Sin recordatorios'}
          </Text>

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
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  fieldGroup: {
    gap: spacing.xs,
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
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  hintError: {
    ...typography.caption,
    color: colors.dangerText,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipPressed: {
    backgroundColor: colors.neutralBackground,
  },
  chipText: {
    color: colors.textLabel,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.primaryDark,
  },
  chipTextDisabled: {
    color: colors.textSecondary,
  },
  reminderSummary: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
