import { L } from '../../core/i18n';

/**
 * Стиснення фото перед збереженням у localStorage: довша сторона ≤ maxSide, JPEG ~0.7.
 * Фото з телефона 4–8 МБ стає ~60–120 КБ — інакше сховище переповниться за кілька нарядів.
 */
export async function compressImage(file: File, maxSide = 1024, quality = 0.7): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(L('Можна додати лише зображення (JPG, PNG, HEIC)', 'Only images can be added (JPG, PNG, HEIC)'));
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(L('Браузер не підтримує обробку зображень', 'This browser can’t process images'));
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* старі браузери / HEIC — пробуємо через <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error(L('Не вдалося прочитати фото. Спробуйте JPG або PNG.', 'Couldn’t read the photo. Try JPG or PNG.'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Розмір data URL у КБ (для підказки про сховище) */
export const dataUrlKb = (s: string) => Math.round((s.length * 2) / 1024);
