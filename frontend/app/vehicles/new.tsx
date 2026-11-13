import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, FieldErrors, useForm } from 'react-hook-form';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';
import { ApiError } from '../../src/api/client';
import {
  LocalPhoto,
  uploadVehiclePhoto,
  useBrands,
  useCreateVehicle,
  useDecodeVin,
  vehiclesQueryKey,
} from '../../src/api/vehicles';
import { MessageBanner } from '../../src/components/MessageBanner';
import { SelectField, SelectOption } from '../../src/components/SelectField';
import { TextField } from '../../src/components/TextField';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { ConfirmModal } from '../../src/components/ui/ConfirmModal';
import { FormFooter } from '../../src/components/ui/FormFooter';
import { Icon } from '../../src/components/ui/Icon';
import { Screen } from '../../src/components/ui/Screen';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useFormScroll } from '../../src/hooks/useFormScroll';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../../src/theme';
import {
  digitsOnly,
  formatChileanAmount,
  parseAmount,
} from '../../src/utils/format';
import {
  photoFromPicker,
  photoUploadErrorMessage,
} from '../../src/utils/photo';
import {
  LICENSE_PLATE_MESSAGE,
  isValidLicensePlate,
  normalizeLicensePlate,
} from '../../src/utils/license-plate';
import {
  VIN_CHECK_DIGIT_MESSAGE,
  validateVin,
} from '../../src/utils/vin';

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear() + 1;
const MAX_MILEAGE = 2_000_000;
const PREVIEW_MAX_WIDTH = 480;

const VIN_HELP = 'Si lo ingresas, completamos marca, modelo y año';
const VIN_LENGTH_MESSAGE = 'El VIN debe tener 17 caracteres';
const VIN_CHARS_MESSAGE =
  'Los VIN no usan las letras I, O ni Q, ni símbolos';
const VIN_UNRECOGNIZED_MESSAGE =
  'No pudimos reconocer este VIN. Revisa que esté bien escrito; si es correcto, ingresa los datos manualmente.';
const AUTOFILL_UNAVAILABLE_MESSAGE =
  'El autocompletado no está disponible ahora. Ingresa los datos manualmente.';
const AUTOFILL_DONE = 'Datos completados automáticamente. Revísalos.';
const PLATE_CHARS_MESSAGE = 'La patente solo puede tener letras y números';
const TRANSIENT_MESSAGE_MS = 4_000;

/** Mayúsculas, solo letras y números, sin I/O/Q, cortado a 17. */
function filterVin(value: string): { value: string; removed: boolean } {
  const upper = value.toUpperCase();
  const cleaned = upper.replace(/[^A-Z0-9]/g, '').replace(/[IOQ]/g, '');

  return { value: cleaned.slice(0, 17), removed: cleaned !== upper };
}

/** Mayúsculas, solo letras y números; se corta después para permitir "BC-DF-12". */
function filterLicensePlate(value: string): {
  value: string;
  invalidSymbol: boolean;
} {
  const upper = value.toUpperCase();

  return {
    value: upper.replace(/[^A-Z0-9]/g, '').slice(0, 6),
    invalidSymbol: /[^A-Z0-9\s.-]/.test(upper),
  };
}

const formSchema = z.object({
  vin: z
    .string()
    .refine((value) => value === '' || value.length === 17, {
      message: VIN_LENGTH_MESSAGE,
    })
    .refine(
      (value) => value === '' || value.length !== 17 || validateVin(value).ok,
      { message: VIN_CHECK_DIGIT_MESSAGE },
    ),
  brand: z.string().min(1, 'Selecciona una marca.'),
  model: z
    .string()
    .trim()
    .min(1, 'El modelo es obligatorio.')
    .max(60, 'El modelo no puede superar los 60 caracteres.'),
  year: z
    .string()
    .trim()
    .min(1, 'El año es obligatorio.')
    .regex(/^\d{4}$/, 'Ingresa un año de 4 dígitos.')
    .refine((value) => Number(value) >= MIN_YEAR && Number(value) <= MAX_YEAR, {
      message: `El año debe estar entre ${MIN_YEAR} y ${MAX_YEAR}.`,
    }),
  licensePlate: z
    .string()
    .transform(normalizeLicensePlate)
    .refine((value) => value.length > 0, 'La patente es obligatoria.')
    .refine(isValidLicensePlate, { message: LICENSE_PLATE_MESSAGE }),
  currentMileage: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => value.length > 0, 'El kilometraje es obligatorio.')
    .refine((value) => Number(value) <= MAX_MILEAGE, {
      message: `El kilometraje no puede superar ${MAX_MILEAGE}.`,
    }),
});

type FormValues = z.infer<typeof formSchema>;

const FORM_FIELDS: Array<keyof FormValues> = [
  'vin',
  'brand',
  'model',
  'year',
  'licensePlate',
  'currentMileage',
];

