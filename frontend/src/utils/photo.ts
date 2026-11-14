import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { ApiError } from '../api/client';

const MAX_PHOTO_SIDE = 1600;
const JPEG_QUALITY = 0.8;
const JPEG_NAME = 'foto.jpg';

/** Lo mínimo que necesita el subidor; el picker no siempre entrega nombre ni tipo. */
export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

/** La foto no se pudo comprimir: se avisa en vez de subir el original. */
export class PhotoProcessingError extends Error {}

/**
 * El nombre nunca se deriva de la URI: en iOS puede ser `ph://...` sin
 * extensión y RN no envía el multipart. El backend detecta el formato real.
 */
export function photoFromPicker(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): PickedPhoto {
  return {
    uri: asset.uri,
    name: asset.fileName || JPEG_NAME,
    type: asset.mimeType || 'image/jpeg',
  };
}

/** Motivo visible para el usuario cuando la subida de la foto falla. */
export function photoUploadErrorMessage(error: unknown): string {
  if (error instanceof PhotoProcessingError) {
    return 'No se pudo preparar la foto. Reintenta o continúa sin foto';
  }

  if (!(error instanceof ApiError)) {
    return 'No se pudo subir la foto';
  }

  const message =
    error.status === 0
      ? 'No pudimos conectar con el servidor'
      : error.status === 401
        ? 'Tu sesión expiró'
        : error.status === 404
          ? 'No encontramos el vehículo'
          : error.status === 413
            ? 'La foto supera 8 MB'
            : error.message || 'No se pudo subir la foto';

  return __DEV__ ? `${message} (HTTP ${error.status})` : message;
}

/**
 * Deja la foto lista antes de subirla: lado mayor 1600 px, JPEG 0.8 y
 * siempre `image/jpeg` + `.jpg`, aunque el original sea HEIC o venga sin tipo.
 * `maxWidth`/`maxHeight` reducen al decodificar, sin cargar la foto entera.
 */
export async function preparePhoto(photo: PickedPhoto): Promise<PickedPhoto> {
  try {
    const context = ImageManipulator.manipulate(photo.uri, {
      maxWidth: MAX_PHOTO_SIDE,
      maxHeight: MAX_PHOTO_SIDE,
    });
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
    });

    return { uri: result.uri, name: JPEG_NAME, type: 'image/jpeg' };
  } catch {
    throw new PhotoProcessingError('No se pudo procesar la foto');
  }
}
