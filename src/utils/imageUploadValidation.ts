/** Where the image is used — report flow disallows GIF (lost/found items). */
export type ImageUploadScope = 'report' | 'profile';

const MIME_REPORT = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_PROFILE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const EXT_REPORT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const EXT_PROFILE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

export const IMAGE_FILE_ACCEPT_REPORT =
  'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export const IMAGE_FILE_ACCEPT_PROFILE =
  'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; message: string };

function allowedMimes(scope: ImageUploadScope): Set<string> {
  return scope === 'report' ? MIME_REPORT : MIME_PROFILE;
}

function allowedExtensions(scope: ImageUploadScope): Set<string> {
  return scope === 'report' ? EXT_REPORT : EXT_PROFILE;
}

function typeErrorMessage(scope: ImageUploadScope): string {
  return scope === 'report'
    ? 'Please use a JPG, PNG, or WebP image.'
    : 'Please use a JPG, PNG, GIF, or WebP image.';
}

function extensionLooksAllowed(file: File, scope: ImageUploadScope): boolean {
  const parts = file.name.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop()?.toLowerCase();
  return ext != null && allowedExtensions(scope).has(ext);
}

/** Sync checks: MIME (or extension if MIME empty) and file size. */
export function validateImageFileTypeAndSize(
  file: File,
  scope: ImageUploadScope
): ImageValidationResult {
  const mimes = allowedMimes(scope);
  const mimeOk = mimes.has(file.type);
  const extFallback = file.type === '' && extensionLooksAllowed(file, scope);
  if (!mimeOk && !extFallback) {
    return {
      ok: false,
      message: typeErrorMessage(scope),
    };
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      ok: false,
      message: 'Image must be 5 MB or smaller.',
    };
  }
  return { ok: true };
}

/** Decode image to verify dimensions (max 2048×2048). */
export function validateImageDimensions(file: File): Promise<ImageValidationResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (
        img.naturalWidth > MAX_IMAGE_DIMENSION ||
        img.naturalHeight > MAX_IMAGE_DIMENSION
      ) {
        resolve({
          ok: false,
          message: `Image must be at most ${MAX_IMAGE_DIMENSION}×${MAX_IMAGE_DIMENSION} pixels.`,
        });
      } else {
        resolve({ ok: true });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        message: 'Could not read this image file.',
      });
    };
    img.src = url;
  });
}

export async function validateImageFile(
  file: File,
  scope: ImageUploadScope
): Promise<ImageValidationResult> {
  const basic = validateImageFileTypeAndSize(file, scope);
  if (!basic.ok) return basic;
  return validateImageDimensions(file);
}
