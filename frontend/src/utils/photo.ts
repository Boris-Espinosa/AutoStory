import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { ApiError } from '../api/client';

const MAX_PHOTO_SIDE = 1600;
const JPEG_QUALITY = 0.8;
const JPEG_NAME = 'foto.jpg';

/** Lo mínimo que necesita el subidor; el picker no siempre entrega nombre ni tipo. */
export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
  /** Web: JPEG ya materializado en memoria, independiente del File del picker. */
  blob?: Blob;
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

type DecodedImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

/** Decodifica en memoria; sin createImageBitmap cae a un <img> con object URL. */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);

    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(blob);

  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
      image.src = url;
    });

    return {
      image: element,
      width: element.naturalWidth,
      height: element.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Redimensiona a lado mayor 1600 y genera un JPEG 0.8 en memoria. */
async function materializeWebPhoto(blob: Blob): Promise<Blob> {
  const decoded = await decodeImage(blob);

  try {
    const scale = Math.min(
      1,
      MAX_PHOTO_SIDE / Math.max(decoded.width, decoded.height),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('No se pudo crear el canvas');
    }

    // JPEG no tiene alfa: fondo blanco para PNG transparentes.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);

    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );

    if (!jpeg) {
      throw new Error('No se pudo generar el JPEG');
    }

    return jpeg;
  } finally {
    decoded.release();
  }
}

function webPhoto(blob: Blob): PickedPhoto {
  return {
    uri: URL.createObjectURL(blob),
    name: JPEG_NAME,
    type: 'image/jpeg',
    blob,
  };
}

/**
 * Deja la foto lista antes de subirla: lado mayor 1600 px, JPEG 0.8 y
 * siempre `image/jpeg` + `.jpg`, aunque el original sea HEIC o venga sin tipo.
 * En web el resultado queda en memoria: Chrome de Android invalida el File
 * del picker segundos después de elegirlo.
 */
export async function preparePhoto(photo: PickedPhoto): Promise<PickedPhoto> {
  if (photo.blob) {
    return photo;
  }

  try {
    if (Platform.OS === 'web') {
      const original = await fetch(photo.uri).then((response) =>
        response.blob(),
      );

      return webPhoto(await materializeWebPhoto(original));
    }

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

/** Procesa la foto al momento de elegirla, no al momento de subirla. */
export async function preparePickedPhoto(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File | null;
}): Promise<PickedPhoto> {
  if (Platform.OS !== 'web') {
    return preparePhoto(photoFromPicker(asset));
  }

  try {
    let original: Blob;

    if (asset.file) {
      original = asset.file;
    } else {
      original = await fetch(photoFromPicker(asset).uri).then((response) =>
        response.blob(),
      );
    }

    return webPhoto(await materializeWebPhoto(original));
  } catch {
    throw new PhotoProcessingError('No se pudo procesar la foto');
  }
}
