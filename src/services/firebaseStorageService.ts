import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { storage } from './firebase';
import {
  type ImageUploadScope,
  validateImageFile,
} from '../utils/imageUploadValidation';

const ALLOWED_REPORT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_PROFILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function extensionForType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function allowedTypesForScope(scope: ImageUploadScope): Set<string> {
  return scope === 'report' ? ALLOWED_REPORT_TYPES : ALLOWED_PROFILE_TYPES;
}

function createFileName(file: File): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.${extensionForType(file.type)}`;
}

export type UploadedImage = {
  path: string;
  downloadUrl: string;
};

/**
 * Upload an image into the authenticated user's namespace.
 *
 * Client validation is for UX only. Firebase Storage rules independently
 * enforce authentication, path ownership, content type, and the 5 MB limit.
 */
export async function uploadUserImage(
  userId: string,
  file: File,
  scope: ImageUploadScope,
  itemId?: string
): Promise<UploadedImage> {
  if (!userId) {
    throw new Error('You must be signed in to upload an image.');
  }

  if (scope === 'report' && !itemId) {
    throw new Error('An item ID is required for an item image.');
  }

  const validation = await validateImageFile(file, scope);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  if (!allowedTypesForScope(scope).has(file.type)) {
    throw new Error('This image type is not allowed.');
  }

  const fileName = createFileName(file);
  const path =
    scope === 'report'
      ? `users/${userId}/items/${itemId}/${fileName}`
      : `users/${userId}/profile/${fileName}`;

  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      ownerId: userId,
      scope,
    },
  });

  return {
    path: snapshot.ref.fullPath,
    downloadUrl: await getDownloadURL(snapshot.ref),
  };
}

export async function deleteUserImage(path: string, userId: string): Promise<void> {
  if (!userId) {
    throw new Error('You must be signed in to delete an image.');
  }

  if (!path.startsWith(`users/${userId}/`)) {
    throw new Error('You can only delete your own images.');
  }

  await deleteObject(ref(storage, path));
}
