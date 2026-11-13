import { ApiError } from '../api/client';

const MAX_PHOTO_SIDE = 1600;
const JPEG_QUALITY = 0.8;

/** Motivo visible para el usuario cuando la subida de la foto falla. */
export function photoUploadErrorMessage(error: unknown): string {
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

async function resizeToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Sin contexto 2D');
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );

  if (!blob) {
    throw new Error('No se pudo convertir a JPEG');
  }

  return blob;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen'));
    image.src = uri;
  });
}

/**
 * Reduce la foto en el navegador antes de subirla: los móviles entregan
 * archivos grandes y la red lenta agota el tiempo de espera.
 */
export async function preparePhotoBlob(uri: string): Promise<Blob> {
  const original = await fetch(uri).then((response) => response.blob());

  try {
    // `from-image` respeta la orientación EXIF cuando el navegador lo soporta.
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(original, {
          imageOrientation: 'from-image',
        });

        try {
          return await resizeToJpeg(bitmap, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      } catch {
        // Se intenta el camino alternativo con <img>.
      }
    }

    const image = await loadImage(uri);
    return await resizeToJpeg(image, image.naturalWidth, image.naturalHeight);
  } catch {
    // Si el navegador no puede convertirla, se sube el original.
    return original;
  }
}