const DEFAULT_VALUES: FormValues = {
  vin: '',
  brand: '',
  model: '',
  year: '',
  licensePlate: '',
  currentMileage: '',
};

export default function NewVehicleScreen() {
  const queryClient = useQueryClient();
  const brandsQuery = useBrands();
  const createVehicleMutation = useCreateVehicle();
  const { isWide } = useBreakpoint();
  const { scrollViewRef, trackField, scrollToFirst } = useFormScroll();
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [createdVehicleId, setCreatedVehicleId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [vinCharsVisible, setVinCharsVisible] = useState(false);
  const [plateCharsVisible, setPlateCharsVisible] = useState(false);
  const [autofilledVin, setAutofilledVin] = useState<string | null>(null);
  const [discardVisible, setDiscardVisible] = useState(false);
  const vinCharsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Campos que el usuario tocó: el autocompletado nunca los pisa.
  const editedFields = useRef(new Set<keyof FormValues>());

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    trigger,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
    // Los errores se limpian al cambiar VIN/patente y se validan al salir.
    reValidateMode: 'onSubmit',
  });

  const vin = watch('vin');
  const vinValidation = vin === '' ? null : validateVin(vin);
  const decodableVin = vinValidation?.ok ? vin : null;
  const decodeQuery = useDecodeVin(decodableVin);

  useEffect(() => {
    return () => {
      if (vinCharsTimer.current) {
        clearTimeout(vinCharsTimer.current);
      }
    };
  }, []);

  const showVinCharsMessage = (removed: boolean) => {
    if (vinCharsTimer.current) {
      clearTimeout(vinCharsTimer.current);
    }

    setVinCharsVisible(removed);

    if (removed) {
      vinCharsTimer.current = setTimeout(
        () => setVinCharsVisible(false),
        TRANSIENT_MESSAGE_MS,
      );
    }
  };

  const markEdited = (field: keyof FormValues) => {
    editedFields.current.add(field);
  };

  useEffect(() => {
    const data = decodeQuery.data;

    if (
      !decodableVin ||
      !data ||
      (data.status !== 'full' && data.status !== 'partial')
    ) {
      return;
    }

    let filled = false;

    if (data.brand && !editedFields.current.has('brand')) {
      setValue('brand', data.brand, { shouldValidate: true });
      filled = true;
    }

    if (data.model && !editedFields.current.has('model')) {
      setValue('model', data.model, { shouldValidate: true });
      filled = true;
    }

    if (data.year !== null && !editedFields.current.has('year')) {
      setValue('year', String(data.year), { shouldValidate: true });
      filled = true;
    }

    // Solo hay aviso si algo se rellenó y para el VIN que sigue escrito.
    if (filled) {
      setAutofilledVin(decodableVin);
    }
  }, [decodeQuery.data, decodableVin, setValue]);

  useEffect(() => {
    const error = decodeQuery.error;

    if (decodableVin && error instanceof ApiError && error.status === 400) {
      setError('vin', { type: 'server', message: error.message });
    }
  }, [decodeQuery.error, decodableVin, setError]);

  const vinNotice = (() => {
    if (vinCharsVisible) {
      return { message: VIN_CHARS_MESSAGE, tone: 'warning' as const };
    }

    if (!decodableVin) {
      return null;
    }

    const decodeError = decodeQuery.error;

    // Un 400 se muestra como error rojo del campo, no como aviso.
    if (decodeError instanceof ApiError && decodeError.status === 400) {
      return null;
    }

    if (decodeQuery.isError) {
      return {
        message: AUTOFILL_UNAVAILABLE_MESSAGE,
        tone: 'muted' as const,
      };
    }

    const data = decodeQuery.data;

    if (!data) {
      return null;
    }

    if (data.status === 'full' || data.status === 'partial') {
      return autofilledVin === vin
        ? { message: AUTOFILL_DONE, tone: 'success' as const }
        : null;
    }

    if (data.status === 'unrecognized') {
      return {
        message: VIN_UNRECOGNIZED_MESSAGE,
        tone: 'warning' as const,
      };
    }

    if (data.status === 'unavailable') {
      return {
        message: AUTOFILL_UNAVAILABLE_MESSAGE,
        tone: 'muted' as const,
      };
    }

    return null;
  })();

  const brandOptions: SelectOption[] = (brandsQuery.data ?? []).map((brand) => ({
    label: brand,
    value: brand,
  }));

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        exif: false,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      setPhoto(photoFromPicker(asset));
    } catch {
      Alert.alert('No se pudo abrir la galería', 'Intenta nuevamente.');
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const finishCreate = async (
    flash = 'Vehículo registrado',
    flashTone: 'success' | 'error' = 'success',
  ) => {
    await queryClient.invalidateQueries({ queryKey: vehiclesQueryKey });
    router.replace({ pathname: '/', params: { flash, flashTone } });
  };

  const handleCancel = () => {
    if (createdVehicleId) {
      void finishCreate('Vehículo registrado sin foto', 'error');
      return;
    }

    if (isSubmitting || uploadingPhoto) {
      return;
    }

    if (isDirty || photo !== null) {
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

  const onInvalid = (formErrors: FieldErrors<FormValues>) => {
    const firstError = FORM_FIELDS.find((field) => formErrors[field]);

    if (firstError) {
      scrollToFirst([firstError]);
    }
  };

  /** Sube la foto y solo navega cuando termina; si falla, deja reintentar. */
  const uploadPhoto = async (vehicleId: string) => {
    if (!photo) {
      await finishCreate();
      return;
    }

    setPhotoError(null);
    setUploadingPhoto(true);

    try {
      await uploadVehiclePhoto(vehicleId, photo);
      await finishCreate();
    } catch (error) {
      if (__DEV__) {
        console.warn(
          '[photo] subida fallida',
          error instanceof ApiError
            ? `status=${error.status} ${error.message}`
            : error,
        );
      }

      setPhotoError(
        `El vehículo se guardó, pero no se pudo subir la foto: ${photoUploadErrorMessage(error)}`,
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setGeneralError(null);

    try {
      const vehicle = await createVehicleMutation.mutateAsync({
        vin: values.vin === '' ? null : values.vin,
        licensePlate: values.licensePlate,
        brand: values.brand,
        model: values.model.trim(),
        year: Number(values.year),
        currentMileage: parseAmount(values.currentMileage),
      });

      setCreatedVehicleId(vehicle.id);
      await uploadPhoto(vehicle.id);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setGeneralError('Ya tienes este vehículo registrado');
          return;
        }

        if (error.status === 400) {
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

          if (error.details.length === 0) {
            setGeneralError(error.message);
          }

          return;
        }

        setGeneralError(error.message);
        return;
      }

      setGeneralError('No se pudo guardar el vehículo. Intenta nuevamente.');
    }
  };

  const footer = (
    <FormFooter
      cancelLabel={createdVehicleId ? 'Continuar sin foto' : 'Cancelar'}
      loading={isSubmitting || uploadingPhoto}
      onCancel={handleCancel}
      onSubmit={
        createdVehicleId
          ? () => void uploadPhoto(createdVehicleId)
          : () => void handleSubmit(onSubmit, onInvalid)()
      }
      submitLabel={createdVehicleId ? 'Reintentar foto' : 'Guardar Vehículo'}
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
        <AppHeader onBack={handleCancel} title="Nuevo Vehículo" />

        <ScrollView
          contentContainerStyle={[styles.content, isWide && styles.contentWide]}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
          style={styles.flex}
        >
          <MessageBanner message={generalError} tone="error" />

          <SectionHeader title="Identificación" />

          <View onLayout={trackField('vin')}>
            <Controller
              control={control}
              name="vin"
              render={({ field, fieldState }) => (
                <View style={styles.fieldGroup}>
                  <TextField
                    autoCapitalize="characters"
                    autoCorrect={false}
                    spellCheck={false}
                    error={fieldState.error?.message}
                    label="VIN (opcional)"
                    onBlur={() => {
                      field.onBlur();
                      void trigger('vin');
                    }}
                    onChangeText={(text) => {
                      const filtered = filterVin(text);

                      if (filtered.value !== field.value) {
                        setAutofilledVin(null);
                      }

                      clearErrors('vin');
                      showVinCharsMessage(filtered.removed);
                      field.onChange(filtered.value);
                    }}
                    placeholder="Ej: WVWZZZ6RZMY000001"
                    suffix={`${field.value.length}/17`}
                    value={field.value}
                  />

                  <Text style={styles.hint}>{VIN_HELP}</Text>

                  {!fieldState.error && vinNotice ? (
                    <Text
                      style={[
                        styles.notice,
                        vinNotice.tone === 'success' && styles.noticeSuccess,
                        vinNotice.tone === 'warning' && styles.noticeWarning,
                        vinNotice.tone === 'muted' && styles.noticeMuted,
                      ]}
                    >
                      {vinNotice.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          </View>

          <View onLayout={trackField('brand')}>
            <SelectField
              disabled={brandsQuery.isLoading}
              error={
                errors.brand?.message ??
                (brandsQuery.isError
                  ? 'No se pudieron cargar las marcas.'
                  : undefined)
              }
              label="Marca"
              onChange={(value) => {
                markEdited('brand');
                setValue('brand', value, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              options={brandOptions}
              placeholder={
                brandsQuery.isLoading
                  ? 'Cargando marcas...'
                  : 'Selecciona una marca'
              }
              value={watch('brand')}
            />
          </View>

          <View
            onLayout={trackField('model', 'year')}
            style={[styles.fieldRow, isWide && styles.fieldRowWide]}
          >
            <View style={isWide ? styles.fieldRowItem : undefined}>
              <Controller
                control={control}
                name="model"
                render={({ field, fieldState }) => (
                  <TextField
                    autoCapitalize="words"
                    error={fieldState.error?.message}
                    label="Modelo"
                    maxLength={60}
                    onBlur={field.onBlur}
                    onChangeText={(text) => {
                      markEdited('model');
                      field.onChange(text);
                    }}
                    placeholder="Ej: Corolla"
                    value={field.value}
                  />
                )}
              />
            </View>

            <View style={isWide ? styles.fieldRowItem : undefined}>
              <Controller
                control={control}
                name="year"
                render={({ field, fieldState }) => (
                  <TextField
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                    label="Año"
                    maxLength={4}
                    onBlur={field.onBlur}
                    onChangeText={(text) => {
                      markEdited('year');
                      field.onChange(digitsOnly(text).slice(0, 4));
                    }}
                    placeholder="2021"
                    value={field.value}
                  />
                )}
              />
            </View>
          </View>

          <View onLayout={trackField('licensePlate')}>
            <Controller
              control={control}
              name="licensePlate"
              render={({ field, fieldState }) => (
                <View style={styles.fieldGroup}>
                  <TextField
                    autoCapitalize="characters"
                    autoCorrect={false}
                    spellCheck={false}
                    error={fieldState.error?.message}
                    label="Matrícula / Patente"
                    onBlur={() => {
                      field.onBlur();
                      void trigger('licensePlate');
                    }}
                    onChangeText={(text) => {
                      const filtered = filterLicensePlate(text);

                      setPlateCharsVisible(filtered.invalidSymbol);
                      clearErrors('licensePlate');
                      field.onChange(filtered.value);
                    }}
                    placeholder="BCDF12"
                    value={field.value}
                  />

                  {!fieldState.error && plateCharsVisible ? (
                    <Text style={[styles.notice, styles.noticeWarning]}>
                      {PLATE_CHARS_MESSAGE}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          </View>

          <SectionHeader title="Detalles" />

          <View onLayout={trackField('currentMileage')}>
            <Controller
              control={control}
              name="currentMileage"
              render={({ field, fieldState }) => (
                <TextField
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  label="Kilometraje Actual"
                  onBlur={field.onBlur}
                  onChangeText={(text) => field.onChange(digitsOnly(text))}
                  placeholder="15.000"
                  suffix="km"
                  value={formatChileanAmount(field.value)}
                />
              )}
            />
          </View>

          <MessageBanner message={photoError} tone="error" />

          <View style={styles.photoField}>
            <Text style={styles.photoLabel}>Subir Foto del Vehículo</Text>

            {photo ? (
              <View style={styles.photoPreview}>
                <Pressable
                  accessibilityLabel="Cambiar foto"
                  accessibilityRole="button"
                  onPress={pickPhoto}
                  style={styles.photoFrame}
                >
                  <Image
                    resizeMode="cover"
                    source={{ uri: photo.uri }}
                    style={styles.photoImage}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel="Quitar foto"
                  accessibilityRole="button"
                  onPress={() => setPhoto(null)}
                  style={styles.removePhotoButton}
                >
                  <Icon
                    color={colors.primary}
                    name="trash-outline"
                    size={20}
                  />
                  <Text style={styles.removePhotoText}>Quitar foto</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityLabel="Seleccionar foto"
                accessibilityRole="button"
                onPress={pickPhoto}
                style={styles.photoPicker}
              >
                <Icon
                  color={colors.primary}
                  name="camera-outline"
                  size={32}
                />
                <Text style={styles.photoPickerText}>Seleccionar foto</Text>
                <Text style={styles.photoHint}>JPG, PNG o WEBP</Text>
              </Pressable>
            )}
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
  fieldRow: {
    gap: spacing.md,
  },
  fieldRowWide: {
    flexDirection: 'row',
  },
  fieldRowItem: {
    flex: 1,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  notice: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  noticeSuccess: {
    color: colors.success,
  },
  noticeWarning: {
    color: colors.warning,
  },
  noticeMuted: {
    color: colors.textSecondary,
  },
  photoField: {
    gap: spacing.sm,
  },
  photoLabel: {
    color: colors.textLabel,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  photoPicker: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: layout.borderWidth,
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  photoPickerText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: '600',
  },
  photoHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  photoPreview: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoFrame: {
    alignSelf: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    maxWidth: PREVIEW_MAX_WIDTH,
    overflow: 'hidden',
    width: '100%',
  },
  photoImage: {
    height: '100%',
    width: '100%',
  },
  removePhotoButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  removePhotoText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
